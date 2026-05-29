import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'

async function getWorkspaceId(userId: string) {
  const member = await prisma.workspaceMember.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
  if (!member) throw new Error('Workspace não encontrado')
  return member.workspaceId
}

const INTEGRATION_TYPES = ['ELEVEN_LABS', 'GOOGLE_CALENDAR', 'PLUG_CHAT', 'E_VENDI', 'SHOPIFY', 'STRIPE', 'PAYPAL', 'INVIDEO'] as const

export async function integrationRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/agents/:agentId/integrations', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { agentId } = req.params as { agentId: string }
    const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } })
    if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' })
    const integrations = await prisma.agentIntegration.findMany({ where: { agentId } })
    return reply.send(integrations)
  })

  app.post('/agents/:agentId/integrations/:type', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { agentId, type } = req.params as { agentId: string; type: string }
    if (!INTEGRATION_TYPES.includes(type as any)) return reply.status(400).send({ error: 'Tipo inválido' })
    const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } })
    if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' })
    const { config } = z.object({ config: z.record(z.any()) }).parse(req.body)
    const integration = await prisma.agentIntegration.upsert({
      where: { agentId_type: { agentId, type: type as any } },
      update: { config, isActive: true },
      create: { agentId, type: type as any, config },
    })
    return reply.status(201).send(integration)
  })

  app.patch('/agents/:agentId/integrations/:type', async (req, reply) => {
    const { agentId, type } = req.params as { agentId: string; type: string }
    const data = z.object({ config: z.record(z.any()).optional(), isActive: z.boolean().optional() }).parse(req.body)
    const integration = await prisma.agentIntegration.update({
      where: { agentId_type: { agentId, type: type as any } },
      data,
    })
    return reply.send(integration)
  })

  app.delete('/agents/:agentId/integrations/:type', async (req, reply) => {
    const { agentId, type } = req.params as { agentId: string; type: string }
    await prisma.agentIntegration.deleteMany({ where: { agentId, type: type as any } })
    return reply.send({ ok: true })
  })
}
