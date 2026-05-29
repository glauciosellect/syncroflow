import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'

async function getWorkspaceId(userId: string) {
  const member = await prisma.workspaceMember.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
  if (!member) throw new Error('Workspace não encontrado')
  return member.workspaceId
}

export async function knowledgeRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/knowledge', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const bases = await prisma.knowledgeBase.findMany({
      where: { workspaceId },
      include: { _count: { select: { documents: true, agentLinks: true } } },
    })
    return reply.send(bases)
  })

  app.post('/knowledge', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { name, description } = z.object({ name: z.string().min(1), description: z.string().optional() }).parse(req.body)
    const kb = await prisma.knowledgeBase.create({ data: { workspaceId, name, description } })
    return reply.status(201).send(kb)
  })

  app.get('/knowledge/:id', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { id } = req.params as { id: string }
    const kb = await prisma.knowledgeBase.findFirst({
      where: { id, workspaceId },
      include: { documents: true, agentLinks: { include: { agent: { select: { id: true, name: true } } } } },
    })
    if (!kb) return reply.status(404).send({ error: 'Base não encontrada' })
    return reply.send(kb)
  })

  app.patch('/knowledge/:id', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { id } = req.params as { id: string }
    const data = z.object({ name: z.string().optional(), description: z.string().optional().nullable() }).parse(req.body)
    await prisma.knowledgeBase.updateMany({ where: { id, workspaceId }, data })
    return reply.send(await prisma.knowledgeBase.findUnique({ where: { id } }))
  })

  app.delete('/knowledge/:id', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { id } = req.params as { id: string }
    await prisma.knowledgeBase.deleteMany({ where: { id, workspaceId } })
    return reply.send({ ok: true })
  })

  app.post('/knowledge/:id/documents', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { id } = req.params as { id: string }
    const kb = await prisma.knowledgeBase.findFirst({ where: { id, workspaceId } })
    if (!kb) return reply.status(404).send({ error: 'Base não encontrada' })
    const { title, content } = z.object({ title: z.string(), content: z.string().min(1) }).parse(req.body)
    const doc = await prisma.knowledgeDocument.create({ data: { knowledgeBaseId: id, title, content } })
    return reply.status(201).send(doc)
  })

  app.delete('/knowledge/:id/documents/:docId', async (req, reply) => {
    const { id, docId } = req.params as { id: string; docId: string }
    await prisma.knowledgeDocument.deleteMany({ where: { id: docId, knowledgeBaseId: id } })
    return reply.send({ ok: true })
  })

  app.post('/agents/:agentId/knowledge/:kbId', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { agentId, kbId } = req.params as { agentId: string; kbId: string }
    const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } })
    if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' })
    await prisma.agentKnowledgeBase.upsert({
      where: { agentId_knowledgeBaseId: { agentId, knowledgeBaseId: kbId } },
      update: {},
      create: { agentId, knowledgeBaseId: kbId },
    })
    return reply.status(201).send({ ok: true })
  })

  app.delete('/agents/:agentId/knowledge/:kbId', async (req, reply) => {
    const { agentId, kbId } = req.params as { agentId: string; kbId: string }
    await prisma.agentKnowledgeBase.deleteMany({ where: { agentId, knowledgeBaseId: kbId } })
    return reply.send({ ok: true })
  })
}
