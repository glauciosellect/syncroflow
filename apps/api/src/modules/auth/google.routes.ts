import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import {
  getLoginOAuthUrl,
  getOAuthUrl,
  exchangeCodeForTokens,
  getGoogleUserInfo,
  listCalendars,
  getValidToken,
} from '../../lib/google'
import crypto from 'crypto'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'
const API_URL = process.env.API_URL || 'http://localhost:3001'

function generateSlug(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60)
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base, i = 0
  while (await prisma.workspace.findUnique({ where: { slug } })) slug = `${base}-${++i}`
  return slug
}

export async function googleRoutes(app: FastifyInstance) {
  const signTokens = (userId: string, workspaceId?: string) => ({
    accessToken: app.jwt.sign({ sub: userId, wid: workspaceId }, { expiresIn: '15m' }),
    refreshToken: app.jwt.sign({ sub: userId, type: 'refresh' }, { expiresIn: '7d' }),
  })

  // ── LOGIN COM GOOGLE ──────────────────────────────────────────────────────
  app.get('/auth/google', async (req, reply) => {
    const state = crypto.randomBytes(16).toString('hex')
    const redirectUri = `${API_URL}/auth/google/callback`
    const url = getLoginOAuthUrl(redirectUri, state)
    return reply.redirect(url)
  })

  app.get('/auth/google/callback', async (req, reply) => {
    const { code, error } = req.query as Record<string, string>
    const redirectBase = `${FRONTEND_URL}/login`

    if (error || !code) {
      return reply.redirect(`${redirectBase}?error=google_auth_failed`)
    }

    try {
      const redirectUri = `${API_URL}/auth/google/callback`
      const tokens = await exchangeCodeForTokens(code, redirectUri)
      const { email, name, picture } = await getGoogleUserInfo(tokens.access_token)

      // Upsert user — cria se não existe, atualiza googleId se existe
      let user = await prisma.user.findUnique({ where: { email } })
      const isNewUser = !user

      if (!user) {
        const firstName = name.split(' ')[0]
        const slug = await uniqueSlug(generateSlug(firstName + '-workspace'))
        user = await (prisma.user as any).create({
          data: {
            name,
            email,
            avatarUrl: picture,
            googleId: email, // usa email como identificador único Google
            onboardingDone: false,
            workspaceMembers: {
              create: {
                role: 'OWNER',
                workspace: {
                  create: {
                    name: `${firstName}'s Workspace`,
                    slug,
                    plan: 'TRIAL',
                    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                    credits: 1000,
                  },
                },
              },
            },
          },
          include: { workspaceMembers: { include: { workspace: true } } },
        }) as any
      } else {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { avatarUrl: picture || user.avatarUrl },
          include: { workspaceMembers: { include: { workspace: true } } },
        } as any) as any
      }

      const workspace = (user as any).workspaceMembers?.[0]?.workspace
        ?? await prisma.workspaceMember.findFirst({ where: { userId: (user as any).id }, orderBy: { createdAt: 'asc' }, include: { workspace: true } }).then(m => m?.workspace)

      const jwtTokens = signTokens((user as any).id, workspace?.id)
      await prisma.session.create({
        data: {
          userId: (user as any).id,
          refreshToken: jwtTokens.refreshToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      })

      // Usuários existentes vão direto ao dashboard; novos usuários passam pelo onboarding
      const destination = (!isNewUser || (user as any).onboardingDone) ? `${FRONTEND_URL}/dashboard` : `${FRONTEND_URL}/register?step=2`
      const params = new URLSearchParams({
        token: jwtTokens.accessToken,
        refresh: jwtTokens.refreshToken,
        workspaceId: workspace?.id || '',
      })
      return reply.redirect(`${destination}?${params}`)
    } catch (err) {
      console.error('[Google Login Callback]', err)
      return reply.redirect(`${redirectBase}?error=google_auth_failed`)
    }
  })

  // ── GOOGLE CALENDAR — conectar workspace ─────────────────────────────────
  // Aceita token via query param pois é um redirect de browser (sem header Authorization)
  // Tenta access token (15min) e também refresh token (7d) para não falhar se access expirou
  app.get('/integrations/google/connect', async (req, reply) => {
    const { token } = req.query as Record<string, string>
    if (!token) return reply.status(401).send({ error: 'Não autorizado' })

    let userId: string
    try {
      const decoded = app.jwt.verify(token) as { sub: string; type?: string }
      userId = decoded.sub
    } catch {
      // access token expirado — tenta verificar como refresh token
      try {
        const decoded = app.jwt.verify(token, { key: process.env.JWT_REFRESH_SECRET || '' }) as { sub: string }
        userId = decoded.sub
      } catch {
        return reply.status(401).send({ error: 'Token inválido' })
      }
    }

    const member = await prisma.workspaceMember.findFirst({ where: { userId } })
    if (!member) return reply.status(404).send({ error: 'Workspace não encontrado' })

    const redirectUri = `${API_URL}/integrations/google/callback`
    const url = getOAuthUrl(redirectUri, member.workspaceId)
    return reply.redirect(url)
  })

  app.get('/integrations/google/callback', async (req, reply) => {
    const { code, state: workspaceId, error } = req.query as Record<string, string>
    const redirectBase = `${FRONTEND_URL}/settings?tab=integrations`

    if (error || !code || !workspaceId) {
      return reply.redirect(`${redirectBase}&google=error`)
    }

    try {
      const redirectUri = `${API_URL}/integrations/google/callback`
      const tokens = await exchangeCodeForTokens(code, redirectUri)
      const { email } = await getGoogleUserInfo(tokens.access_token)

      const calendars = await listCalendars(tokens.access_token)
      const syncroflowCal = calendars.find(c =>
        c.summary.toLowerCase().includes('syncroflow') || c.summary.toLowerCase().includes('syncro')
      )
      const calendarId = syncroflowCal?.id ?? 'primary'

      // Busca o refresh token existente para não apagar caso o Google não retorne um novo
      const existingWs = await (prisma.workspace as any).findUnique({
        where: { id: workspaceId },
        select: { googleRefreshToken: true },
      })

      await (prisma.workspace as any).update({
        where: { id: workspaceId },
        data: {
          googleCalendarEnabled: true,
          googleCalendarEmail: email,
          googleCalendarId: calendarId,
          googleAccessToken: tokens.access_token,
          googleRefreshToken: tokens.refresh_token ?? existingWs?.googleRefreshToken ?? null,
          googleTokenExpiry: new Date(tokens.expiry_date),
        },
      })

      return reply.redirect(`${redirectBase}&google=success`)
    } catch (err) {
      console.error('[Google Calendar Callback]', err)
      return reply.redirect(`${redirectBase}&google=error`)
    }
  })

  // ── GOOGLE CALENDAR — status e disconnect ────────────────────────────────
  app.get('/integrations/google', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const member = await prisma.workspaceMember.findFirst({ where: wid ? { workspaceId: wid, userId: sub } : { userId: sub }, orderBy: { createdAt: 'asc' } })
    if (!member) return reply.status(404).send({ error: 'Workspace não encontrado' })

    const ws = await (prisma.workspace as any).findUnique({
      where: { id: member.workspaceId },
      select: { googleCalendarEnabled: true, googleCalendarEmail: true, googleCalendarId: true, googleTokenExpiry: true, googleRefreshToken: true },
    })

    if (!ws?.googleCalendarEnabled) {
      return reply.send({ connected: false, email: null, calendarId: null, tokenExpired: false })
    }

    // Tenta renovar o token automaticamente se estiver expirado ou prestes a expirar
    let tokenExpired = false
    const accessToken = await getValidToken(member.workspaceId)
    if (!accessToken) {
      // Renovação falhou — refresh token inválido ou ausente → requer reconexão
      tokenExpired = true
    }

    return reply.send({
      connected: true,
      email: ws.googleCalendarEmail ?? null,
      calendarId: ws.googleCalendarId ?? null,
      tokenExpired,
    })
  })

  app.delete('/integrations/google', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const member = await prisma.workspaceMember.findFirst({ where: wid ? { workspaceId: wid, userId: sub } : { userId: sub }, orderBy: { createdAt: 'asc' } })
    if (!member) return reply.status(404).send({ error: 'Workspace não encontrado' })

    await (prisma.workspace as any).update({
      where: { id: member.workspaceId },
      data: {
        googleCalendarEnabled: false,
        googleCalendarEmail: null,
        googleCalendarId: null,
        googleAccessToken: null,
        googleRefreshToken: null,
        googleTokenExpiry: null,
      },
    })
    return reply.send({ ok: true })
  })

  // ── GOOGLE CALENDAR — eventos ────────────────────────────────────────────
  app.get('/integrations/google/events', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const member = await prisma.workspaceMember.findFirst({ where: wid ? { workspaceId: wid, userId: sub } : { userId: sub }, orderBy: { createdAt: 'asc' } })
    if (!member) return reply.status(404).send({ error: 'Workspace não encontrado' })

    const { timeMin, timeMax } = req.query as Record<string, string>
    const ws = await (prisma.workspace as any).findUnique({
      where: { id: member.workspaceId },
      select: { googleCalendarEnabled: true, googleCalendarId: true },
    })

    if (!ws?.googleCalendarEnabled) return reply.send({ events: [], connected: false })

    const accessToken = await getValidToken(member.workspaceId)
    if (!accessToken) return reply.send({ events: [], connected: false })

    const { listCalendarEvents } = await import('../../lib/google')
    const events = await listCalendarEvents(accessToken, ws.googleCalendarId, timeMin, timeMax)
    return reply.send({ events, connected: true })
  })

  app.post('/integrations/google/events', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const member = await prisma.workspaceMember.findFirst({ where: wid ? { workspaceId: wid, userId: sub } : { userId: sub }, orderBy: { createdAt: 'asc' } })
    if (!member) return reply.status(404).send({ error: 'Workspace não encontrado' })

    const ws = await (prisma.workspace as any).findUnique({
      where: { id: member.workspaceId },
      select: { googleCalendarEnabled: true, googleCalendarId: true },
    })
    if (!ws?.googleCalendarEnabled) return reply.status(403).send({ error: 'Google Calendar não conectado' })

    const accessToken = await getValidToken(member.workspaceId)
    if (!accessToken) return reply.status(401).send({ error: 'Token expirado' })

    const { createCalendarEvent } = await import('../../lib/google')
    const eventId = await createCalendarEvent(accessToken, ws.googleCalendarId, req.body as any)
    return reply.status(201).send({ eventId })
  })

  app.delete('/integrations/google/events/:eventId', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const { eventId } = req.params as { eventId: string }
    const member = await prisma.workspaceMember.findFirst({ where: wid ? { workspaceId: wid, userId: sub } : { userId: sub }, orderBy: { createdAt: 'asc' } })
    if (!member) return reply.status(404).send({ error: 'Workspace não encontrado' })

    const ws = await (prisma.workspace as any).findUnique({
      where: { id: member.workspaceId },
      select: { googleCalendarEnabled: true, googleCalendarId: true },
    })
    if (!ws?.googleCalendarEnabled) return reply.status(403).send({ error: 'Google Calendar não conectado' })

    const accessToken = await getValidToken(member.workspaceId)
    if (!accessToken) return reply.status(401).send({ error: 'Token expirado' })

    const { deleteCalendarEvent } = await import('../../lib/google')
    await deleteCalendarEvent(accessToken, ws.googleCalendarId, eventId)
    return reply.send({ ok: true })
  })
}
