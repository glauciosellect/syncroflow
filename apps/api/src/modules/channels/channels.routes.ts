import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { getWorkspaceId } from '../../lib/workspace'
import { getWhatsAppProvider } from './whatsapp/provider.factory'
import { auditLog } from '../../lib/rbac'


export async function channelRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/channels', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const channels = await prisma.channel.findMany({
      where: { workspaceId },
      include: { agentChannels: { include: { agent: { select: { id: true, name: true, avatarUrl: true } } } } },
    })
    return reply.send(channels)
  })

  // Foto/sobre do perfil comercial do número no WhatsApp (o que o cliente vê no contato).
  app.get('/channels/:id/whatsapp-profile', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    const channel = await prisma.channel.findFirst({ where: { id, workspaceId } })
    if (!channel) return reply.status(404).send({ error: 'Canal não encontrado' })
    if (channel.type !== 'WHATSAPP') return reply.status(400).send({ error: 'Disponível apenas para canais WhatsApp' })

    const provider = getWhatsAppProvider()
    if (!provider.getBusinessProfile) return reply.send({})
    try {
      return reply.send(await provider.getBusinessProfile(id))
    } catch (err: any) {
      return reply.status(502).send({ error: 'Falha ao buscar o perfil na Meta', detail: err?.response?.data?.error?.message || err?.message })
    }
  })

  // Define a foto do perfil do WhatsApp: ou um arquivo enviado (multipart, campo
  // "file") ou a foto de um agente do workspace (JSON { agentId }).
  app.post('/channels/:id/whatsapp-profile/picture', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    const channel = await prisma.channel.findFirst({ where: { id, workspaceId } })
    if (!channel) return reply.status(404).send({ error: 'Canal não encontrado' })
    if (channel.type !== 'WHATSAPP') return reply.status(400).send({ error: 'Disponível apenas para canais WhatsApp' })

    const provider = getWhatsAppProvider()
    if (!provider.setProfilePicture) return reply.status(501).send({ error: 'Provedor de WhatsApp não suporta alterar a foto' })

    let buffer: Buffer
    let mimetype: string
    let source: 'upload' | 'agent' = 'upload'

    if (req.isMultipart()) {
      const file = await req.file()
      if (!file) return reply.status(400).send({ error: 'Nenhum arquivo enviado' })
      mimetype = file.mimetype
      try {
        buffer = await file.toBuffer()
      } catch (err: any) {
        if (err?.code === 'FST_REQ_FILE_TOO_LARGE') return reply.status(413).send({ error: 'Imagem muito grande (máximo 5MB)' })
        throw err
      }
    } else {
      const { agentId } = z.object({ agentId: z.string() }).parse(req.body)
      const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } })
      if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' })
      if (!agent.avatarUrl) return reply.status(400).send({ error: 'Esse agente ainda não tem foto — envie uma na tela do agente' })
      const axios = (await import('axios')).default
      const img = await axios.get(agent.avatarUrl, { responseType: 'arraybuffer', timeout: 20000 })
      buffer = Buffer.from(img.data)
      mimetype = String(img.headers['content-type'] || '').split(';')[0]
      source = 'agent'
    }

    // A Meta só aceita JPEG/PNG para foto de perfil do WhatsApp
    if (!['image/jpeg', 'image/png'].includes(mimetype)) {
      return reply.status(400).send({ error: `A foto do WhatsApp precisa ser JPG ou PNG (recebido: ${mimetype || 'desconhecido'})` })
    }
    if (buffer.length > 5 * 1024 * 1024) return reply.status(413).send({ error: 'Imagem muito grande (máximo 5MB)' })

    try {
      await provider.setProfilePicture(id, buffer, mimetype)
    } catch (err: any) {
      return reply.status(502).send({ error: 'A Meta recusou a foto', detail: err?.response?.data?.error?.message || err?.message })
    }

    await auditLog({
      workspaceId,
      userId: sub,
      action: 'channel.whatsapp_picture_updated',
      resourceType: 'Channel',
      resourceId: id,
      metadata: { source, channelName: channel.name },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    })
    return reply.send({ ok: true })
  })

  // Templates de mensagem aprovados pela Meta — necessários para iniciar
  // conversa com alguém que nunca escreveu antes (fora da janela de 24h).
  app.get('/channels/:id/templates', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    const channel = await prisma.channel.findFirst({ where: { id, workspaceId } })
    if (!channel) return reply.status(404).send({ error: 'Canal não encontrado' })
    if (channel.type !== 'WHATSAPP') return reply.send([])

    const provider = getWhatsAppProvider()
    if (!provider.listTemplates) return reply.send([])
    try {
      const templates = await provider.listTemplates(id)
      return reply.send(templates)
    } catch (err: any) {
      return reply.status(502).send({ error: 'Falha ao buscar templates na Meta', detail: err?.response?.data?.error?.message || err?.message })
    }
  })

  app.post('/channels/telegram', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
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
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
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
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { name, pageAccessToken, pageId } = z.object({ name: z.string(), pageAccessToken: z.string(), pageId: z.string() }).parse(req.body)
    const channel = await prisma.channel.create({
      data: { workspaceId, type: 'INSTAGRAM', name, config: { pageAccessToken, pageId } },
    })
    return reply.status(201).send(channel)
  })

  app.post('/channels/facebook', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { name, pageAccessToken, pageId } = z.object({ name: z.string(), pageAccessToken: z.string(), pageId: z.string() }).parse(req.body)
    const channel = await prisma.channel.create({
      data: { workspaceId, type: 'FACEBOOK', name, config: { pageAccessToken, pageId } },
    })
    return reply.status(201).send(channel)
  })

  // LinkedIn — via Webhook URL + Page Access Token
  app.post('/channels/linkedin', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { name, accessToken, organizationId } = z.object({
      name: z.string().min(1),
      accessToken: z.string().min(10),
      organizationId: z.string().optional(),
    }).parse(req.body)

    // Valida o token contra a API do LinkedIn
    const testRes = await fetch('https://api.linkedin.com/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!testRes.ok) return reply.status(400).send({ error: 'Access Token do LinkedIn inválido' })
    const profile = await testRes.json() as any
    const linkedinId = profile?.id || organizationId || ''

    const channel = await prisma.channel.create({
      data: {
        workspaceId, type: 'LINKEDIN', name,
        config: { accessToken, organizationId, linkedinId, profileName: profile?.localizedFirstName || name },
      },
    })
    return reply.status(201).send(channel)
  })

  // Desconecta o canal sem apagar histórico — mensagens, conversas e contatos
  // continuam preservados; o canal fica isActive=false e para de processar
  // mensagens (ver checagem em message.worker.ts). Reconectar reativa tudo.
  app.delete('/channels/:id', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    const channel = await prisma.channel.findFirst({ where: { id, workspaceId } })
    if (!channel) return reply.status(404).send({ error: 'Canal não encontrado' })
    if (channel.type === 'WHATSAPP') {
      const provider = getWhatsAppProvider()
      try { await provider.deleteInstance(id) } catch {}
    }
    await prisma.channel.update({ where: { id }, data: { isActive: false } })
    return reply.send({ ok: true })
  })

  app.patch('/channels/:id/agents', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
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

}
