import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { messageQueue } from '../../lib/queue'
import { WIDGET_SCRIPT } from './widget.script'

// Rotas PÚBLICAS do widget de chat para sites (sem JWT). Proteções:
//  - origem validada contra allowedDomains do canal
//  - visitorId aleatório (>= 20 chars) funciona como segredo para ler a própria conversa
//  - rate limit por IP em cada rota

const visitorIdSchema = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/)

function hostOf(value: string | undefined): string | null {
  if (!value) return null
  try { return new URL(value).hostname.toLowerCase() } catch { return null }
}

function originAllowed(req: FastifyRequest, allowedDomains: unknown): boolean {
  const list = Array.isArray(allowedDomains)
    ? allowedDomains.map((d) => String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean)
    : []
  if (list.length === 0) return true // sem lista configurada = qualquer site (não recomendado em produção)
  const host = hostOf(req.headers.origin as string | undefined) || hostOf(req.headers.referer as string | undefined)
  if (!host) return false
  return list.some((d) => host === d || host.endsWith('.' + d))
}

async function loadChannel(channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { agentChannels: { include: { agent: true }, take: 1 } },
  })
  if (!channel || channel.type !== 'WIDGET' || !channel.isActive) return null
  return channel
}

function open(reply: FastifyReply) {
  // helmet define CORP same-origin; o widget precisa ser carregado de outro domínio
  reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
}

export async function widgetRoutes(app: FastifyInstance) {
  app.get('/widget.js', async (_req, reply) => {
    open(reply)
    return reply
      .header('Content-Type', 'application/javascript; charset=utf-8')
      .header('Cache-Control', 'public, max-age=300')
      .send(WIDGET_SCRIPT)
  })

  app.get('/widget/:channelId/config', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    open(reply)
    const { channelId } = req.params as { channelId: string }
    const channel = await loadChannel(channelId)
    if (!channel || !originAllowed(req, (channel.config as any)?.allowedDomains)) {
      return reply.status(404).send({ error: 'Canal não encontrado' })
    }
    const cfg = channel.config as any
    const agent = channel.agentChannels[0]?.agent
    return reply.send({
      name: agent?.name || channel.name,
      role: agent?.funcao || null,
      avatarUrl: agent?.avatarUrl || null,
      color: cfg?.color || '#6366f1',
      position: cfg?.position || 'bottom-right',
      welcomeMessage: cfg?.welcomeMessage || 'Olá! Como posso ajudar?',
      online: !!agent && agent.isActive,
    })
  })

  // Visitante envia mensagem
  app.post('/widget/:channelId/messages', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    open(reply)
    const { channelId } = req.params as { channelId: string }
    const parsed = z.object({
      visitorId: visitorIdSchema,
      text: z.string().trim().min(1).max(2000),
      name: z.string().trim().max(80).optional(),
    }).safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Mensagem inválida' })

    const channel = await loadChannel(channelId)
    if (!channel || !originAllowed(req, (channel.config as any)?.allowedDomains)) {
      return reply.status(404).send({ error: 'Canal não encontrado' })
    }

    await messageQueue.add('process', { channelId, channelType: 'WIDGET', payload: parsed.data }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    })
    return reply.send({ ok: true })
  })

  // Visitante busca novas mensagens (respostas do agente). after = ISO date da última recebida.
  app.get('/widget/:channelId/messages', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    open(reply)
    const { channelId } = req.params as { channelId: string }
    const q = z.object({ visitorId: visitorIdSchema, after: z.string().datetime().optional() }).safeParse(req.query)
    if (!q.success) return reply.status(400).send({ error: 'Parâmetros inválidos' })

    const channel = await loadChannel(channelId)
    if (!channel || !originAllowed(req, (channel.config as any)?.allowedDomains)) {
      return reply.status(404).send({ error: 'Canal não encontrado' })
    }

    const contact = await prisma.contact.findUnique({
      where: { workspaceId_channelId_externalId: { workspaceId: channel.workspaceId, channelId, externalId: q.data.visitorId } },
    })
    if (!contact) return reply.send({ messages: [] })

    const conversation = await prisma.conversation.findFirst({
      where: { channelId, contactId: contact.id },
      orderBy: { createdAt: 'desc' },
    })
    if (!conversation) return reply.send({ messages: [] })

    const messages = await prisma.message.findMany({
      where: {
        conversationId: conversation.id,
        deletedAt: null,
        role: { in: ['ASSISTANT', 'HUMAN'] },
        ...(q.data.after ? { createdAt: { gt: new Date(q.data.after) } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: { id: true, role: true, content: true, createdAt: true },
    })
    return reply.send({ messages })
  })
}
