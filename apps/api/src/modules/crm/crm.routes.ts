import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import crypto from 'crypto'
import { prisma } from '../../lib/prisma'
import { encrypt, decrypt } from '../../lib/crypto'
import { getWorkspaceId } from '../../lib/workspace'
import { logger } from '../../lib/logger'

// ─── Webhook Receiver CRM ─────────────────────────────────────────────────────

export async function crmWebhookRoutes(app: FastifyInstance) {
  app.post<{ Params: { workspaceId: string; platform: string } }>(
    '/webhooks/crm/:workspaceId/:platform',
    async (request, reply) => {
      const { workspaceId, platform } = request.params
      const body = request.body as any

      reply.status(200).send({ ok: true })

      try {
        const conn = await prisma.crmConnection.findUnique({
          where: { workspaceId_platform: { workspaceId, platform } },
        })
        if (!conn || conn.status !== 'active') return

        logger.info('CRM webhook received', { workspaceId, platform, event: body?.subscriptionType ?? body?.event ?? 'unknown' })
      } catch (err) {
        logger.error('CRM webhook error', { err, workspaceId, platform })
      }
    }
  )
}

// ─── OAuth Callbacks (públicos) ───────────────────────────────────────────────

export async function crmOAuthCallbackRoutes(app: FastifyInstance) {
  // HubSpot callback
  app.get('/crm/hubspot/callback', async (req, reply) => {
    const { code, state } = req.query as { code: string; state: string }
    let workspaceId: string
    try { workspaceId = JSON.parse(Buffer.from(state, 'base64url').toString()).workspaceId }
    catch { return reply.status(400).send({ error: 'State inválido' }) }

    const clientId = process.env.HUBSPOT_CLIENT_ID ?? ''
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET ?? ''
    const baseUrl = process.env.API_BASE_URL ?? 'https://api.syncroflow.io'
    const redirectUri = `${baseUrl}/crm/hubspot/callback`

    const tokenRes = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code }),
    })

    if (!tokenRes.ok) {
      logger.error('HubSpot token exchange failed', { status: tokenRes.status })
      return reply.status(502).send({ error: 'Falha ao obter token do HubSpot' })
    }

    const tokenData = await tokenRes.json() as any
    const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 1800) * 1000)

    // Busca info da conta
    const infoRes = await fetch('https://api.hubapi.com/account-info/v3/details', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const info = infoRes.ok ? await infoRes.json() as any : {}

    await prisma.crmConnection.upsert({
      where: { workspaceId_platform: { workspaceId, platform: 'hubspot' } },
      create: {
        workspaceId, platform: 'hubspot', status: 'active',
        accessToken: encrypt(tokenData.access_token),
        refreshToken: encrypt(tokenData.refresh_token),
        tokenExpiresAt: expiresAt,
        accountId: String(info?.portalId ?? ''),
        accountName: info?.uiDomain ?? null,
      },
      update: {
        accessToken: encrypt(tokenData.access_token),
        refreshToken: encrypt(tokenData.refresh_token),
        tokenExpiresAt: expiresAt,
        status: 'active',
      },
    })

    const frontendUrl = process.env.FRONTEND_URL ?? 'https://app.syncroflow.io'
    return reply.redirect(`${frontendUrl}/integrations/crm?connected=hubspot`)
  })

  // Pipedrive callback
  app.get('/crm/pipedrive/callback', async (req, reply) => {
    const { code, state } = req.query as { code: string; state: string }
    let workspaceId: string
    try { workspaceId = JSON.parse(Buffer.from(state, 'base64url').toString()).workspaceId }
    catch { return reply.status(400).send({ error: 'State inválido' }) }

    const clientId = process.env.PIPEDRIVE_CLIENT_ID ?? ''
    const clientSecret = process.env.PIPEDRIVE_CLIENT_SECRET ?? ''
    const baseUrl = process.env.API_BASE_URL ?? 'https://api.syncroflow.io'
    const redirectUri = `${baseUrl}/crm/pipedrive/callback`

    const tokenRes = await fetch('https://oauth.pipedrive.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', redirect_uri: redirectUri, code }),
    })

    if (!tokenRes.ok) {
      logger.error('Pipedrive token exchange failed', { status: tokenRes.status })
      return reply.status(502).send({ error: 'Falha ao obter token do Pipedrive' })
    }

    const tokenData = await tokenRes.json() as any
    const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000)

    const userRes = await fetch(`https://api.pipedrive.com/v1/users/me?api_token=${tokenData.access_token}`)
    const userData = userRes.ok ? (await userRes.json() as any)?.data : {}

    await prisma.crmConnection.upsert({
      where: { workspaceId_platform: { workspaceId, platform: 'pipedrive' } },
      create: {
        workspaceId, platform: 'pipedrive', status: 'active',
        accessToken: encrypt(tokenData.access_token),
        refreshToken: encrypt(tokenData.refresh_token),
        tokenExpiresAt: expiresAt,
        accountId: String(userData?.company_id ?? ''),
        accountName: userData?.company_name ?? null,
      },
      update: {
        accessToken: encrypt(tokenData.access_token),
        refreshToken: encrypt(tokenData.refresh_token),
        tokenExpiresAt: expiresAt,
        status: 'active',
      },
    })

    const frontendUrl = process.env.FRONTEND_URL ?? 'https://app.syncroflow.io'
    return reply.redirect(`${frontendUrl}/integrations/crm?connected=pipedrive`)
  })

  // RD Station CRM callback
  app.get('/crm/rdcrm/callback', async (req, reply) => {
    const { code, state } = req.query as { code: string; state: string }
    let workspaceId: string
    try { workspaceId = JSON.parse(Buffer.from(state, 'base64url').toString()).workspaceId }
    catch { return reply.status(400).send({ error: 'State inválido' }) }

    const clientId = process.env.RDCRM_CLIENT_ID ?? ''
    const clientSecret = process.env.RDCRM_CLIENT_SECRET ?? ''
    const baseUrl = process.env.API_BASE_URL ?? 'https://api.syncroflow.io'
    const redirectUri = `${baseUrl}/crm/rdcrm/callback`

    const tokenRes = await fetch('https://api.rdstation.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
    })

    if (!tokenRes.ok) {
      logger.error('RD Station CRM token exchange failed', { status: tokenRes.status })
      return reply.status(502).send({ error: 'Falha ao obter token do RD Station CRM' })
    }

    const tokenData = await tokenRes.json() as any
    const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 86400) * 1000)

    await prisma.crmConnection.upsert({
      where: { workspaceId_platform: { workspaceId, platform: 'rdcrm' } },
      create: {
        workspaceId, platform: 'rdcrm', status: 'active',
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
    return reply.redirect(`${frontendUrl}/integrations/crm?connected=rdcrm`)
  })
}

// ─── CRM CRUD (autenticado) ───────────────────────────────────────────────────

export async function crmRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  // Listar conexões CRM do workspace
  app.get('/crm/connections', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const connections = await prisma.crmConnection.findMany({
      where: { workspaceId },
      select: { id: true, platform: true, status: true, accountId: true, accountName: true, createdAt: true, updatedAt: true },
    })
    return reply.send(connections)
  })

  // Iniciar OAuth de uma plataforma CRM
  app.get<{ Params: { platform: string } }>('/crm/:platform/connect', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { platform } = req.params
    const baseUrl = process.env.API_BASE_URL ?? 'https://api.syncroflow.io'
    const state = Buffer.from(JSON.stringify({ workspaceId })).toString('base64url')

    if (platform === 'hubspot') {
      const clientId = process.env.HUBSPOT_CLIENT_ID
      if (!clientId) return reply.status(503).send({ error: 'HubSpot não configurado' })
      const redirectUri = encodeURIComponent(`${baseUrl}/crm/hubspot/callback`)
      const scopes = 'crm.objects.contacts.read crm.objects.contacts.write crm.objects.deals.read crm.objects.deals.write'
      return reply.send({ authUrl: `https://app.hubspot.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${encodeURIComponent(scopes)}&state=${state}` })

    } else if (platform === 'pipedrive') {
      const clientId = process.env.PIPEDRIVE_CLIENT_ID
      if (!clientId) return reply.status(503).send({ error: 'Pipedrive não configurado' })
      const redirectUri = encodeURIComponent(`${baseUrl}/crm/pipedrive/callback`)
      return reply.send({ authUrl: `https://oauth.pipedrive.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}` })

    } else if (platform === 'rdcrm') {
      const clientId = process.env.RDCRM_CLIENT_ID
      if (!clientId) return reply.status(503).send({ error: 'RD Station CRM não configurado' })
      const redirectUri = encodeURIComponent(`${baseUrl}/crm/rdcrm/callback`)
      return reply.send({ authUrl: `https://api.rdstation.com/auth/dialog?client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}` })

    } else {
      return reply.status(400).send({ error: `Plataforma CRM ${platform} não suportada` })
    }
  })

  // Desconectar CRM
  app.delete<{ Params: { id: string } }>('/crm/connections/:id', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    await prisma.crmConnection.deleteMany({ where: { id: req.params.id, workspaceId } })
    return reply.send({ ok: true })
  })

  // ─── Actions CRM (executar via API) ──────────────────────────────────────────

  app.post<{ Params: { platform: string }; Body: { action: string; payload: Record<string, any> } }>(
    '/crm/:platform/action',
    async (req, reply) => {
      const { sub, wid } = req.user as { sub: string; wid?: string }
      const workspaceId = await getWorkspaceId(sub, wid)
      const { platform } = req.params
      const { action, payload } = z.object({
        action: z.string(),
        payload: z.record(z.any()),
      }).parse(req.body)

      const conn = await prisma.crmConnection.findUnique({
        where: { workspaceId_platform: { workspaceId, platform } },
      })
      if (!conn || conn.status !== 'active') return reply.status(404).send({ error: 'Conexão CRM não encontrada' })

      const token = conn.accessToken ? decrypt(conn.accessToken) : ''
      let result: any = null

      if (platform === 'hubspot') result = await hubspotAction(token, action, payload)
      else if (platform === 'pipedrive') result = await pipedriveAction(token, action, payload)
      else if (platform === 'rdcrm') result = await rdcrmAction(token, action, payload)
      else return reply.status(400).send({ error: 'Plataforma não suportada' })

      return reply.send({ ok: true, result })
    }
  )
}

// ─── HubSpot Actions ──────────────────────────────────────────────────────────

async function hubspotAction(token: string, action: string, payload: Record<string, any>) {
  const base = 'https://api.hubapi.com'
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  if (action === 'create_contact') {
    const res = await fetch(`${base}/crm/v3/objects/contacts`, {
      method: 'POST', headers,
      body: JSON.stringify({ properties: { email: payload.email, firstname: payload.firstName, lastname: payload.lastName, phone: payload.phone } }),
    })
    return res.json()
  }
  if (action === 'create_deal') {
    const res = await fetch(`${base}/crm/v3/objects/deals`, {
      method: 'POST', headers,
      body: JSON.stringify({ properties: { dealname: payload.name, amount: payload.amount, dealstage: payload.stage ?? 'appointmentscheduled', pipeline: payload.pipeline ?? 'default' } }),
    })
    return res.json()
  }
  if (action === 'add_note') {
    const res = await fetch(`${base}/crm/v3/objects/notes`, {
      method: 'POST', headers,
      body: JSON.stringify({ properties: { hs_note_body: payload.note, hs_timestamp: Date.now() } }),
    })
    return res.json()
  }
  if (action === 'get_contact') {
    const res = await fetch(`${base}/crm/v3/objects/contacts/${payload.contactId}?properties=email,firstname,lastname,phone`, { headers })
    return res.json()
  }
  throw new Error(`Ação HubSpot não suportada: ${action}`)
}

// ─── Pipedrive Actions ────────────────────────────────────────────────────────

async function pipedriveAction(token: string, action: string, payload: Record<string, any>) {
  const base = `https://api.pipedrive.com/v1`
  const auth = `?api_token=${token}`
  const headers = { 'Content-Type': 'application/json' }

  if (action === 'create_person') {
    const res = await fetch(`${base}/persons${auth}`, {
      method: 'POST', headers,
      body: JSON.stringify({ name: payload.name, phone: [{ value: payload.phone }], email: [{ value: payload.email }] }),
    })
    return (await res.json() as any).data
  }
  if (action === 'create_deal') {
    const res = await fetch(`${base}/deals${auth}`, {
      method: 'POST', headers,
      body: JSON.stringify({ title: payload.name, value: payload.amount, person_id: payload.personId }),
    })
    return (await res.json() as any).data
  }
  if (action === 'add_note') {
    const res = await fetch(`${base}/notes${auth}`, {
      method: 'POST', headers,
      body: JSON.stringify({ content: payload.note, deal_id: payload.dealId }),
    })
    return (await res.json() as any).data
  }
  if (action === 'get_deal') {
    const res = await fetch(`${base}/deals/${payload.dealId}${auth}`)
    return (await res.json() as any).data
  }
  throw new Error(`Ação Pipedrive não suportada: ${action}`)
}

// ─── RD Station CRM Actions ───────────────────────────────────────────────────

async function rdcrmAction(token: string, action: string, payload: Record<string, any>) {
  const base = 'https://crm.rdstation.com/api/v1'
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  if (action === 'create_contact') {
    const res = await fetch(`${base}/contacts`, {
      method: 'POST', headers,
      body: JSON.stringify({ contact: { name: payload.name, emails: [{ email: payload.email }], phones: [{ phone: payload.phone }] } }),
    })
    return res.json()
  }
  if (action === 'create_deal') {
    const res = await fetch(`${base}/deals`, {
      method: 'POST', headers,
      body: JSON.stringify({ deal: { name: payload.name, amount_montly: payload.amount } }),
    })
    return res.json()
  }
  if (action === 'update_deal_stage') {
    const res = await fetch(`${base}/deals/${payload.dealId}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ deal: { deal_stage_id: payload.stageId } }),
    })
    return res.json()
  }
  throw new Error(`Ação RD Station CRM não suportada: ${action}`)
}
