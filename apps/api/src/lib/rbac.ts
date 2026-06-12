import type { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from './prisma'
import { getWorkspaceId } from './workspace'

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
}) {
  try {
    await prisma.auditLog.create({ data: opts })
  } catch {
    // Audit log nunca pode quebrar a operação principal
  }
}
