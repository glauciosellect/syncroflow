import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { getWorkspaceId } from '../../lib/workspace'
import { generateApiKey, hashApiKey } from '../../lib/crypto'


export async function apiKeyRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/api-keys', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const keys = await prisma.apiKey.findMany({
      where: { workspaceId },
      select: { id: true, name: true, lastUsedAt: true, createdAt: true },
    })
    return reply.send(keys)
  })

  app.post('/api-keys', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { name } = z.object({ name: z.string().min(1).max(100) }).parse(req.body)
    const fullKey = generateApiKey()
    const keyHash = hashApiKey(fullKey)
    const key = await prisma.apiKey.create({ data: { name, keyHash, userId: sub, workspaceId } })
    return reply.status(201).send({ ...key, key: fullKey })
  })

  app.delete('/api-keys/:id', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    await prisma.apiKey.deleteMany({ where: { id, workspaceId } })
    return reply.send({ ok: true })
  })
}
