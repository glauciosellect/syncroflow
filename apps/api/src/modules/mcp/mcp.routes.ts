import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { encrypt, decrypt } from '../../lib/crypto'

async function getWorkspaceId(userId: string) {
  const member = await prisma.workspaceMember.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
  if (!member) throw new Error('Workspace não encontrado')
  return member.workspaceId
}

export async function mcpRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/agents/:agentId/mcp', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { agentId } = req.params as { agentId: string }
    const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } })
    if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' })
    const servers = await prisma.agentMcpServer.findMany({ where: { agentId } })
    return reply.send(servers.map((s) => ({ ...s, apiKey: s.apiKey ? '***' : null })))
  })

  app.post('/agents/:agentId/mcp', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { agentId } = req.params as { agentId: string }
    const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } })
    if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' })
    const { name, url, apiKey } = z.object({ name: z.string(), url: z.string().url(), apiKey: z.string().optional() }).parse(req.body)
    const server = await prisma.agentMcpServer.create({
      data: { agentId, name, url, apiKey: apiKey ? encrypt(apiKey) : null },
    })
    return reply.status(201).send({ ...server, apiKey: apiKey ? '***' : null })
  })

  app.patch('/agents/:agentId/mcp/:mcpId', async (req, reply) => {
    const { mcpId } = req.params as { agentId: string; mcpId: string }
    const { name, url, apiKey, isActive } = z.object({ name: z.string().optional(), url: z.string().url().optional(), apiKey: z.string().optional(), isActive: z.boolean().optional() }).parse(req.body)
    const server = await prisma.agentMcpServer.update({
      where: { id: mcpId },
      data: { name, url, isActive, ...(apiKey ? { apiKey: encrypt(apiKey) } : {}) },
    })
    return reply.send({ ...server, apiKey: server.apiKey ? '***' : null })
  })

  app.delete('/agents/:agentId/mcp/:mcpId', async (req, reply) => {
    const { mcpId } = req.params as { agentId: string; mcpId: string }
    await prisma.agentMcpServer.delete({ where: { id: mcpId } })
    return reply.send({ ok: true })
  })
}
