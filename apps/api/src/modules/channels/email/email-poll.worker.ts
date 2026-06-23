import { createWorker, emailPollQueue, messageQueue } from '../../../lib/queue'
import { prisma } from '../../../lib/prisma'
import { getValidGmailToken, listNewMessages, getMessage, markAsRead } from '../../../lib/gmail'

const POLL_INTERVAL_MS = 5 * 60 * 1000

// Verifica se o remetente está na lista de permitidos do canal — sem isso, a
// IA responderia spam, newsletters e e-mails internos da própria empresa.
function isSenderAllowed(from: string, allowedSenders: string[]): boolean {
  if (!allowedSenders?.length) return false
  const lower = from.toLowerCase()
  return allowedSenders.some((rule) => {
    const r = rule.toLowerCase()
    return r.startsWith('@') ? lower.endsWith(r) : lower === r
  })
}

export function startEmailPollingWorker() {
  // Agenda o job repetitivo (idempotente — BullMQ não duplica se já existir
  // um repeat job idêntico registrado).
  emailPollQueue.add('poll', {}, { repeat: { every: POLL_INTERVAL_MS }, jobId: 'email-poll-recurring' }).catch((err) => {
    console.error('[EMAIL-POLL] Erro ao agendar job recorrente:', err?.message)
  })

  return createWorker<Record<string, never>>(
    'email-poll',
    async () => {
      const channels = await prisma.channel.findMany({ where: { type: 'EMAIL', isActive: true } })

      for (const channel of channels) {
        const cfg = channel.config as any
        const allowedSenders: string[] = cfg?.allowedSenders || []
        if (!allowedSenders.length) continue // sem lista configurada, não processa nada

        const accessToken = await getValidGmailToken(channel.id)
        if (!accessToken) {
          console.error(`[EMAIL-POLL] Token inválido para canal ${channel.id} — pulando`)
          continue
        }

        const messageIds = await listNewMessages(accessToken, 'is:unread -from:me')
        for (const messageId of messageIds) {
          const msg = await getMessage(accessToken, messageId)
          if (!msg) continue

          if (!isSenderAllowed(msg.from, allowedSenders)) {
            await markAsRead(accessToken, messageId)
            continue
          }

          await messageQueue.add('process', {
            channelId: channel.id,
            channelType: 'EMAIL',
            payload: msg,
          }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
          })

          await markAsRead(accessToken, messageId)
        }
      }
    },
    1, // concorrência baixa — evita sobrecarregar a Gmail API com chamadas paralelas
  )
}
