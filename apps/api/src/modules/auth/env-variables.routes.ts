import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { getWorkspaceId } from '../../lib/workspace'
import { encrypt, decrypt } from '../../lib/crypto'


export async function envVariableRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/env-variables', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const vars = await prisma.envVariable.findMany({
      where: { workspaceId },
      select: { id: true, key: true, type: true, createdAt: true, updatedAt: true },
    })
    return reply.send(vars)
  })

  app.post('/env-variables', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { key, value, type } = z.object({ key: z.string().regex(/^[A-Z_][A-Z0-9_]*$/), value: z.string(), type: z.enum(['TEXT', 'NUMBER']).optional() }).parse(req.body)
    const encryptedValue = encrypt(value)
    const variable = await prisma.envVariable.upsert({
      where: { workspaceId_key: { workspaceId, key } },
      update: { value: encryptedValue, type: type || 'TEXT' },
      create: { workspaceId, key, value: encryptedValue, type: type || 'TEXT' },
    })
    return reply.status(201).send({ id: variable.id, key: variable.key, type: variable.type })
  })

  app.patch('/env-variables/:id', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    const { value } = z.object({ value: z.string() }).parse(req.body)
    await prisma.envVariable.updateMany({ where: { id, workspaceId }, data: { value: encrypt(value) } })
    return reply.send({ ok: true })
  })

  app.delete('/env-variables/:id', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    await prisma.envVariable.deleteMany({ where: { id, workspaceId } })
    return reply.send({ ok: true })
  })
}
