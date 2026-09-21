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
        userAgent: req.headers['user-agent'],
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
        userAgent: req.headers['user-agent'],
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

  // ─── Audit Log (trilha de auditoria) ────────────────────────────────────────

  function buildAuditWhere(workspaceId: string, query: { action?: string; userId?: string; resourceType?: string; from?: string; to?: string; search?: string }) {
    const where: any = { workspaceId }
    if (query.action) where.action = { contains: query.action }
    if (query.userId) where.userId = query.userId
    if (query.resourceType) where.resourceType = query.resourceType
    if (query.from || query.to) {
      // "to" costuma vir só com a data (input type=date do front) — sem hora,
      // viraria meia-noite e excluiria o próprio dia selecionado.
      const to = query.to && !query.to.includes('T') ? `${query.to}T23:59:59.999` : query.to
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      }
    }
    // Busca por cliente — ações sobre contato/atendimento gravam contactName/
    // contactPhone no metadata (ver auditLog(...) nos módulos de contatos e
    // conversas); sem um campo dedicado, filtramos pelo conteúdo do JSON.
    if (query.search) {
      where.OR = [
        { metadata: { path: ['contactName'], string_contains: query.search } },
        { metadata: { path: ['contactPhone'], string_contains: query.search } },
      ]
    }
    return where
  }

  app.get<{ Querystring: { page?: string; limit?: string; action?: string; userId?: string; resourceType?: string; from?: string; to?: string; search?: string } }>(
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
      const where = buildAuditWhere(workspaceId, req.query)

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

  // Exporta a trilha de auditoria em CSV (mesmos filtros da listagem), para
  // uso como comprovante em auditorias internas/externas e conformidade LGPD.
  app.get<{ Querystring: { action?: string; userId?: string; resourceType?: string; from?: string; to?: string; search?: string } }>(
    '/workspace/audit-log/export',
    async (req, reply) => {
      const { sub, wid } = req.user as { sub: string; wid?: string }
      const workspaceId = await getWorkspaceId(sub, wid)

      const requesterRole = await getUserRole(sub, workspaceId)
      if (!requesterRole || !hasPermission(requesterRole, 'audit.view')) {
        return reply.status(403).send({ error: 'Apenas Owner e Admin podem ver o audit log' })
      }

      const where = buildAuditWhere(workspaceId, req.query)
      const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 10000 })

      const members = await prisma.workspaceMember.findMany({
        where: { workspaceId },
        include: { user: { select: { id: true, name: true, email: true } } },
      })
      const userById = new Map(members.map((m) => [m.userId, m.user]))

      const headers = ['Data/Hora', 'Usuário', 'E-mail', 'Ação', 'Cliente', 'Recurso', 'ID do recurso', 'Endereço IP', 'Localização', 'Navegador/Dispositivo', 'Detalhes']
      const rows = logs.map((log) => {
        const user = log.userId ? userById.get(log.userId) : undefined
        const location = [log.geoCity, log.geoRegion, log.geoCountry].filter(Boolean).join(', ')
        const meta = (log.metadata as any) || {}
        const client = [meta.contactName, meta.contactPhone].filter(Boolean).join(' — ')
        return [
          log.createdAt.toISOString(),
          user?.name || log.userId || '',
          user?.email || '',
          log.action,
          client,
          log.resourceType || '',
          log.resourceId || '',
          log.ipAddress || '',
          location,
          log.userAgent || '',
          log.metadata ? JSON.stringify(log.metadata) : '',
        ]
      })

      const csv = [headers, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
      reply.header('Content-Type', 'text/csv; charset=utf-8')
      reply.header('Content-Disposition', 'attachment; filename="trilha-de-auditoria.csv"')
      return reply.send('﻿' + csv)
    }
  )
}
