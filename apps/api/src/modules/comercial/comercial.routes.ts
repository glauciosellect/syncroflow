import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { getWorkspaceId } from '../../lib/workspace'


const leadSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  source: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  stageId: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  agentId: z.string().optional().nullable(),
  value: z.number().optional().nullable(),
  lostReason: z.string().optional().nullable(),
})

const stageSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().optional(),
  order: z.number().int().optional(),
})

const followUpSchema = z.object({
  leadId: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  title: z.string().min(1).max(200),
  notes: z.string().optional().nullable(),
  scheduledAt: z.string().datetime(),
})

export async function comercialRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  // —— Pipeline Stages ————————————————————————————————————————————————

  app.get('/comercial/stages', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const stages = await prisma.pipelineStage.findMany({
      where: { workspaceId },
      orderBy: { order: 'asc' },
      include: { _count: { select: { leads: true } } },
    })
    return reply.send(stages)
  })

  app.post('/comercial/stages', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const data = stageSchema.parse(req.body)
    const count = await prisma.pipelineStage.count({ where: { workspaceId } })
    const stage = await prisma.pipelineStage.create({
      data: { ...data, workspaceId, order: data.order ?? count },
    })
    return reply.status(201).send(stage)
  })

  app.patch('/comercial/stages/:id', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    const data = stageSchema.partial().parse(req.body)
    const stage = await prisma.pipelineStage.updateMany({ where: { id, workspaceId }, data })
    if (stage.count === 0) return reply.status(404).send({ error: 'Etapa não encontrada' })
    return reply.send(await prisma.pipelineStage.findUnique({ where: { id } }))
  })

  app.delete('/comercial/stages/:id', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    await prisma.lead.updateMany({ where: { stageId: id, workspaceId }, data: { stageId: null } })
    await prisma.pipelineStage.deleteMany({ where: { id, workspaceId } })
    return reply.send({ ok: true })
  })

  app.post('/comercial/stages/reorder', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { order } = z.object({ order: z.array(z.string()) }).parse(req.body)
    await Promise.all(order.map((id, idx) =>
      prisma.pipelineStage.updateMany({ where: { id, workspaceId }, data: { order: idx } })
    ))
    return reply.send({ ok: true })
  })

  // —— Leads ———————————————————————————————————————————————————————

  app.get('/comercial/leads', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { stageId, search } = req.query as { stageId?: string; search?: string }
    const leads = await prisma.lead.findMany({
      where: {
        workspaceId,
        ...(stageId !== undefined ? { stageId: stageId || null } : {}),
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      include: { stage: true, followUps: { where: { status: 'PENDING' }, orderBy: { scheduledAt: 'asc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(leads)
  })

  app.post('/comercial/leads', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const data = leadSchema.parse(req.body)
    const lead = await prisma.lead.create({ data: { ...data, workspaceId }, include: { stage: true } })
    return reply.status(201).send(lead)
  })

  app.patch('/comercial/leads/:id', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    const data = leadSchema.partial().parse(req.body)
    const result = await prisma.lead.updateMany({ where: { id, workspaceId }, data })
    if (result.count === 0) return reply.status(404).send({ error: 'Lead não encontrado' })
    return reply.send(await prisma.lead.findUnique({ where: { id }, include: { stage: true } }))
  })

  app.delete('/comercial/leads/:id', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    await prisma.lead.deleteMany({ where: { id, workspaceId } })
    return reply.send({ ok: true })
  })

  // —— Follow-ups —————————————————————————————————————————————————

  app.get('/comercial/followups', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { status } = req.query as { status?: string }
    const followUps = await prisma.followUp.findMany({
      where: {
        workspaceId,
        ...(status ? { status: status as any } : {}),
      },
      include: { lead: true },
      orderBy: { scheduledAt: 'asc' },
    })
    return reply.send(followUps)
  })

  app.post('/comercial/followups', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const data = followUpSchema.parse(req.body)
    const followUp = await prisma.followUp.create({
      data: { ...data, workspaceId, scheduledAt: new Date(data.scheduledAt) },
      include: { lead: true },
    })
    return reply.status(201).send(followUp)
  })

  app.patch('/comercial/followups/:id', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    const data = z.object({
      title: z.string().optional(),
      notes: z.string().optional().nullable(),
      scheduledAt: z.string().datetime().optional(),
      status: z.enum(['PENDING', 'DONE', 'CANCELLED']).optional(),
      doneAt: z.string().datetime().optional().nullable(),
    }).parse(req.body)
    const result = await prisma.followUp.updateMany({
      where: { id, workspaceId },
      data: {
        ...data,
        ...(data.scheduledAt ? { scheduledAt: new Date(data.scheduledAt) } : {}),
        ...(data.doneAt ? { doneAt: new Date(data.doneAt) } : {}),
        ...(data.status === 'DONE' && !data.doneAt ? { doneAt: new Date() } : {}),
      },
    })
    if (result.count === 0) return reply.status(404).send({ error: 'Follow-up não encontrado' })
    return reply.send(await prisma.followUp.findUnique({ where: { id }, include: { lead: true } }))
  })

  app.delete('/comercial/followups/:id', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    await prisma.followUp.deleteMany({ where: { id, workspaceId } })
    return reply.send({ ok: true })
  })

  // —— Stats para dashboard ——————————————————————————————————————————

  app.get('/comercial/stats', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const [totalLeads, stages, pendingFollowUps, overdueFollowUps] = await Promise.all([
      prisma.lead.count({ where: { workspaceId } }),
      prisma.pipelineStage.findMany({
        where: { workspaceId },
        orderBy: { order: 'asc' },
        include: { _count: { select: { leads: true } } },
      }),
      prisma.followUp.count({ where: { workspaceId, status: 'PENDING', scheduledAt: { gte: new Date() } } }),
      prisma.followUp.count({ where: { workspaceId, status: 'PENDING', scheduledAt: { lt: new Date() } } }),
    ])
    return reply.send({ totalLeads, stages, pendingFollowUps, overdueFollowUps })
  })
}
