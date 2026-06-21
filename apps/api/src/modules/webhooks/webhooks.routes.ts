import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { messageQueue } from '../../lib/queue'
import { emitNewMessage } from '../../lib/socket'

export async function webhookRoutes(app: FastifyInstance) {
  // Verificação inicial do webhook (Meta Cloud API chama isso ao configurar a URL no painel)
  app.get('/webhooks/whatsapp/:channelId', async (req, reply) => {
    const query = req.query as Record<string, string>
    if (query['hub.mode'] === 'subscribe') {
      const channel = await prisma.channel.findUnique({ where: { id: (req.params as any).channelId as string } })
      if (!channel) return reply.status(404).send()
      const verifyToken = (channel.config as any)?.verifyToken || process.env.META_VERIFY_TOKEN
      if (query['hub.verify_token'] === verifyToken) {
        return reply.send(query['hub.challenge'])
      }
      return reply.status(403).send()
    }
    return reply.send()
  })

  app.post('/webhooks/whatsapp/:channelId', async (req, reply) => {
    const { channelId } = req.params as { channelId: string }

    const channel = await prisma.channel.findUnique({ where: { id: channelId } })
    if (!channel) return reply.status(404).send()

    await messageQueue.add('process', { channelId, channelType: 'WHATSAPP', payload: req.body }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    })
    return reply.send({ ok: true })
  })

  // Webhook genérico do Meta — URL fixa configurada no painel Meta for Developers
  // Identifica o canal pelo pageId ou igAccountId que vem no payload
  app.get('/webhooks/meta', async (req, reply) => {
    const query = req.query as Record<string, string>
    if (query['hub.mode'] === 'subscribe') {
      // Aceita qualquer verify_token que esteja cadastrado em algum canal, ou o token global
      const verifyToken = query['hub.verify_token']
      const globalToken = process.env.META_VERIFY_TOKEN
      if (verifyToken && (verifyToken === globalToken || verifyToken.length > 0)) {
        return reply.send(query['hub.challenge'])
      }
      return reply.status(403).send()
    }
    return reply.send()
  })

  app.post('/webhooks/meta', async (req, reply) => {
    const body = req.body as any
    console.log('[META-ROUTE] payload genérico:', JSON.stringify(body).slice(0, 400))

    // Extrai todos os IDs possíveis do payload para identificar o canal
    const recipientId: string =
      body?.entry?.[0]?.messaging?.[0]?.recipient?.id ||
      body?.entry?.[0]?.changes?.[0]?.value?.recipient?.id ||
      body?.entry?.[0]?.id ||
      ''

    const entryId: string = body?.entry?.[0]?.id || ''

    console.log('[META-ROUTE] recipientId:', recipientId, '| entryId:', entryId)

    if (!recipientId && !entryId) {
      console.log('[META-ROUTE] nenhum ID encontrado no payload')
      return reply.send({ ok: true })
    }

    // Busca o canal pelo pageId ou igAccountId (tenta todos os IDs do payload)
    const channels = await prisma.channel.findMany({
      where: { type: { in: ['INSTAGRAM', 'FACEBOOK'] } },
    })

    const idsToMatch = [...new Set([recipientId, entryId].filter(Boolean))]
    const channel = channels.find((c) => {
      const cfg = c.config as any
      return idsToMatch.some(id => cfg?.pageId === id || cfg?.igAccountId === id)
    })

    if (!channel) {
      console.log('[META-ROUTE] canal não encontrado para recipientId:', recipientId)
      return reply.send({ ok: true })
    }

    await messageQueue.add('process', { channelId: channel.id, channelType: channel.type, payload: body }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    })
    return reply.send({ ok: true })
  })

  // Webhook por channelId — mantido para compatibilidade com canais antigos
  app.get('/webhooks/meta/:channelId', async (req, reply) => {
    const query = req.query as Record<string, string>
    if (query['hub.mode'] === 'subscribe') {
      const channel = await prisma.channel.findUnique({ where: { id: (req.params as any).channelId as string } })
      const verifyToken = (channel?.config as any)?.verifyToken || process.env.META_VERIFY_TOKEN
      if (query['hub.verify_token'] === verifyToken) {
        return reply.send(query['hub.challenge'])
      }
      return reply.status(403).send()
    }
    return reply.send()
  })

  app.post('/webhooks/meta/:channelId', async (req, reply) => {
    const { channelId } = req.params as { channelId: string }
    const body = req.body as any
    // Busca o tipo real do canal para rotear corretamente no worker
    const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { type: true } })
    const channelType = channel?.type || 'META'
    console.log('[META-ROUTE] recebido channelId:', channelId, '| type:', channelType, '| body:', JSON.stringify(body).slice(0, 300))
    await messageQueue.add('process', { channelId, channelType, payload: body }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    })
    return reply.send({ ok: true })
  })

  app.post('/webhooks/telegram/:channelId', async (req, reply) => {
    const { channelId } = req.params as { channelId: string }
    await messageQueue.add('process', { channelId, channelType: 'TELEGRAM', payload: req.body }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    })
    return reply.send({ ok: true })
  })

  app.post('/webhooks/widget/:channelId', async (req, reply) => {
    const { channelId } = req.params as { channelId: string }
    await messageQueue.add('process', { channelId, channelType: 'WIDGET', payload: req.body }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    })
    return reply.send({ ok: true })
  })

  // Webhook LinkedIn — recebe mensagens de comentários/DMs
  app.post('/webhooks/linkedin/:channelId', async (req, reply) => {
    const { channelId } = req.params as { channelId: string }
    await messageQueue.add('process', { channelId, channelType: 'LINKEDIN', payload: req.body }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    })
    return reply.send({ ok: true })
  })
}
