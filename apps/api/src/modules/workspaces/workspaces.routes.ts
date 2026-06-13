import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import crypto from 'crypto'
import { prisma } from '../../lib/prisma'
import { sendEmail, workspaceInviteEmail } from '../../lib/mailer'

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
    const target = await prisma.workspaceMember.findUnique({ where: { id } })
    if (target?.role === 'OWNER') return reply.status(403).send({ error: 'Não é possível remover o proprietário' })
    await prisma.workspaceMember.delete({ where: { id } })
    return reply.send({ ok: true })
  })

  // —— Convites ——————————————————————————————————————————————————————

  app.get('/workspaces/me/invites', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { workspace } = await getWorkspace(sub)
    const invites = await prisma.workspaceInvite.findMany({
      where: { workspaceId: workspace.id, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(invites)
  })

  app.post('/workspaces/me/members/invite', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { workspace, role } = await getWorkspace(sub)
    if (role !== 'OWNER' && role !== 'ADMIN') return reply.status(403).send({ error: 'Sem permissão' })

    const { email, role: inviteRole } = z.object({
      email: z.string().email(),
      role: z.enum(['ADMIN', 'AGENT']).default('AGENT'),
    }).parse(req.body)

    const inviter = await prisma.user.findUnique({ where: { id: sub }, select: { name: true } })

    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      const alreadyMember = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: existingUser.id, workspaceId: workspace.id } },
      })
      if (alreadyMember) return reply.status(409).send({ error: 'Este usuário já é membro do workspace' })
    }

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    await prisma.workspaceInvite.upsert({
      where: { email_workspaceId: { email, workspaceId: workspace.id } },
      update: { token, role: inviteRole, expiresAt, acceptedAt: null },
      create: { workspaceId: workspace.id, email, role: inviteRole, token, expiresAt },
    })

    const acceptUrl = `${process.env.FRONTEND_URL}/accept-invite?token=${token}`
    await sendEmail(email, `Convite para ${workspace.name} — SyncroFlow`, workspaceInviteEmail(inviter?.name || 'Alguém', workspace.name, inviteRole, acceptUrl))

    return reply.status(201).send({ ok: true })
  })

  app.delete('/workspaces/me/invites/:id', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { workspace, role } = await getWorkspace(sub)
    if (role !== 'OWNER' && role !== 'ADMIN') return reply.status(403).send({ error: 'Sem permissão' })
    const { id } = req.params as { id: string }
    await prisma.workspaceInvite.deleteMany({ where: { id, workspaceId: workspace.id } })
    return reply.send({ ok: true })
  })

  // Excluir conta + workspace (irreversível, só OWNER)
  app.delete('/workspaces/me', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { workspace, role } = await getWorkspace(sub)
    if (role !== 'OWNER') return reply.status(403).send({ error: 'Apenas o proprietário pode excluir a conta' })

    // Apaga tudo em cascata via Prisma (ordem importa por FK)
    await prisma.$transaction([
      prisma.welcomeMessage.deleteMany({ where: { workspaceId: workspace.id } }),
      prisma.agentChannel.deleteMany({ where: { channel: { workspaceId: workspace.id } } }),
      prisma.channel.deleteMany({ where: { workspaceId: workspace.id } }),
      prisma.lead.deleteMany({ where: { workspaceId: workspace.id } }),
      prisma.contact.deleteMany({ where: { workspaceId: workspace.id } }),
      prisma.intention.deleteMany({ where: { agent: { workspaceId: workspace.id } } }),
      prisma.flow.deleteMany({ where: { agent: { workspaceId: workspace.id } } }),
      prisma.agentConfig.deleteMany({ where: { agent: { workspaceId: workspace.id } } }),
      prisma.agent.deleteMany({ where: { workspaceId: workspace.id } }),
      prisma.workspaceInvite.deleteMany({ where: { workspaceId: workspace.id } }),
      prisma.workspaceMember.deleteMany({ where: { workspaceId: workspace.id } }),
      prisma.workspace.delete({ where: { id: workspace.id } }),
      prisma.session.deleteMany({ where: { userId: sub } }),
      prisma.user.delete({ where: { id: sub } }),
    ])

    return reply.send({ ok: true })
  })

  // Endpoint de diagnóstico — apenas em desenvolvimento
  app.get('/workspaces/debug', async (req, reply) => {
    if (process.env.NODE_ENV === 'production') return reply.status(404).send()
    const { sub } = req.user as { sub: string }
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: sub },
      include: {
        workspace: {
          include: {
            agents: { select: { id: true, name: true, isActive: true, workspaceId: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
    return reply.send({
      userId: sub,
      workspaces: memberships.map((m) => ({
        workspaceId: m.workspaceId,
        workspaceName: m.workspace.name,
        role: m.role,
        memberCreatedAt: m.createdAt,
        agents: m.workspace.agents,
      })),
    })
  })

  // Reassocia agente ao workspace correto (por ID do agente) — não deleta nada
  app.patch('/workspaces/fix-agent/:agentId', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { agentId } = req.params as { agentId: string }
    const { workspace } = await getWorkspace(sub)
    const agent = await prisma.agent.findUnique({ where: { id: agentId } })
    if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' })
    if (agent.workspaceId === workspace.id) return reply.send({ ok: true, message: 'Agente já está no workspace correto' })
    const updated = await prisma.agent.update({
      where: { id: agentId },
      data: { workspaceId: workspace.id },
    })
    return reply.send({ ok: true, message: 'Agente reassociado com sucesso', agent: updated })
  })
}
