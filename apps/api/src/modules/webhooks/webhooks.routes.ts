import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { messageQueue } from '../../lib/queue'
import { redis } from '../../lib/redis'

const OWNER_SILENCE_TTL = 60 * 60 // 1 hora em segundos

// Extrai o número de destino e detecta se a mensagem foi enviada pelo dono do número
function extractOwnerMessage(payload: any): string | null {
  // Evolution API: fromMe + remoteJid
  if (payload?.event === 'messages.upsert' && payload?.data?.key?.fromMe === true) {
    const jid: string = payload.data.key.remoteJid || ''
    return jid.replace('@s.whatsapp.net', '').replace('@g.us', '').replace(/\D/g, '') || null
  }

  // UAZAPI: fromMe — ignora silêncio automático pois o UAZAPI dispara fromMe=true
  // tanto para mensagens humanas quanto para mensagens enviadas pela API do Jarbas,
  // tornando impossível distinguir sem campo confiável. Silêncio é controlado apenas
  // via comando #jarbas off (enviado pelo operador humano com texto específico).
  if (payload?.message?.fromMe === true) {
    return null
  }

  // Z-API: fromMe
  if (payload?.fromMe === true) {
    return (payload.phone || '').replace(/\D/g, '') || null
  }

  return null
}

export async function webhookRoutes(app: FastifyInstance) {
  app.post('/webhooks/whatsapp/:channelId', async (req, reply) => {
    const { channelId } = req.params as { channelId: string }

    // Log para debug — remover após confirmar funcionamento
    console.log('[WEBHOOK] Recebido para canal:', channelId)
    console.log('[WEBHOOK] Payload:', JSON.stringify(req.body).slice(0, 500))

    const channel = await prisma.channel.findUnique({ where: { id: channelId } })
    if (!channel) {
      console.log('[WEBHOOK] Canal não encontrado:', channelId)
      return reply.status(404).send()
    }

    // Se o dono do número enviou mensagem, verifica se é comando especial ou silencia por 1h
    const ownerTo = extractOwnerMessage(req.body)
    if (ownerTo) {
      const silenceKey = `silence:${channelId}:${ownerTo}`

      const body = req.body as any
      const ownerText: string =
        body?.message?.text ||
        body?.data?.message?.conversation ||
        body?.data?.message?.extendedTextMessage?.text ||
        body?.text?.message || ''

      if (ownerText.trim().toLowerCase() === '#jarbas on') {
        await redis.del(silenceKey)
        console.log('[WEBHOOK] #jarbas on — silêncio removido para:', ownerTo)
      } else {
        await redis.set(silenceKey, '1', 'EX', OWNER_SILENCE_TTL)
        console.log('[WEBHOOK] Mensagem do dono — silenciando:', ownerTo)
      }

      return reply.send({ ok: true })
    }

    console.log('[WEBHOOK] Enfileirando job para canal:', channelId)
    await messageQueue.add('process', { channelId, channelType: 'WHATSAPP', payload: req.body }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    })
    return reply.send({ ok: true })
  })

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
    const channelType = body.object === 'instagram' ? 'META' : 'META'
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
}
