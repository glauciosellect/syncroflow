import bcrypt from 'bcryptjs'
import * as speakeasy from 'speakeasy'
import * as qrcode from 'qrcode'
import crypto from 'crypto'
import { prisma } from '../../lib/prisma'
import { redis } from '../../lib/redis'
import { sendEmail, passwordResetEmail } from '../../lib/mailer'
import type { RegisterInput, LoginInput } from './auth.schema'

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base
  let i = 0
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    slug = `${base}-${++i}`
  }
  return slug
}

export async function registerUser(input: RegisterInput, signTokens: (userId: string) => { accessToken: string; refreshToken: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) throw new Error('Email já cadastrado')

  const passwordHash = await bcrypt.hash(input.password, 12)
  const workspaceName = input.workspaceName || `${input.name.split(' ')[0]}'s Workspace`
  const slug = await uniqueSlug(generateSlug(workspaceName))

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      workspaceMembers: {
        create: {
          role: 'OWNER',
          workspace: {
            create: {
              name: workspaceName,
              slug,
              plan: 'TRIAL',
              trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              credits: 1000,
            },
          },
        },
      },
    },
    include: { workspaceMembers: { include: { workspace: true } } },
  })

  const tokens = signTokens(user.id)
  await saveRefreshToken(user.id, tokens.refreshToken)

  const workspace = user.workspaceMembers[0].workspace
  return { user: sanitize(user), workspace, ...tokens }
}

export async function loginUser(input: LoginInput, signTokens: (userId: string) => { accessToken: string; refreshToken: string }) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { workspaceMembers: { include: { workspace: true }, take: 1 } },
  })
  if (!user || !user.passwordHash) throw new Error('Credenciais inválidas')

  const valid = await bcrypt.compare(input.password, user.passwordHash)
  if (!valid) throw new Error('Credenciais inválidas')

  if (user.twoFactorEnabled) {
    if (!input.totpCode) throw new Error('Código 2FA obrigatório')
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret!,
      encoding: 'base32',
      token: input.totpCode,
      window: 1,
    })
    if (!verified) throw new Error('Código 2FA inválido')
  }

  const tokens = signTokens(user.id)
  await saveRefreshToken(user.id, tokens.refreshToken)

  const workspace = user.workspaceMembers[0]?.workspace
  return { user: sanitize(user), workspace, ...tokens }
}

export async function refreshTokens(
  oldRefreshToken: string,
  signTokens: (userId: string) => { accessToken: string; refreshToken: string }
) {
  const session = await prisma.session.findUnique({
    where: { refreshToken: oldRefreshToken },
    include: { user: true },
  })
  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } })
    throw new Error('Refresh token inválido ou expirado')
  }

  const tokens = signTokens(session.userId)
  await prisma.session.update({
    where: { id: session.id },
    data: {
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })

  return { user: sanitize(session.user), ...tokens }
}

export async function logoutUser(refreshToken: string) {
  await prisma.session.deleteMany({ where: { refreshToken } })
}

export async function forgotPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return

  const token = crypto.randomBytes(32).toString('hex')
  await redis.set(`reset:${token}`, user.id, 'EX', 3600)

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`
  await sendEmail(user.email, 'Redefinição de senha — SyncroFlow', passwordResetEmail(user.name, resetUrl))
}

export async function resetPassword(token: string, newPassword: string) {
  const userId = await redis.get(`reset:${token}`)
  if (!userId) throw new Error('Token inválido ou expirado')

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } })
  await redis.del(`reset:${token}`)
  await prisma.session.deleteMany({ where: { userId } })
}

export async function setup2FA(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('Usuário não encontrado')

  const secret = speakeasy.generateSecret({ name: `SyncroFlow (${user.email})`, length: 20 })
  await redis.set(`2fa_setup:${userId}`, secret.base32!, 'EX', 600)

  const qrCode = await qrcode.toDataURL(secret.otpauth_url!)
  return { qrCode, secret: secret.base32 }
}

export async function verify2FA(userId: string, totpCode: string) {
  const secret = await redis.get(`2fa_setup:${userId}`)
  if (!secret) throw new Error('Setup 2FA expirado. Reinicie o processo.')

  const valid = speakeasy.totp.verify({ secret, encoding: 'base32', token: totpCode, window: 1 })
  if (!valid) throw new Error('Código inválido')

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: secret, twoFactorEnabled: true },
  })
  await redis.del(`2fa_setup:${userId}`)
}

export async function disable2FA(userId: string, totpCode: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.twoFactorSecret) throw new Error('2FA não habilitado')

  const valid = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token: totpCode,
    window: 1,
  })
  if (!valid) throw new Error('Código inválido')

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: null, twoFactorEnabled: false },
  })
}

async function saveRefreshToken(userId: string, refreshToken: string) {
  await prisma.session.create({
    data: {
      userId,
      refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })
}

function sanitize(user: { id: string; name: string; email: string; avatarUrl: string | null; twoFactorEnabled: boolean; onboardingDone: boolean; language: string; theme: string }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    twoFactorEnabled: user.twoFactorEnabled,
    onboardingDone: user.onboardingDone,
    language: user.language,
    theme: user.theme,
  }
}
