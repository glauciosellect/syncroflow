import { createWorker } from '../../lib/queue'
import { prisma } from '../../lib/prisma'
import { processAgentResponse, detectIntention, processIncomingMedia } from '../ai/ai.service'
import { getWhatsAppProvider } from '../channels/whatsapp/provider.factory'
import { emitNewMessage, emitConversationUpdated } from '../../lib/socket'
import axios from 'axios'

export function startMessageWorker() {
  return createWorker<{ channelId: string; channelType: string; payload: any }>(
    'messages',
    async (job) => {
      const { channelId, channelType, payload } = job.data

      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        include: { agentChannels: { include: { agent: { include: { config: true, intentions: true } } } } },
      })
      if (!channel) return

      const MEDIA_CREDITS = 2
      let from: string, name: string, text: string | undefined

      if (channelType === 'WHATSAPP') {
        const provider = getWhatsAppProvider()
        const msg = provider.parseWebhook(payload)
        if (!msg) return
        from = msg.from
        name = msg.name
        text = msg.text

        // Processar mídia: áudio (transcrição), imagem (visão), documento (extração)
        if (!text && msg.mediaUrl && msg.mediaType) {
          // Debitar créditos de mídia antecipadamente
          await prisma.workspace.update({
            where: { id: channel.workspaceId },
            data: { credits: { decrement: MEDIA_CREDITS } },
          })
          text = await processIncomingMedia(msg.mediaUrl, msg.mediaType)
        }

        if (!text) return
      } else if (channelType === 'TELEGRAM') {
        from = String(payload.message?.from?.id || payload.message?.chat?.id)
        name = payload.message?.from?.first_name || 'Usuário'
        text = payload.message?.text
        if (!text) return
      } else if (channelType === 'META') {
        const messaging = payload.entry?.[0]?.messaging?.[0]
        if (!messaging) return
        from = messaging.sender.id
        name = 'Usuário'
        text = messaging.message?.text
        if (!text) return
      } else {
        return
      }

      const agentChannel = channel.agentChannels[0]
      if (!agentChannel) return
      const agent = agentChannel.agent

      // Verificar créditos antes de processar
      const workspace = await prisma.workspace.findUnique({ where: { id: channel.workspaceId } })
      if (!workspace) return

      const isMedia = !!(payload?.message?.mediaUrl || payload?.message?.fileUrl || payload?.message?.url)

      if (workspace.credits <= 0) {
        const noCreditsMsg = '⚠️ O atendimento automático está temporariamente indisponível. Entre em contato conosco para reativar o serviço.'
        if (channelType === 'WHATSAPP') {
          const provider = getWhatsAppProvider()
          await provider.sendText(channelId, from!, noCreditsMsg)
        } else if (channelType === 'TELEGRAM') {
          const botToken = (channel.config as any).botToken
          await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, { chat_id: from, text: noCreditsMsg })
        }
        return
      }

      // Aviso de créditos baixos (≤20% do plano)
      const planCredits: Record<string, number> = { TRIAL: 1000, BASIC: 2500, STANDARD: 11500, CORPORATE: 30000, ENTERPRISE: 50000 }
      const totalCredits = planCredits[workspace.plan] || 1000
      const lowCreditThreshold = Math.floor(totalCredits * 0.2)
      if (workspace.credits <= lowCreditThreshold && workspace.credits > 0) {
        const lowMsg = `⚠️ Atenção: você está com apenas ${workspace.credits} créditos restantes. Adquira mais créditos para não interromper seu atendimento.`
        if (channelType === 'WHATSAPP') {
          const provider = getWhatsAppProvider()
          await provider.sendText(channelId, from!, lowMsg)
        }
      }

      let contact = await prisma.contact.findUnique({
        where: { workspaceId_channelId_externalId: { workspaceId: channel.workspaceId, channelId, externalId: from } },
      })
      if (!contact) {
        contact = await prisma.contact.create({
          data: { workspaceId: channel.workspaceId, channelId, externalId: from, name, phone: channelType === 'WHATSAPP' ? from : undefined },
        })
      }

      let conversation = await prisma.conversation.findFirst({
        where: { channelId, contactId: contact.id, status: { not: 'CLOSED' } },
      })
      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            workspaceId: channel.workspaceId,
            agentId: agent.id,
            channelId,
            contactId: contact.id,
            status: 'AI_ACTIVE',
          },
        })
      }

      const userMsg = await prisma.message.create({
        data: { conversationId: conversation.id, role: 'USER', content: text },
      })
      try { emitNewMessage(channel.workspaceId, conversation.id, userMsg) } catch {}

      if (conversation.status === 'HUMAN_ACTIVE' || conversation.status === 'WAITING_HUMAN') {
        return
      }

      const config = agent.config
      if (config?.maxInteractionsPerChat && conversation.interactionCount >= config.maxInteractionsPerChat) {
        return
      }

      const intention = await detectIntention(text, agent.intentions)
      let responseText: string
      let creditsUsed = 0

      if (intention && intention.actionType === 'INTERNAL') {
        // Intenção interna — mensagem fixa, zero créditos de IA
        responseText = (intention.webhookBody as any)?.fixedMessage || intention.name
        creditsUsed = 0
      } else if (intention && intention.webhookUrl) {
        try {
          const webhookRes = await axios({
            method: (intention.webhookMethod || 'POST') as any,
            url: intention.webhookUrl,
            data: intention.webhookBody || {},
            headers: (intention.webhookHeaders as any) || {},
            timeout: 10000,
          })

          if (intention.responseMode === 'API_RAW') {
            responseText = JSON.stringify(webhookRes.data)
          } else if (intention.responseMode === 'FIXED_MESSAGE') {
            responseText = (intention.webhookBody as any)?.fixedMessage || 'Sua solicitação foi processada com sucesso.'
          } else {
            const aiRes = await processAgentResponse({
              agent: agent as any,
              conversationHistory: [],
              userMessage: `O usuário solicitou: "${text}". A API retornou: ${JSON.stringify(webhookRes.data)}. Responda naturalmente ao usuário.`,
              agentId: agent.id,
            })
            responseText = aiRes.content
            creditsUsed = aiRes.creditsUsed
          }

          if (intention.outputVariables && contact) {
            const vars = (intention.outputVariables as any[]) || []
            const contactVars = (contact.variables as Record<string, any>) || {}
            for (const v of vars) {
              if (v.path && webhookRes.data[v.key] !== undefined) {
                contactVars[v.name] = webhookRes.data[v.key]
              }
            }
            await prisma.contact.update({ where: { id: contact.id }, data: { variables: contactVars } })
          }
        } catch {
          responseText = 'Desculpe, não consegui processar sua solicitação no momento.'
        }
      } else {
        const history = await prisma.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: 'asc' },
          take: 20,
        })
        const conversationHistory = history.map((m) => ({
          role: (m.role === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.content,
        }))

        const aiRes = await processAgentResponse({
          agent: agent as any,
          conversationHistory,
          userMessage: text,
          agentId: agent.id,
        })
        responseText = aiRes.content
        creditsUsed = aiRes.creditsUsed
      }

      if (config?.responseDelay && config.responseDelay > 0) {
        await new Promise((r) => setTimeout(r, config.responseDelay * 1000))
      }

      const aiMsg = await prisma.message.create({
        data: { conversationId: conversation.id, role: 'ASSISTANT', content: responseText, creditsUsed },
      })
      try { emitNewMessage(channel.workspaceId, conversation.id, aiMsg) } catch {}

      const updatedConv = await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          creditsUsed: { increment: creditsUsed },
          interactionCount: { increment: 1 },
        },
      })
      try { emitConversationUpdated(channel.workspaceId, updatedConv) } catch {}

      await prisma.workspace.update({
        where: { id: channel.workspaceId },
        data: { credits: { decrement: creditsUsed } },
      })

      if (channelType === 'WHATSAPP') {
        const parts = config?.splitLongMessages && responseText.length > 800
          ? responseText.match(/.{1,800}(?:\s|$)/g) || [responseText]
          : [responseText]
        const provider = getWhatsAppProvider()
        for (const part of parts) {
          await provider.sendText(channelId, from, part.trim())
        }
      } else if (channelType === 'TELEGRAM') {
        const botToken = (channel.config as any).botToken
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          chat_id: from,
          text: responseText,
        })
      } else if (channelType === 'META') {
        const pageToken = (channel.config as any).pageAccessToken
        await axios.post('https://graph.facebook.com/v19.0/me/messages', {
          recipient: { id: from },
          message: { text: responseText },
        }, { headers: { Authorization: `Bearer ${pageToken}` } })
      }
    },
    5
  )
}
