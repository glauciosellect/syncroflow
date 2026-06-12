import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { messageQueue } from '../../lib/queue'
import { redis } from '../../lib/redis'
import { emitConversationUpdated } from '../../lib/socket'

const OWNER_SILENCE_TTL = 60 * 60 // 1 hora em segundos

// Extrai o número de destino e detecta se a mensagem foi enviada pelo dono do número
function extractOwnerMessage(payload: any): string | null {
  // Evolution API: fromMe + remoteJid
  if (payload?.event === 'messages.upsert' && payload?.data?.key?.fromMe === true) {
    const jid: string = payload.data.key.remoteJid || ''
    return jid.replace('@s.whatsapp.net', '').replace('@g.us', '').replace(/\D/g, '') || null
  }

  // UAZAPI: fromMe=true para mensagens do dono. fromApi=true indica que foi enviada via API (Jarbas).
  // Se fromMe=true e fromApi=true  → foi o Jarbas via API → NÃO silencia.
  // Se fromMe=true e type=audio/video/image/document → foi a API (UAZAPI não seta fromApi=true em mídia) → NÃO silencia.
  // Se fromMe=true e fromApi!=true e tipo texto → operador humano digitou (celular/web) → silencia por 1h.
  if (payload?.message?.fromMe === true) {
    console.log('[WEBHOOK] fromMe=true detectado — fromApi:', payload?.message?.fromApi, '| type:', payload?.message?.type, '| chatid:', payload?.message?.chatid)
    if (payload?.message?.fromApi === true) return null
    const msgType: string = payload?.message?.type || ''
    if (['audio', 'video', 'image', 'document', 'ptt', 'sticker', 'media'].includes(msgType)) return null
    const chatid: string = payload?.message?.chatid || payload?.message?.sender_pn || ''
    return chatid.replace(/\D/g, '') || null
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

    const channel = await prisma.channel.findUnique({ where: { id: channelId } })
    if (!channel) return reply.status(404).send()

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

      // Busca o contato pelo número (ownerTo = número do cliente com quem o operador está falando)
      const contactForConv = await prisma.contact.findUnique({
        where: { workspaceId_channelId_externalId: { workspaceId: channel.workspaceId, channelId, externalId: ownerTo } },
      })

      const cmd = ownerText.trim().toLowerCase()
      if (cmd === '#jarbas on' || cmd === '#on' || cmd === '#ativar') {
        // Reativa o agente para este contato
        await redis.del(silenceKey)
        if (contactForConv) {
          const conv = await prisma.conversation.findFirst({
            where: { channelId, contactId: contactForConv.id, status: { in: ['HUMAN_ACTIVE', 'WAITING_HUMAN'] } },
            orderBy: { startedAt: 'desc' },
          })
          if (conv) {
            const updated = await prisma.conversation.update({
              where: { id: conv.id },
              data: { status: 'AI_ACTIVE', assignedToId: null },
            })
            try { emitConversationUpdated(channel.workspaceId, updated) } catch {}
          }
        }
      } else if (cmd === '#jarbas' || cmd === '#jarbas off' || cmd === '#off' || cmd === '#parar' || cmd === '#silenciar') {
        // Para o agente para este contato por 24h e assume a conversa
        await redis.set(silenceKey, '1', 'EX', 24 * 60 * 60)
        if (contactForConv) {
          const conv = await prisma.conversation.findFirst({
            where: { channelId, contactId: contactForConv.id, status: { not: 'CLOSED' } },
            orderBy: { startedAt: 'desc' },
          })
          if (conv && conv.status === 'AI_ACTIVE') {
            const updated = await prisma.conversation.update({
              where: { id: conv.id },
              data: { status: 'HUMAN_ACTIVE' },
            })
            try { emitConversationUpdated(channel.workspaceId, updated) } catch {}
          }
        }
      } else {
        // Qualquer outro texto do operador = silencia por 1h e assume a conversa automaticamente
        await redis.set(silenceKey, '1', 'EX', OWNER_SILENCE_TTL)
        if (contactForConv) {
          const conv = await prisma.conversation.findFirst({
            where: { channelId, contactId: contactForConv.id, status: { not: 'CLOSED' } },
            orderBy: { startedAt: 'desc' },
          })
          if (conv && conv.status === 'AI_ACTIVE') {
            const updated = await prisma.conversation.update({
              where: { id: conv.id },
              data: { status: 'HUMAN_ACTIVE' },
            })
            try { emitConversationUpdated(channel.workspaceId, updated) } catch {}
          }
        }
      }

      return reply.send({ ok: true })
    }

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
      if (query['hub.verify_token'] === process.env.META_VERIFY_TOKEN) {
        return reply.send(query['hub.challenge'])
      }
      return reply.status(403).send()
    }
    return reply.send()
  })

  app.post('/webhooks/meta', async (req, reply) => {
    const body = req.body as any
    console.log('[META-ROUTE] payload genérico:', JSON.stringify(body).slice(0, 400))

    // Extrai o recipientId (pageId ou igAccountId) do payload
    const recipientId: string =
      body?.entry?.[0]?.messaging?.[0]?.recipient?.id ||
      body?.entry?.[0]?.changes?.[0]?.value?.recipient?.id ||
      body?.entry?.[0]?.id ||
      ''

    if (!recipientId) {
      console.log('[META-ROUTE] recipientId não encontrado no payload')
      return reply.send({ ok: true })
    }

    // Busca o canal pelo pageId ou igAccountId
    const channels = await prisma.channel.findMany({
      where: { type: { in: ['INSTAGRAM', 'FACEBOOK'] } },
    })

    const channel = channels.find((c) => {
      const cfg = c.config as any
      return cfg?.pageId === recipientId || cfg?.igAccountId === recipientId
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
