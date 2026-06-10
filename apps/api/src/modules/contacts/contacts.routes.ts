import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { getWorkspaceId } from '../../lib/workspace'


export async function contactRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/contacts', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { search, channelId, tag, page = '1', limit = '20' } = req.query as Record<string, string>
    const skip = (Number(page) - 1) * Number(limit)

    const where: any = { workspaceId }
    if (channelId) where.channelId = channelId
    if (tag) where.tags = { has: tag }
    if (search) where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { email: { contains: search, mode: 'insensitive' } },
    ]

    const [contacts, total] = await prisma.$transaction([
      prisma.contact.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: Number(limit) }),
      prisma.contact.count({ where }),
    ])
    return reply.send({ data: contacts, total, page: Number(page), limit: Number(limit) })
  })

  app.get('/contacts/:id', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    const contact = await prisma.contact.findFirst({ where: { id, workspaceId } })
    if (!contact) return reply.status(404).send({ error: 'Contato não encontrado' })
    return reply.send(contact)
  })

  app.patch('/contacts/:id', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    const data = z.object({
      name: z.string().optional(),
      phone: z.string().optional().nullable(),
      email: z.string().email().optional().nullable(),
      tags: z.array(z.string()).optional(),
      notes: z.string().optional().nullable(),
      variables: z.any().optional(),
    }).parse(req.body)

    const updated = await prisma.contact.updateMany({ where: { id, workspaceId }, data })
    if (updated.count === 0) return reply.status(404).send({ error: 'Contato não encontrado' })
    return reply.send(await prisma.contact.findUnique({ where: { id } }))
  })

  app.delete('/contacts/:id', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    await prisma.contact.deleteMany({ where: { id, workspaceId } })
    return reply.send({ ok: true })
  })

  app.get('/contacts/:id/conversations', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    const contact = await prisma.contact.findFirst({ where: { id, workspaceId } })
    if (!contact) return reply.status(404).send({ error: 'Contato não encontrado' })
    const conversations = await prisma.conversation.findMany({
      where: { contactId: id, workspaceId },
      include: { agent: { select: { id: true, name: true } }, channel: { select: { id: true, type: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(conversations)
  })
}
