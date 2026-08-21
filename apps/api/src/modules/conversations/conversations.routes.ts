import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { emitNewMessage, emitConversationUpdated, emitMessageDeleted } from '../../lib/socket'
import { getWhatsAppProvider } from '../channels/whatsapp/provider.factory'
import { normalizeBrazilianNumber } from '../channels/whatsapp/providers/meta-cloud.provider'
import { getWorkspaceId } from '../../lib/workspace'
import { getValidGmailToken, sendReply } from '../../lib/gmail'
import { uploadAttachment } from '../../lib/storage'
import { convertToOggOpus } from '../../lib/audio-convert'
import { captureLearningFromConversation } from '../ai/agent-learning.service'

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/amr', 'audio/webm',
])

function mimeToMediaType(mimetype: string): 'image' | 'audio' | 'document' {
  if (mimetype.startsWith('image/')) return 'image'
  if (mimetype.startsWith('audio/')) return 'audio'
  return 'document'
}

export async function conversationRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/conversations', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { status, agentId, channelId, page = '1', limit = '20', search, assignedToMe } = req.query as Record<string, string>
    const skip = (Number(page) - 1) * Number(limit)

    const where: any = { workspaceId }
    if (status) where.status = status
    if (agentId) where.agentId = agentId
    if (channelId) where.channelId = channelId
    // "Meus": conversas com atendimento humano atribuídas a quem está logado —
    // sem isso, a aba "Meus" misturava conversas de todos os atendentes.
    if (assignedToMe === 'true') where.assignedToId = sub
    if (search) where.contact = { OR: [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }] }

    const [conversations, total] = await prisma.$transaction([
      prisma.conversation.findMany({
        where,
        include: {
          contact: true,
          agent: { select: { id: true, name: true, avatarUrl: true } },
          channel: { select: { id: true, type: true, name: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.conversation.count({ where }),
    ])
    return reply.send({ data: conversations, total, page: Number(page), limit: Number(limit) })
  })

  // Inicia uma conversa nova com um contato da agenda (ex: importado via CSV,
  // que ainda nunca mandou mensagem). Reaproveita conversa já aberta e não
  // encerrada com esse contato/canal, se existir, em vez de duplicar.
  app.post('/conversations/start', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { contactId, channelId } = z.object({
      contactId: z.string(),
      channelId: z.string().optional(),
    }).parse(req.body)

    const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId } })
    if (!contact) return reply.status(404).send({ error: 'Contato não encontrado' })

    const channel = channelId
      ? await prisma.channel.findFirst({ where: { id: channelId, workspaceId, isActive: true } })
      : await prisma.channel.findFirst({ where: { workspaceId, type: 'WHATSAPP', isActive: true } })
    if (!channel) return reply.status(400).send({ error: 'Nenhum canal de WhatsApp ativo encontrado' })

    const agentChannel = await prisma.agentChannel.findFirst({ where: { channelId: channel.id }, include: { agent: true } })
    if (!agentChannel) return reply.status(400).send({ error: 'Este canal não tem agente vinculado' })

    // Contato ainda sem canal vinculado (importado manualmente) — vincula
    // agora ao canal usado para iniciar a conversa, e normaliza o telefone
    // para bater com o formato usado quando ele responder de verdade.
    let usedContact = contact
    if (!contact.channelId && contact.phone) {
      const normalizedPhone = normalizeBrazilianNumber(contact.phone)
      usedContact = await prisma.contact.update({
        where: { id: contact.id },
        data: { channelId: channel.id, externalId: normalizedPhone, phone: normalizedPhone },
      })
    }

    let conversation = await prisma.conversation.findFirst({
      where: { channelId: channel.id, contactId: usedContact.id, status: { not: 'CLOSED' } },
    })
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          workspaceId,
          agentId: agentChannel.agent.id,
          channelId: channel.id,
          contactId: usedContact.id,
          status: 'HUMAN_ACTIVE',
          assignedToId: sub,
        },
      })
      try { emitConversationUpdated(workspaceId, conversation) } catch {}
    }

    // A Meta só entrega texto livre depois que o CLIENTE escreveu primeiro
    // (janela de 24h). Se ele nunca mandou nenhuma mensagem nessa conversa,
    // é preciso usar um template aprovado para iniciar — sinaliza isso para
    // o front trocar o composer normal por um seletor de template.
    let requiresTemplate = false
    if (channel.type === 'WHATSAPP') {
      const incomingMessage = await prisma.message.findFirst({
        where: { conversationId: conversation.id, role: 'USER' },
        select: { id: true },
      })
      requiresTemplate = !incomingMessage
    }

    return reply.status(201).send({ ...conversation, requiresTemplate })
  })

  app.get('/conversations/:id', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    const conversation = await prisma.conversation.findFirst({
      where: { id, workspaceId },
      include: {
        contact: true,
        agent: true,
        channel: true,
        messages: { orderBy: { createdAt: 'asc' } },
      },
    })
    if (!conversation) return reply.status(404).send({ error: 'Conversa não encontrada' })

    // Zera não lidas ao abrir a conversa
    if (conversation.unreadCount > 0) {
      await prisma.conversation.update({ where: { id }, data: { unreadCount: 0 } })
    }

    return reply.send({ ...conversation, unreadCount: 0 })
  })

  app.get('/conversations/:id/messages', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    const { page = '1', limit = '50' } = req.query as Record<string, string>
    const skip = (Number(page) - 1) * Number(limit)

    const conv = await prisma.conversation.findFirst({ where: { id, workspaceId } })
    if (!conv) return reply.status(404).send({ error: 'Conversa não encontrada' })

    const [messages, total] = await prisma.$transaction([
      prisma.message.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: 'asc' },
        skip,
        take: Number(limit),
      }),
      prisma.message.count({ where: { conversationId: id } }),
    ])
    return reply.send({ data: messages, total })
  })

  // Upload de anexo (imagem, PDF, doc, áudio) — retorna a URL para ser usada
  // no POST /messages logo em seguida. Separado do envio de mensagem porque o
  // upload em si não depende de canal/destinatário.
  app.post('/conversations/:id/attachments', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }

    const conv = await prisma.conversation.findFirst({ where: { id, workspaceId } })
    if (!conv) return reply.status(404).send({ error: 'Conversa não encontrada' })

    const file = await req.file()
    if (!file) return reply.status(400).send({ error: 'Nenhum arquivo enviado' })

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return reply.status(400).send({ error: `Tipo de arquivo não suportado: ${file.mimetype}` })
    }

    let buffer: Buffer
    try {
      buffer = await file.toBuffer()
    } catch (err: any) {
      if (err?.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.status(413).send({ error: 'Arquivo muito grande (máximo 25MB)' })
      }
      throw err
    }

    let mimetype = file.mimetype
    let filename = file.filename

    // Áudio gravado no navegador vem como webm/opus — a Meta não aceita esse
    // formato, então convertemos para ogg/opus (único container ogg suportado)
    // antes de subir para o storage.
    if (mimetype === 'audio/webm') {
      try {
        buffer = await convertToOggOpus(buffer)
        mimetype = 'audio/ogg'
        filename = filename.replace(/\.webm$/i, '.ogg')
      } catch (err: any) {
        console.error('[attachments] Falha ao converter áudio:', err?.message)
        return reply.status(500).send({ error: 'Falha ao processar áudio gravado' })
      }
    }

    const { publicUrl } = await uploadAttachment(workspaceId, buffer, mimetype, filename)
    // filename original volta pro front, que reenvia em POST /messages — é o
    // nome real usado ao entregar o documento pro cliente no WhatsApp (ver
    // bug corrigido em 2026-08: antes disso o backend inventava um nome a
    // partir do caption ou da própria mediaUrl, perdendo a extensão .pdf).
    return reply.send({ mediaUrl: publicUrl, mediaType: mimeToMediaType(mimetype), mimetype, filename })
  })

  // Envia um template de mensagem aprovado pela Meta — usado para iniciar
  // conversa com contato que nunca escreveu antes (ver requiresTemplate em
  // POST /conversations/start). Salva como mensagem HUMAN normal no histórico.
  app.post('/conversations/:id/send-template', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    const { templateName, languageCode, params, previewText } = z.object({
      templateName: z.string(),
      languageCode: z.string(),
      params: z.array(z.string()).optional(),
      previewText: z.string(),
    }).parse(req.body)

    const conv = await prisma.conversation.findFirst({
      where: { id, workspaceId },
      include: { contact: true, channel: true },
    })
    if (!conv) return reply.status(404).send({ error: 'Conversa não encontrada' })
    if (conv.channel.type !== 'WHATSAPP' || !conv.contact.externalId) {
      return reply.status(400).send({ error: 'Templates só são suportados para conversas de WhatsApp' })
    }

    const provider = getWhatsAppProvider()
    if (!provider.sendTemplate) return reply.status(400).send({ error: 'Provider atual não suporta envio de templates' })

    const message = await prisma.message.create({
      data: { conversationId: id, role: 'HUMAN', content: previewText },
    })
    try { emitNewMessage(workspaceId, id, message) } catch {}

    try {
      const wamid = await provider.sendTemplate(conv.channelId, conv.contact.externalId, templateName, languageCode, params)
      if (wamid) await prisma.message.update({ where: { id: message.id }, data: { externalId: wamid } })
      return reply.status(201).send(message)
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error?.message || err?.message || 'Falha desconhecida ao enviar template'
      console.error('[chat] Erro ao enviar template:', errorMessage)
      const updated = await prisma.message.update({
        where: { id: message.id },
        data: { metadata: { sendError: errorMessage } },
      })
      try { emitNewMessage(workspaceId, id, updated) } catch {}
      return reply.status(201).send(updated)
    }
  })

  app.post('/conversations/:id/messages', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    const { content, mediaUrl, mediaType, filename } = z.object({
      content: z.string(),
      mediaUrl: z.string().url().optional(),
      mediaType: z.enum(['image', 'audio', 'document']).optional(),
      // Nome original do arquivo anexado (ex: "contrato.pdf"), devolvido pelo
      // POST /attachments — usado só para nomear o documento no WhatsApp,
      // nunca confundido com `content` (que é o texto/caption da mensagem).
      filename: z.string().optional(),
    }).refine(d => d.content.length > 0 || !!d.mediaUrl, { message: 'Mensagem vazia' }).parse(req.body)

    const conv = await prisma.conversation.findFirst({
      where: { id, workspaceId },
      include: { contact: true, channel: true },
    })
    if (!conv) return reply.status(404).send({ error: 'Conversa não encontrada' })

    const message = await prisma.message.create({
      data: { conversationId: id, role: 'HUMAN', content, mediaUrl, mediaType },
    })
    try { emitNewMessage(workspaceId, id, message) } catch {}

    // Envia a mensagem pelo canal de origem (WhatsApp, etc.)
    try {
      if (conv.channel.type === 'WHATSAPP' && conv.contact.externalId) {
        const provider = getWhatsAppProvider()
        let wamid: string | null = null
        if (mediaUrl && mediaType === 'audio') {
          wamid = await provider.sendAudio(conv.channelId, conv.contact.externalId, mediaUrl)
        } else if (mediaUrl) {
          wamid = await provider.sendMedia(conv.channelId, conv.contact.externalId, mediaUrl, content || undefined, filename)
        } else {
          wamid = await provider.sendText(conv.channelId, conv.contact.externalId, content)
        }
        if (wamid) await prisma.message.update({ where: { id: message.id }, data: { externalId: wamid } })
      }
      // Telegram, Facebook, Instagram, LinkedIn e Email ainda não suportam envio
      // de mídia pelo painel — só WhatsApp. Evita mandar texto vazio quando a
      // mensagem é só um anexo.
      if (conv.channel.type === 'TELEGRAM' && conv.contact.externalId && content) {
        const cfg = conv.channel.config as any
        if (cfg?.botToken) {
          const axios = (await import('axios')).default
          await axios.post(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
            chat_id: conv.contact.externalId,
            text: content,
          })
        }
      }
      // Meta (Instagram / Facebook)
      if ((conv.channel.type === 'FACEBOOK' || conv.channel.type === 'INSTAGRAM') && conv.contact.externalId && content) {
        const cfg = conv.channel.config as any
        if (cfg?.pageAccessToken) {
          const axios = (await import('axios')).default
          await axios.post('https://graph.facebook.com/v19.0/me/messages', {
            recipient: { id: conv.contact.externalId },
            message: { text: content },
          }, { headers: { Authorization: `Bearer ${cfg.pageAccessToken}` } })
        }
      }
      // LinkedIn — mesmo padrão (não-oficial) usado em message.worker.ts; ver
      // PENDENCIAS.md sobre confiabilidade dessa integração
      if (conv.channel.type === 'LINKEDIN' && conv.contact.externalId && content) {
        const cfg = conv.channel.config as any
        if (cfg?.accessToken) {
          const axios = (await import('axios')).default
          await axios.post('https://api.linkedin.com/v2/messages', {
            recipients: [{ 'com.linkedin.voyager.messaging.MessagingMember': { 'com.linkedin.common.UrnId': conv.contact.externalId } }],
            subject: '',
            body: content,
          }, { headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' } })
        }
      }
      // Email — responde na mesma thread, usando o metadata (threadId/messageId/
      // references/subject) salvo na última mensagem do cliente
      if (conv.channel.type === 'EMAIL' && conv.contact.externalId && content) {
        const lastInbound = await prisma.message.findFirst({
          where: { conversationId: id, role: 'USER', metadata: { not: undefined } },
          orderBy: { createdAt: 'desc' },
        })
        const meta = lastInbound?.metadata as any
        if (meta?.threadId && meta?.messageId) {
          const accessToken = await getValidGmailToken(conv.channelId)
          if (accessToken) {
            await sendReply(accessToken, {
              threadId: meta.threadId,
              messageId: meta.messageId,
              references: meta.references,
              to: conv.contact.externalId,
              subject: meta.subject?.toLowerCase().startsWith('re:') ? meta.subject : `Re: ${meta.subject || ''}`,
              body: content,
            })
          }
        }
      }
    } catch (err: any) {
      // Mensagem já está salva no banco (aparece na tela) mas o envio real
      // pelo canal falhou — marca isso de forma visível em vez de só logar,
      // senão o operador acha que a mensagem chegou ao cliente quando na
      // verdade nunca saiu do painel.
      const errorMessage = err?.response?.data?.error?.message || err?.message || 'Falha desconhecida ao enviar'
      console.error('[chat] Erro ao enviar mensagem pelo canal:', errorMessage)
      const updated = await prisma.message.update({
        where: { id: message.id },
        data: { metadata: { sendError: errorMessage } },
      })
      try { emitNewMessage(workspaceId, id, updated) } catch {}
      return reply.status(201).send(updated)
    }

    return reply.status(201).send(message)
  })

  // Exclui uma mensagem enviada por engano. Sempre soft-delete local
  // (some da tela, fica marcada deletedAt no banco). Se a mensagem tem
  // externalId (wamid) e o provider suporta, tenta apagar também no
  // WhatsApp do cliente — a Meta só permite isso dentro de uma janela de
  // tempo curta, então a falha nesse passo é ignorada silenciosamente e a
  // exclusão local acontece de qualquer forma.
  app.delete('/conversations/:id/messages/:messageId', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id, messageId } = req.params as { id: string; messageId: string }

    const conv = await prisma.conversation.findFirst({ where: { id, workspaceId }, include: { channel: true } })
    if (!conv) return reply.status(404).send({ error: 'Conversa não encontrada' })

    const message = await prisma.message.findFirst({ where: { id: messageId, conversationId: id } })
    if (!message) return reply.status(404).send({ error: 'Mensagem não encontrada' })
    if (message.deletedAt) return reply.send({ ok: true })

    let deletedRemotely = false
    if (message.role === 'HUMAN' && message.externalId && conv.channel.type === 'WHATSAPP') {
      try {
        const provider = getWhatsAppProvider()
        if (provider.deleteMessage) {
          await provider.deleteMessage(conv.channelId, message.externalId)
          deletedRemotely = true
        }
      } catch (err: any) {
        console.error('[chat] Falha ao excluir mensagem remotamente (fora da janela de tempo?):', err?.message)
      }
    }

    await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } })
    try { emitMessageDeleted(workspaceId, id, messageId) } catch {}

    return reply.send({ ok: true, deletedRemotely })
  })

  app.post('/conversations/:id/assume', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }

    const conv = await prisma.conversation.findFirst({ where: { id, workspaceId } })
    if (!conv) return reply.status(404).send({ error: 'Conversa não encontrada' })

    const updated = await prisma.conversation.update({
      where: { id },
      data: { status: 'HUMAN_ACTIVE', assignedToId: sub },
    })
    const sysMsg = await prisma.message.create({
      data: { conversationId: id, role: 'SYSTEM', content: 'Atendimento assumido por humano.' },
    })
    try { emitConversationUpdated(workspaceId, updated) } catch {}
    try { emitNewMessage(workspaceId, id, sysMsg) } catch {}
    return reply.send(updated)
  })

  app.post('/conversations/:id/transfer', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    const { to } = z.object({ to: z.enum(['human', 'ai']) }).parse(req.body)

    const conv = await prisma.conversation.findFirst({ where: { id, workspaceId } })
    if (!conv) return reply.status(404).send({ error: 'Conversa não encontrada' })

    const status = to === 'human' ? 'WAITING_HUMAN' : 'AI_ACTIVE'
    const updated = await prisma.conversation.update({ where: { id }, data: { status } })
    const sysMsg = await prisma.message.create({
      data: { conversationId: id, role: 'SYSTEM', content: to === 'human' ? 'Atendimento transferido para equipe humana.' : 'Atendimento retornado para IA.' },
    })
    try { emitConversationUpdated(workspaceId, updated) } catch {}
    try { emitNewMessage(workspaceId, id, sysMsg) } catch {}
    return reply.send(updated)
  })

  app.post('/conversations/:id/close', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }

    const conv = await prisma.conversation.findFirst({
      where: { id, workspaceId },
      include: { contact: true, agent: true, channel: true },
    })
    if (!conv) return reply.status(404).send({ error: 'Conversa não encontrada' })

    const updated = await prisma.conversation.update({
      where: { id },
      data: { status: 'CLOSED', endedAt: new Date(), closedBy: 'human' },
    })

    const duration = conv.startedAt ? Math.floor((Date.now() - conv.startedAt.getTime()) / 1000) : null
    await prisma.attendance.upsert({
      where: { conversationId: id },
      update: { status: 'CLOSED', endedAt: new Date(), durationSeconds: duration || undefined },
      create: {
        workspaceId,
        conversationId: id,
        contactName: conv.contact?.name || undefined,
        contactPhone: conv.contact?.phone || undefined,
        channelType: conv.channel.type,
        agentName: conv.agent.name,
        status: 'CLOSED',
        startedAt: conv.startedAt,
        endedAt: new Date(),
        durationSeconds: duration || undefined,
        creditsUsed: conv.creditsUsed,
        interactionCount: conv.interactionCount,
        protocol: conv.protocol,
      },
    })

    try { emitConversationUpdated(workspaceId, updated) } catch {}

    // Dispara em segundo plano (não bloqueia a resposta de encerrar a conversa):
    // se um atendente humano participou, tenta extrair uma lição reaproveitável
    // pro agente. Ver agent-learning.service.ts para a lógica e as travas de segurança.
    captureLearningFromConversation({ conversationId: id, workspaceId, agentId: conv.agentId }).catch(() => {})

    return reply.send(updated)
  })
}
