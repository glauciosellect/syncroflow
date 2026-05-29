import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { generateApiKey, hashApiKey } from '../../lib/crypto'

async function getWorkspaceId(userId: string) {
  const member = await prisma.workspaceMember.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
  if (!member) throw new Error('Workspace não encontrado')
  return member.workspaceId
}

export async function apiKeyRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/api-keys', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const keys = await prisma.apiKey.findMany({
      where: { workspaceId },
      select: { id: true, name: true, lastUsedAt: true, createdAt: true },
    })
    return reply.send(keys)
  })

  app.post('/api-keys', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { name } = z.object({ name: z.string().min(1).max(100) }).parse(req.body)
    const fullKey = generateApiKey()
    const keyHash = hashApiKey(fullKey)
    const key = await prisma.apiKey.create({ data: { name, keyHash, userId: sub, workspaceId } })
    return reply.status(201).send({ ...key, key: fullKey })
  })

  app.delete('/api-keys/:id', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { id } = req.params as { id: string }
    await prisma.apiKey.deleteMany({ where: { id, workspaceId } })
    return reply.send({ ok: true })
  })
}
