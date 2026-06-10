import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { getWorkspaceId } from '../../lib/workspace'
import axios from 'axios'

const intentionSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(512).optional().nullable(),
  fields: z.any().optional().nullable(),
  actionType: z.enum(['WEBHOOK', 'INTERNAL', 'CALENDAR']).optional(),
  calendarAction: z.enum(['SCHEDULE', 'LIST', 'CANCEL']).optional().nullable(),
  webhookUrl: z.string().url().optional().nullable(),
  webhookMethod: z.string().optional(),
  webhookHeaders: z.any().optional().nullable(),
  webhookParams: z.any().optional().nullable(),
  webhookBody: z.any().optional().nullable(),
  outputVariables: z.any().optional().nullable(),
  responseMode: z.enum(['INTERPRET_API', 'FIXED_MESSAGE', 'API_RAW']).optional(),
  isActive: z.boolean().optional(),
})


export async function intentionRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/agents/:agentId/intentions', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { agentId } = req.params as { agentId: string }
    const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } })
    if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' })
    const intentions = await prisma.intention.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(intentions)
  })

  app.post('/agents/:agentId/intentions', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { agentId } = req.params as { agentId: string }
    const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } })
    if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' })
    const data = intentionSchema.parse(req.body)
    const intention = await prisma.intention.create({ data: { ...data, agentId } })
    return reply.status(201).send(intention)
  })

  app.get('/agents/:agentId/intentions/:intentId', async (req, reply) => {
    const { agentId, intentId } = req.params as { agentId: string; intentId: string }
    const intention = await prisma.intention.findFirst({ where: { id: intentId, agentId } })
    if (!intention) return reply.status(404).send({ error: 'Intenção não encontrada' })
    return reply.send(intention)
  })

  app.patch('/agents/:agentId/intentions/:intentId', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { agentId, intentId } = req.params as { agentId: string; intentId: string }
    const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } })
    if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' })
    const data = intentionSchema.partial().parse(req.body)
    const existing = await prisma.intention.findFirst({ where: { id: intentId, agentId } })
    if (!existing) return reply.status(404).send({ error: 'Intenção não encontrada' })
    const intention = await prisma.intention.update({ where: { id: intentId }, data })
    return reply.send(intention)
  })

  app.delete('/agents/:agentId/intentions/:intentId', async (req, reply) => {
    const { agentId, intentId } = req.params as { agentId: string; intentId: string }
    await prisma.intention.deleteMany({ where: { id: intentId, agentId } })
    return reply.send({ ok: true })
  })

  app.post('/agents/:agentId/intentions/:intentId/test', async (req, reply) => {
    const { agentId, intentId } = req.params as { agentId: string; intentId: string }
    const intention = await prisma.intention.findFirst({ where: { id: intentId, agentId } })
    if (!intention || !intention.webhookUrl) return reply.status(404).send({ error: 'Webhook não configurado' })
    try {
      const method = (intention.webhookMethod || 'POST').toLowerCase()
      const res = await (axios as any)[method](intention.webhookUrl, intention.webhookBody || {}, {
        headers: (intention.webhookHeaders as any) || {},
        params: (intention.webhookParams as any) || {},
        timeout: 10000,
      })
      return reply.send({ status: res.status, data: res.data })
    } catch (err: any) {
      return reply.send({ error: err.message, status: err.response?.status })
    }
  })

  app.post('/agents/:agentId/intentions/import', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { agentId } = req.params as { agentId: string }
    const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } })
    if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' })
    const { intentions } = z.object({ intentions: z.array(intentionSchema) }).parse(req.body)
    const created = await prisma.intention.createMany({
      data: intentions.map((i) => ({ ...i, agentId })),
    })
    return reply.status(201).send({ created: created.count })
  })
}
