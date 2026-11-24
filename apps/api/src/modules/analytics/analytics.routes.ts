import type { FastifyInstance } from 'fastify'
import { ConversationStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { getWorkspaceId } from '../../lib/workspace'

function dateRange(start?: string, end?: string) {
  const s = start ? new Date(start) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const e = end ? new Date(end) : new Date()
  return { gte: s, lte: e }
}

export async function analyticsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/analytics/overview', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { start, end } = req.query as Record<string, string>
    const range = dateRange(start, end)

    const [attendances, credits, contacts, workspace] = await prisma.$transaction([
      prisma.attendance.count({ where: { workspaceId, status: 'CLOSED', createdAt: range } }),
      prisma.message.aggregate({ _sum: { creditsUsed: true }, where: { conversation: { workspaceId }, createdAt: range } }),
      prisma.contact.count({ where: { workspaceId, createdAt: range } }),
      prisma.workspace.findUnique({ where: { id: workspaceId }, select: { credits: true, plan: true } }),
    ])

    return reply.send({
      attendances,
      creditsUsed: credits._sum.creditsUsed || 0,
      newContacts: contacts,
      creditsRemaining: workspace?.credits || 0,
      plan: workspace?.plan,
    })
  })

  app.get('/analytics/timeline', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { start, end } = req.query as Record<string, string>
    const range = dateRange(start, end)

    const messages = await prisma.message.findMany({
      where: { conversation: { workspaceId }, createdAt: range, role: 'ASSISTANT' },
      select: { createdAt: true, creditsUsed: true },
    })

    const grouped: Record<string, number> = {}
    for (const m of messages) {
      const day = m.createdAt.toISOString().split('T')[0]
      grouped[day] = (grouped[day] || 0) + m.creditsUsed
    }

    return reply.send(Object.entries(grouped).map(([date, credits]) => ({ date, credits })).sort((a, b) => a.date.localeCompare(b.date)))
  })

  app.get('/analytics/by-channel', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { start, end } = req.query as Record<string, string>
    const range = dateRange(start, end)

    const conversations = await prisma.conversation.findMany({
      where: { workspaceId, createdAt: range },
      include: { channel: { select: { type: true, name: true } } },
    })

    const grouped: Record<string, { type: string; name: string; credits: number; count: number }> = {}
    for (const c of conversations) {
      const key = c.channelId
      if (!grouped[key]) grouped[key] = { type: c.channel.type, name: c.channel.name, credits: 0, count: 0 }
      grouped[key].credits += c.creditsUsed
      grouped[key].count++
    }

    return reply.send(Object.values(grouped).sort((a, b) => b.credits - a.credits))
  })

  app.get('/analytics/top-agents', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { start, end } = req.query as Record<string, string>
    const range = dateRange(start, end)

    const conversations = await prisma.conversation.findMany({
      where: { workspaceId, createdAt: range },
      include: { agent: { select: { id: true, name: true, avatarUrl: true } } },
    })

    const grouped: Record<string, { id: string; name: string; avatarUrl: string | null; credits: number; conversations: number }> = {}
    for (const c of conversations) {
      const key = c.agentId
      if (!grouped[key]) grouped[key] = { id: c.agent.id, name: c.agent.name, avatarUrl: c.agent.avatarUrl, credits: 0, conversations: 0 }
      grouped[key].credits += c.creditsUsed
      grouped[key].conversations++
    }

    return reply.send(Object.values(grouped).sort((a, b) => b.credits - a.credits).slice(0, 10))
  })

  app.get('/analytics/top-contacts', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { start, end } = req.query as Record<string, string>
    const range = dateRange(start, end)

    const conversations = await prisma.conversation.findMany({
      where: { workspaceId, createdAt: range },
      include: { contact: true },
    })

    const grouped: Record<string, { name: string | null; phone: string | null; interactions: number; credits: number }> = {}
    for (const c of conversations) {
      const key = c.contactId
      if (!grouped[key]) grouped[key] = { name: c.contact.name, phone: c.contact.phone, interactions: 0, credits: 0 }
      grouped[key].interactions += c.interactionCount
      grouped[key].credits += c.creditsUsed
    }

    return reply.send(Object.values(grouped).sort((a, b) => b.interactions - a.interactions).slice(0, 10))
  })

  app.get('/analytics/realtime', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const [openConversations, waitingHuman, channels, agents, recentConversations, newContactsToday] = await prisma.$transaction([
      // "Abertas" = tudo que não foi encerrado (inclui as que aguardam humano)
      prisma.conversation.count({ where: { workspaceId, status: { not: ConversationStatus.CLOSED } } }),
      prisma.conversation.count({ where: { workspaceId, status: ConversationStatus.WAITING_HUMAN } }),
      prisma.channel.findMany({ where: { workspaceId }, select: { id: true, name: true, type: true, isActive: true } }),
      prisma.agent.findMany({ where: { workspaceId }, select: { id: true, name: true, funcao: true, isActive: true, _count: { select: { conversations: true } } } }),
      prisma.conversation.findMany({
        where: { workspaceId, updatedAt: { gte: since24h } },
        orderBy: { updatedAt: 'desc' },
        take: 8,
        select: { id: true, status: true, updatedAt: true, creditsUsed: true, interactionCount: true, contact: { select: { name: true, phone: true } }, agent: { select: { name: true } }, channel: { select: { type: true } } },
      }),
      prisma.contact.count({ where: { workspaceId, createdAt: { gte: since24h } } }),
    ])

    return reply.send({ openConversations, waitingHuman, channels, agents, recentConversations, newContactsToday })
  })

  // Lista de conversas ao vivo (card laranja "Aguardando humano" / card azul "Conversas abertas")
  app.get('/analytics/live-conversations', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { kind } = req.query as { kind?: string }

    const where =
      kind === 'waiting'
        ? { workspaceId, status: ConversationStatus.WAITING_HUMAN }
        : { workspaceId, status: { not: ConversationStatus.CLOSED } }

    const rows = await prisma.conversation.findMany({
      where,
      orderBy: { updatedAt: kind === 'waiting' ? 'asc' : 'desc' }, // quem espera há mais tempo primeiro
      take: 60,
      select: {
        id: true, status: true, updatedAt: true, startedAt: true, interactionCount: true, transferSummary: true, unreadCount: true,
        contact: { select: { id: true, name: true, phone: true } },
        agent: { select: { name: true } },
        channel: { select: { type: true, name: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true, role: true, createdAt: true } },
      },
    })

    return reply.send(rows.map((c) => ({
      id: c.id,
      status: c.status,
      contact: c.contact,
      agent: c.agent?.name ?? null,
      channel: c.channel,
      transferSummary: c.transferSummary,
      unreadCount: c.unreadCount,
      interactionCount: c.interactionCount,
      waitingSince: c.updatedAt,
      lastMessage: c.messages[0] ? { content: c.messages[0].content.slice(0, 140), role: c.messages[0].role, at: c.messages[0].createdAt } : null,
    })))
  })

  // Painel de resultados do negócio (leads, funil, atendimento da IA, agenda...)
  app.get('/analytics/business', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { start, end } = req.query as Record<string, string>
    const range = dateRange(start, end)
    const now = new Date()
    const spanMs = range.lte.getTime() - range.gte.getTime()
    const prevRange = { gte: new Date(range.gte.getTime() - spanMs), lt: range.gte }
    const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const handedOffWhere = {
      OR: [
        { status: { in: [ConversationStatus.WAITING_HUMAN, ConversationStatus.HUMAN_ACTIVE] } },
        { transferSummary: { not: null } },
        { assignedToId: { not: null } },
      ],
    }

    const [
      conversations, prevConversations, handedOff,
      newLeads, prevLeads, totalLeads, leadsWithValue,
      newContacts, prevContacts,
      pendingFollowUps, overdueFollowUps, doneFollowUps,
      apptsPeriod, apptsUpcoming,
      msgByRole,
      stages, unstaged,
      convRows, leadRows, contactRows, leadSources,
      responseTimes,
    ] = await Promise.all([
      prisma.conversation.count({ where: { workspaceId, createdAt: range } }),
      prisma.conversation.count({ where: { workspaceId, createdAt: prevRange } }),
      prisma.conversation.count({ where: { workspaceId, createdAt: range, ...handedOffWhere } }),
      prisma.lead.count({ where: { workspaceId, createdAt: range } }),
      prisma.lead.count({ where: { workspaceId, createdAt: prevRange } }),
      prisma.lead.count({ where: { workspaceId } }),
      prisma.lead.aggregate({ where: { workspaceId, value: { not: null } }, _sum: { value: true }, _count: true }),
      prisma.contact.count({ where: { workspaceId, createdAt: range } }),
      prisma.contact.count({ where: { workspaceId, createdAt: prevRange } }),
      prisma.followUp.count({ where: { workspaceId, status: 'PENDING', scheduledAt: { gte: now } } }),
      prisma.followUp.count({ where: { workspaceId, status: 'PENDING', scheduledAt: { lt: now } } }),
      prisma.followUp.count({ where: { workspaceId, status: 'DONE', doneAt: range } }),
      prisma.appointment.count({ where: { workspaceId, startAt: range } }),
      prisma.appointment.count({ where: { workspaceId, startAt: { gte: now, lte: in7d } } }),
      prisma.message.groupBy({ by: ['role'], where: { conversation: { workspaceId }, createdAt: range }, _count: { _all: true } }),
      prisma.pipelineStage.findMany({ where: { workspaceId }, orderBy: { order: 'asc' }, select: { id: true, name: true, color: true, _count: { select: { leads: true } } } }),
      prisma.lead.count({ where: { workspaceId, stageId: null } }),
      prisma.conversation.findMany({ where: { workspaceId, createdAt: range }, select: { createdAt: true, status: true } }),
      prisma.lead.findMany({ where: { workspaceId, createdAt: range }, select: { createdAt: true } }),
      prisma.contact.findMany({ where: { workspaceId, createdAt: range }, select: { createdAt: true } }),
      prisma.lead.groupBy({ by: ['source'], where: { workspaceId, createdAt: range }, _count: { _all: true } }),
      // tempo até o 1º atendimento humano (assumir) — aproximação via mensagens HUMAN
      prisma.message.findMany({
        where: { conversation: { workspaceId }, createdAt: range, role: 'HUMAN' },
        select: { conversationId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: 500,
      }),
    ])

    // série diária
    const day = (d: Date) => d.toISOString().split('T')[0]
    const series: Record<string, { date: string; conversations: number; leads: number; contacts: number }> = {}
    const ensure = (k: string) => (series[k] ||= { date: k, conversations: 0, leads: 0, contacts: 0 })
    for (let t = range.gte.getTime(); t <= range.lte.getTime(); t += 86400000) ensure(day(new Date(t)))
    convRows.forEach((r) => { ensure(day(r.createdAt)).conversations++ })
    leadRows.forEach((r) => { ensure(day(r.createdAt)).leads++ })
    contactRows.forEach((r) => { ensure(day(r.createdAt)).contacts++ })

    // horário de pico (hora local do Brasil, UTC-3)
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }))
    convRows.forEach((r) => { hours[(r.createdAt.getUTCHours() + 21) % 24].count++ })

    const msgs = Object.fromEntries(msgByRole.map((m) => [m.role, m._count._all])) as Record<string, number>
    const aiHandled = Math.max(0, conversations - handedOff)
    const uniqueHuman = new Set(responseTimes.map((r) => r.conversationId)).size

    return reply.send({
      totals: {
        conversations, prevConversations,
        newLeads, prevLeads, totalLeads,
        newContacts, prevContacts,
        aiHandled, handedOff,
        aiResolutionRate: conversations > 0 ? Math.round((aiHandled / conversations) * 100) : 0,
        leadConversionRate: newContacts > 0 ? Math.round((newLeads / newContacts) * 100) : 0,
        pipelineValue: leadsWithValue._sum.value ?? 0,
        pipelineValueCount: leadsWithValue._count,
        humanAttended: uniqueHuman,
      },
      followUps: { pending: pendingFollowUps, overdue: overdueFollowUps, done: doneFollowUps },
      appointments: { period: apptsPeriod, upcoming7d: apptsUpcoming },
      messages: { client: msgs.USER ?? 0, ai: msgs.ASSISTANT ?? 0, human: msgs.HUMAN ?? 0 },
      funnel: [
        ...(unstaged > 0 ? [{ id: 'none', name: 'Sem etapa', color: '#94A3B8', count: unstaged }] : []),
        ...stages.map((s) => ({ id: s.id, name: s.name, color: s.color, count: s._count.leads })),
      ],
      sources: leadSources
        .map((s) => ({ source: s.source || 'Não informado', count: s._count._all }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      timeline: Object.values(series).sort((a, b) => a.date.localeCompare(b.date)),
      hours,
    })
  })

  app.get('/analytics/attendance', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { start, end } = req.query as Record<string, string>
    const range = dateRange(start, end)

    const [total, byStatus, avgCredits, avgInteractions] = await prisma.$transaction([
      prisma.conversation.count({ where: { workspaceId, createdAt: range } }),
      prisma.conversation.groupBy({ by: ['status'], where: { workspaceId, createdAt: range }, _count: true, orderBy: { _count: { status: 'desc' } } }),
      prisma.conversation.aggregate({ where: { workspaceId, createdAt: range }, _avg: { creditsUsed: true } }),
      prisma.conversation.aggregate({ where: { workspaceId, createdAt: range }, _avg: { interactionCount: true }, _min: { interactionCount: true }, _max: { interactionCount: true } }),
    ])

    return reply.send({
      total,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      avgCreditsPerAttendance: Math.round(avgCredits._avg.creditsUsed || 0),
      avgInteractions: Math.round(avgInteractions._avg.interactionCount || 0),
      minInteractions: avgInteractions._min.interactionCount,
      maxInteractions: avgInteractions._max.interactionCount,
    })
  })
}
