import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { getWorkspaceId } from '../../lib/workspace'


export async function attendanceRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/attendances', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { search, status, channelType, agentName, page = '1', limit = '20', start, end } = req.query as Record<string, string>
    const skip = (Number(page) - 1) * Number(limit)

    const where: any = { workspaceId }
    if (status) where.status = status
    if (channelType) where.channelType = channelType
    if (agentName) where.agentName = { contains: agentName, mode: 'insensitive' }
    if (search) where.OR = [{ contactName: { contains: search, mode: 'insensitive' } }, { contactPhone: { contains: search } }, { protocol: { contains: search } }]
    if (start || end) where.createdAt = { ...(start ? { gte: new Date(start) } : {}), ...(end ? { lte: new Date(end) } : {}) }

    const [attendances, total] = await prisma.$transaction([
      prisma.attendance.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: Number(limit) }),
      prisma.attendance.count({ where }),
    ])
    return reply.send({ data: attendances, total, page: Number(page), limit: Number(limit) })
  })

  app.get('/attendances/export', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const attendances = await prisma.attendance.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    })

    const headers = ['Protocolo', 'Contato', 'Telefone', 'Canal', 'Agente', 'Responsável', 'Status', 'Início', 'Fim', 'Duração (s)', 'Créditos', 'Interações']
    const rows = attendances.map((a) => [
      a.protocol, a.contactName || '', a.contactPhone || '', a.channelType, a.agentName, a.assigneeName || '',
      a.status, a.startedAt.toISOString(), a.endedAt?.toISOString() || '', a.durationSeconds || '', a.creditsUsed, a.interactionCount,
    ])

    const csv = [headers, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', 'attachment; filename="atendimentos.csv"')
    return reply.send('﻿' + csv)
  })

  app.get('/attendances/:id', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }
    const attendance = await prisma.attendance.findFirst({ where: { id, workspaceId } })
    if (!attendance) return reply.status(404).send({ error: 'Atendimento não encontrado' })
    const conversation = await prisma.conversation.findUnique({
      where: { id: attendance.conversationId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })
    return reply.send({ ...attendance, messages: conversation?.messages || [] })
  })
}
