import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { getWorkspaceId } from '../../lib/workspace'
import { normalizeBrazilianNumber } from '../channels/whatsapp/providers/meta-cloud.provider'


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

  // Cria um contato manualmente (ex: agenda importada) — sem channelId/
  // externalId ainda, já que não veio de mensagem recebida. Ao receber a
  // primeira mensagem de verdade desse telefone, message.worker.ts completa
  // o vínculo com o canal em vez de criar um contato duplicado.
  app.post('/contacts', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const data = z.object({
      name: z.string().min(1),
      phone: z.string().min(1),
      email: z.string().email().optional().nullable(),
      tags: z.array(z.string()).optional(),
      notes: z.string().optional().nullable(),
    }).parse(req.body)

    const phone = normalizeBrazilianNumber(data.phone)
    const existing = await prisma.contact.findFirst({ where: { workspaceId, phone } })
    if (existing) return reply.status(409).send({ error: 'Já existe um contato com esse telefone', contact: existing })

    const contact = await prisma.contact.create({ data: { ...data, phone, workspaceId } })
    return reply.status(201).send(contact)
  })

  // Importação em lote (CSV já parseado no front em [{ name, phone }]).
  // Ignora silenciosamente linhas sem telefone e duplicatas (mesmo telefone
  // já cadastrado no workspace) — retorna quantos foram criados vs pulados.
  app.post('/contacts/import', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { contacts } = z.object({
      contacts: z.array(z.object({
        name: z.string().optional(),
        phone: z.string(),
      })).min(1).max(2000),
    }).parse(req.body)

    const existingPhones = new Set(
      (await prisma.contact.findMany({ where: { workspaceId }, select: { phone: true } }))
        .map(c => c.phone)
        .filter(Boolean)
    )

    let created = 0
    let skipped = 0
    const toCreate: { workspaceId: string; name: string; phone: string }[] = []
    const seenInBatch = new Set<string>()

    for (const c of contacts) {
      const phone = c.phone?.trim() ? normalizeBrazilianNumber(c.phone) : ''
      if (!phone || existingPhones.has(phone) || seenInBatch.has(phone)) {
        skipped++
        continue
      }
      seenInBatch.add(phone)
      toCreate.push({ workspaceId, name: c.name?.trim() || phone, phone })
    }

    if (toCreate.length > 0) {
      const result = await prisma.contact.createMany({ data: toCreate })
      created = result.count
    }

    return reply.send({ created, skipped, total: contacts.length })
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
      humanOnly: z.boolean().optional(),
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
