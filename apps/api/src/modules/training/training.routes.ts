import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { trainingQueue } from '../../lib/queue'

async function getWorkspaceId(userId: string) {
  const member = await prisma.workspaceMember.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
  if (!member) throw new Error('Workspace não encontrado')
  return member.workspaceId
}

async function verifyAgent(agentId: string, workspaceId: string) {
  const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } })
  if (!agent) throw new Error('Agente não encontrado')
  return agent
}

export async function trainingRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/agents/:agentId/trainings', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { agentId } = req.params as { agentId: string }
    await verifyAgent(agentId, workspaceId)
    const { type, page = '1', limit = '20' } = req.query as { type?: string; page?: string; limit?: string }
    const skip = (Number(page) - 1) * Number(limit)
    const where = { agentId, ...(type ? { type: type as any } : {}) }
    const [trainings, total] = await prisma.$transaction([
      prisma.training.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: Number(limit) }),
      prisma.training.count({ where }),
    ])
    return reply.send({ data: trainings, total, page: Number(page), limit: Number(limit) })
  })

  app.post('/agents/:agentId/trainings/text', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { agentId } = req.params as { agentId: string }
    await verifyAgent(agentId, workspaceId)
    const { content, title } = z.object({ content: z.string().min(1).max(10000), title: z.string().optional() }).parse(req.body)
    const training = await prisma.training.create({
      data: { agentId, type: 'TEXT', content, title: title || content.slice(0, 60), status: 'PENDING' },
    })
    await trainingQueue.add('process', { trainingId: training.id, type: 'TEXT', agentId })
    return reply.status(201).send(training)
  })

  app.post('/agents/:agentId/trainings/website', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { agentId } = req.params as { agentId: string }
    await verifyAgent(agentId, workspaceId)
    const { url, crawl } = z.object({ url: z.string().url(), crawl: z.boolean().default(false) }).parse(req.body)
    const training = await prisma.training.create({
      data: { agentId, type: 'WEBSITE', url, title: url, status: 'PENDING' },
    })
    await trainingQueue.add('process', { trainingId: training.id, type: 'WEBSITE', agentId, extra: { crawl } })
    return reply.status(201).send(training)
  })

  app.post('/agents/:agentId/trainings/video', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { agentId } = req.params as { agentId: string }
    await verifyAgent(agentId, workspaceId)
    const { url } = z.object({ url: z.string().url() }).parse(req.body)
    const training = await prisma.training.create({
      data: { agentId, type: 'VIDEO', url, title: url, status: 'PENDING' },
    })
    await trainingQueue.add('process', { trainingId: training.id, type: 'VIDEO', agentId })
    return reply.status(201).send(training)
  })

  app.delete('/agents/:agentId/trainings/:trainingId', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { agentId, trainingId } = req.params as { agentId: string; trainingId: string }
    await verifyAgent(agentId, workspaceId)
    await prisma.training.deleteMany({ where: { id: trainingId, agentId } })
    return reply.send({ ok: true })
  })
}
