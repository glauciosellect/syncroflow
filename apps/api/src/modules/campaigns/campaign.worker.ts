import type { Job } from 'bullmq'
import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'
import { createWorker } from '../../lib/queue'
import { sendEmail } from '../../lib/mailer'
import { getWhatsAppProvider } from '../channels/whatsapp/provider.factory'
import { emitNewMessage } from '../../lib/socket'
import { ACTIVE_MSG_LIMITS } from '../calendar/reminder.worker'

type CampaignJob = { campaignId: string; contactId: string }

function firstName(name?: string | null) {
  return (name || '').trim().split(/\s+/)[0] || 'cliente'
}

function fill(text: string, name?: string | null) {
  return text.replace(/\{\{\s*nome\s*\}\}/gi, firstName(name))
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function finalizeIfDone(campaignId: string) {
  const pending = await prisma.campaignRecipient.count({ where: { campaignId, status: 'PENDING' } })
  if (pending > 0) return
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } })
  if (!c || ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'CANCELLED'].includes(c.status)) return
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: c.failedCount > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED', completedAt: new Date() },
  })
}

async function markRecipient(campaignId: string, contactId: string, status: 'SENT' | 'FAILED' | 'SKIPPED', error?: string) {
  await prisma.campaignRecipient.update({
    where: { campaignId_contactId: { campaignId, contactId } },
    data: { status, error: error?.slice(0, 500), sentAt: status === 'SENT' ? new Date() : undefined },
  })
}

async function processCampaignJob(job: Job<CampaignJob>) {
  const { campaignId, contactId } = job.data
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, include: { workspace: true } })
  if (!campaign || campaign.status === 'CANCELLED') return

  const recipient = await prisma.campaignRecipient.findUnique({ where: { campaignId_contactId: { campaignId, contactId } } })
  if (!recipient || recipient.status !== 'PENDING') return

  if (campaign.status === 'QUEUED') {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'SENDING' } })
  }

  const contact = await prisma.contact.findUnique({ where: { id: contactId } })
  // Quem pediu para sair depois de a campanha entrar na fila também não recebe.
  if (!contact || contact.optedOutAt) {
    await markRecipient(campaignId, contactId, 'SKIPPED', 'Contato descadastrado')
    await finalizeIfDone(campaignId)
    return
  }

  try {
    if (campaign.channelType === 'EMAIL') {
      if (!contact.email) throw new Error('Contato sem e-mail')
      const body = escapeHtml(fill(campaign.emailBody || '', contact.name)).replace(/\n/g, '<br>')
      await sendEmail(
        contact.email,
        fill(campaign.emailSubject || campaign.name, contact.name),
        `${body}<br><br><hr><p style="font-size:12px;color:#888">Para não receber mais mensagens, responda este e-mail com a palavra SAIR.</p>`
      )
    } else {
      const ws = campaign.workspace
      const limit = (ACTIVE_MSG_LIMITS[ws.plan] ?? 0) + ws.activeMsgsExtra
      const fresh = await prisma.workspace.findUnique({ where: { id: ws.id }, select: { activeMsgsUsed: true } })
      if ((fresh?.activeMsgsUsed ?? 0) >= limit) throw new Error('Cota de mensagens ativas esgotada')
      if (!contact.phone || !campaign.channelId || !campaign.templateName || !campaign.templateLanguage) {
        throw new Error('Dados insuficientes para enviar o modelo')
      }
      const provider = getWhatsAppProvider()
      if (!provider.sendTemplate) throw new Error('Provedor WhatsApp não suporta templates')
      const params = ((campaign.templateParams as string[] | null) ?? []).map((p) => fill(p, contact.name))
      const wamid = await provider.sendTemplate(campaign.channelId, contact.phone, campaign.templateName, campaign.templateLanguage, params)

      await prisma.workspace.update({ where: { id: ws.id }, data: { activeMsgsUsed: { increment: 1 } } })

      // Registra no chat: quando o cliente responder, a conversa já existe e o agente atende.
      try {
        const agentChannel = await prisma.agentChannel.findFirst({ where: { channelId: campaign.channelId } })
        if (agentChannel) {
          let conversation = await prisma.conversation.findFirst({
            where: { channelId: campaign.channelId, contactId: contact.id, status: { not: 'CLOSED' } },
          })
          if (!conversation) {
            conversation = await prisma.conversation.create({
              data: { workspaceId: ws.id, agentId: agentChannel.agentId, channelId: campaign.channelId, contactId: contact.id, status: 'AI_ACTIVE' },
            })
          }
          const preview = fill(campaign.previewText || campaign.templateName, contact.name)
          const msg = await prisma.message.create({
            data: { conversationId: conversation.id, role: 'ASSISTANT', content: preview, externalId: wamid ?? undefined, creditsUsed: 0 },
          })
          try { emitNewMessage(ws.id, conversation.id, msg) } catch {}
        }
      } catch (err: any) {
        logger.warn('[CAMPAIGN] Enviado, mas falhou ao registrar no chat', { contactId, err: err?.message })
      }
    }

    await markRecipient(campaignId, contactId, 'SENT')
    await prisma.campaign.update({ where: { id: campaignId }, data: { sentCount: { increment: 1 } } })
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message || err?.message || 'Falha desconhecida'
    logger.error('[CAMPAIGN] Falha ao enviar', { campaignId, contactId, error: msg })
    await markRecipient(campaignId, contactId, 'FAILED', msg)
    await prisma.campaign.update({ where: { id: campaignId }, data: { failedCount: { increment: 1 } } })
  }

  await finalizeIfDone(campaignId)
}

export function startCampaignWorker() {
  // Concorrência 1: o ritmo já vem dos delays na fila; assim nada dispara em rajada.
  return createWorker<CampaignJob>('campaigns', processCampaignJob, 1)
}
