import { prisma } from './prisma'
import { decrypt } from './crypto'
import { logger } from './logger'
import { createWorker, syncrolexQueue } from './queue'

export type SyncrolexEvent = 'lead.created' | 'appointment.created'

export interface SyncrolexConnection { url: string; token: string }

/**
 * Conexão SyncroLex ativa do workspace (URL do webhook + token), ou null.
 * Usada tanto para avisar eventos (lead/agendamento) quanto para perguntar ao SyncroLex
 * (ex.: verificação de CPF antes de enviar documentos).
 */
export async function getSyncrolexConnection(workspaceId: string): Promise<SyncrolexConnection | null> {
  const conn = await prisma.crmConnection.findUnique({
    where: { workspaceId_platform: { workspaceId, platform: 'syncrolex' } },
  })
  if (!conn || conn.status !== 'active' || !conn.accessToken) return null
  const url = (conn.metadata as { webhookUrl?: string } | null)?.webhookUrl
  if (!url) return null
  return { url, token: decrypt(conn.accessToken) }
}

/**
 * Dispara um evento de negócio para a conexão SyncroLex ativa do workspace
 * (se houver) — um POST para a URL de webhook que o usuário colou na conexão,
 * autenticado pelo token gerado no próprio SyncroLex.
 * Contrato: docs/superpowers/specs/2026-07-10-integracao-syncroflow-design.md
 * no repositório do SyncroLex CRM.
 *
 * `retryable` indica se vale tentar de novo (falha de rede ou 5xx); sem conexão
 * configurada ou erro 4xx (token/dados inválidos) não adianta repetir.
 */
export async function dispatchSyncrolexWebhook(
  workspaceId: string,
  event: SyncrolexEvent,
  payload: Record<string, any>
): Promise<{ ok: boolean; error?: string; retryable?: boolean }> {
  const conn = await getSyncrolexConnection(workspaceId)
  if (!conn) return { ok: false, error: 'Conexão SyncroLex não encontrada ou inativa', retryable: false }

  try {
    const res = await fetch(conn.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ...payload }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      logger.error('SyncroLex webhook retornou erro', { workspaceId, event, status: res.status, body })
      return { ok: false, error: `SyncroLex webhook retornou ${res.status}`, retryable: res.status >= 500 || res.status === 429 }
    }
    return { ok: true }
  } catch (err) {
    logger.error('Falha ao chamar webhook SyncroLex', { workspaceId, event, err })
    return { ok: false, error: 'Falha de conexão com o webhook do SyncroLex', retryable: true }
  }
}

/**
 * Pergunta ao SyncroLex se um CPF pertence ao cliente daquele telefone (evento `contract.verify`).
 * Resposta síncrona: `valid` só é true quando o SyncroLex confirma. Qualquer falha vira `unavailable`.
 */
export async function verifySyncrolexCpf(
  workspaceId: string,
  phone: string,
  cpf: string
): Promise<{ valid: boolean; unavailable?: boolean }> {
  const conn = await getSyncrolexConnection(workspaceId)
  if (!conn) return { valid: false, unavailable: true }
  try {
    const res = await fetch(conn.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'contract.verify', phone, contract: cpf }),
    })
    if (!res.ok) {
      logger.error('SyncroLex contract.verify retornou erro', { workspaceId, status: res.status })
      return { valid: false, unavailable: true }
    }
    const data = (await res.json()) as any
    return { valid: data?.valid === true }
  } catch (err: any) {
    logger.error('Falha ao chamar contract.verify no SyncroLex', { workspaceId, err: err?.message })
    return { valid: false, unavailable: true }
  }
}

/**
 * Notifica com nova tentativa automática: o evento entra numa fila (BullMQ) e, se o SyncroLex
 * estiver fora do ar, é reenviado com espera crescente (até ~5 tentativas) em vez de se perder.
 * Nunca lança — é efeito colateral que não pode atrapalhar a resposta ao cliente.
 */
export async function notifySyncrolex(
  workspaceId: string,
  event: SyncrolexEvent,
  payload: Record<string, any>
): Promise<void> {
  try {
    await syncrolexQueue.add(
      'send',
      { workspaceId, event, payload },
      { attempts: 5, backoff: { type: 'exponential', delay: 15_000 }, removeOnComplete: 500, removeOnFail: 500 }
    )
  } catch (err: any) {
    logger.error('Falha ao enfileirar evento SyncroLex; enviando direto', { err: err?.message })
    await dispatchSyncrolexWebhook(workspaceId, event, payload)
  }
}

export function startSyncrolexWorker() {
  return createWorker<{ workspaceId: string; event: SyncrolexEvent; payload: Record<string, any> }>(
    'syncrolex-events',
    async (job) => {
      const { workspaceId, event, payload } = job.data
      const r = await dispatchSyncrolexWebhook(workspaceId, event, payload)
      // Lançar faz o BullMQ tentar de novo; erro permanente (sem conexão / 4xx) é descartado sem repetir.
      if (!r.ok && r.retryable) throw new Error(r.error || 'Falha ao enviar para o SyncroLex')
    },
    2
  )
}
