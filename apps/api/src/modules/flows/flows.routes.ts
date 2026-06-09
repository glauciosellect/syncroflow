import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'

const flowSchema = z.object({
  name: z.string().min(1).max(255),
  trigger: z.string().min(1).max(512),
  script: z.string().min(1),
  isActive: z.boolean().optional(),
})

async function verifyAgentOwner(userId: string, agentId: string) {
  const member = await prisma.workspaceMember.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
  if (!member) throw new Error('Workspace não encontrado')
  const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId: member.workspaceId } })
  if (!agent) throw new Error('Agente não encontrado')
  return agent
}

export async function flowRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  // GET /agents/:agentId/flows
  app.get('/agents/:agentId/flows', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { agentId } = req.params as { agentId: string }
    try {
      await verifyAgentOwner(sub, agentId)
    } catch {
      return reply.status(403).send({ error: 'Sem permissão' })
    }
    const flows = await prisma.flow.findMany({
      where: { agentId },
      orderBy: { createdAt: 'asc' },
    })
    return reply.send(flows)
  })

  // POST /agents/:agentId/flows
  app.post('/agents/:agentId/flows', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { agentId } = req.params as { agentId: string }
    try {
      await verifyAgentOwner(sub, agentId)
    } catch {
      return reply.status(403).send({ error: 'Sem permissão' })
    }
    const body = flowSchema.parse(req.body)
    const flow = await prisma.flow.create({
      data: { agentId, ...body },
    })
    return reply.status(201).send(flow)
  })

  // GET /agents/:agentId/flows/:flowId
  app.get('/agents/:agentId/flows/:flowId', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { agentId, flowId } = req.params as { agentId: string; flowId: string }
    try {
      await verifyAgentOwner(sub, agentId)
    } catch {
      return reply.status(403).send({ error: 'Sem permissão' })
    }
    const flow = await prisma.flow.findFirst({ where: { id: flowId, agentId } })
    if (!flow) return reply.status(404).send({ error: 'Fluxo não encontrado' })
    return reply.send(flow)
  })

  // PATCH /agents/:agentId/flows/:flowId
  app.patch('/agents/:agentId/flows/:flowId', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { agentId, flowId } = req.params as { agentId: string; flowId: string }
    try {
      await verifyAgentOwner(sub, agentId)
    } catch {
      return reply.status(403).send({ error: 'Sem permissão' })
    }
    const body = flowSchema.partial().parse(req.body)
    const flow = await prisma.flow.updateMany({
      where: { id: flowId, agentId },
      data: body,
    })
    if (flow.count === 0) return reply.status(404).send({ error: 'Fluxo não encontrado' })
    return reply.send(await prisma.flow.findUnique({ where: { id: flowId } }))
  })

  // DELETE /agents/:agentId/flows/:flowId
  app.delete('/agents/:agentId/flows/:flowId', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { agentId, flowId } = req.params as { agentId: string; flowId: string }
    try {
      await verifyAgentOwner(sub, agentId)
    } catch {
      return reply.status(403).send({ error: 'Sem permissão' })
    }
    await prisma.flow.deleteMany({ where: { id: flowId, agentId } })
    return reply.status(204).send()
  })
}
