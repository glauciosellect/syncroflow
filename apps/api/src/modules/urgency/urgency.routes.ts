import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { getUrgencyConfig, saveUrgencyConfig } from './urgency.service'

async function getWorkspaceId(userId: string) {
  const member = await prisma.workspaceMember.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
  if (!member) throw new Error('Workspace não encontrado')
  return member.workspaceId
}

const bodySchema = z.object({
  enabled: z.boolean(),
  contacts: z.array(z.object({ name: z.string().min(1).max(80), phone: z.string().min(8).max(20) })).max(5),
  emails: z.array(z.string().email()).max(5).default([]),
  templateName: z.string().max(100).optional().nullable(),
  templateLanguage: z.string().max(10).optional(),
})

export async function urgencyRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/urgency', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    return reply.send(await getUrgencyConfig(await getWorkspaceId(sub)))
  })

  app.put('/urgency', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const body = bodySchema.parse(req.body)
    const workspaceId = await getWorkspaceId(sub)
    await saveUrgencyConfig(workspaceId, {
      enabled: body.enabled,
      contacts: body.contacts.map((c) => ({ name: c.name.trim(), phone: c.phone.replace(/\D/g, '') })),
      emails: body.emails,
      templateName: body.templateName || undefined,
      templateLanguage: body.templateLanguage,
    })
    return reply.send(await getUrgencyConfig(workspaceId))
  })
}
