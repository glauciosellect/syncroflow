import { createWorker } from '../../lib/queue'
import { prisma } from '../../lib/prisma'
import { processAgentResponse, detectIntention, detectFlow, processIncomingMedia } from '../ai/ai.service'
import { getWhatsAppProvider } from '../channels/whatsapp/provider.factory'
import { emitNewMessage, emitConversationUpdated } from '../../lib/socket'
import { redis } from '../../lib/redis'
import { scheduleAppointment, listUpcomingAppointments, cancelAppointment, getAgendaContextForPrompt } from '../calendar/calendar.service'
import { generateSpeech } from '../tts/tts.service'
import { getValidGmailToken, sendReply } from '../../lib/gmail'
import { uploadAttachment } from '../../lib/storage'
import axios from 'axios'

const AUDIO_PREFERENCE_KEY = 'audioPreference' // chave dentro de contact.variables

// Baixa a mídia recebida (URL temporária/autenticada da Meta) e re-hospeda no
// Supabase Storage, para que o link salvo em Message.mediaUrl não expire nem
// exija o Bearer token da Meta para abrir no navegador do atendente.
// Nunca lança — se falhar, a mensagem segue salva sem mediaUrl permanente.
async function rehostIncomingMedia(
  workspaceId: string,
  mediaUrl: string,
  mimetype: string | undefined,
  authHeader: string | undefined,
): Promise<string | undefined> {
  try {
    const res = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: authHeader ? { Authorization: authHeader } : undefined,
    })
    const buffer = Buffer.from(res.data)
    const contentTypeHeader = res.headers['content-type']
    const resolvedMimetype = mimetype || (typeof contentTypeHeader === 'string' ? contentTypeHeader : undefined) || 'application/octet-stream'
    const ext = resolvedMimetype.split('/').pop()?.split(';')[0] || 'bin'
    const { publicUrl } = await uploadAttachment(workspaceId, buffer, resolvedMimetype, `recebido.${ext}`)
    return publicUrl
  } catch (err: any) {
    console.error('[WORKER] Falha ao re-hospedar mídia recebida:', err?.message)
    return undefined
  }
}

// Detecta se o remetente é um grupo do WhatsApp (@g.us)
function isWhatsAppGroup(from: string): boolean {
  return from.endsWith('@g.us')
}

// Detecta se a mensagem parece ser de outra IA / bot automatizado
// Evita loop infinito entre agentes
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

// Detecta se a mensagem é uma despedida do cliente
// Quando detectado, o agente responde uma última vez e silencia a conversa por 2h
function isFarewellMessage(text: string): boolean {
  const t = text.trim()
  // Mensagem muito curta com emoji de despedida ou palavras simples
  const farewellPatterns = [
    /^(tchau|xau|tchauzinho|xauzinho|até\s*mais|até\s*logo|até\s*breve|até\s*amanhã|falou|flw|fui|valeu\s*falou|abraços?|bjs?|bjão|bjoca)[\s!.]*$/i,
    /^(bye|cya|see\s*you|goodbye|hasta\s*luego)[\s!.]*$/i,
    /\b(tchau|xau|até\s*mais|até\s*logo|até\s*breve|até\s*a\s*próxima|boa\s*noite|boa\s*tarde|bom\s*dia)\s*[\W]*$/i,
  ]
  // Só aplica em mensagens curtas (≤ 60 chars) para não bloquear respostas longas que mencionem despedida
  return t.length <= 60 && farewellPatterns.some((p) => p.test(t))
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
      if (!channel || !channel.isActive) return

      const MEDIA_CREDITS = 2
      let from: string, name: string, text: string | undefined
      let incomingMediaType: string | undefined
      let incomingMediaUrl: string | undefined
      let emailMetadata: { threadId: string; messageId: string; references?: string; subject: string } | undefined

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

          // Providers com mediaUrl prefixado ("uazapi:", "meta-cloud:", ...) expõem downloadMedia
          // para resolver o id em URL real (e, no caso da Meta, exigem o token de auth no download)
          const providerMediaMatch = msg.mediaUrl.match(/^([a-z-]+):(.+)$/)
          if (providerMediaMatch && provider.downloadMedia) {
            const messageId = providerMediaMatch[2]
            const result = await provider.downloadMedia(messageId, channelId)
            if (result.transcription) {
              text = result.transcription
              if (result.fileURL) {
                incomingMediaUrl = await rehostIncomingMedia(channel.workspaceId, result.fileURL, result.mimetype, result.authHeader)
              }
            } else if (result.fileURL) {
              // Re-hospeda no storage próprio e processa com IA em paralelo — os dois
              // baixam da mesma URL temporária da Meta, rodar em série só aumenta a
              // janela de risco dela expirar entre uma chamada e outra.
              const [rehostedUrl, processedText] = await Promise.all([
                rehostIncomingMedia(channel.workspaceId, result.fileURL, result.mimetype, result.authHeader),
                processIncomingMedia(result.fileURL, msg.mediaType, result.mimetype, result.authHeader),
              ])
              incomingMediaUrl = rehostedUrl
              text = processedText
            } else {
              text = msg.mediaType === 'audio'
                ? '[Áudio recebido — não foi possível transcrever]'
                : '[Mídia recebida]'
            }
          } else {
            const [rehostedUrl, processedText] = await Promise.all([
              rehostIncomingMedia(channel.workspaceId, msg.mediaUrl, undefined, undefined),
              processIncomingMedia(msg.mediaUrl, msg.mediaType),
            ])
            incomingMediaUrl = rehostedUrl || msg.mediaUrl
            text = processedText
          }
        }

        if (!text) return
        if (isWhatsAppGroup(from)) return
        if (isBotMessage(text)) return

        const silenceKey = `silence:${channelId}:${from}`
        const isSilenced = await redis.get(silenceKey)
        if (isSilenced) { console.log(`[WORKER] conversa silenciada (chave ${silenceKey}) — descartada`); return }

        // Se cliente se despediu, agenda silêncio de 2h para evitar loop de despedidas
        // O worker continua e processa normalmente — o agente responde a despedida uma última vez
        // Depois disso a conversa fica silenciada até o próximo contato do cliente
        const farewell = isFarewellMessage(text)
        if (farewell) {
          await redis.set(silenceKey, '1', 'EX', 2 * 60 * 60)
          console.log(`[WORKER] Despedida detectada de ${from} — silenciando por 2h após esta resposta`)
        }

      } else if (channelType === 'TELEGRAM') {
        from = String(payload.message?.from?.id || payload.message?.chat?.id)
        name = payload.message?.from?.first_name || 'Usuário'
        text = payload.message?.text
        if (!text) return
      } else if (channelType === 'LINKEDIN') {
        // LinkedIn Messaging API: payload vem como evento de mensagem direta
        const event = payload?.value ?? payload
        from = event?.sender?.accountUrn || event?.from || String(Math.random())
        name = event?.senderName || 'Usuário LinkedIn'
        text = event?.message?.text || event?.body || event?.content?.text
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

        // Ignora echos (mensagens enviadas pelo próprio canal)
        if (messaging.message?.is_echo) {
          console.log('[META] ignorando echo')
          return
        }

        // Ignora eventos sem mensagem de texto (edições, reações, etc)
        if (!messaging.message) return

        from = messaging.sender?.id || String(messaging.sender)
        name = 'Usuário'
        text = messaging.message?.text
        if (!text) return
      } else if (channelType === 'EMAIL') {
        // payload já vem parseado pelo email-poll.worker.ts (GmailMessage)
        from = payload.from
        name = payload.fromName || payload.from
        text = payload.body
        emailMetadata = {
          threadId: payload.threadId,
          messageId: payload.messageId,
          references: payload.references,
          subject: payload.subject,
        }
        if (!text) return
      } else {
        return
      }

      const agentChannel = channel.agentChannels[0]
      if (!agentChannel) { console.log('[WORKER] canal sem agente vinculado — descartado'); return }
      // agente padrão do canal (usado ao criar nova conversa)
      const defaultAgent = agentChannel.agent

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
      const planCredits: Record<string, number> = { TRIAL: 1000, STARTER: 2000, PRO: 5000, BUSINESS: 15000, ENTERPRISE: 50000 }
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
            agentId: defaultAgent.id,
            channelId,
            contactId: contact.id,
            status: 'AI_ACTIVE',
          },
        })
      }

      // Usa o agente vinculado à conversa (pode ter sido trocado por transferência entre agentes)
      // Se o agente da conversa for diferente do padrão do canal, carrega ele completo
      let agent = defaultAgent
      if (conversation.agentId !== defaultAgent.id) {
        const conversationAgent = await prisma.agent.findUnique({
          where: { id: conversation.agentId },
          include: { config: true, intentions: true, flows: { where: { isActive: true } } },
        })
        if (conversationAgent) agent = conversationAgent as typeof defaultAgent
      }

      // ── Auto-criar Lead ──────────────────────────────────────────────────────
      const config = agent.config
      if (isNewContact && config?.autoCreateLead) {
        try {
          // Resolve stageId: usa o configurado no agente, ou busca a primeira etapa do workspace
          let autoStageId: string | null = null
          const configuredStageId = (config as any).autoLeadStageId
          if (configuredStageId) {
            // Valida que o stage existe e pertence ao workspace
            const stage = await prisma.pipelineStage.findFirst({
              where: { id: configuredStageId, workspaceId: channel.workspaceId },
            })
            autoStageId = stage?.id ?? null
          }
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
              stageId: autoStageId || undefined,
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
      if (!(contact as any).humanOnly && isNewContact && config?.firstContactEnabled && (config.firstContactText || config.firstContactVideoUrl || config.firstContactFileUrl)) {
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
            mediaPromises.push(getWhatsAppProvider().sendMedia(channelId, from!, config.firstContactVideoUrl))
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
            data: { conversationId: conv.id, role: 'USER', content: text, mediaUrl: incomingMediaUrl, mediaType: incomingMediaType },
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
          data: { conversationId: conversation.id, role: 'USER', content: text, mediaUrl: incomingMediaUrl, mediaType: incomingMediaType, metadata: emailMetadata as any },
        }),
      ])

      await Promise.all([
        prisma.conversation.update({ where: { id: conversation.id }, data: { unreadCount: { increment: 1 } } }),
        Promise.resolve().then(() => { try { emitNewMessage(channel.workspaceId, conversation.id, userMsg) } catch {} }),
      ])

      // Relê o status no banco (não o valor lido no início do worker) para evitar responder
      // quando o operador assumiu a conversa entre a leitura inicial e este ponto (race condition
      // entre o webhook do operador e o processamento desta mensagem do cliente).
      const freshConversation = await prisma.conversation.findUnique({ where: { id: conversation.id }, select: { status: true } })
      if (freshConversation?.status === 'HUMAN_ACTIVE' || freshConversation?.status === 'WAITING_HUMAN') {
        console.log(`[WORKER] Silenciado: conversa ${conversation.id} está em modo humano (${freshConversation.status})`)
        return
      }

      // Contato marcado como "somente humano" — IA nunca responde
      if ((contact as any).humanOnly) {
        console.log(`[WORKER] Silenciado: contato ${contact.id} marcado como humanOnly`)
        await prisma.conversation.update({ where: { id: conversation.id }, data: { status: 'WAITING_HUMAN' } })
        return
      }

      if (config?.maxInteractionsPerChat && conversation.interactionCount >= config.maxInteractionsPerChat) {
        console.log(`[WORKER] Silenciado: conversa ${conversation.id} atingiu limite de ${config.maxInteractionsPerChat} interações (atual: ${conversation.interactionCount})`)
        return
      }

      // ── Preferência de resposta em áudio ────────────────────────────────────
      // Regra: espelha o formato do cliente. Texto → texto. Áudio → áudio.
      // Cliente pode forçar com #audio ou #texto a qualquer momento.
      const contactVars = (contact.variables as Record<string, any>) || {}
      let audioPreference: 'audio' | 'text' | undefined = contactVars[AUDIO_PREFERENCE_KEY]

      // Se recebeu áudio → responde em áudio e salva preferência
      const isAudioMessage = channelType === 'WHATSAPP' && incomingMediaType === 'audio'
      if (isAudioMessage) {
        if (audioPreference !== 'audio') {
          audioPreference = 'audio'
          await prisma.contact.update({
            where: { id: contact.id },
            data: { variables: { ...contactVars, [AUDIO_PREFERENCE_KEY]: 'audio' } },
          })
        }
      } else if (!audioPreference) {
        // Recebeu texto e não tem preferência salva → responde em texto
        audioPreference = 'text'
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

      const convHistory = history.map((m) => ({
        role: m.role === 'USER' ? 'user' : 'assistant',
        content: m.content,
      }))

      // Só intercepta com calendar se o contato já tem nome registrado;
      // caso contrário o agente IA precisa coletar dados primeiro
      const contactHasName = !!(contact.name && contact.name.trim().length > 0)

      if (wsForCalendar?.googleCalendarEnabled && contactHasName) {
        if (rescheduleKeywords.test(text) && hasDateTime) {
          // Remarcar = cancelar o existente + agendar novo
          await cancelAppointment({ workspaceId: channel.workspaceId, userMessage: text, contactName: contact.name ?? 'Cliente' })
          const result = await scheduleAppointment({ workspaceId: channel.workspaceId, userMessage: text, contactName: contact.name ?? 'Cliente', contactPhone: channelType === 'WHATSAPP' ? from : undefined, contactId: contact.id, channelId: channel.id, conversationHistory: convHistory })
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
          const result = await scheduleAppointment({ workspaceId: channel.workspaceId, userMessage: text, contactName: contact.name ?? 'Cliente', contactPhone: channelType === 'WHATSAPP' ? from : undefined, contactId: contact.id, channelId: channel.id, conversationHistory: convHistory })
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
      } else if (intention && (intention.actionType as string) === 'AGENT_TRANSFER' && (intention as any).transferToAgentId) {
        // Transferência para outro agente especialista
        const targetAgentId = (intention as any).transferToAgentId as string
        const targetAgent = await prisma.agent.findFirst({
          where: { id: targetAgentId, workspaceId: channel.workspaceId },
          include: { config: true, intentions: true, flows: { where: { isActive: true } } },
        })

        if (targetAgent) {
          // Atualiza conversa para usar o novo agente
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { agentId: targetAgentId },
          })

          // Mensagem de sistema informando a transferência
          const transferMsg = await prisma.message.create({
            data: { conversationId: conversation.id, role: 'SYSTEM', content: `Transferido para o agente: ${targetAgent.name}`, creditsUsed: 0 },
          })
          try { emitNewMessage(channel.workspaceId, conversation.id, transferMsg) } catch {}

          // Processa a resposta com o agente de destino
          const conversationHistory = history.map((m) => ({
            role: (m.role === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: m.content,
          }))
          const alreadyIntroduced = history.some(m => m.role === 'ASSISTANT' && m.content.length > 0)
          const transferContext = `\n\n[CONTEXTO INTERNO: Você acaba de assumir esta conversa como especialista de ${targetAgent.name}. ${alreadyIntroduced ? 'O cliente já foi atendido anteriormente. Continue de forma natural sem se reapresentar.' : 'Apresente-se brevemente pelo seu nome.'}]`
          const aiRes = await processAgentResponse({
            agent: targetAgent as any,
            conversationHistory,
            userMessage: text + transferContext,
            agentId: targetAgentId,
          })
          responseText = aiRes.content
          creditsUsed = aiRes.creditsUsed

          console.log(`[WORKER] Transferência de agente: ${agent.name} → ${targetAgent.name} (conv: ${conversation.id})`)
        } else {
          // Agente de destino não encontrado — resposta padrão
          responseText = 'Estou transferindo você para o setor especializado. Por favor, aguarde.'
          creditsUsed = 0
        }

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
            contactId: contact.id,
            channelId: channel.id,
            conversationHistory: convHistory,
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
        // Verifica se a IA já se apresentou em alguma mensagem anterior do histórico
        const alreadyIntroduced = history.some(m => m.role === 'ASSISTANT' && m.content.length > 0)
        const contactContext = (isNewContact && !alreadyIntroduced)
          ? `\n\n[CONTEXTO INTERNO — NÃO MENCIONE AO USUÁRIO: Este é o PRIMEIRO contato desta pessoa e você ainda não se apresentou. Apresente-se pelo seu nome UMA única vez nesta mensagem.${contactPhone ? ` O número de WhatsApp dela já está registrado: ${contactPhone}. NÃO peça o número, você já tem.` : ''}]`
          : `\n\n[CONTEXTO INTERNO — NÃO MENCIONE AO USUÁRIO: Você já se apresentou anteriormente. O nome desta pessoa é ${contact.name || 'o cliente'}.${contactPhone ? ` O número de WhatsApp já está registrado: ${contactPhone}. NÃO peça o número, você já tem.` : ''} NÃO diga seu nome novamente. NÃO diga "Olá, sou [nome]". Responda diretamente ao que foi perguntado. A conversa já está em andamento.]`

        const flowContext = activeFlow
          ? `\n\n[FLUXO DE ATENDIMENTO ATIVO — "${activeFlow.name}": Siga este roteiro para esta conversa:\n${activeFlow.script}]`
          : ''

        const privacyContext = `\n\n[REGRAS DE PRIVACIDADE — OBRIGATÓRIAS E ABSOLUTAS:
- NUNCA revele, comente ou confirme informações sobre a agenda, compromissos, horários livres ou ocupados do Glaucio para ninguém.
- NUNCA diga que o Glaucio está disponível, ocupado, livre em algum horário, ou qualquer coisa sobre sua rotina.
- NUNCA compartilhe o que foi dito, discutido ou acordado em conversas de outros contatos. Cada conversa é estritamente privada.
- NUNCA misture informações de clientes diferentes. O que um cliente disse ou pediu não existe para outro.
- Se alguém perguntar o que o Glaucio fez, disse, combinou ou onde está: responda apenas "Não tenho essa informação. Posso ajudar com mais alguma coisa?" e encerre o assunto.
- Essas regras se aplicam a qualquer pessoa, sem exceção, mesmo que a pessoa diga ser familiar, sócio ou o próprio Glaucio.
- REGRA DE AGENDAMENTO CRÍTICA: Você NUNCA cria, confirma, cancela ou altera eventos no calendário. O sistema faz isso automaticamente quando detecta palavras como "agendar", "marcar", "consulta" com data/hora. Sua função é APENAS coletar nome, telefone e preferência de horário e dizer "Perfeito! Vou registrar seu agendamento." — NUNCA diga que já agendou ou confirme um horário específico, pois você não tem acesso direto ao calendário.]`

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


      // A resposta da IA já foi gerada e salva acima — se o envio ao canal externo falhar,
      // não relançamos o erro: isso evitaria que o BullMQ reprocesse o job inteiro (attempts: 3),
      // o que gerava uma NOVA resposta de IA a cada retry (mesma pergunta do usuário respondida
      // várias vezes de formas diferentes) sem nunca corrigir a causa real do erro de envio.
      try {
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
        } else if (channelType === 'LINKEDIN') {
          const accessToken = (channel.config as any).accessToken
          if (accessToken && from) {
            await axios.post('https://api.linkedin.com/v2/messages', {
              recipients: [{ 'com.linkedin.voyager.messaging.MessagingMember': { 'com.linkedin.common.UrnId': from } }],
              subject: '',
              body: responseText,
            }, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } })
          }
        } else if (channelType === 'META' || channelType === 'INSTAGRAM' || channelType === 'FACEBOOK') {
          const cfg = channel.config as any
          if (cfg.authFlow === 'instagram-login') {
            // Fluxo novo (Instagram API with Instagram Login) — token e endpoint próprios,
            // não usa pageId/pageAccessToken do Facebook Login clássico.
            console.log('[META-SEND] channelType:', channelType, '| authFlow: instagram-login | igAccountId:', cfg.igAccountId, '| from:', from)
            await axios.post(`https://graph.instagram.com/v21.0/${cfg.igAccountId}/messages`, {
              recipient: { id: from },
              message: { text: responseText },
            }, { params: { access_token: cfg.accessToken } })
          } else {
            const pageToken = cfg.pageAccessToken
            // Instagram (fluxo legado via Facebook Login): envia via /{pageId}/messages
            // Facebook: envia via /{pageId}/messages
            const pageId = cfg.pageId
            console.log('[META-SEND] channelType:', channelType, '| pageId:', pageId, '| from:', from, '| token prefix:', pageToken?.slice(0, 20))
            await axios.post(`https://graph.facebook.com/v21.0/${pageId}/messages`, {
              recipient: { id: from },
              message: { text: responseText },
              messaging_type: 'RESPONSE',
            }, { params: { access_token: pageToken } })
          }
        } else if (channelType === 'EMAIL' && emailMetadata) {
          const accessToken = await getValidGmailToken(channelId)
          if (accessToken) {
            await sendReply(accessToken, {
              threadId: emailMetadata.threadId,
              messageId: emailMetadata.messageId,
              references: emailMetadata.references,
              to: from,
              subject: emailMetadata.subject.toLowerCase().startsWith('re:') ? emailMetadata.subject : `Re: ${emailMetadata.subject}`,
              body: responseText,
            })
          } else {
            console.error('[EMAIL-SEND] Token inválido para canal', channelId)
          }
        }
      } catch (sendErr: any) {
        // Log alto e claro: a resposta foi gerada mas NÃO chegou ao cliente de verdade.
        console.error(
          `[WORKER] FALHA NO ENVIO (canal ${channelType}, channelId ${channelId}) — mensagem gerada mas não entregue:`,
          sendErr?.response?.data || sendErr?.message
        )
      }

      } catch (err: any) {
        console.error('[WORKER] ERRO:', err?.message || err, '| status:', err?.status ?? err?.response?.status, '| detalhe:', JSON.stringify(err?.error ?? err?.response?.data ?? {}))
        throw err // re-throw para BullMQ registrar como falha e fazer retry
      }
    },
    5
  )
}
