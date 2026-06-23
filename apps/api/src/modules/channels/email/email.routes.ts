import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../../lib/prisma'
import { getWorkspaceId } from '../../../lib/workspace'
import { getGmailOAuthUrl } from '../../../lib/gmail'
import { exchangeCodeForTokens, getGoogleUserInfo } from '../../../lib/google'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'
const API_URL = process.env.API_URL || 'http://localhost:3001'

export async function emailChannelRoutes(app: FastifyInstance) {
  // Aceita token via query param pois é um redirect de browser (sem header Authorization) —
  // mesmo padrão de /integrations/google/connect.
  app.get('/channels/email/connect', async (req, reply) => {
    const { token, wid } = req.query as Record<string, string>
    if (!token) return reply.status(401).send({ error: 'Não autorizado' })

    let userId: string
    try {
      const decoded = app.jwt.verify(token) as { sub: string; type?: string }
      userId = decoded.sub
    } catch {
      try {
        const decoded = app.jwt.verify(token, { key: process.env.JWT_REFRESH_SECRET || '' }) as { sub: string }
        userId = decoded.sub
      } catch {
        return reply.status(401).send({ error: 'Token inválido' })
      }
    }

    const member = await prisma.workspaceMember.findFirst({
      where: wid ? { workspaceId: wid, userId } : { userId },
      orderBy: { createdAt: 'asc' },
    })
    if (!member) return reply.status(404).send({ error: 'Workspace não encontrado' })

    const redirectUri = `${API_URL}/channels/email/callback`
    const url = getGmailOAuthUrl(redirectUri, member.workspaceId)
    return reply.redirect(url)
  })

  app.get('/channels/email/callback', async (req, reply) => {
    const { code, state: workspaceId, error } = req.query as Record<string, string>
    const redirectBase = `${FRONTEND_URL}/settings?tab=channels`

    if (error || !code || !workspaceId) {
      return reply.redirect(`${redirectBase}&email=error`)
    }

    try {
      const redirectUri = `${API_URL}/channels/email/callback`
      const tokens = await exchangeCodeForTokens(code, redirectUri)
      const { email } = await getGoogleUserInfo(tokens.access_token)

      const existing = await prisma.channel.findFirst({
        where: { workspaceId, type: 'EMAIL', config: { path: ['email'], equals: email } },
      })
      if (existing) {
        await prisma.channel.update({
          where: { id: existing.id },
          data: {
            config: {
              ...(existing.config as any),
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token ?? (existing.config as any).refreshToken,
              tokenExpiry: new Date(tokens.expiry_date).toISOString(),
            },
          },
        })
        return reply.redirect(`${redirectBase}&email=success`)
      }

      await prisma.channel.create({
        data: {
          workspaceId,
          type: 'EMAIL',
          name: email,
          config: {
            provider: 'gmail',
            email,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token ?? null,
            tokenExpiry: new Date(tokens.expiry_date).toISOString(),
            allowedSenders: [],
          },
        },
      })

      return reply.redirect(`${redirectBase}&email=success`)
    } catch (err) {
      console.error('[EMAIL] Erro no callback de conexão:', err)
      return reply.redirect(`${redirectBase}&email=error`)
    }
  })

  app.patch('/channels/:id/email-settings', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }

    const channel = await prisma.channel.findFirst({ where: { id, workspaceId, type: 'EMAIL' } })
    if (!channel) return reply.status(404).send({ error: 'Canal não encontrado' })

    const { allowedSenders } = z.object({ allowedSenders: z.array(z.string()) }).parse(req.body)

    await prisma.channel.update({
      where: { id },
      data: { config: { ...(channel.config as any), allowedSenders: allowedSenders.map(s => s.trim().toLowerCase()).filter(Boolean) } },
    })

    return reply.send({ ok: true })
  })
}
