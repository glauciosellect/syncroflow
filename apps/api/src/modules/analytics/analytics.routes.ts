import type { FastifyInstance } from 'fastify'
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
