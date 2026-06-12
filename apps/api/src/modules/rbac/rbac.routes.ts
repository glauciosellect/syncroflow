import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { getWorkspaceId } from '../../lib/workspace'
import { requirePermission, auditLog, hasPermission, getUserRole } from '../../lib/rbac'

export async function rbacRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  // Listar membros do workspace com roles
  app.get('/workspace/members', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: { createdAt: 'asc' },
    })

    return reply.send(members)
  })

  // Alterar role de um membro
  app.patch<{ Params: { memberId: string }; Body: { role: string } }>(
    '/workspace/members/:memberId/role',
    async (req, reply) => {
      const { sub, wid } = req.user as { sub: string; wid?: string }
      const workspaceId = await getWorkspaceId(sub, wid)

      // Só OWNER e ADMIN podem alterar roles
      const requesterRole = await getUserRole(sub, workspaceId)
      if (!requesterRole || !hasPermission(requesterRole, 'members.manage')) {
        return reply.status(403).send({ error: 'Apenas Owner e Admin podem alterar roles' })
      }

      const { role } = z.object({
        role: z.enum(['ADMIN', 'MEMBER', 'AGENT', 'VIEWER']),
      }).parse(req.body)

      const member = await prisma.workspaceMember.findFirst({
        where: { id: req.params.memberId, workspaceId },
        include: { user: { select: { name: true } } },
      })
      if (!member) return reply.status(404).send({ error: 'Membro não encontrado' })

      // Owner não pode ter role alterada
      if (member.role === 'OWNER') {
        return reply.status(400).send({ error: 'O role do Owner não pode ser alterado' })
      }

      await prisma.workspaceMember.update({
        where: { id: req.params.memberId },
        data: { role: role as any },
      })

      await auditLog({
        workspaceId,
        userId: sub,
        action: 'member.role_changed',
        resourceType: 'WorkspaceMember',
        resourceId: req.params.memberId,
        metadata: { memberName: member.user.name, newRole: role },
        ipAddress: req.ip,
      })

      return reply.send({ ok: true })
    }
  )

  // Remover membro do workspace
  app.delete<{ Params: { memberId: string } }>(
    '/workspace/members/:memberId',
    async (req, reply) => {
      const { sub, wid } = req.user as { sub: string; wid?: string }
      const workspaceId = await getWorkspaceId(sub, wid)

      const requesterRole = await getUserRole(sub, workspaceId)
      if (!requesterRole || !hasPermission(requesterRole, 'members.manage')) {
        return reply.status(403).send({ error: 'Permissão insuficiente' })
      }

      const member = await prisma.workspaceMember.findFirst({
        where: { id: req.params.memberId, workspaceId },
        include: { user: { select: { name: true } } },
      })
      if (!member) return reply.status(404).send({ error: 'Membro não encontrado' })
      if (member.role === 'OWNER') return reply.status(400).send({ error: 'O Owner não pode ser removido' })

      await prisma.workspaceMember.delete({ where: { id: req.params.memberId } })

      await auditLog({
        workspaceId,
        userId: sub,
        action: 'member.removed',
        resourceType: 'WorkspaceMember',
        resourceId: req.params.memberId,
        metadata: { memberName: member.user.name },
        ipAddress: req.ip,
      })

      return reply.send({ ok: true })
    }
  )

  // Buscar minha role no workspace atual
  app.get('/workspace/my-role', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const role = await getUserRole(sub, workspaceId)
    return reply.send({ role, permissions: role ? Object.keys(require('../../lib/rbac').ROLE_PERMISSIONS[role] ?? {}) : [] })
  })

  // ─── Audit Log ────────────────────────────────────────────────────────────────

  app.get<{ Querystring: { page?: string; limit?: string; action?: string; userId?: string } }>(
    '/workspace/audit-log',
    async (req, reply) => {
      const { sub, wid } = req.user as { sub: string; wid?: string }
      const workspaceId = await getWorkspaceId(sub, wid)

      const requesterRole = await getUserRole(sub, workspaceId)
      if (!requesterRole || !hasPermission(requesterRole, 'audit.view')) {
        return reply.status(403).send({ error: 'Apenas Owner e Admin podem ver o audit log' })
      }

      const page = Number(req.query.page ?? 1)
      const limit = Math.min(Number(req.query.limit ?? 50), 100)
      const skip = (page - 1) * limit

      const where: any = { workspaceId }
      if (req.query.action) where.action = { contains: req.query.action }
      if (req.query.userId) where.userId = req.query.userId

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.auditLog.count({ where }),
      ])

      return reply.send({ logs, total, page, limit, totalPages: Math.ceil(total / limit) })
    }
  )
}
