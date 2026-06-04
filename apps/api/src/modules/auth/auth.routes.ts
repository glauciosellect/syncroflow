import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verify2FASchema,
} from './auth.schema'
import {
  registerUser,
  loginUser,
  refreshTokens,
  logoutUser,
  forgotPassword,
  resetPassword,
  setup2FA,
  verify2FA,
  disable2FA,
} from './auth.service'

export async function authRoutes(app: FastifyInstance) {
  const signTokens = (userId: string) => ({
    accessToken: app.jwt.sign({ sub: userId }, { expiresIn: '15m' }),
    refreshToken: app.jwt.sign({ sub: userId, type: 'refresh' }, { expiresIn: '7d' }),
  })

  app.post('/auth/register', async (req, reply) => {
    const input = registerSchema.parse(req.body)
    const result = await registerUser(input, signTokens)
    return reply.status(201).send(result)
  })

  app.post('/auth/login', async (req, reply) => {
    const input = loginSchema.parse(req.body)
    const result = await loginUser(input, signTokens)
    return reply.send(result)
  })

  app.post('/auth/refresh', async (req, reply) => {
    const { refreshToken } = refreshSchema.parse(req.body)
    const result = await refreshTokens(refreshToken, signTokens)
    return reply.send(result)
  })

  app.post('/auth/logout', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body)
    await logoutUser(refreshToken)
    return reply.send({ ok: true })
  })

  app.post('/auth/forgot-password', async (req, reply) => {
    const { email } = forgotPasswordSchema.parse(req.body)
    await forgotPassword(email)
    return reply.send({ ok: true })
  })

  app.post('/auth/reset-password', async (req, reply) => {
    const { token, password } = resetPasswordSchema.parse(req.body)
    await resetPassword(token, password)
    return reply.send({ ok: true })
  })

  app.get('/auth/2fa/setup', { onRequest: [app.authenticate] }, async (req, reply) => {
    const result = await setup2FA((req.user as { sub: string }).sub)
    return reply.send(result)
  })

  app.post('/auth/2fa/verify', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { totpCode } = verify2FASchema.parse(req.body)
    await verify2FA((req.user as { sub: string }).sub, totpCode)
    return reply.send({ ok: true })
  })

  app.post('/auth/2fa/disable', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { totpCode } = verify2FASchema.parse(req.body)
    await disable2FA((req.user as { sub: string }).sub, totpCode)
    return reply.send({ ok: true })
  })

  app.get('/auth/me', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { prisma } = await import('../../lib/prisma')
    const user = await prisma.user.findUnique({
      where: { id: sub },
      include: { workspaceMembers: { include: { workspace: true } } },
    })
    if (!user) return reply.status(404).send({ error: 'Usuário não encontrado' })
    const { passwordHash, twoFactorSecret, ...safeUser } = user
    return reply.send(safeUser)
  })

  app.post('/auth/invite/accept', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { prisma } = await import('../../lib/prisma')
    const { token } = z.object({ token: z.string() }).parse(req.body)

    const invite = await prisma.workspaceInvite.findUnique({ where: { token } })
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      return reply.status(400).send({ error: 'Convite inválido ou expirado' })
    }

    const user = await prisma.user.findUnique({ where: { id: sub } })
    if (!user) return reply.status(404).send({ error: 'Usuário não encontrado' })
    if (user.email !== invite.email) {
      return reply.status(403).send({ error: `Este convite é para ${invite.email}. Faça login com a conta correta.` })
    }

    const alreadyMember = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: sub, workspaceId: invite.workspaceId } },
    })
    if (!alreadyMember) {
      await prisma.workspaceMember.create({
        data: { userId: sub, workspaceId: invite.workspaceId, role: invite.role },
      })
    }

    await prisma.workspaceInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } })
    return reply.send({ ok: true, workspaceId: invite.workspaceId })
  })

  app.patch('/auth/me', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { prisma } = await import('../../lib/prisma')
    const data = z.object({
      name: z.string().optional(),
      phone: z.string().optional().nullable(),
      language: z.string().optional(),
      theme: z.string().optional(),
      onboardingDone: z.boolean().optional(),
      onboardingData: z.any().optional(),
    }).parse(req.body)
    const user = await prisma.user.update({ where: { id: sub }, data })
    const { passwordHash, twoFactorSecret, ...safeUser } = user
    return reply.send(safeUser)
  })
}
