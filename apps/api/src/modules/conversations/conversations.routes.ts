import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { emitNewMessage, emitConversationUpdated } from '../../lib/socket'
import { getWhatsAppProvider } from '../channels/whatsapp/provider.factory'
import { getWorkspaceId } from '../../lib/workspace'
import { getValidGmailToken, sendReply } from '../../lib/gmail'
import { uploadAttachment } from '../../lib/storage'
import { convertToOggOpus } from '../../lib/audio-convert'

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
    return reply.send({ mediaUrl: publicUrl, mediaType: mimeToMediaType(mimetype), mimetype })
  })

  app.post('/conversations/:id/messages', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    const { content, mediaUrl, mediaType } = z.object({
      content: z.string(),
      mediaUrl: z.string().url().optional(),
      mediaType: z.enum(['image', 'audio', 'document']).optional(),
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
        if (mediaUrl && mediaType === 'audio') {
          await provider.sendAudio(conv.channelId, conv.contact.externalId, mediaUrl)
        } else if (mediaUrl) {
          await provider.sendMedia(conv.channelId, conv.contact.externalId, mediaUrl, content || undefined)
        } else {
          await provider.sendText(conv.channelId, conv.contact.externalId, content)
        }
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
      // Log mas não falha — mensagem já está salva no banco
      console.error('[chat] Erro ao enviar mensagem pelo canal:', err?.message)
    }

    return reply.status(201).send(message)
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
    return reply.send(updated)
  })
}
