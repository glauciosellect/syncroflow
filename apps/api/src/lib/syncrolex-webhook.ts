import { prisma } from './prisma'
import { decrypt } from './crypto'
import { logger } from './logger'
import { createWorker, syncrolexQueue } from './queue'

export type SyncrolexEvent = 'lead.created' | 'appointment.created'

// Sistemas que recebem avisos por webhook (URL + token). Cada um é uma CrmConnection própria.
export type WebhookPlatform = 'syncrolex' | 'gestorama'
export const WEBHOOK_PLATFORMS: WebhookPlatform[] = ['syncrolex', 'gestorama']

export interface SyncrolexConnection { id: string; url: string; token: string; metadata: Record<string, any> }

/**
 * Conexão SyncroLex ativa do workspace (URL do webhook + token), ou null.
 * Usada tanto para avisar eventos (lead/agendamento) quanto para perguntar ao SyncroLex
 * (ex.: verificação de CPF antes de enviar documentos).
 */
export async function getSyncrolexConnection(workspaceId: string, platform: WebhookPlatform = 'syncrolex'): Promise<SyncrolexConnection | null> {
  const conn = await prisma.crmConnection.findUnique({
    where: { workspaceId_platform: { workspaceId, platform } },
  })
  if (!conn || conn.status !== 'active' || !conn.accessToken) return null
  const url = (conn.metadata as { webhookUrl?: string } | null)?.webhookUrl
  if (!url) return null
  return { id: conn.id, url, token: decrypt(conn.accessToken), metadata: (conn.metadata as Record<string, any>) || {} }
}

function rootHost(host: string) {
  return host.toLowerCase().replace(/^www\./, '')
}

/**
 * POST que segue redirecionamentos (301/302/307/308) mantendo POST, corpo e Authorization.
 * Só segue se o destino for o MESMO site (ex.: syncrolex.com.br <-> www.syncrolex.com.br):
 * nunca manda o token para outro domínio. Devolve também o endereço final.
 */
async function postFollowingRedirects(url: string, token: string, body: string): Promise<{ res: Response; finalUrl: string; redirected: boolean }> {
  let current = url
  let redirected = false
  for (let i = 0; i < 3; i++) {
    const res = await fetch(current, {
      method: 'POST',
      redirect: 'manual',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return { res, finalUrl: current, redirected }
      const next = new URL(loc, current)
      if (rootHost(next.hostname) !== rootHost(new URL(current).hostname) || next.protocol !== 'https:') {
        return { res, finalUrl: current, redirected }
      }
      current = next.toString()
      redirected = true
      continue
    }
    return { res, finalUrl: current, redirected }
  }
  throw new Error('Redirecionamentos demais')
}

// Se o endereço mudou por redirecionamento, guarda o novo para não depender dele nas próximas vezes.
async function healUrl(conn: SyncrolexConnection, finalUrl: string, redirected: boolean) {
  if (!redirected || finalUrl === conn.url) return
  try {
    await prisma.crmConnection.update({ where: { id: conn.id }, data: { metadata: { ...conn.metadata, webhookUrl: finalUrl } as any } })
    conn.url = finalUrl
    conn.metadata = { ...conn.metadata, webhookUrl: finalUrl }
  } catch { /* melhor esforço */ }
}

async function recordDispatch(conn: SyncrolexConnection, ok: boolean, error?: string) {
  try {
    await prisma.crmConnection.update({
      where: { id: conn.id },
      data: { metadata: { ...conn.metadata, lastDispatch: { at: new Date().toISOString(), ok, error: error ?? null } } as any },
    })
  } catch { /* observabilidade nunca pode quebrar o envio */ }
}

/**
 * Testa a conexão sem criar nada no SyncroLex: manda uma verificação de CPF fictícia.
 * 200 = URL e token corretos. Devolve o motivo em português quando falha.
 */
export async function testSyncrolexConnection(workspaceId: string, platform: WebhookPlatform = 'syncrolex'): Promise<{ ok: boolean; message: string }> {
  const nome = platform === 'gestorama' ? 'GestorAMA' : 'SyncroLex'
  const conn = await getSyncrolexConnection(workspaceId, platform)
  if (!conn) return { ok: false, message: `Conexão com o ${nome} não encontrada. Conecte novamente.` }
  try {
    const { res, finalUrl, redirected } = await postFollowingRedirects(conn.url, conn.token, JSON.stringify(platform === 'gestorama' ? { event: 'ping' } : { event: 'contract.verify', phone: '0000000000', contract: '00000000000' }))
    let result: { ok: boolean; message: string }
    if (res.status >= 300 && res.status < 400) result = { ok: false, message: 'O endereço está redirecionando. Cole a URL exatamente como aparece no SyncroLex (com www).' }
    else if (res.status === 401) result = { ok: false, message: 'Token inválido ou integração inativa no ' + nome + '. Copie o token de novo e reconecte.' }
    else if (res.status === 404) result = { ok: false, message: 'Endereço não encontrado. Confira a URL copiada do ' + nome + '.' }
    else if (res.status === 400) result = { ok: true, message: 'Conectado. (O ' + nome + ' ainda não responde a esta verificação, mas os avisos funcionam.)' }
    else if (res.ok) result = { ok: true, message: redirected ? 'Conectado! O endereço foi ajustado automaticamente.' : 'Conectado! O ' + nome + ' aceitou a conexão.' }
    else result = { ok: false, message: `O ${nome} respondeu com erro ${res.status}. Tente de novo em instantes.` }
    if (result.ok) await healUrl(conn, finalUrl, redirected)
    await recordDispatch(conn, result.ok, result.ok ? undefined : result.message)
    return result
  } catch {
    const result = { ok: false, message: 'Não consegui alcançar o ' + nome + '. Confira o endereço da URL.' }
    await recordDispatch(conn, false, result.message)
    return result
  }
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
  payload: Record<string, any>,
  platform: WebhookPlatform = 'syncrolex'
): Promise<{ ok: boolean; error?: string; retryable?: boolean }> {
  const conn = await getSyncrolexConnection(workspaceId, platform)
  if (!conn) return { ok: false, error: 'Conexão SyncroLex não encontrada ou inativa', retryable: false }

  try {
    const { res, finalUrl, redirected } = await postFollowingRedirects(conn.url, conn.token, JSON.stringify({ event, ...payload }))
    if (res.ok) await healUrl(conn, finalUrl, redirected)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      logger.error('SyncroLex webhook retornou erro', { workspaceId, event, status: res.status, body })
      await recordDispatch(conn, false, `Erro ${res.status} ao enviar ${event}`)
      return { ok: false, error: `SyncroLex webhook retornou ${res.status}`, retryable: res.status >= 500 || res.status === 429 }
    }
    await recordDispatch(conn, true)
    return { ok: true }
  } catch (err) {
    logger.error('Falha ao chamar webhook SyncroLex', { workspaceId, event, err })
    await recordDispatch(conn, false, 'Falha de conexão ao enviar ' + event)
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
    const { res } = await postFollowingRedirects(conn.url, conn.token, JSON.stringify({ event: 'contract.verify', phone, contract: cpf }))
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
 * Notifica os sistemas conectados (SyncroLex e/ou GestorAMA) com nova tentativa automática: cada
 * envio entra numa fila (BullMQ) e, se o destino estiver fora do ar, é reenviado com espera crescente
 * (até 5 tentativas) em vez de se perder. Quem não tem conexão ativa não gera nada.
 * Nunca lança — é efeito colateral que não pode atrapalhar a resposta ao cliente.
 */
export async function notifySyncrolex(
  workspaceId: string,
  event: SyncrolexEvent,
  payload: Record<string, any>
): Promise<void> {
  try {
    const conns = await prisma.crmConnection.findMany({
      where: { workspaceId, platform: { in: WEBHOOK_PLATFORMS }, status: 'active' },
      select: { platform: true },
    })
    for (const c of conns) {
      const platform = c.platform as WebhookPlatform
      try {
        await syncrolexQueue.add(
          'send',
          { workspaceId, event, payload, platform },
          { attempts: 5, backoff: { type: 'exponential', delay: 15_000 }, removeOnComplete: 500, removeOnFail: 500 }
        )
      } catch (err: any) {
        logger.error('Falha ao enfileirar evento; enviando direto', { platform, err: err?.message })
        await dispatchSyncrolexWebhook(workspaceId, event, payload, platform)
      }
    }
  } catch (err: any) {
    logger.error('Falha ao notificar sistemas conectados', { err: err?.message })
  }
}

export function startSyncrolexWorker() {
  return createWorker<{ workspaceId: string; event: SyncrolexEvent; payload: Record<string, any>; platform?: WebhookPlatform }>(
    'syncrolex-events',
    async (job) => {
      const { workspaceId, event, payload, platform } = job.data
      const r = await dispatchSyncrolexWebhook(workspaceId, event, payload, platform ?? 'syncrolex')
      // Lançar faz o BullMQ tentar de novo; erro permanente (sem conexão / 4xx) é descartado sem repetir.
      if (!r.ok && r.retryable) throw new Error(r.error || 'Falha ao enviar para o SyncroLex')
    },
    2
  )
}
