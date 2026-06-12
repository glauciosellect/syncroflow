import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { encrypt, decrypt } from '../../lib/crypto'
import { getWorkspaceId } from '../../lib/workspace'
import { logger } from '../../lib/logger'

// ─── Webhook Receiver Marketing ───────────────────────────────────────────────

export async function marketingWebhookRoutes(app: FastifyInstance) {
  app.post<{ Params: { workspaceId: string; platform: string } }>(
    '/webhooks/marketing/:workspaceId/:platform',
    async (request, reply) => {
      const { workspaceId, platform } = request.params
      const body = request.body as any

      reply.status(200).send({ ok: true })

      try {
        const conn = await prisma.marketingConnection.findUnique({
          where: { workspaceId_platform: { workspaceId, platform } },
        })
        if (!conn || conn.status !== 'active') return

        const event = body?.event_type ?? body?.type ?? 'unknown'
        logger.info('Marketing webhook received', { workspaceId, platform, event })
      } catch (err) {
        logger.error('Marketing webhook error', { err, workspaceId, platform })
      }
    }
  )
}

// ─── OAuth Callbacks (públicos) ───────────────────────────────────────────────

export async function marketingOAuthCallbackRoutes(app: FastifyInstance) {
  // RD Station Marketing callback
  app.get('/marketing/rdmarketing/callback', async (req, reply) => {
    const { code, state } = req.query as { code: string; state: string }
    let workspaceId: string
    try { workspaceId = JSON.parse(Buffer.from(state, 'base64url').toString()).workspaceId }
    catch { return reply.status(400).send({ error: 'State inválido' }) }

    const clientId = process.env.RDMARKETING_CLIENT_ID ?? ''
    const clientSecret = process.env.RDMARKETING_CLIENT_SECRET ?? ''

    const tokenRes = await fetch('https://api.rdstation.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    })

    if (!tokenRes.ok) {
      logger.error('RD Station Marketing token exchange failed', { status: tokenRes.status })
      return reply.status(502).send({ error: 'Falha ao obter token do RD Station Marketing' })
    }

    const tokenData = await tokenRes.json() as any
    const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 86400) * 1000)

    await prisma.marketingConnection.upsert({
      where: { workspaceId_platform: { workspaceId, platform: 'rdmarketing' } },
      create: {
        workspaceId, platform: 'rdmarketing', status: 'active',
        accessToken: encrypt(tokenData.access_token),
        refreshToken: encrypt(tokenData.refresh_token),
        tokenExpiresAt: expiresAt,
      },
      update: {
        accessToken: encrypt(tokenData.access_token),
        refreshToken: encrypt(tokenData.refresh_token),
        tokenExpiresAt: expiresAt,
        status: 'active',
      },
    })

    const frontendUrl = process.env.FRONTEND_URL ?? 'https://app.syncroflow.io'
    return reply.redirect(`${frontendUrl}/integrations/marketing?connected=rdmarketing`)
  })
}

// ─── Marketing CRUD + Ações (autenticado) ─────────────────────────────────────

export async function marketingRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  // Listar conexões
  app.get('/marketing/connections', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const connections = await prisma.marketingConnection.findMany({
      where: { workspaceId },
      select: { id: true, platform: true, status: true, accountId: true, accountName: true, accountUrl: true, createdAt: true, updatedAt: true },
    })
    return reply.send(connections)
  })

  // Conectar ActiveCampaign (API Key + URL da conta)
  app.post<{ Body: { apiKey: string; accountUrl: string } }>(
    '/marketing/activecampaign/connect',
    async (req, reply) => {
      const { sub, wid } = req.user as { sub: string; wid?: string }
      const workspaceId = await getWorkspaceId(sub, wid)
      const { apiKey, accountUrl } = z.object({
        apiKey: z.string().min(10),
        accountUrl: z.string().url(),
      }).parse(req.body)

      const cleanUrl = accountUrl.replace(/\/$/, '')
      const testRes = await fetch(`${cleanUrl}/api/3/users/me`, {
        headers: { 'Api-Token': apiKey },
      })
      if (!testRes.ok) return reply.status(400).send({ error: 'Credenciais do ActiveCampaign inválidas' })
      const userData = await testRes.json() as any
      const accountName = userData?.user?.username ?? null

      await prisma.marketingConnection.upsert({
        where: { workspaceId_platform: { workspaceId, platform: 'activecampaign' } },
        create: { workspaceId, platform: 'activecampaign', status: 'active', apiKey: encrypt(apiKey), accountUrl: cleanUrl, accountName },
        update: { apiKey: encrypt(apiKey), accountUrl: cleanUrl, status: 'active', accountName },
      })

      return reply.status(201).send({ ok: true, accountName })
    }
  )

  // Iniciar OAuth RD Station Marketing
  app.get('/marketing/rdmarketing/connect', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const clientId = process.env.RDMARKETING_CLIENT_ID
    if (!clientId) return reply.status(503).send({ error: 'RD Station Marketing não configurado' })
    const baseUrl = process.env.API_BASE_URL ?? 'https://api.syncroflow.io'
    const state = Buffer.from(JSON.stringify({ workspaceId })).toString('base64url')
    const redirectUri = encodeURIComponent(`${baseUrl}/marketing/rdmarketing/callback`)
    return reply.send({ authUrl: `https://api.rdstation.com/auth/dialog?client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}` })
  })

  // Desconectar
  app.delete<{ Params: { id: string } }>('/marketing/connections/:id', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    await prisma.marketingConnection.deleteMany({ where: { id: req.params.id, workspaceId } })
    return reply.send({ ok: true })
  })

  // ─── Actions Marketing ────────────────────────────────────────────────────────

  app.post<{ Params: { platform: string }; Body: { action: string; payload: Record<string, any> } }>(
    '/marketing/:platform/action',
    async (req, reply) => {
      const { sub, wid } = req.user as { sub: string; wid?: string }
      const workspaceId = await getWorkspaceId(sub, wid)
      const { platform } = req.params
      const { action, payload } = z.object({
        action: z.string(),
        payload: z.record(z.any()),
      }).parse(req.body)

      const conn = await prisma.marketingConnection.findUnique({
        where: { workspaceId_platform: { workspaceId, platform } },
      })
      if (!conn || conn.status !== 'active') return reply.status(404).send({ error: 'Conexão de marketing não encontrada' })

      let result: any = null

      if (platform === 'rdmarketing') {
        const token = conn.accessToken ? decrypt(conn.accessToken) : ''
        result = await rdmarketingAction(token, action, payload)
      } else if (platform === 'activecampaign') {
        const apiKey = conn.apiKey ? decrypt(conn.apiKey) : ''
        result = await activecampaignAction(apiKey, conn.accountUrl ?? '', action, payload)
      } else {
        return reply.status(400).send({ error: 'Plataforma não suportada' })
      }

      return reply.send({ ok: true, result })
    }
  )
}

// ─── RD Station Marketing Actions ─────────────────────────────────────────────

async function rdmarketingAction(token: string, action: string, payload: Record<string, any>) {
  const base = 'https://api.rdstation.com/marketing/v1.3'
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  if (action === 'create_lead') {
    const res = await fetch(`${base}/conversions`, {
      method: 'POST', headers,
      body: JSON.stringify({
        event_type: 'CONVERSION',
        event_family: 'CDP',
        payload: { email: payload.email, name: payload.name, mobile_phone: payload.phone, tags: payload.tags },
      }),
    })
    return res.json()
  }
  if (action === 'update_lead') {
    const res = await fetch(`${base}/contacts/email:${payload.email}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ contact: { name: payload.name, job_title: payload.jobTitle } }),
    })
    return res.json()
  }
  if (action === 'add_to_segment') {
    const res = await fetch(`${base}/segmentations/${payload.segmentationId}/contacts`, {
      method: 'POST', headers,
      body: JSON.stringify({ contacts: [{ email: payload.email }] }),
    })
    return res.json()
  }
  throw new Error(`Ação RD Station Marketing não suportada: ${action}`)
}

// ─── ActiveCampaign Actions ───────────────────────────────────────────────────

async function activecampaignAction(apiKey: string, accountUrl: string, action: string, payload: Record<string, any>) {
  const base = `${accountUrl}/api/3`
  const headers = { 'Api-Token': apiKey, 'Content-Type': 'application/json' }

  if (action === 'create_contact') {
    const res = await fetch(`${base}/contacts`, {
      method: 'POST', headers,
      body: JSON.stringify({ contact: { email: payload.email, firstName: payload.firstName, lastName: payload.lastName, phone: payload.phone } }),
    })
    return res.json()
  }
  if (action === 'add_tag') {
    // Busca ou cria a tag
    const tagRes = await fetch(`${base}/tags?search=${encodeURIComponent(payload.tag)}`, { headers })
    const tagData = await tagRes.json() as any
    const tagId = tagData?.tags?.[0]?.id

    if (!tagId) return { error: 'Tag não encontrada' }

    const res = await fetch(`${base}/contactTags`, {
      method: 'POST', headers,
      body: JSON.stringify({ contactTag: { contact: payload.contactId, tag: tagId } }),
    })
    return res.json()
  }
  if (action === 'add_to_list') {
    const res = await fetch(`${base}/contactLists`, {
      method: 'POST', headers,
      body: JSON.stringify({ contactList: { list: payload.listId, contact: payload.contactId, status: 1 } }),
    })
    return res.json()
  }
  if (action === 'get_contact') {
    const res = await fetch(`${base}/contacts/${payload.contactId}`, { headers })
    return res.json()
  }
  throw new Error(`Ação ActiveCampaign não suportada: ${action}`)
}
