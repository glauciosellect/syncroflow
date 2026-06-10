import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { emitNewMessage, emitConversationUpdated } from '../../lib/socket'
import { getWhatsAppProvider } from '../channels/whatsapp/provider.factory'
import { getWorkspaceId } from '../../lib/workspace'

export async function conversationRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/conversations', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { status, agentId, channelId, page = '1', limit = '20', search } = req.query as Record<string, string>
    const skip = (Number(page) - 1) * Number(limit)

    const where: any = { workspaceId }
    if (status) where.status = status
    if (agentId) where.agentId = agentId
    if (channelId) where.channelId = channelId
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

  app.post('/conversations/:id/messages', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    const { content } = z.object({ content: z.string().min(1) }).parse(req.body)

    const conv = await prisma.conversation.findFirst({
      where: { id, workspaceId },
      include: { contact: true, channel: true },
    })
    if (!conv) return reply.status(404).send({ error: 'Conversa não encontrada' })

    const message = await prisma.message.create({
      data: { conversationId: id, role: 'HUMAN', content },
    })
    try { emitNewMessage(workspaceId, id, message) } catch {}

    // Envia a mensagem pelo canal de origem (WhatsApp, etc.)
    try {
      if (conv.channel.type === 'WHATSAPP' && conv.contact.externalId) {
        const provider = getWhatsAppProvider()
        await provider.sendText(conv.channelId, conv.contact.externalId, content)
      }
      // Telegram
      if (conv.channel.type === 'TELEGRAM' && conv.contact.externalId) {
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
      if ((conv.channel.type === 'FACEBOOK' || conv.channel.type === 'INSTAGRAM') && conv.contact.externalId) {
        const cfg = conv.channel.config as any
        if (cfg?.pageAccessToken) {
          const axios = (await import('axios')).default
          await axios.post('https://graph.facebook.com/v19.0/me/messages', {
            recipient: { id: conv.contact.externalId },
            message: { text: content },
          }, { headers: { Authorization: `Bearer ${cfg.pageAccessToken}` } })
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
