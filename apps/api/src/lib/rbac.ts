import type { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from './prisma'
import { getWorkspaceId } from './workspace'
import { lookupGeo } from './geo'

export type Permission =
  | 'workspace.settings'
  | 'members.manage'
  | 'agents.create' | 'agents.edit' | 'agents.delete' | 'agents.view'
  | 'integrations.manage' | 'integrations.view'
  | 'conversations.view' | 'conversations.manage'
  | 'billing.view' | 'billing.manage'
  | 'analytics.view'
  | 'audit.view'
  | '*'

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  OWNER: ['*'],
  ADMIN: [
    'workspace.settings',
    'members.manage',
    'agents.create', 'agents.edit', 'agents.delete', 'agents.view',
    'integrations.manage', 'integrations.view',
    'conversations.view', 'conversations.manage',
    'billing.view',
    'analytics.view',
    'audit.view',
  ],
  MEMBER: [
    'agents.create', 'agents.edit', 'agents.view',
    'integrations.view',
    'conversations.view', 'conversations.manage',
    'analytics.view',
  ],
  AGENT: [
    'agents.view',
    'conversations.view', 'conversations.manage',
  ],
  VIEWER: [
    'agents.view',
    'conversations.view',
    'analytics.view',
  ],
}

export function hasPermission(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role] ?? []
  return perms.includes('*') || perms.includes(permission)
}

export async function getUserRole(userId: string, workspaceId: string): Promise<string | null> {
  const member = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { role: true },
  })
  return member?.role ?? null
}

export function requirePermission(permission: Permission) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(user.sub, user.wid)
    const role = await getUserRole(user.sub, workspaceId)

    if (!role || !hasPermission(role, permission)) {
      return reply.status(403).send({ error: 'Permissão insuficiente para esta ação' })
    }
  }
}

// Registra uma entrada no audit log
export async function auditLog(opts: {
  workspaceId: string
  userId?: string
  action: string
  resourceType?: string
  resourceId?: string
  metadata?: Record<string, any>
  ipAddress?: string
  userAgent?: string
}) {
  try {
    const geo = lookupGeo(opts.ipAddress)
    await prisma.auditLog.create({
      data: {
        ...opts,
        geoCity: geo?.city ?? undefined,
        geoRegion: geo?.region ?? undefined,
        geoCountry: geo?.country ?? undefined,
      },
    })
  } catch {
    // Audit log nunca pode quebrar a operação principal
  }
}

// Atalho para os módulos de negócio: extrai workspace/usuário/IP/user-agent
// direto da request autenticada, para não repetir esse boilerplate em cada rota.
export async function auditLogFromRequest(
  req: FastifyRequest,
  opts: { action: string; resourceType?: string; resourceId?: string; metadata?: Record<string, any>; workspaceId?: string }
) {
  const user = req.user as { sub: string; wid?: string }
  const workspaceId = opts.workspaceId ?? (await getWorkspaceId(user.sub, user.wid))
  await auditLog({
    workspaceId,
    userId: user.sub,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    action: opts.action,
    resourceType: opts.resourceType,
    resourceId: opts.resourceId,
    metadata: opts.metadata,
  })
}
