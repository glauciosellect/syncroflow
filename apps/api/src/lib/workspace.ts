import { prisma } from './prisma'

/**
 * Retorna o workspaceId do usuário autenticado.
 * Prioriza o campo `wid` do JWT (emitido no login/register).
 * Fallback: busca no banco o workspace mais antigo do usuário.
 */
export async function getWorkspaceId(userId: string, widFromToken?: string): Promise<string> {
  if (widFromToken) return widFromToken

  const member = await prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  })
  if (!member) throw new Error('Workspace não encontrado')
  return member.workspaceId
}
