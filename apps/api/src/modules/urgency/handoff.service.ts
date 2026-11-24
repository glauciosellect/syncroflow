import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'
import { emitConversationUpdated, emitNewMessage } from '../../lib/socket'
import { sendUrgencyAlert, shouldSendUrgencyAlert } from './urgency.service'

export const DEFAULT_HANDOFF_REPLY =
  'Certo! Já avisei nossa equipe e em breve um atendente fala com você por aqui. 🙏'

/**
 * Avisa a equipe (contatos de emergência: WhatsApp + e-mail) que uma conversa aguarda atendimento humano.
 * Um aviso por conversa a cada `windowSeconds`. Nunca lança.
 */
export async function notifyTeamHandoff(opts: {
  workspaceId: string
  conversationId: string
  channelId?: string
  channelType?: string
  clientName: string
  clientPhone?: string
  summary: string
  windowSeconds?: number
}): Promise<boolean> {
  try {
    if (!(await shouldSendUrgencyAlert(`handoff:${opts.conversationId}`, opts.windowSeconds ?? 1800))) return false
    const r = await sendUrgencyAlert({
      workspaceId: opts.workspaceId,
      conversationId: opts.conversationId,
      whatsappChannelId: opts.channelType === 'WHATSAPP' ? opts.channelId : undefined,
      clientName: opts.clientName,
      clientPhone: opts.clientPhone,
      lastMessage: opts.summary,
      kind: 'handoff',
    })
    return r.alerted
  } catch (err: any) {
    logger.error('notifyTeamHandoff falhou', { err: err?.message })
    return false
  }
}

/**
 * Coloca a conversa em "Aguardando humano" (a IA para de responder), registra uma nota no chat
 * e avisa a equipe. Usado pela ação "Transferir para equipe" e pelo detector de "vou transferir".
 */
export async function moveToWaitingHuman(opts: {
  workspaceId: string
  conversationId: string
  summary: string
  note?: boolean
  notify?: boolean
}) {
  const conv = await prisma.conversation.update({
    where: { id: opts.conversationId },
    data: { status: 'WAITING_HUMAN', transferSummary: opts.summary.slice(0, 500) },
    include: { contact: { select: { name: true, phone: true } }, channel: { select: { id: true, type: true } } },
  })
  try { emitConversationUpdated(opts.workspaceId, conv) } catch {}

  if (opts.note !== false) {
    const sys = await prisma.message.create({
      data: { conversationId: opts.conversationId, role: 'SYSTEM', content: 'Cliente aguardando atendimento da equipe.', creditsUsed: 0 },
    })
    try { emitNewMessage(opts.workspaceId, opts.conversationId, sys) } catch {}
  }

  if (opts.notify !== false) {
    // não bloqueia a resposta ao cliente
    void notifyTeamHandoff({
      workspaceId: opts.workspaceId,
      conversationId: opts.conversationId,
      channelId: conv.channel?.id,
      channelType: conv.channel?.type as any,
      clientName: conv.contact?.name || conv.contact?.phone || 'Cliente',
      clientPhone: conv.contact?.phone || undefined,
      summary: opts.summary,
    })
  }
  return conv
}
