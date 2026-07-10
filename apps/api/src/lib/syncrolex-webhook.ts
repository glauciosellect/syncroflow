import { prisma } from './prisma'
import { decrypt } from './crypto'
import { logger } from './logger'

export type SyncrolexEvent = 'lead.created' | 'appointment.created'

/**
 * Dispara um evento de negócio para a conexão SyncroLex ativa do workspace
 * (se houver). O SyncroLex não expõe uma API para o SyncroFlow chamar — em
 * vez disso, este helper envia um POST para a URL de webhook que o usuário
 * colou na conexão, autenticado pelo token gerado no próprio SyncroLex.
 * Contrato: docs/superpowers/specs/2026-07-10-integracao-syncroflow-design.md
 * no repositório do SyncroLex CRM.
 */
export async function dispatchSyncrolexWebhook(
  workspaceId: string,
  event: SyncrolexEvent,
  payload: Record<string, any>
): Promise<{ ok: boolean; error?: string }> {
  const conn = await prisma.crmConnection.findUnique({
    where: { workspaceId_platform: { workspaceId, platform: 'syncrolex' } },
  })
  if (!conn || conn.status !== 'active' || !conn.accessToken) {
    return { ok: false, error: 'Conexão SyncroLex não encontrada ou inativa' }
  }

  const webhookUrl = (conn.metadata as { webhookUrl?: string } | null)?.webhookUrl
  if (!webhookUrl) return { ok: false, error: 'webhookUrl não configurada nesta conexão' }

  const token = decrypt(conn.accessToken)

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ...payload }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      logger.error('SyncroLex webhook retornou erro', { workspaceId, event, status: res.status, body })
      return { ok: false, error: `SyncroLex webhook retornou ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    logger.error('Falha ao chamar webhook SyncroLex', { workspaceId, event, err })
    return { ok: false, error: 'Falha de conexão com o webhook do SyncroLex' }
  }
}

/**
 * Notifica de forma best-effort — nunca lança, apenas loga em caso de falha.
 * Use nos pontos onde a notificação é um efeito colateral opcional (ex:
 * dentro das tools do agente de IA), sem bloquear a resposta ao cliente.
 */
export async function notifySyncrolex(
  workspaceId: string,
  event: SyncrolexEvent,
  payload: Record<string, any>
): Promise<void> {
  await dispatchSyncrolexWebhook(workspaceId, event, payload)
}
