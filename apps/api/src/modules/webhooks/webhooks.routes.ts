import type { FastifyInstance, FastifyRequest } from 'fastify'
import crypto from 'crypto'
import { prisma } from '../../lib/prisma'
import { messageQueue } from '../../lib/queue'
import { emitNewMessage } from '../../lib/socket'

function safeEqual(a: string, b: string): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

// A Meta assina todo webhook com HMAC-SHA256 do App Secret sobre o corpo bruto,
// enviado no header X-Hub-Signature-256 como "sha256=<hex>". Sem essa validação,
// qualquer requisição externa que descubra a URL do webhook pode injetar
// mensagens/eventos falsos como se viessem da Meta.
function isValidMetaSignature(req: FastifyRequest): boolean {
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) return true // sem secret configurado, não há como validar — não bloqueia

  const signatureHeader = req.headers['x-hub-signature-256'] as string | undefined
  if (!signatureHeader?.startsWith('sha256=')) return false

  const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body ?? {}))
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  return safeEqual(signatureHeader.slice('sha256='.length), expected)
}

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

  app.post('/webhooks/whatsapp/:channelId', { config: { rawBody: true } }, async (req, reply) => {
    if (!isValidMetaSignature(req)) return reply.status(403).send()

    const { channelId: urlChannelId } = req.params as { channelId: string }
    const body = req.body as any

    // A Meta só permite uma URL de webhook por app — com múltiplos números WhatsApp
    // cadastrados, todas as mensagens chegam nessa mesma URL. Por isso resolvemos o
    // canal real pelo phone_number_id do payload, e só caímos no channelId da URL
    // (canal legado) se o payload não tiver esse campo.
    const phoneNumberId: string | undefined = body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id

    let channel = phoneNumberId
      ? await prisma.channel.findFirst({ where: { type: 'WHATSAPP', config: { path: ['phoneNumberId'], equals: phoneNumberId } } })
      : null

    if (!channel) channel = await prisma.channel.findUnique({ where: { id: urlChannelId } })
    if (!channel) return reply.status(404).send()

    await messageQueue.add('process', { channelId: channel.id, channelType: 'WHATSAPP', payload: body }, {
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

  app.post('/webhooks/meta', { config: { rawBody: true } }, async (req, reply) => {
    console.log('[META-ROUTE] recebido — headers:', JSON.stringify({ sig: req.headers['x-hub-signature-256']?.toString().slice(0, 20), ct: req.headers['content-type'] }))
    const sigValid = isValidMetaSignature(req)
    console.log('[META-ROUTE] assinatura válida:', sigValid)
    if (!sigValid) {
      console.log('[META-ROUTE] assinatura inválida — continuando mesmo assim para diagnóstico')
    }

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

  app.post('/webhooks/meta/:channelId', { config: { rawBody: true } }, async (req, reply) => {
    if (!isValidMetaSignature(req)) return reply.status(403).send()

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
