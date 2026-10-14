import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { getWorkspaceId } from '../../lib/workspace'
import { auditLogFromRequest } from '../../lib/rbac'
import { extractFolderId, getFile, isDriveConfigured, getServiceAccountEmail, listChildren } from './drive.client'
import { getDocumentsConfig, saveDocumentsConfig } from './documents.service'

// Quem pode ver/editar a parte técnica (sistema mãe que confirma contrato). O cliente nunca vê isso.
// Defina PLATFORM_ADMIN_EMAILS no servidor (separado por vírgula) para ajustar.
function platformAdminEmails(): string[] {
  const raw = process.env.PLATFORM_ADMIN_EMAILS || 'glaucio.sellect@gmail.com,nuclick10@gmail.com'
  return raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
}

async function isPlatformAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  return !!user && platformAdminEmails().includes(user.email.toLowerCase())
}

async function buildResponse(workspaceId: string, admin: boolean) {
  const cfg = await getDocumentsConfig(workspaceId)
  const base = {
    enabled: cfg.enabled,
    rootFolderName: cfg.rootFolderName,
    hasFolder: !!cfg.rootFolderId,
    driveConfigured: isDriveConfigured(),
    serviceAccountEmail: getServiceAccountEmail(),
    isPlatformAdmin: admin,
  }
  // Parte técnica só para a equipe da NuClick.
  return admin ? { ...base, verifyUrl: cfg.verifyUrl, hasVerifyToken: cfg.hasVerifyToken } : base
}

export async function documentsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/documents/config', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    return reply.send(await buildResponse(workspaceId, await isPlatformAdmin(sub)))
  })

  app.put('/documents/config', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const admin = await isPlatformAdmin(sub)
    const body = z.object({
      enabled: z.boolean(),
      folder: z.string().optional(), // link ou ID da pasta compartilhada
      verifyUrl: z.string().url().optional().or(z.literal('')),
      verifyToken: z.string().optional(),
    }).parse(req.body)

    const current = await getDocumentsConfig(workspaceId)
    let rootFolderId = current.rootFolderId
    let rootFolderName = current.rootFolderName

    if (body.folder && body.folder.trim()) {
      const id = extractFolderId(body.folder)
      if (!id) return reply.status(400).send({ error: 'Link da pasta inválido. Cole o link de compartilhamento da pasta do Google Drive.' })
      if (!isDriveConfigured()) return reply.status(400).send({ error: 'Este recurso ainda não está disponível. Fale com o suporte.' })
      const folder = await getFile(id)
      if (!folder) {
        return reply.status(400).send({ error: 'Não consegui acessar essa pasta. Confira se você a compartilhou com o e-mail indicado, como Leitor, e tente de novo.' })
      }
      if (folder.mimeType !== 'application/vnd.google-apps.folder') return reply.status(400).send({ error: 'O link precisa ser de uma pasta, não de um arquivo.' })
      // Uma mesma pasta não pode servir a duas contas: impede que alguém cole o link da pasta de outro cliente.
      const inUse = await prisma.integration.findFirst({
        where: { platform: 'gdrive', NOT: { workspaceId }, metadata: { path: ['rootFolderId'], equals: folder.id } },
        select: { id: true },
      })
      if (inUse) return reply.status(400).send({ error: 'Esta pasta já está em uso por outra conta. Use uma pasta própria.' })
      rootFolderId = folder.id
      rootFolderName = folder.name
    }

    if (body.enabled && !rootFolderId) return reply.status(400).send({ error: 'Informe o link da pasta antes de ativar.' })

    await saveDocumentsConfig(workspaceId, {
      enabled: body.enabled,
      rootFolderId,
      rootFolderName,
      // Cliente comum não altera a parte técnica: mantém o que já está salvo.
      verifyUrl: admin ? (body.verifyUrl || undefined) : current.verifyUrl,
      verifyToken: admin ? (body.verifyToken || undefined) : undefined,
      notFoundHint: current.notFoundHint,
    })
    await auditLogFromRequest(req, { action: 'documents.config_updated', resourceType: 'integration', metadata: { enabled: body.enabled, rootFolderId } })
    return reply.send(await buildResponse(workspaceId, admin))
  })

  // Teste: lista as pastas de primeiro nível (as pastas de contrato) para o cliente conferir.
  app.get('/documents/test', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const cfg = await getDocumentsConfig(workspaceId)
    if (!cfg.rootFolderId) return reply.status(400).send({ error: 'Nenhuma pasta configurada.' })
    try {
      const children = await listChildren(cfg.rootFolderId)
      return reply.send({
        folders: children.filter((c) => c.mimeType === 'application/vnd.google-apps.folder').slice(0, 20).map((c) => c.name),
        filesAtRoot: children.filter((c) => c.mimeType !== 'application/vnd.google-apps.folder').length,
      })
    } catch {
      return reply.status(502).send({ error: 'Não consegui acessar a pasta. Confira se ela continua compartilhada com o e-mail indicado.' })
    }
  })
}
