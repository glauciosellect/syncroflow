import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { messageQueue } from '../../lib/queue'
import {
  TIKTOK_SCOPES,
  tiktokEnv,
  exchangeAuthCode,
  fetchAccountInfo,
  tokenFields,
  isValidTikTokSignature,
} from '../../lib/tiktok'

const FRONTEND_URL = process.env.FRONTEND_URL!

// O content do webhook vem como string JSON com IDs de 19 dígitos — coloca aspas nos números
// grandes antes do parse para não perder precisão.
function parseContent(content: unknown): any {
  if (typeof content !== 'string') return content ?? {}
  try {
    return JSON.parse(content.replace(/("[A-Za-z_]*id"\s*:\s*)(\d{16,})/g, '$1"$2"'))
  } catch {
    return {}
  }
}

export async function tiktokRoutes(app: FastifyInstance) {
  // Inicia OAuth — GET /integrations/tiktok/connect?token=JWT
  app.get('/integrations/tiktok/connect', async (req, reply) => {
    const { token } = req.query as { token?: string }
    if (!token) return reply.status(400).send({ error: 'Token JWT obrigatório' })
    const { appId, redirectUri } = tiktokEnv()
    if (!appId) return reply.redirect(`${FRONTEND_URL}/settings?meta_error=${encodeURIComponent('TikTok não configurado no servidor')}`)

    const state = Buffer.from(JSON.stringify({ token, ts: Date.now() })).toString('base64url')
    const url = new URL('https://www.tiktok.com/v2/auth/authorize/')
    url.searchParams.set('client_key', appId)
    url.searchParams.set('scope', TIKTOK_SCOPES)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)
    return reply.redirect(url.toString())
  })

  app.get('/integrations/tiktok/callback', async (req, reply) => {
    const { code, state, error, error_description } = req.query as Record<string, string>
    const fail = (msg: string) => reply.redirect(`${FRONTEND_URL}/settings?meta_error=${encodeURIComponent(msg)}`)
    if (error) return fail(error_description || error)
    if (!code || !state) return fail('invalid_state')

    let jwtToken: string
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
      if (Date.now() - Number(decoded.ts) > 10 * 60 * 1000) return fail('Sessão de conexão expirada, tente novamente')
      jwtToken = decoded.token
    } catch {
      return fail('invalid_state')
    }

    let userId: string
    try {
      try {
        userId = (app.jwt.verify(jwtToken, { clockTolerance: 300 }) as { sub: string }).sub
      } catch {
        const session = await prisma.session.findUnique({
          where: { refreshToken: jwtToken },
          select: { userId: true, expiresAt: true },
        })
        if (!session || session.expiresAt <= new Date()) return fail('invalid_token')
        userId = session.userId
      }
    } catch {
      return fail('invalid_token')
    }

    const member = await prisma.workspaceMember.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
    if (!member) return fail('workspace_not_found')
    const workspaceId = member.workspaceId

    try {
      const tokens = await exchangeAuthCode(code)
      const businessId = tokens.open_id
      if (!businessId) return fail('TikTok não retornou o ID da conta')

      let username: string | undefined
      let displayName: string | undefined
      try {
        const info = await fetchAccountInfo(tokens.access_token, businessId)
        username = info.username
        displayName = info.displayName
      } catch (e: any) {
        console.error('[TIKTOK-OAUTH] não foi possível ler dados da conta:', e?.message)
      }

      const configData = { ...tokenFields(tokens), businessId, username, displayName, needsReconnect: false }
      const existing = await prisma.channel.findFirst({
        where: { workspaceId, type: 'TIKTOK', config: { path: ['businessId'], equals: businessId } },
      })
      if (existing) {
        await prisma.channel.update({
          where: { id: existing.id },
          data: { isActive: true, config: { ...(existing.config as any), ...configData } },
        })
      } else {
        await prisma.channel.create({
          data: {
            workspaceId,
            type: 'TIKTOK',
            name: username ? `@${username}` : displayName || 'TikTok',
            config: configData,
          },
        })
      }
      const msg = username ? `Conectado: @${username}` : 'TikTok conectado'
      return reply.redirect(`${FRONTEND_URL}/settings?meta_success=${encodeURIComponent(msg)}`)
    } catch (err: any) {
      console.error('[TIKTOK-OAUTH] erro:', err?.response?.data || err?.message)
      return fail(err?.message || 'Não foi possível conectar o TikTok')
    }
  })

  // Webhook único do app TikTok (event_type COMMENT). Responde 200 rápido e processa na fila.
  app.post('/webhooks/tiktok', { config: { rawBody: true } }, async (req, reply) => {
    const rawBody: Buffer = (req as any).rawBody || Buffer.from(JSON.stringify(req.body ?? {}))
    if (!isValidTikTokSignature(rawBody, req.headers['tiktok-signature'] as string | undefined)) {
      return reply.status(403).send()
    }

    const body = req.body as any
    const event: string = body?.event || ''
    const content = parseContent(body?.content)
    const businessId: string = String(content?.business_id || body?.user_openid || content?.user_openid || '')

    // Usuário revogou o acesso — marca o canal para reconexão
    if (event === 'authorization.removed') {
      const ch = businessId
        ? await prisma.channel.findFirst({ where: { type: 'TIKTOK', config: { path: ['businessId'], equals: businessId } } })
        : null
      if (ch) await prisma.channel.update({ where: { id: ch.id }, data: { config: { ...(ch.config as any), needsReconnect: true } } })
      return reply.send({ ok: true })
    }

    if (!event.startsWith('comment')) return reply.send({ ok: true })

    const commentId = String(content?.comment_id || '')
    const videoId = String(content?.video_id || '')
    const parent = String(content?.parent_comment_id ?? '0')
    // Só comentários novos de primeiro nível
    if (!commentId || !videoId || (parent && parent !== '0')) return reply.send({ ok: true })
    if (content?.action && !['insert', 'create'].includes(String(content.action).toLowerCase())) {
      return reply.send({ ok: true })
    }

    const channel = businessId
      ? await prisma.channel.findFirst({ where: { type: 'TIKTOK', isActive: true, config: { path: ['businessId'], equals: businessId } } })
      : null
    if (!channel) {
      console.log('[TIKTOK-ROUTE] canal não encontrado para business_id:', businessId)
      return reply.send({ ok: true })
    }

    await messageQueue.add(
      'process',
      { channelId: channel.id, channelType: 'TIKTOK', payload: { commentId, videoId, text: content?.text } },
      { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, jobId: `tiktok-${commentId}` },
    )
    return reply.send({ ok: true })
  })
}
