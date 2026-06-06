import type { FastifyInstance } from 'fastify'
import axios from 'axios'
import { prisma } from '../../lib/prisma'

const META_APP_ID = process.env.META_APP_ID!
const META_APP_SECRET = process.env.META_APP_SECRET!
const API_URL = process.env.API_URL!
const FRONTEND_URL = process.env.FRONTEND_URL!

// Troca code por token de curta duração, depois converte para longa duração (60 dias)
async function exchangeCodeForLongLivedToken(code: string, redirectUri: string): Promise<string> {
  const shortRes = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
    params: {
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      redirect_uri: redirectUri,
      code,
    },
  })
  const shortToken: string = shortRes.data.access_token

  const longRes = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      fb_exchange_token: shortToken,
    },
  })
  return longRes.data.access_token
}

// Busca páginas do Facebook e conta Instagram vinculada
async function getPagesWithInstagram(userToken: string) {
  const res = await axios.get('https://graph.facebook.com/v21.0/me/accounts', {
    params: {
      access_token: userToken,
      fields: 'id,name,access_token,instagram_business_account{id,name,username,profile_picture_url}',
    },
  })
  return res.data.data as Array<{
    id: string
    name: string
    access_token: string
    instagram_business_account?: { id: string; name: string; username: string; profile_picture_url?: string }
  }>
}

export async function metaIntegrationRoutes(app: FastifyInstance) {
  // Inicia fluxo OAuth — redireciona para Meta Login
  // GET /integrations/meta/connect?token=JWT&type=instagram|facebook
  app.get('/integrations/meta/connect', async (req, reply) => {
    const { token, type } = req.query as { token?: string; type?: string }
    if (!token) return reply.status(400).send({ error: 'Token JWT obrigatório' })

    const redirectUri = `${API_URL}/integrations/meta/callback`
    const scope = type === 'facebook'
      ? 'pages_show_list,pages_messaging'
      : 'pages_show_list,pages_messaging,instagram_basic,instagram_manage_messages'

    const state = Buffer.from(JSON.stringify({ token, type: type || 'instagram' })).toString('base64url')

    const authUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth')
    authUrl.searchParams.set('client_id', META_APP_ID)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('scope', scope)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('response_type', 'code')

    return reply.redirect(authUrl.toString())
  })

  // Callback OAuth — Meta redireciona aqui com o code
  // GET /integrations/meta/callback?code=...&state=...
  app.get('/integrations/meta/callback', async (req, reply) => {
    const { code, state, error } = req.query as Record<string, string>

    if (error) {
      return reply.redirect(`${FRONTEND_URL}/settings?meta_error=${encodeURIComponent(error)}`)
    }

    let jwtToken: string
    let channelType: string
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
      jwtToken = decoded.token
      channelType = decoded.type || 'instagram'
    } catch {
      return reply.redirect(`${FRONTEND_URL}/settings?meta_error=invalid_state`)
    }

    // Verifica JWT e extrai userId
    let userId: string
    try {
      const payload = app.jwt.verify(jwtToken) as { sub: string }
      userId = payload.sub
    } catch {
      return reply.redirect(`${FRONTEND_URL}/settings?meta_error=invalid_token`)
    }

    const member = await prisma.workspaceMember.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
    if (!member) return reply.redirect(`${FRONTEND_URL}/settings?meta_error=workspace_not_found`)
    const workspaceId = member.workspaceId

    const redirectUri = `${API_URL}/integrations/meta/callback`

    try {
      const longToken = await exchangeCodeForLongLivedToken(code, redirectUri)
      const pages = await getPagesWithInstagram(longToken)
      console.log('[META-OAUTH] páginas encontradas:', JSON.stringify(pages).slice(0, 500))

      if (pages.length === 0) {
        return reply.redirect(`${FRONTEND_URL}/settings?meta_error=no_pages`)
      }

      // Cria canais para cada página/conta Instagram encontrada
      const created: string[] = []
      for (const page of pages) {
        if (channelType === 'instagram' && page.instagram_business_account) {
          const ig = page.instagram_business_account
          // Verifica se já existe canal para esse igAccountId
          const existing = await prisma.channel.findFirst({
            where: { workspaceId, type: 'INSTAGRAM', config: { path: ['igAccountId'], equals: ig.id } },
          })
          if (!existing) {
            const channel = await prisma.channel.create({
              data: {
                workspaceId,
                type: 'INSTAGRAM',
                name: ig.username ? `@${ig.username}` : (ig.name || 'Instagram'),
                config: {
                  pageAccessToken: page.access_token,
                  pageId: page.id,
                  igAccountId: ig.id,
                  igUsername: ig.username,
                  igName: ig.name,
                  tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 dias
                  verifyToken: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
                },
              },
            })
            // Configura webhook automaticamente
            await setupMetaWebhook(page.id, page.access_token, channel.id)
            created.push(ig.username || ig.name)
          }
        } else if (channelType === 'facebook') {
          const existing = await prisma.channel.findFirst({
            where: { workspaceId, type: 'FACEBOOK', config: { path: ['pageId'], equals: page.id } },
          })
          if (!existing) {
            const channel = await prisma.channel.create({
              data: {
                workspaceId,
                type: 'FACEBOOK',
                name: page.name,
                config: {
                  pageAccessToken: page.access_token,
                  pageId: page.id,
                  tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
                  verifyToken: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
                },
              },
            })
            await setupMetaWebhook(page.id, page.access_token, channel.id)
            created.push(page.name)
          }
        }
      }

      const successMsg = created.length > 0
        ? `Conectado: ${created.join(', ')}`
        : 'Canal já estava conectado'

      return reply.redirect(`${FRONTEND_URL}/settings?meta_success=${encodeURIComponent(successMsg)}`)
    } catch (err: any) {
      console.error('[META-OAUTH] Erro:', err?.response?.data || err?.message)
      const errMsg = err?.response?.data?.error?.message || 'Erro ao conectar com Meta'
      return reply.redirect(`${FRONTEND_URL}/settings?meta_error=${encodeURIComponent(errMsg)}`)
    }
  })

  // Renova token de um canal Meta (chamado manualmente ou por cron)
  // POST /integrations/meta/refresh/:channelId
  app.post('/integrations/meta/refresh/:channelId', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { channelId } = req.params as { channelId: string }
    const member = await prisma.workspaceMember.findFirst({ where: { userId: sub } })
    if (!member) return reply.status(403).send({ error: 'Sem permissão' })

    const channel = await prisma.channel.findFirst({
      where: { id: channelId, workspaceId: member.workspaceId },
    })
    if (!channel) return reply.status(404).send({ error: 'Canal não encontrado' })

    const config = channel.config as any
    try {
      const res = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: META_APP_ID,
          client_secret: META_APP_SECRET,
          fb_exchange_token: config.pageAccessToken,
        },
      })
      const newToken = res.data.access_token
      await prisma.channel.update({
        where: { id: channelId },
        data: {
          config: {
            ...config,
            pageAccessToken: newToken,
            tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          },
        },
      })
      return reply.send({ ok: true, expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString() })
    } catch (err: any) {
      return reply.status(400).send({ error: err?.response?.data?.error?.message || 'Erro ao renovar token' })
    }
  })
}

// Configura webhook da página do Facebook para receber mensagens
async function setupMetaWebhook(pageId: string, pageToken: string, channelId: string) {
  const webhookUrl = `${API_URL}/webhooks/meta/${channelId}`
  try {
    await axios.post(
      `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps`,
      { subscribed_fields: ['messages', 'messaging_postbacks'] },
      { params: { access_token: pageToken } }
    )
    console.log(`[META-OAUTH] Webhook configurado para página ${pageId} → ${webhookUrl}`)
  } catch (err: any) {
    console.error('[META-OAUTH] Erro ao configurar webhook:', err?.response?.data || err?.message)
  }
}
