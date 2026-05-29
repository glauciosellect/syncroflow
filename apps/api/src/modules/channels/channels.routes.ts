import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { getWhatsAppProvider } from './whatsapp/provider.factory'

async function getWorkspaceId(userId: string) {
  const member = await prisma.workspaceMember.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
  if (!member) throw new Error('Workspace não encontrado')
  return member.workspaceId
}

export async function channelRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/channels', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const channels = await prisma.channel.findMany({
      where: { workspaceId },
      include: { agentChannels: { include: { agent: { select: { id: true, name: true } } } } },
    })
    return reply.send(channels)
  })

  app.post('/channels/whatsapp', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { name } = z.object({ name: z.string().min(1) }).parse(req.body)
    const channel = await prisma.channel.create({
      data: { workspaceId, type: 'WHATSAPP', name, config: { provider: process.env.WHATSAPP_PROVIDER || 'evolution' } },
    })
    const provider = getWhatsAppProvider()
    try {
      await provider.createInstance(channel.id)
    } catch {}
    return reply.status(201).send(channel)
  })

  app.post('/channels/telegram', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { name, botToken } = z.object({ name: z.string(), botToken: z.string() }).parse(req.body)
    const channel = await prisma.channel.create({
      data: { workspaceId, type: 'TELEGRAM', name, config: { botToken } },
    })
    const webhookUrl = `${process.env.API_URL}/webhooks/telegram/${channel.id}`
    const axios = (await import('axios')).default
    await axios.post(`https://api.telegram.org/bot${botToken}/setWebhook`, { url: webhookUrl })
    return reply.status(201).send(channel)
  })

  app.post('/channels/widget', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { name, color, position, welcomeMessage, allowedDomains } = z.object({
      name: z.string(),
      color: z.string().optional(),
      position: z.enum(['bottom-right', 'bottom-left']).optional(),
      welcomeMessage: z.string().optional(),
      allowedDomains: z.array(z.string()).optional(),
    }).parse(req.body)
    const channel = await prisma.channel.create({
      data: {
        workspaceId, type: 'WIDGET', name,
        config: { color: color || '#6366f1', position: position || 'bottom-right', welcomeMessage, allowedDomains },
      },
    })
    return reply.status(201).send(channel)
  })

  app.post('/channels/instagram', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { name, pageAccessToken, pageId } = z.object({ name: z.string(), pageAccessToken: z.string(), pageId: z.string() }).parse(req.body)
    const channel = await prisma.channel.create({
      data: { workspaceId, type: 'INSTAGRAM', name, config: { pageAccessToken, pageId } },
    })
    return reply.status(201).send(channel)
  })

  app.post('/channels/facebook', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { name, pageAccessToken, pageId } = z.object({ name: z.string(), pageAccessToken: z.string(), pageId: z.string() }).parse(req.body)
    const channel = await prisma.channel.create({
      data: { workspaceId, type: 'FACEBOOK', name, config: { pageAccessToken, pageId } },
    })
    return reply.status(201).send(channel)
  })

  app.delete('/channels/:id', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { id } = req.params as { id: string }
    const channel = await prisma.channel.findFirst({ where: { id, workspaceId } })
    if (!channel) return reply.status(404).send({ error: 'Canal não encontrado' })
    if (channel.type === 'WHATSAPP') {
      const provider = getWhatsAppProvider()
      try { await provider.deleteInstance(id) } catch {}
    }
    await prisma.channel.delete({ where: { id } })
    return reply.send({ ok: true })
  })

  app.patch('/channels/:id/agents', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { id } = req.params as { id: string }
    const channel = await prisma.channel.findFirst({ where: { id, workspaceId } })
    if (!channel) return reply.status(404).send({ error: 'Canal não encontrado' })
    const { agentIds } = z.object({ agentIds: z.array(z.string()) }).parse(req.body)
    await prisma.agentChannel.deleteMany({ where: { channelId: id } })
    await prisma.agentChannel.createMany({
      data: agentIds.map((agentId) => ({ agentId, channelId: id })),
      skipDuplicates: true,
    })
    return reply.send({ ok: true })
  })

  app.get('/channels/:id/qr', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { id } = req.params as { id: string }
    const channel = await prisma.channel.findFirst({ where: { id, workspaceId, type: 'WHATSAPP' } })
    if (!channel) return reply.status(404).send({ error: 'Canal não encontrado' })
    const provider = getWhatsAppProvider()
    const qr = await provider.getQRCode(id)
    const status = await provider.getStatus(id)
    return reply.send({ qr, status })
  })
}
