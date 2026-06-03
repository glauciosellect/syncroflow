import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'

const agentSchema = z.object({
  name: z.string().min(1).max(100),
  purpose: z.enum(['SUPPORT', 'SALES', 'PERSONAL']).optional(),
  companyName: z.string().max(100).optional().nullable(),
  companyWebsite: z.string().url().or(z.literal('')).optional().nullable(),
  companyDesc: z.string().max(2000).optional().nullable(),
  behavior: z.string().max(6000).optional().nullable(),
  communicationStyle: z.enum(['FORMAL', 'NORMAL', 'CASUAL']).optional(),
  llmModel: z.string().optional(),
  avatarUrl: z.string().optional().nullable(),
})

const configSchema = z.object({
  transferToHuman: z.boolean().optional(),
  summarizeOnTransfer: z.boolean().optional(),
  useEmojis: z.boolean().optional(),
  signNameInResponses: z.boolean().optional(),
  restrictTopics: z.boolean().optional(),
  splitLongMessages: z.boolean().optional(),
  allowReminders: z.boolean().optional(),
  smartTrainingSearch: z.boolean().optional(),
  timezone: z.string().optional(),
  responseDelay: z.number().int().min(0).max(300).optional(),
  maxInteractionsPerChat: z.number().int().nullable().optional(),
  workingHours: z.any().optional(),
  webhookEvents: z.any().optional(),
  transferRules: z.any().optional(),
  inactivityActions: z.any().optional(),
})

async function getWorkspaceId(userId: string) {
  const member = await prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  })
  if (!member) throw new Error('Workspace não encontrado')
  return member.workspaceId
}

export async function agentRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/agents', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { search } = req.query as { search?: string }
    const agents = await prisma.agent.findMany({
      where: {
        workspaceId,
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      include: { config: true, _count: { select: { trainings: true, conversations: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(agents)
  })

  app.post('/agents', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const data = agentSchema.parse(req.body)
    const agent = await prisma.agent.create({
      data: { ...data, workspaceId, config: { create: {} } },
      include: { config: true },
    })
    return reply.status(201).send(agent)
  })

  app.get('/agents/:id', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { id } = req.params as { id: string }
    const agent = await prisma.agent.findFirst({
      where: { id, workspaceId },
      include: {
        config: true,
        trainings: { orderBy: { createdAt: 'desc' } },
        intentions: { orderBy: { createdAt: 'desc' } },
        integrations: true,
        mcpServers: true,
        agentChannels: { include: { channel: true } },
        knowledgeBases: { include: { knowledgeBase: true } },
      },
    })
    if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' })
    return reply.send(agent)
  })

  app.patch('/agents/:id', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { id } = req.params as { id: string }
    const data = agentSchema.partial().parse(req.body)
    const agent = await prisma.agent.updateMany({
      where: { id, workspaceId },
      data,
    })
    if (agent.count === 0) return reply.status(404).send({ error: 'Agente não encontrado' })
    return reply.send(await prisma.agent.findUnique({ where: { id }, include: { config: true } }))
  })

  app.delete('/agents/:id', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { id } = req.params as { id: string }
    await prisma.agent.deleteMany({ where: { id, workspaceId } })
    return reply.send({ ok: true })
  })

  app.patch('/agents/:id/toggle', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { id } = req.params as { id: string }
    const agent = await prisma.agent.findFirst({ where: { id, workspaceId } })
    if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' })
    const updated = await prisma.agent.update({
      where: { id },
      data: { isActive: !agent.isActive },
    })
    return reply.send(updated)
  })

  app.get('/agents/:id/config', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { id } = req.params as { id: string }
    const agent = await prisma.agent.findFirst({ where: { id, workspaceId }, include: { config: true } })
    if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' })
    return reply.send(agent.config)
  })

  app.patch('/agents/:id/config', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { id } = req.params as { id: string }
    const agent = await prisma.agent.findFirst({ where: { id, workspaceId } })
    if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' })
    const data = configSchema.parse(req.body)
    const config = await prisma.agentConfig.upsert({
      where: { agentId: id },
      update: data,
      create: { agentId: id, ...data },
    })
    return reply.send(config)
  })

  app.post('/agents/:id/test', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { id } = req.params as { id: string }
    const { message } = z.object({ message: z.string() }).parse(req.body)
    const agent = await prisma.agent.findFirst({
      where: { id, workspaceId },
      include: { config: true },
    })
    if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' })
    const { testAgent } = await import('../ai/ai.service')
    const result = await testAgent(agent, message)
    return reply.send(result)
  })
}
