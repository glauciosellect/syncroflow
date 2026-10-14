import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { getWorkspaceId } from '../../lib/workspace'
import { campaignQueue } from '../../lib/queue'
import { ACTIVE_MSG_LIMITS } from '../calendar/reminder.worker'

// Limites pensados para não prejudicar a qualidade do número na Meta:
// - teto de contatos por campanha;
// - teto de envios por linha/canal em 24h;
// - ritmo de 1 mensagem a cada 3 segundos.
export const MAX_CAMPAIGN_TARGETS = 500
export const MAX_24H_WHATSAPP = 250
export const MAX_24H_EMAIL = 400
export const SEND_INTERVAL_MS = 3000

type CampaignChannelType = 'WHATSAPP' | 'EMAIL'

function max24h(type: CampaignChannelType) {
  return type === 'EMAIL' ? MAX_24H_EMAIL : MAX_24H_WHATSAPP
}

async function resolveTargets(workspaceId: string, type: CampaignChannelType, tag?: string) {
  return prisma.contact.findMany({
    where: {
      workspaceId,
      optedOutAt: null,
      ...(tag ? { tags: { has: tag } } : {}),
      ...(type === 'EMAIL' ? { email: { not: null } } : { phone: { not: null } }),
    },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
    take: MAX_CAMPAIGN_TARGETS + 1,
  })
}

async function sentLast24h(workspaceId: string, type: CampaignChannelType) {
  return prisma.campaignRecipient.count({
    where: {
      status: 'SENT',
      sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      campaign: { workspaceId, channelType: type },
    },
  })
}

async function quotaRemaining(workspaceId: string) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!ws) return 0
  const limit = (ACTIVE_MSG_LIMITS[ws.plan] ?? 0) + ws.activeMsgsExtra
  // Plano ENTERPRISE com créditos liberados manualmente não tem como estourar a cota mensal à toa.
  return Math.max(0, limit - ws.activeMsgsUsed)
}

export async function campaignRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/campaigns', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const campaigns = await prisma.campaign.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return reply.send(campaigns)
  })

  app.get('/campaigns/preview', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const q = z.object({ channelType: z.enum(['WHATSAPP', 'EMAIL']).default('WHATSAPP'), tag: z.string().optional() }).parse(req.query)
    const targets = await resolveTargets(workspaceId, q.channelType, q.tag || undefined)
    const sent = await sentLast24h(workspaceId, q.channelType)
    return reply.send({
      totalTargets: Math.min(targets.length, MAX_CAMPAIGN_TARGETS),
      moreThanLimit: targets.length > MAX_CAMPAIGN_TARGETS,
      maxTargets: MAX_CAMPAIGN_TARGETS,
      sentLast24h: sent,
      max24h: max24h(q.channelType),
      remaining24h: Math.max(0, max24h(q.channelType) - sent),
      activeMsgsRemaining: await quotaRemaining(workspaceId),
    })
  })

  app.post('/campaigns', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const body = z.object({
      name: z.string().min(2).max(120),
      channelType: z.enum(['WHATSAPP', 'EMAIL']),
      channelId: z.string().optional(),
      templateName: z.string().optional(),
      templateLanguage: z.string().optional(),
      templateParams: z.array(z.string()).optional(),
      previewText: z.string().optional(),
      emailSubject: z.string().max(200).optional(),
      emailBody: z.string().max(10000).optional(),
      tag: z.string().optional(),
    }).parse(req.body)

    if (body.channelType === 'WHATSAPP') {
      if (!body.channelId || !body.templateName || !body.templateLanguage) {
        return reply.status(400).send({ error: 'Escolha o número de WhatsApp e um modelo de mensagem aprovado.' })
      }
      const channel = await prisma.channel.findFirst({ where: { id: body.channelId, workspaceId, type: 'WHATSAPP', isActive: true } })
      if (!channel) return reply.status(400).send({ error: 'Canal de WhatsApp não encontrado ou inativo.' })
    } else if (!body.emailSubject || !body.emailBody) {
      return reply.status(400).send({ error: 'Informe o assunto e o texto do e-mail.' })
    }

    const targets = await resolveTargets(workspaceId, body.channelType, body.tag || undefined)
    if (targets.length === 0) return reply.status(400).send({ error: 'Nenhum contato elegível (sem descadastro e com telefone/e-mail) para este filtro.' })
    if (targets.length > MAX_CAMPAIGN_TARGETS) {
      return reply.status(400).send({ error: `Limite de ${MAX_CAMPAIGN_TARGETS} contatos por campanha excedido. Use uma etiqueta para dividir o público.` })
    }

    const sent = await sentLast24h(workspaceId, body.channelType)
    if (sent + targets.length > max24h(body.channelType)) {
      return reply.status(400).send({
        error: `Limite de ${max24h(body.channelType)} envios em 24h seria excedido (${sent} já enviados). Aguarde ou reduza o público.`,
      })
    }

    if (body.channelType === 'WHATSAPP') {
      const remaining = await quotaRemaining(workspaceId)
      if (remaining < targets.length) {
        return reply.status(400).send({ error: `Mensagens ativas insuficientes: restam ${remaining}, esta campanha precisa de ${targets.length}.` })
      }
    }

    const campaign = await prisma.campaign.create({
      data: {
        workspaceId,
        name: body.name,
        channelType: body.channelType,
        channelId: body.channelId,
        templateName: body.templateName,
        templateLanguage: body.templateLanguage,
        templateParams: body.templateParams as any,
        previewText: body.previewText,
        emailSubject: body.emailSubject,
        emailBody: body.emailBody,
        tag: body.tag || null,
        totalTargets: targets.length,
        createdById: sub,
      },
    })
    await prisma.campaignRecipient.createMany({
      data: targets.map((t) => ({ campaignId: campaign.id, contactId: t.id })),
    })
    await Promise.all(
      targets.map((t, i) =>
        campaignQueue.add(
          'send',
          { campaignId: campaign.id, contactId: t.id },
          { delay: i * SEND_INTERVAL_MS, attempts: 2, backoff: { type: 'exponential', delay: 5000 } },
        ),
      ),
    )
    return reply.status(201).send(campaign)
  })

  app.post('/campaigns/:id/cancel', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    const campaign = await prisma.campaign.findFirst({ where: { id, workspaceId } })
    if (!campaign) return reply.status(404).send({ error: 'Campanha não encontrada' })
    if (['COMPLETED', 'COMPLETED_WITH_ERRORS', 'CANCELLED'].includes(campaign.status)) return reply.send(campaign)
    const updated = await prisma.campaign.update({ where: { id }, data: { status: 'CANCELLED', completedAt: new Date() } })
    return reply.send(updated)
  })
}
