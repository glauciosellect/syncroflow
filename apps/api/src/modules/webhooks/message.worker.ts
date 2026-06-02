import { createWorker } from '../../lib/queue'
import { prisma } from '../../lib/prisma'
import { processAgentResponse, detectIntention, processIncomingMedia } from '../ai/ai.service'
import { getWhatsAppProvider } from '../channels/whatsapp/provider.factory'
import { emitNewMessage, emitConversationUpdated } from '../../lib/socket'
import { redis } from '../../lib/redis'
import { scheduleAppointment, listUpcomingAppointments, cancelAppointment, getAgendaContextForPrompt } from '../calendar/calendar.service'
import { generateSpeech } from '../tts/tts.service'
import axios from 'axios'

const AUDIO_PREFERENCE_KEY = 'audioPreference' // chave dentro de contact.variables

// Detecta se o remetente é um grupo do WhatsApp (@g.us)
function isWhatsAppGroup(from: string): boolean {
  return from.endsWith('@g.us')
}

// Detecta se a mensagem parece ser de outra IA / bot automatizado
// Evita loop infinito entre agentes
function isBotMessage(text: string): boolean {
  const botPatterns = [
    /até\s*(breve|logo|mais)/i,
    /obrigad[oa]\s*por\s*(entrar|contatar|nos\s*contatar)/i,
    /atendimento\s*(encerrado|finalizado|conclu[ií]do)/i,
    /foi\s*um\s*prazer\s*(atend|ajud)/i,
    /\bbot\b/i,
    /assistente\s*virtual/i,
    /atendimento\s*autom[aá]tico/i,
    /se\s*precisar.*estamos\s*[àa]\s*disposi/i,
    /qualquer\s*(d[úu]vida|necessidade).*entre\s*em\s*contato/i,
    /conversa\s*(encerrada|finalizada)/i,
    /tchau|goodbye|adeus/i,
  ]
  return botPatterns.some((pattern) => pattern.test(text))
}

export function startMessageWorker() {
  return createWorker<{ channelId: string; channelType: string; payload: any }>(
    'messages',
    async (job) => {
      try {
      const { channelId, channelType, payload } = job.data

      console.log('[WORKER] Processando job — canal:', channelId, 'tipo:', channelType)

      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        include: { agentChannels: { include: { agent: { include: { config: true, intentions: true } } } } },
      })
      if (!channel) {
        console.log('[WORKER] Canal não encontrado:', channelId)
        return
      }

      const MEDIA_CREDITS = 2
      let from: string, name: string, text: string | undefined
      let incomingMediaType: string | undefined

      if (channelType === 'WHATSAPP') {
        const provider = getWhatsAppProvider()
        const msg = provider.parseWebhook(payload)
        console.log('[WORKER] parseWebhook resultado:', msg ? `from=${msg.from} text=${msg.text?.slice(0, 50)}` : 'null')
        if (!msg) return
        from = msg.from
        name = msg.name
        text = msg.text
        incomingMediaType = msg.mediaType

        // Processar mídia: áudio (transcrição), imagem (visão), documento (extração)
        if (!text && msg.mediaUrl && msg.mediaType) {
          await prisma.workspace.update({
            where: { id: channel.workspaceId },
            data: { credits: { decrement: MEDIA_CREDITS } },
          })

          // UAZAPI: usar endpoint nativo de download/transcrição
          if (msg.mediaUrl.startsWith('uazapi:') && provider.downloadMedia) {
            const messageId = msg.mediaUrl.replace('uazapi:', '')
            const result = await provider.downloadMedia(messageId)

            if (result.transcription) {
              text = result.transcription
            } else if (result.fileURL) {
              // Passa o mimetype real retornado pelo UAZAPI para rotear corretamente
              text = await processIncomingMedia(result.fileURL, msg.mediaType, result.mimetype)
            } else {
              text = msg.mediaType === 'audio'
                ? '[Áudio recebido — não foi possível transcrever]'
                : '[Mídia recebida]'
            }
          } else {
            text = await processIncomingMedia(msg.mediaUrl, msg.mediaType)
          }
        }

        if (!text) return

        // Ignorar mensagens de grupos do WhatsApp
        if (isWhatsAppGroup(from)) return

        // Ignorar mensagens que parecem ser de outra IA (evita loop infinito)
        if (isBotMessage(text)) return

        // Verificar se o dono do número enviou mensagem para este contato recentemente (silêncio de 1h)
        const silenceKey = `silence:${channelId}:${from}`
        const isSilenced = await redis.get(silenceKey)
        if (isSilenced) return

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
      if (!agentChannel) {
        console.log('[WORKER] Nenhum agente vinculado ao canal:', channelId)
        return
      }
      const agent = agentChannel.agent
      console.log('[WORKER] Agente:', agent.name, '| from:', from, '| text:', text?.slice(0, 80))

      // Verificar créditos antes de processar
      const workspace = await prisma.workspace.findUnique({ where: { id: channel.workspaceId } })
      if (!workspace) return
      console.log('[WORKER] Créditos:', workspace.credits)

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
      const isNewContact = !contact
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

      // Carregar histórico ANTES de salvar a mensagem atual para evitar duplicata no LLM
      const history = await prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'asc' },
        take: 20,
      })

      const userMsg = await prisma.message.create({
        data: { conversationId: conversation.id, role: 'USER', content: text },
      })

      // Incrementa não lidas (visível no chat interno para o operador humano)
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { unreadCount: { increment: 1 } },
      })

      try { emitNewMessage(channel.workspaceId, conversation.id, userMsg) } catch {}

      if (conversation.status === 'HUMAN_ACTIVE' || conversation.status === 'WAITING_HUMAN') {
        return
      }

      const config = agent.config
      if (config?.maxInteractionsPerChat && conversation.interactionCount >= config.maxInteractionsPerChat) {
        return
      }

      // ── Preferência de resposta em áudio ────────────────────────────────────
      const contactVars = (contact.variables as Record<string, any>) || {}
      const audioPreference: 'audio' | 'text' | undefined = contactVars[AUDIO_PREFERENCE_KEY]

      // Detecta se a mensagem recebida veio de áudio (já transcrita)
      const isAudioMessage = channelType === 'WHATSAPP' && incomingMediaType === 'audio'

      // Se recebeu áudio e ainda não tem preferência salva → pergunta
      if (isAudioMessage && !audioPreference && channelType === 'WHATSAPP') {
        const pergunta = 'Recebi sua mensagem de voz! 🎙️ Prefere que eu responda em *áudio* ou *texto*? Responda "áudio" ou "texto".'
        const provider = getWhatsAppProvider()
        await provider.sendText(channelId, from, pergunta)
        const askMsg = await prisma.message.create({
          data: { conversationId: conversation.id, role: 'ASSISTANT', content: pergunta, creditsUsed: 0 },
        })
        try { emitNewMessage(channel.workspaceId, conversation.id, askMsg) } catch {}
        return
      }

      // Detecta resposta de preferência do usuário
      const lowerText = text.trim().toLowerCase()
      if (!audioPreference && (lowerText === 'áudio' || lowerText === 'audio' || lowerText === 'voz')) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: { variables: { ...contactVars, [AUDIO_PREFERENCE_KEY]: 'audio' } },
        })
        const confirmMsg = 'Ótimo! Vou responder em áudio a partir de agora. 🎧'
        if (channelType === 'WHATSAPP') {
          const provider = getWhatsAppProvider()
          await provider.sendText(channelId, from, confirmMsg)
        }
        const cfmMsg = await prisma.message.create({
          data: { conversationId: conversation.id, role: 'ASSISTANT', content: confirmMsg, creditsUsed: 0 },
        })
        try { emitNewMessage(channel.workspaceId, conversation.id, cfmMsg) } catch {}
        return
      }

      if (!audioPreference && (lowerText === 'texto' || lowerText === 'text' || lowerText === 'escrito')) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: { variables: { ...contactVars, [AUDIO_PREFERENCE_KEY]: 'text' } },
        })
        const confirmMsg = 'Perfeito! Responderei sempre em texto. ✍️'
        if (channelType === 'WHATSAPP') {
          const provider = getWhatsAppProvider()
          await provider.sendText(channelId, from, confirmMsg)
        }
        const cfmMsg = await prisma.message.create({
          data: { conversationId: conversation.id, role: 'ASSISTANT', content: confirmMsg, creditsUsed: 0 },
        })
        try { emitNewMessage(channel.workspaceId, conversation.id, cfmMsg) } catch {}
        return
      }
      // ────────────────────────────────────────────────────────────────────────

      // Verificar Google Calendar ANTES das intenções para ter prioridade
      const wsForCalendar = await prisma.workspace.findUnique({
        where: { id: channel.workspaceId },
        select: { googleCalendarEnabled: true } as any,
      }) as any

      const scheduleKeywords = /\bagendar\b|\bagend(e|ar|amento)\b|\bmarcar\b|\breservar\b|\bconsulta\b|\breunião\b|\bhorário\b|\bvaga\b|\bdisponível\b|\bdisponibilidade\b/i
      const cancelKeywords = /\bcancelar\b|\bdesmarcar\b|\bcancelamento\b/i
      const listKeywords = /\bver agenda\b|\bconsultar agenda\b|\bmeus agendamentos\b|\bpróximas consultas\b|\bhorários marcados\b/i
      const hasDateTime = /amanhã|hoje|segunda|terça|quarta|quinta|sexta|sábado|domingo|\d{1,2}[\/\-]\d{1,2}|\d{1,2}\s*h\b|\d{1,2}:\d{2}|próxim|semana/i.test(text)

      let calendarHandled = false
      let responseText: string = ''
      let creditsUsed = 0

      if (wsForCalendar?.googleCalendarEnabled && scheduleKeywords.test(text)) {
        if (cancelKeywords.test(text)) {
          const result = await cancelAppointment({ workspaceId: channel.workspaceId, userMessage: text, contactName: contact.name ?? 'Cliente' })
          responseText = result.message
          creditsUsed = 1
          calendarHandled = true
        } else if (listKeywords.test(text)) {
          const result = await listUpcomingAppointments(channel.workspaceId)
          responseText = result.message
          creditsUsed = 1
          calendarHandled = true
        } else if (hasDateTime) {
          const result = await scheduleAppointment({ workspaceId: channel.workspaceId, userMessage: text, contactName: contact.name ?? 'Cliente', contactPhone: channelType === 'WHATSAPP' ? from : undefined })
          responseText = result.message
          creditsUsed = 1
          calendarHandled = true
        }
      }

      let intention = null
      if (!calendarHandled) {
        try {
          intention = await detectIntention(text, agent.intentions)
        } catch {
          intention = null
        }
      }

      if (calendarHandled) {
        // já processado acima
      } else if (intention && intention.actionType === 'INTERNAL') {
        // Intenção interna — mensagem fixa, zero créditos de IA
        responseText = (intention.webhookBody as any)?.fixedMessage || intention.name
        creditsUsed = 0

      } else if (intention && (intention.actionType as string) === 'CALENDAR') {
        // Intenção de calendário — agendar, consultar ou cancelar consulta
        const calendarAction = (intention as any).calendarAction || 'SCHEDULE'

        if (calendarAction === 'LIST') {
          const result = await listUpcomingAppointments(channel.workspaceId)
          responseText = result.message
        } else if (calendarAction === 'CANCEL') {
          const result = await cancelAppointment({
            workspaceId: channel.workspaceId,
            userMessage: text,
            contactName: contact.name ?? 'Cliente',
          })
          responseText = result.message
        } else {
          // SCHEDULE (padrão)
          const result = await scheduleAppointment({
            workspaceId: channel.workspaceId,
            userMessage: text,
            contactName: contact.name ?? 'Cliente',
            contactPhone: channelType === 'WHATSAPP' ? from : undefined,
          })
          responseText = result.message
        }
        creditsUsed = 1

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
        // Fluxo padrão — resposta via IA
        const conversationHistory = history.map((m) => ({
          role: (m.role === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.content,
        }))
        const contactContext = isNewContact
          ? '\n\n[CONTEXTO INTERNO — NÃO MENCIONE AO USUÁRIO: Este é o PRIMEIRO contato desta pessoa. Apresente-se e faça uma saudação completa.]'
          : `\n\n[CONTEXTO INTERNO — NÃO MENCIONE AO USUÁRIO: Esta pessoa já entrou em contato antes. O nome dela é ${contact.name}. Use apenas uma saudação breve e direta, sem se reapresentar.]`
        const agendaContext = await getAgendaContextForPrompt(channel.workspaceId)
        const aiRes = await processAgentResponse({
          agent: agent as any,
          conversationHistory,
          userMessage: text + contactContext + agendaContext,
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

      console.log('[WORKER] Resposta gerada:', responseText?.slice(0, 100), '| créditos:', creditsUsed)

      if (channelType === 'WHATSAPP') {
        const provider = getWhatsAppProvider()
        console.log('[WORKER] Enviando resposta para:', from)

        // Resposta em áudio (voz JARVIS) se o contato preferir
        if (audioPreference === 'audio') {
          const audioBuffer = await generateSpeech(responseText, channel.workspaceId)
          if (audioBuffer && provider.sendAudioBase64) {
            await provider.sendAudioBase64(channelId, from, audioBuffer.toString('base64'))
          } else {
            // Fallback para texto se TTS falhar
            await provider.sendText(channelId, from, responseText)
          }
        } else {
          const parts = config?.splitLongMessages && responseText.length > 800
            ? responseText.match(/.{1,800}(?:\s|$)/g) || [responseText]
            : [responseText]
          for (const part of parts) {
            await provider.sendText(channelId, from, part.trim())
          }
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

      console.log('[WORKER] Job concluído com sucesso para:', from)

      } catch (err: any) {
        console.error('[WORKER] ERRO no job:', err?.message || err)
        console.error('[WORKER] Stack:', err?.stack?.slice(0, 500))
        throw err // re-throw para BullMQ registrar como falha e fazer retry
      }
    },
    5
  )
}
