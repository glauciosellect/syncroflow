import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { getWorkspaceId } from '../../lib/workspace'
import { auditLogFromRequest } from '../../lib/rbac'
import { extractFolderId, getFile, isDriveConfigured, getServiceAccountEmail, listChildren } from './drive.client'
import { getDocumentsConfig, saveDocumentsConfig } from './documents.service'

export async function documentsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/documents/config', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const cfg = await getDocumentsConfig(workspaceId)
    return reply.send({ ...cfg, driveConfigured: isDriveConfigured(), serviceAccountEmail: getServiceAccountEmail() })
  })

  app.put('/documents/config', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const body = z.object({
      enabled: z.boolean(),
      folder: z.string().optional(), // link ou ID da pasta compartilhada
      verifyUrl: z.string().url().optional().or(z.literal('')),
      verifyToken: z.string().optional(),
      notFoundHint: z.string().max(500).optional(),
    }).parse(req.body)

    const current = await getDocumentsConfig(workspaceId)
    let rootFolderId = current.rootFolderId
    let rootFolderName = current.rootFolderName

    if (body.folder && body.folder.trim()) {
      const id = extractFolderId(body.folder)
      if (!id) return reply.status(400).send({ error: 'Link da pasta inválido. Cole o link de compartilhamento da pasta do Google Drive.' })
      if (!isDriveConfigured()) return reply.status(400).send({ error: 'A conta de serviço do Google Drive ainda não foi configurada no servidor.' })
      const folder = await getFile(id)
      if (!folder) {
        return reply.status(400).send({ error: `Não consegui acessar essa pasta. Compartilhe-a com ${getServiceAccountEmail()} (permissão de leitor) e tente de novo.` })
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

    if (body.enabled && !rootFolderId) return reply.status(400).send({ error: 'Informe a pasta compartilhada antes de ativar.' })

    await saveDocumentsConfig(workspaceId, {
      enabled: body.enabled,
      rootFolderId,
      rootFolderName,
      verifyUrl: body.verifyUrl || undefined,
      verifyToken: body.verifyToken || undefined,
      notFoundHint: body.notFoundHint,
    })
    await auditLogFromRequest(req, { action: 'documents.config_updated', resourceType: 'integration', metadata: { enabled: body.enabled, rootFolderId } })
    return reply.send({ ...(await getDocumentsConfig(workspaceId)), driveConfigured: isDriveConfigured(), serviceAccountEmail: getServiceAccountEmail() })
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
    } catch (err: any) {
      return reply.status(502).send({ error: err?.message || 'Falha ao acessar o Drive' })
    }
  })
}
