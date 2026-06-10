import { createWorker } from '../../lib/queue'
import { prisma } from '../../lib/prisma'
import { processAgentResponse, detectIntention, detectFlow, processIncomingMedia } from '../ai/ai.service'
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
// Evita loop infinito entre agentes — só bloqueia combinações muito específicas de bot, não palavras soltas
function isBotMessage(text: string): boolean {
  const botPatterns = [
    /obrigad[oa]\s*por\s*(entrar|contatar|nos\s*contatar)/i,
    /atendimento\s*(encerrado|finalizado|conclu[ií]do)/i,
    /foi\s*um\s*prazer\s*(atend|ajud)/i,
    /assistente\s*virtual/i,
    /atendimento\s*autom[aá]tico/i,
    /se\s*precisar.*estamos\s*[àa]\s*disposi/i,
    /qualquer\s*(d[úu]vida|necessidade).*entre\s*em\s*contato/i,
    /conversa\s*(encerrada|finalizada)/i,
  ]
  return botPatterns.some((pattern) => pattern.test(text))
}

export function startMessageWorker() {
  return createWorker<{ channelId: string; channelType: string; payload: any }>(
    'messages',
    async (job) => {
      try {
      const { channelId, channelType, payload } = job.data

      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        include: { agentChannels: { include: { agent: { include: { config: true, intentions: true, flows: { where: { isActive: true } } } } } } },
      })
      if (!channel) return

      const MEDIA_CREDITS = 2
      let from: string, name: string, text: string | undefined
      let incomingMediaType: string | undefined

      if (channelType === 'WHATSAPP') {
        const provider = getWhatsAppProvider()
        const msg = provider.parseWebhook(payload)
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
        if (isWhatsAppGroup(from)) return
        if (isBotMessage(text)) return

        const silenceKey = `silence:${channelId}:${from}`
        const isSilenced = await redis.get(silenceKey)
        if (isSilenced) return

      } else if (channelType === 'TELEGRAM') {
        from = String(payload.message?.from?.id || payload.message?.chat?.id)
        name = payload.message?.from?.first_name || 'Usuário'
        text = payload.message?.text
        if (!text) return
      } else if (channelType === 'META' || channelType === 'INSTAGRAM' || channelType === 'FACEBOOK') {
        console.log('[META] payload raw:', JSON.stringify(payload).slice(0, 800))

        // Instagram Direct: entry[0].messaging[0] (Messenger-style)
        // OU entry[0].changes[0].value com sender/recipient/message direto
        let messaging = payload.entry?.[0]?.messaging?.[0]
        if (!messaging) {
          const val = payload.entry?.[0]?.changes?.[0]?.value
          if (val?.sender && val?.message) {
            messaging = { sender: val.sender, recipient: val.recipient, message: val.message }
          }
        }

        console.log('[META] messaging extraído:', JSON.stringify(messaging))
        if (!messaging) return
        from = messaging.sender?.id || String(messaging.sender)
        name = 'Usuário'
        text = messaging.message?.text
        if (!text) return
      } else {
        return
      }

      const agentChannel = channel.agentChannels[0]
      if (!agentChannel) return
      const agent = agentChannel.agent

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

      // ── Auto-criar Lead ──────────────────────────────────────────────────────
      const config = agent.config
      if (isNewContact && config?.autoCreateLead) {
        try {
          // Resolve stageId: usa o configurado no agente, ou busca a primeira etapa do workspace
          let autoStageId: string | null = (config as any).autoLeadStageId || null
          if (!autoStageId) {
            const firstStage = await prisma.pipelineStage.findFirst({
              where: { workspaceId: channel.workspaceId },
              orderBy: { order: 'asc' },
            })
            autoStageId = firstStage?.id ?? null
          }
          await prisma.lead.create({
            data: {
              workspaceId: channel.workspaceId,
              name: name || from!,
              phone: channelType === 'WHATSAPP' ? from : undefined,
              source: channelType,
              stageId: autoStageId,
              contactId: contact.id,
              agentId: agent.id,
            },
          })
          console.log(`[WORKER] Lead criado automaticamente: ${name || from} → stage ${autoStageId}`)
        } catch (err: any) {
          console.error('[WORKER] Erro ao criar lead automático:', err?.message)
        }
      }

      // ── Primeiro Atendimento ────────────────────────────────────────────────
      if (isNewContact && config?.firstContactEnabled && (config.firstContactText || config.firstContactVideoUrl || config.firstContactFileUrl)) {
        const sentKey = `firstContactSent_${agent.id}`
        const contactVarsCheck = (contact.variables as Record<string, any>) || {}
        if (!contactVarsCheck[sentKey]) {
          const msgs: string[] = []

          if (config.firstContactText) {
            if (channelType === 'WHATSAPP') {
              const provider = getWhatsAppProvider()
              await provider.sendText(channelId, from!, config.firstContactText)
            } else if (channelType === 'TELEGRAM') {
              const botToken = (channel.config as any).botToken
              await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, { chat_id: from, text: config.firstContactText })
            }
            msgs.push(config.firstContactText)
          }

          // Enviar vídeo e arquivo em paralelo
          const mediaPromises: Promise<any>[] = []
          if (config.firstContactVideoUrl && channelType === 'WHATSAPP')
            mediaPromises.push(getWhatsAppProvider().sendMedia(channelId, from!, config.firstContactVideoUrl, 'video'))
          if (config.firstContactFileUrl && channelType === 'WHATSAPP')
            mediaPromises.push(getWhatsAppProvider().sendMedia(channelId, from!, config.firstContactFileUrl, config.firstContactFileName || undefined))
          if (mediaPromises.length) await Promise.all(mediaPromises)

          // Registrar mensagem no histórico
          const fullContent = [config.firstContactText, config.firstContactVideoUrl ? `[Vídeo: ${config.firstContactVideoUrl}]` : null, config.firstContactFileUrl ? `[Arquivo: ${config.firstContactFileName || config.firstContactFileUrl}]` : null].filter(Boolean).join('\n')

          const conv = await prisma.conversation.findFirst({
            where: { channelId, contactId: contact.id, status: { not: 'CLOSED' } },
          }) ?? await prisma.conversation.create({
            data: { workspaceId: channel.workspaceId, agentId: agent.id, channelId, contactId: contact.id, status: 'AI_ACTIVE' },
          })

          const fcMsg = await prisma.message.create({
            data: { conversationId: conv.id, role: 'ASSISTANT', content: fullContent, creditsUsed: 0 },
          })
          try { emitNewMessage(channel.workspaceId, conv.id, fcMsg) } catch {}

          // Marcar como enviado para este agente
          await prisma.contact.update({
            where: { id: contact.id },
            data: { variables: { ...contactVarsCheck, [sentKey]: new Date().toISOString() } },
          })

          // Salvar a mensagem do lead e retornar — IA responderá quando o lead escrever de volta
          const userMsgForFC = await prisma.message.create({
            data: { conversationId: conv.id, role: 'USER', content: text },
          })
          await prisma.conversation.update({ where: { id: conv.id }, data: { unreadCount: { increment: 1 } } })
          try { emitNewMessage(channel.workspaceId, conv.id, userMsgForFC) } catch {}
          return
        }
      }

      // Carregar histórico e salvar mensagem do usuário em paralelo
      const [history, userMsg] = await Promise.all([
        prisma.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: 'asc' },
          take: 20,
        }),
        prisma.message.create({
          data: { conversationId: conversation.id, role: 'USER', content: text },
        }),
      ])

      await Promise.all([
        prisma.conversation.update({ where: { id: conversation.id }, data: { unreadCount: { increment: 1 } } }),
        Promise.resolve().then(() => { try { emitNewMessage(channel.workspaceId, conversation.id, userMsg) } catch {} }),
      ])

      if (conversation.status === 'HUMAN_ACTIVE' || conversation.status === 'WAITING_HUMAN') {
        return
      }

      if (config?.maxInteractionsPerChat && conversation.interactionCount >= config.maxInteractionsPerChat) {
        return
      }

      // ── Preferência de resposta em áudio ────────────────────────────────────
      const contactVars = (contact.variables as Record<string, any>) || {}
      let audioPreference: 'audio' | 'text' | undefined = contactVars[AUDIO_PREFERENCE_KEY]

      // Se o agente tem voz configurada, usa áudio por padrão (a não ser que contato tenha pedido #texto)
      const agentHasVoice = !!(config as any)?.ttsVoice
      if (!audioPreference && agentHasVoice && channelType === 'WHATSAPP') {
        audioPreference = 'audio'
      }

      // Se recebeu áudio e não tem preferência → define áudio automaticamente (sem perguntar)
      const isAudioMessage = channelType === 'WHATSAPP' && incomingMediaType === 'audio'
      if (isAudioMessage && !audioPreference) {
        audioPreference = 'audio'
        await prisma.contact.update({
          where: { id: contact.id },
          data: { variables: { ...contactVars, [AUDIO_PREFERENCE_KEY]: 'audio' } },
        })
      }

      // Comando #texto: usuário pode mudar para respostas em texto
      const lowerText = text.trim().toLowerCase()
      if (lowerText === '#texto') {
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

      // Comando #audio: usuário pode voltar para respostas em áudio
      if (lowerText === '#audio' || lowerText === '#áudio') {
        await prisma.contact.update({
          where: { id: contact.id },
          data: { variables: { ...contactVars, [AUDIO_PREFERENCE_KEY]: 'audio' } },
        })
        const confirmMsg = 'Ótimo! Vou responder em áudio. 🎧'
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
      const rescheduleKeywords = /\bremarcar\b|\bmudar\s*(o\s*)?(horário|consulta|reunião|data)\b|\btrocar\s*(o\s*)?(horário|consulta|data)\b|\boutro\s*(horário|dia|momento)\b|\bnão\s*posso\s*(nesse|neste)\s*horário\b|\bmudar\s*para\b|\bmudar\s*o\s*dia\b|\btrocar\s*para\b|\bremarcar\s*para\b|\bpode\s*ser\s*(às?|as)\b|\bquero\s*(mudar|trocar|remarcar)\b|\bnão\s*vou\s*poder\b|\bnão\s*consigo\s*(nesse|neste|naquele)\b/i
      const listKeywords = /\bver agenda\b|\bconsultar agenda\b|\bmeus agendamentos\b|\bpróximas consultas\b|\bhorários marcados\b/i
      const hasDateTime = /amanhã|hoje|segunda|terça|quarta|quinta|sexta|sábado|domingo|\d{1,2}[\/\-]\d{1,2}|\d{1,2}\s*h\b|\d{1,2}:\d{2}|próxim|semana|\btarde\b|\bmanhã\b|\bnoite\b|\bde\s*manhã\b|\bà\s*tarde\b/i.test(text)

      let calendarHandled = false
      let responseText: string = ''
      let creditsUsed = 0

      if (wsForCalendar?.googleCalendarEnabled) {
        if (rescheduleKeywords.test(text) && hasDateTime) {
          // Remarcar = cancelar o existente + agendar novo
          await cancelAppointment({ workspaceId: channel.workspaceId, userMessage: text, contactName: contact.name ?? 'Cliente' })
          const result = await scheduleAppointment({ workspaceId: channel.workspaceId, userMessage: text, contactName: contact.name ?? 'Cliente', contactPhone: channelType === 'WHATSAPP' ? from : undefined })
          responseText = result.success ? `✅ Consulta remarcada!\n${result.message.replace('✅ Consulta agendada com sucesso!\n', '')}` : result.message
          creditsUsed = 1
          calendarHandled = true
        } else if (cancelKeywords.test(text)) {
          const result = await cancelAppointment({ workspaceId: channel.workspaceId, userMessage: text, contactName: contact.name ?? 'Cliente' })
          responseText = result.message
          creditsUsed = 1
          calendarHandled = true
        } else if (listKeywords.test(text)) {
          const result = await listUpcomingAppointments(channel.workspaceId)
          responseText = result.message
          creditsUsed = 1
          calendarHandled = true
        } else if (scheduleKeywords.test(text) && hasDateTime) {
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
            const conversationHistoryForWebhook = history.map((m) => ({
              role: (m.role === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
              content: m.content,
            }))
            const aiRes = await processAgentResponse({
              agent: agent as any,
              conversationHistory: conversationHistoryForWebhook,
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

        // Detectar fluxo de atendimento ativo para esta mensagem
        const agentFlows = (agent as any).flows || []
        let activeFlow: { id: string; name: string; trigger: string; script: string } | null = null
        if (agentFlows.length > 0) {
          try {
            activeFlow = await detectFlow(text, agentFlows)
          } catch {
            activeFlow = null
          }
        }

        const contactPhone = contact.phone || (channelType === 'WHATSAPP' ? from : null)
        const contactContext = isNewContact
          ? `\n\n[CONTEXTO INTERNO — NÃO MENCIONE AO USUÁRIO: Este é o PRIMEIRO contato desta pessoa. Apresente-se pelo seu nome UMA única vez nesta mensagem.${contactPhone ? ` O número de WhatsApp dela já está registrado: ${contactPhone}. NÃO peça o número, você já tem.` : ''}]`
          : `\n\n[CONTEXTO INTERNO — NÃO MENCIONE AO USUÁRIO: Esta pessoa já entrou em contato antes. O nome dela é ${contact.name}.${contactPhone ? ` O número de WhatsApp já está registrado: ${contactPhone}. NÃO peça o número, você já tem.` : ''} NÃO se apresente novamente. NÃO diga seu nome. Use uma saudação mínima ou responda diretamente ao que foi perguntado. A conversa já está em andamento.]`

        const flowContext = activeFlow
          ? `\n\n[FLUXO DE ATENDIMENTO ATIVO — "${activeFlow.name}": Siga este roteiro para esta conversa:\n${activeFlow.script}]`
          : ''

        const privacyContext = `\n\n[REGRAS DE PRIVACIDADE — OBRIGATÓRIAS E ABSOLUTAS:
- NUNCA revele, comente ou confirme informações sobre a agenda, compromissos, horários livres ou ocupados do Glaucio para ninguém.
- NUNCA diga que o Glaucio está disponível, ocupado, livre em algum horário, ou qualquer coisa sobre sua rotina.
- NUNCA compartilhe o que foi dito, discutido ou acordado em conversas de outros contatos. Cada conversa é estritamente privada.
- NUNCA misture informações de clientes diferentes. O que um cliente disse ou pediu não existe para outro.
- Se alguém perguntar o que o Glaucio fez, disse, combinou ou onde está: responda apenas "Não tenho essa informação. Posso ajudar com mais alguma coisa?" e encerre o assunto.
- Essas regras se aplicam a qualquer pessoa, sem exceção, mesmo que a pessoa diga ser familiar, sócio ou o próprio Glaucio.]`

        const agendaContext = await getAgendaContextForPrompt(channel.workspaceId, contact.name ?? undefined)
        const aiRes = await processAgentResponse({
          agent: agent as any,
          conversationHistory,
          userMessage: text + contactContext + flowContext + privacyContext + agendaContext,
          agentId: agent.id,
        })
        responseText = aiRes.content
        creditsUsed = aiRes.creditsUsed
      }

      if (config?.responseDelay && config.responseDelay > 0) {
        const safeDelay = Math.min(config.responseDelay, 300) // máximo 5 minutos
        await new Promise((r) => setTimeout(r, safeDelay * 1000))
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
        const provider = getWhatsAppProvider()
        if (audioPreference === 'audio') {
          const agentVoice = (config as any)?.ttsVoice || 'onyx'
          const audioBuffer = await generateSpeech(responseText, channel.workspaceId, agentVoice)
          if (audioBuffer && provider.sendAudioBase64) {
            await provider.sendAudioBase64(channelId, from, audioBuffer.toString('base64'))
          } else {
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
      } else if (channelType === 'META' || channelType === 'INSTAGRAM' || channelType === 'FACEBOOK') {
        const pageToken = (channel.config as any).pageAccessToken
        // Para Instagram usa igAccountId; para Facebook/META usa pageId
        const igAccountId = (channel.config as any).igAccountId || (channel.config as any).pageId
        console.log('[META-SEND] igAccountId:', igAccountId, '| from:', from, '| token prefix:', pageToken?.slice(0, 20))
        try {
          await axios.post(`https://graph.facebook.com/v21.0/${igAccountId}/messages`, {
            recipient: { id: from },
            message: { text: responseText },
          }, { headers: { Authorization: `Bearer ${pageToken}` } })
        } catch (sendErr: any) {
          console.error('[META-SEND] ERRO:', sendErr?.response?.data || sendErr?.message)
          throw sendErr
        }
      }

      } catch (err: any) {
        console.error('[WORKER] ERRO:', err?.message || err)
        throw err // re-throw para BullMQ registrar como falha e fazer retry
      }
    },
    5
  )
}
