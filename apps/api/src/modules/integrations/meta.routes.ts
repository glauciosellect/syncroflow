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
  console.log('[META-OAUTH] short token response:', JSON.stringify(shortRes.data).slice(0, 200))
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

type MetaPage = {
  id: string
  name: string
  access_token: string
  instagram_business_account?: { id: string; name: string; username: string; profile_picture_url?: string }
}

// Busca páginas do Facebook e conta Instagram vinculada
async function getPagesWithInstagram(userToken: string): Promise<MetaPage[]> {
  // Loga info do usuário para diagnóstico
  let userName = 'desconhecido'
  try {
    const meRes = await axios.get('https://graph.facebook.com/v21.0/me', {
      params: { access_token: userToken, fields: 'id,name' },
    })
    userName = meRes.data?.name || meRes.data?.id || 'desconhecido'
    console.log('[META-OAUTH] me:', JSON.stringify(meRes.data))
  } catch (e: any) {
    console.log('[META-OAUTH] me error:', e?.response?.data || e?.message)
  }

  const pageFields = 'id,name,access_token,instagram_business_account{id,name,username,profile_picture_url}'
  const pagesMap = new Map<string, MetaPage>()

  // 1. Páginas com admin direto
  try {
    const res = await axios.get('https://graph.facebook.com/v21.0/me/accounts', {
      params: { access_token: userToken, fields: pageFields },
    })
    console.log('[META-OAUTH] /me/accounts raw:', JSON.stringify(res.data))
    for (const p of (res.data.data || [])) pagesMap.set(p.id, p)
  } catch (e: any) {
    console.log('[META-OAUTH] /me/accounts error:', e?.response?.data || e?.message)
  }

  // 2. Páginas via portfólios empresariais (Business Manager)
  try {
    const bizRes = await axios.get('https://graph.facebook.com/v21.0/me/businesses', {
      params: { access_token: userToken, fields: 'id,name' },
    })
    console.log('[META-OAUTH] /me/businesses raw:', JSON.stringify(bizRes.data).slice(0, 400))
    for (const biz of (bizRes.data?.data || [])) {
      try {
        const ownedRes = await axios.get(`https://graph.facebook.com/v21.0/${biz.id}/owned_pages`, {
          params: { access_token: userToken, fields: pageFields },
        })
        console.log(`[META-OAUTH] business ${biz.name} owned_pages:`, JSON.stringify(ownedRes.data).slice(0, 400))
        for (const p of (ownedRes.data?.data || [])) {
          if (!pagesMap.has(p.id)) pagesMap.set(p.id, p)
        }
      } catch (e: any) {
        console.log(`[META-OAUTH] owned_pages error for ${biz.id}:`, e?.response?.data || e?.message)
      }
      try {
        const clientRes = await axios.get(`https://graph.facebook.com/v21.0/${biz.id}/client_pages`, {
          params: { access_token: userToken, fields: pageFields },
        })
        console.log(`[META-OAUTH] business ${biz.name} client_pages:`, JSON.stringify(clientRes.data).slice(0, 400))
        for (const p of (clientRes.data?.data || [])) {
          if (!pagesMap.has(p.id)) pagesMap.set(p.id, p)
        }
      } catch (e: any) {
        console.log(`[META-OAUTH] client_pages error for ${biz.id}:`, e?.response?.data || e?.message)
      }
    }
  } catch (e: any) {
    console.log('[META-OAUTH] /me/businesses error:', e?.response?.data || e?.message)
  }

  const pages = Array.from(pagesMap.values())
  console.log(`[META-OAUTH] total páginas encontradas para "${userName}":`, pages.length)
  return pages
}

export async function metaIntegrationRoutes(app: FastifyInstance) {
  // Inicia fluxo OAuth — redireciona para Meta Login
  // GET /integrations/meta/connect?token=JWT&type=instagram|facebook
  app.get('/integrations/meta/connect', async (req, reply) => {
    const { token, type } = req.query as { token?: string; type?: string }
    if (!token) return reply.status(400).send({ error: 'Token JWT obrigatório' })

    const redirectUri = `${API_URL}/integrations/meta/callback`
    const scope = 'pages_show_list,pages_messaging,pages_manage_metadata,instagram_basic,instagram_manage_messages,business_management'

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

    // Verifica o token: tenta JWT primeiro, depois refreshToken no banco
    let userId: string
    try {
      // 1. Tenta como accessToken JWT (pode estar próximo de expirar — aceita até 5 min extra)
      try {
        const payload = app.jwt.verify(jwtToken, { clockTolerance: 300 }) as { sub: string }
        userId = payload.sub
      } catch {
        // 2. Fallback: tenta como refreshToken no banco (7 dias)
        const session = await prisma.session.findUnique({
          where: { refreshToken: jwtToken },
          select: { userId: true, expiresAt: true },
        })
        if (!session || session.expiresAt <= new Date()) {
          console.log('[META-OAUTH] token inválido — nem JWT nem refreshToken válido')
          return reply.redirect(`${FRONTEND_URL}/settings?meta_error=invalid_token`)
        }
        userId = session.userId
      }
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
      console.log('[META-OAUTH] páginas encontradas:', JSON.stringify(pages).slice(0, 800))

      if (pages.length === 0) {
        // Diagnóstico detalhado
        try {
          const [permRes, meRes] = await Promise.all([
            axios.get('https://graph.facebook.com/v21.0/me/permissions', { params: { access_token: longToken } }),
            axios.get('https://graph.facebook.com/v21.0/me', { params: { access_token: longToken, fields: 'id,name' } }),
          ])
          const granted = (permRes.data?.data || []).filter((p: any) => p.status === 'granted').map((p: any) => p.permission)
          const meUser = meRes.data?.name || meRes.data?.id || 'desconhecido'
          console.log('[META-OAUTH] diagnóstico — usuário:', meUser, '| permissões:', granted.join(', '))
          const hasPages = granted.includes('pages_show_list')
          const errMsg = hasPages
            ? `Nenhuma Página encontrada para o usuário "${meUser}". Você precisa ser ADMINISTRADOR da Página no Facebook. Acesse facebook.com/[sua-pagina] → Configurações → Funções da Página e verifique se sua conta é Admin.`
            : `Permissão "pages_show_list" não concedida para "${meUser}". Tente conectar novamente e autorize TODAS as permissões.`
          return reply.redirect(`${FRONTEND_URL}/settings?meta_error=${encodeURIComponent(errMsg)}`)
        } catch {
          return reply.redirect(`${FRONTEND_URL}/settings?meta_error=${encodeURIComponent('Nenhuma Página do Facebook encontrada. Você precisa ser ADMINISTRADOR da Página (não apenas seguidor).')}`)
        }
      }

      const created: string[] = []
      for (const page of pages) {
        if (channelType === 'instagram' && page.instagram_business_account) {
          const ig = page.instagram_business_account
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
                  tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
                  verifyToken: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
                },
              },
            })
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
