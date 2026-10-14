import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import {
  getValidToken,
  listCalendarEvents,
  createCalendarEvent,
  createCalendarEventWithMeet,
  updateCalendarEvent,
  deleteCalendarEvent,
} from '../../lib/google'

// Agenda nativa (mesmo modelo do SyncroLex): o Google Calendar é a fonte da verdade.
// O que for criado aqui, no SyncroLex ou no próprio Google aparece nos três, desde que
// os sistemas estejam conectados à mesma conta Google.

async function getCalendarContext(userId: string) {
  const member = await prisma.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: 'asc' },
  })
  if (!member) return null
  const ws = member.workspace as any
  if (!ws.googleCalendarEnabled || !ws.googleCalendarId) return { workspaceId: ws.id, connected: false as const }
  const accessToken = await getValidToken(ws.id)
  if (!accessToken) return { workspaceId: ws.id, connected: false as const, tokenExpired: true }
  return { workspaceId: ws.id, connected: true as const, calendarId: ws.googleCalendarId as string, accessToken }
}

const eventBody = z.object({
  summary: z.string().min(1).max(300),
  description: z.string().max(8000).optional(),
  location: z.string().max(500).optional(),
  start: z.object({ dateTime: z.string().optional(), date: z.string().optional(), timeZone: z.string().optional() }),
  end: z.object({ dateTime: z.string().optional(), date: z.string().optional(), timeZone: z.string().optional() }),
  attendees: z.array(z.object({ email: z.string().email() })).max(50).optional(),
  withMeet: z.boolean().optional(),
})

export async function agendaRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/agenda/events', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { timeMin, timeMax } = z.object({ timeMin: z.string(), timeMax: z.string() }).parse(req.query)
    const ctx = await getCalendarContext(sub)
    if (!ctx || !ctx.connected) return reply.send({ events: [], connected: false, tokenExpired: (ctx as any)?.tokenExpired === true })
    try {
      const events = await listCalendarEvents(ctx.accessToken, ctx.calendarId, timeMin, timeMax)
      return reply.send({ events, connected: true })
    } catch {
      return reply.send({ events: [], connected: true, error: 'Erro ao buscar eventos' })
    }
  })

  app.post('/agenda/events', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { withMeet, ...event } = eventBody.parse(req.body)
    const ctx = await getCalendarContext(sub)
    if (!ctx || !ctx.connected) return reply.status(400).send({ error: 'Google Calendar não conectado' })
    if (withMeet) {
      const r = await createCalendarEventWithMeet(ctx.accessToken, ctx.calendarId, event as any)
      if (!r.id) return reply.status(502).send({ error: 'Erro ao criar evento' })
      return reply.send({ id: r.id, meetLink: r.meetLink })
    }
    const id = await createCalendarEvent(ctx.accessToken, ctx.calendarId, event as any)
    if (!id) return reply.status(502).send({ error: 'Erro ao criar evento' })
    return reply.send({ id })
  })

  app.patch('/agenda/events/:eventId', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { eventId } = req.params as { eventId: string }
    const { withMeet: _w, ...event } = eventBody.partial().parse(req.body)
    const ctx = await getCalendarContext(sub)
    if (!ctx || !ctx.connected) return reply.status(400).send({ error: 'Google Calendar não conectado' })
    const ok = await updateCalendarEvent(ctx.accessToken, ctx.calendarId, eventId, event)
    return ok ? reply.send({ ok: true }) : reply.status(502).send({ error: 'Erro ao atualizar evento' })
  })

  app.delete('/agenda/events/:eventId', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { eventId } = req.params as { eventId: string }
    const ctx = await getCalendarContext(sub)
    if (!ctx || !ctx.connected) return reply.status(400).send({ error: 'Google Calendar não conectado' })
    await deleteCalendarEvent(ctx.accessToken, ctx.calendarId, eventId)
    return reply.send({ ok: true })
  })
}
