import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { getWorkspaceId } from '../../lib/workspace'

/**
 * Listas de contatos (como as "Listas" do WhatsApp Business): o atendente junta contatos em
 * grupos próprios e filtra o chat por eles. Um contato pode estar em várias listas.
 */
export async function contactListRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  const corSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)

  async function wsId(req: any) {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    return getWorkspaceId(sub, wid)
  }

  // Todas as listas do workspace, com quantos contatos cada uma tem e quais contatos (ids),
  // para a tela marcar de uma vez em quais listas o contato aberto está.
  app.get('/contact-lists', async (req, reply) => {
    const workspaceId = await wsId(req)
    const lists = await prisma.contactList.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      include: { members: { select: { contactId: true } } },
    })
    return reply.send(
      lists.map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
        count: l.members.length,
        contactIds: l.members.map((m) => m.contactId),
      }))
    )
  })

  app.post('/contact-lists', async (req, reply) => {
    const workspaceId = await wsId(req)
    const { name, color, contactId } = z
      .object({ name: z.string().trim().min(1).max(40), color: corSchema.optional(), contactId: z.string().optional() })
      .parse(req.body)

    const existing = await prisma.contactList.findUnique({ where: { workspaceId_name: { workspaceId, name } } })
    if (existing) return reply.status(409).send({ error: 'Já existe uma lista com esse nome' })

    const list = await prisma.contactList.create({ data: { workspaceId, name, ...(color ? { color } : {}) } })
    // "Nova lista" a partir de uma conversa: já coloca o contato aberto na lista nova
    if (contactId) {
      const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId }, select: { id: true } })
      if (contact) await prisma.contactListMember.create({ data: { listId: list.id, contactId } })
    }
    return reply.status(201).send({ id: list.id, name: list.name, color: list.color })
  })

  app.patch('/contact-lists/:id', async (req, reply) => {
    const workspaceId = await wsId(req)
    const { id } = req.params as { id: string }
    const data = z.object({ name: z.string().trim().min(1).max(40).optional(), color: corSchema.optional() }).parse(req.body)

    const list = await prisma.contactList.findFirst({ where: { id, workspaceId } })
    if (!list) return reply.status(404).send({ error: 'Lista não encontrada' })
    if (data.name && data.name !== list.name) {
      const clash = await prisma.contactList.findUnique({ where: { workspaceId_name: { workspaceId, name: data.name } } })
      if (clash) return reply.status(409).send({ error: 'Já existe uma lista com esse nome' })
    }
    const updated = await prisma.contactList.update({ where: { id }, data })
    return reply.send({ id: updated.id, name: updated.name, color: updated.color })
  })

  // Excluir a lista não exclui os contatos: só desfaz o agrupamento.
  app.delete('/contact-lists/:id', async (req, reply) => {
    const workspaceId = await wsId(req)
    const { id } = req.params as { id: string }
    await prisma.contactList.deleteMany({ where: { id, workspaceId } })
    return reply.send({ ok: true })
  })

  app.post('/contact-lists/:id/members', async (req, reply) => {
    const workspaceId = await wsId(req)
    const { id } = req.params as { id: string }
    const { contactIds } = z.object({ contactIds: z.array(z.string()).min(1).max(500) }).parse(req.body)

    const list = await prisma.contactList.findFirst({ where: { id, workspaceId }, select: { id: true } })
    if (!list) return reply.status(404).send({ error: 'Lista não encontrada' })
    // só contatos deste workspace
    const valid = await prisma.contact.findMany({ where: { id: { in: contactIds }, workspaceId }, select: { id: true } })
    await prisma.contactListMember.createMany({
      data: valid.map((c) => ({ listId: id, contactId: c.id })),
      skipDuplicates: true,
    })
    return reply.status(201).send({ added: valid.length })
  })

  app.delete('/contact-lists/:id/members/:contactId', async (req, reply) => {
    const workspaceId = await wsId(req)
    const { id, contactId } = req.params as { id: string; contactId: string }
    const list = await prisma.contactList.findFirst({ where: { id, workspaceId }, select: { id: true } })
    if (!list) return reply.status(404).send({ error: 'Lista não encontrada' })
    await prisma.contactListMember.deleteMany({ where: { listId: id, contactId } })
    return reply.send({ ok: true })
  })
}
