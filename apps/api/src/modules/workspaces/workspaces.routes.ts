import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'

async function getWorkspace(userId: string) {
  const member = await prisma.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: 'asc' },
  })
  if (!member) throw new Error('Workspace não encontrado')
  return { workspace: member.workspace, role: member.role }
}

export async function workspaceRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/workspaces/me', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { workspace, role } = await getWorkspace(sub)
    return reply.send({ ...workspace, role })
  })

  app.patch('/workspaces/me', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { workspace } = await getWorkspace(sub)
    const { name } = z.object({ name: z.string().min(2).max(64) }).parse(req.body)
    const updated = await prisma.workspace.update({ where: { id: workspace.id }, data: { name } })
    return reply.send(updated)
  })

  app.get('/workspaces/me/members', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { workspace } = await getWorkspace(sub)
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    })
    return reply.send(members)
  })

  app.patch('/workspaces/me/members/:id', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { workspace, role } = await getWorkspace(sub)
    if (role !== 'OWNER' && role !== 'ADMIN') return reply.status(403).send({ error: 'Sem permissão' })
    const { id } = req.params as { id: string }
    const { role: newRole } = z.object({ role: z.enum(['ADMIN', 'AGENT']) }).parse(req.body)
    const updated = await prisma.workspaceMember.update({
      where: { id },
      data: { role: newRole },
    })
    return reply.send(updated)
  })

  app.delete('/workspaces/me/members/:id', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { workspace, role } = await getWorkspace(sub)
    if (role !== 'OWNER' && role !== 'ADMIN') return reply.status(403).send({ error: 'Sem permissão' })
    const { id } = req.params as { id: string }
    await prisma.workspaceMember.delete({ where: { id } })
    return reply.send({ ok: true })
  })
}
