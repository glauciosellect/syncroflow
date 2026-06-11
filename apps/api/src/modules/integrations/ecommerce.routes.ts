import type { FastifyInstance } from 'fastify'
import crypto from 'crypto'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { integrationQueue } from '../../lib/queue'
import { encrypt, decrypt } from '../../lib/crypto'
import { getWorkspaceId } from '../../lib/workspace'
import { logger } from '../../lib/logger'

// ─── Assinatura por plataforma ────────────────────────────────────────────────

function hmacSha256Hex(secret: string, data: Buffer | string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex')
}

function hmacSha256Base64(secret: string, data: Buffer): string {
  return crypto.createHmac('sha256', secret).update(data).digest('base64')
}

function safeEqual(a: string, b: string): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

// ─── Webhook Receiver Universal ───────────────────────────────────────────────

export async function ecommerceWebhookRoutes(app: FastifyInstance) {
  app.post<{ Params: { workspaceId: string; platform: string } }>(
    '/webhooks/integration/:workspaceId/:platform',
    async (request, reply) => {
      const { workspaceId, platform } = request.params
      const rawBody = Buffer.from(JSON.stringify(request.body ?? {}))
      const body = request.body as any

      // Respond 200 immediately — process async
      reply.status(200).send({ ok: true })

      try {
        const integration = await prisma.integration.findUnique({
          where: { workspaceId_platform: { workspaceId, platform } },
        })
        if (!integration || integration.status !== 'active') return

        let event = 'unknown'
        let payload: unknown = body

        if (platform === 'nuvemshop') {
          const sig = request.headers['x-linkedstore-hmac-sha256'] as string ?? ''
          const secret = process.env.NUVEMSHOP_CLIENT_SECRET ?? ''
          if (sig && !safeEqual(hmacSha256Hex(secret, rawBody), sig)) {
            logger.warn('Invalid Nuvemshop signature — rejected', { workspaceId, platform })
            return
          }
          event = body?.topic ?? body?.event ?? 'unknown'

        } else if (platform === 'mercadolivre') {
          // ML only delivers resource ID — handler fetches full payload
          event = body?.topic ?? 'unknown'
          payload = { resource: body?.resource, topic: body?.topic, user_id: body?.user_id }

        } else if (platform === 'shopify') {
          const sig = request.headers['x-shopify-hmac-sha256'] as string ?? ''
          const secret = process.env.SHOPIFY_API_SECRET ?? ''
          if (sig && !safeEqual(hmacSha256Base64(secret, rawBody), sig)) {
            logger.warn('Invalid Shopify signature — rejected', { workspaceId, platform })
            return
          }
          event = (request.headers['x-shopify-topic'] as string) ?? 'unknown'

        } else if (platform === 'shopee') {
          event = String(body?.code ?? 'unknown')

        } else if (platform === 'tiktokshop') {
          event = body?.type ?? 'unknown'
        }

        await integrationQueue.add('process-event', { workspaceId, platform, event, payload })
      } catch (err) {
        logger.error('Error enqueuing integration event', { err, workspaceId, platform })
      }
    }
  )
}

// ─── E-commerce Integrations CRUD + OAuth ────────────────────────────────────

// ─── OAuth Callbacks (públicos — chamados pela plataforma após autorização) ───

export async function ecommerceOAuthCallbackRoutes(app: FastifyInstance) {
  // Nuvemshop callback
  app.get('/ecommerce/integrations/nuvemshop/callback', async (req, reply) => {
    const { code, state } = req.query as { code: string; state: string }
    let workspaceId: string
    try {
      workspaceId = JSON.parse(Buffer.from(state, 'base64url').toString()).workspaceId
    } catch {
      return reply.status(400).send({ error: 'State inválido' })
    }

    const clientId = process.env.NUVEMSHOP_CLIENT_ID ?? ''
    const clientSecret = process.env.NUVEMSHOP_CLIENT_SECRET ?? ''

    const tokenRes = await fetch(`https://www.nuvemshop.com.br/apps/authorize/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code }),
    })

    if (!tokenRes.ok) {
      logger.error('Nuvemshop token exchange failed', { status: tokenRes.status })
      return reply.status(502).send({ error: 'Falha ao obter token da Nuvemshop' })
    }

    const tokenData = await tokenRes.json() as { access_token: string; user_id: string }

    const storeRes = await fetch(`https://api.nuvemshop.com.br/v1/${tokenData.user_id}/store`, {
      headers: { Authentication: `bearer ${tokenData.access_token}`, 'User-Agent': 'SyncroFlow/1.0' },
    })
    const storeData = storeRes.ok ? await storeRes.json() as any : {}

    await prisma.integration.upsert({
      where: { workspaceId_platform: { workspaceId, platform: 'nuvemshop' } },
      create: {
        workspaceId, platform: 'nuvemshop', status: 'active',
        accessToken: encrypt(tokenData.access_token),
        shopId: String(tokenData.user_id),
        shopName: storeData?.name?.pt ?? storeData?.name ?? null,
        shopUrl: storeData?.original_domain ?? null,
      },
      update: {
        accessToken: encrypt(tokenData.access_token),
        status: 'active',
        shopName: storeData?.name?.pt ?? storeData?.name ?? null,
        shopUrl: storeData?.original_domain ?? null,
      },
    })

    const frontendUrl = process.env.FRONTEND_URL ?? 'https://app.syncroflow.io'
    return reply.redirect(`${frontendUrl}/integrations?connected=nuvemshop`)
  })

  // Mercado Livre callback
  app.get('/ecommerce/integrations/mercadolivre/callback', async (req, reply) => {
    const { code, state } = req.query as { code: string; state: string }
    let workspaceId: string
    try {
      workspaceId = JSON.parse(Buffer.from(state, 'base64url').toString()).workspaceId
    } catch {
      return reply.status(400).send({ error: 'State inválido' })
    }

    const appId = process.env.MERCADOLIVRE_APP_ID ?? ''
    const clientSecret = process.env.MERCADOLIVRE_CLIENT_SECRET ?? ''
    const baseUrl = process.env.API_BASE_URL ?? 'https://api.syncroflow.io'
    const redirectUri = `${baseUrl}/ecommerce/integrations/mercadolivre/callback`

    const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', client_id: appId, client_secret: clientSecret,
        code, redirect_uri: redirectUri,
      }),
    })

    if (!tokenRes.ok) {
      logger.error('MercadoLivre token exchange failed', { status: tokenRes.status })
      return reply.status(502).send({ error: 'Falha ao obter token do Mercado Livre' })
    }

    const tokenData = await tokenRes.json() as { access_token: string; refresh_token: string; expires_in: number; user_id: number }
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000)

    const userRes = await fetch(`https://api.mercadolibre.com/users/${tokenData.user_id}`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const userData = userRes.ok ? await userRes.json() as any : {}

    await prisma.integration.upsert({
      where: { workspaceId_platform: { workspaceId, platform: 'mercadolivre' } },
      create: {
        workspaceId, platform: 'mercadolivre', status: 'active',
        accessToken: encrypt(tokenData.access_token),
        refreshToken: encrypt(tokenData.refresh_token),
        tokenExpiresAt: expiresAt,
        shopId: String(tokenData.user_id),
        shopName: userData?.nickname ?? null,
        shopUrl: userData?.permalink ?? null,
      },
      update: {
        accessToken: encrypt(tokenData.access_token),
        refreshToken: encrypt(tokenData.refresh_token),
        tokenExpiresAt: expiresAt,
        status: 'active',
        shopName: userData?.nickname ?? null,
      },
    })

    const frontendUrl = process.env.FRONTEND_URL ?? 'https://app.syncroflow.io'
    return reply.redirect(`${frontendUrl}/integrations?connected=mercadolivre`)
  })

  // Shopify callback
  app.get('/ecommerce/integrations/shopify/callback', async (req, reply) => {
    const { code, state, shop } = req.query as { code: string; state: string; shop: string; hmac: string }
    let workspaceId: string
    try {
      workspaceId = JSON.parse(Buffer.from(state, 'base64url').toString()).workspaceId
    } catch {
      return reply.status(400).send({ error: 'State inválido' })
    }

    const apiKey = process.env.SHOPIFY_API_KEY ?? ''
    const apiSecret = process.env.SHOPIFY_API_SECRET ?? ''

    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: apiKey, client_secret: apiSecret, code }),
    })

    if (!tokenRes.ok) {
      return reply.status(502).send({ error: 'Falha ao obter token do Shopify' })
    }

    const tokenData = await tokenRes.json() as { access_token: string }

    const storeRes = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': tokenData.access_token },
    })
    const storeData = storeRes.ok ? (await storeRes.json() as any).shop : {}

    await prisma.integration.upsert({
      where: { workspaceId_platform: { workspaceId, platform: 'shopify' } },
      create: {
        workspaceId, platform: 'shopify', status: 'active',
        accessToken: encrypt(tokenData.access_token),
        shopId: String(storeData?.id ?? shop),
        shopName: storeData?.name ?? shop,
        shopUrl: `https://${shop}`,
      },
      update: {
        accessToken: encrypt(tokenData.access_token),
        status: 'active',
        shopName: storeData?.name ?? shop,
      },
    })

    const frontendUrl = process.env.FRONTEND_URL ?? 'https://app.syncroflow.io'
    return reply.redirect(`${frontendUrl}/integrations?connected=shopify`)
  })
}

// ─── E-commerce Integrations CRUD + OAuth connect (autenticado) ──────────────

export async function ecommerceIntegrationRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  // Listar integrações conectadas
  app.get('/ecommerce/integrations', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const integrations = await prisma.integration.findMany({
      where: { workspaceId },
      select: {
        id: true, platform: true, status: true,
        shopId: true, shopName: true, shopUrl: true,
        createdAt: true, updatedAt: true,
        _count: { select: { automations: true } },
      },
    })
    return reply.send(integrations)
  })

  // Desconectar integração
  app.delete<{ Params: { id: string } }>('/ecommerce/integrations/:id', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    await prisma.integration.deleteMany({ where: { id: req.params.id, workspaceId } })
    return reply.send({ ok: true })
  })

  // ─── OAuth: iniciar autorização ───────────────────────────────────────────
  app.get<{ Params: { platform: string } }>(
    '/ecommerce/integrations/:platform/connect',
    async (req, reply) => {
      const { sub, wid } = req.user as { sub: string; wid?: string }
      const workspaceId = await getWorkspaceId(sub, wid)
      const { platform } = req.params
      const baseUrl = process.env.API_BASE_URL ?? 'https://api.syncroflow.io'

      if (platform === 'nuvemshop') {
        const clientId = process.env.NUVEMSHOP_CLIENT_ID
        if (!clientId) return reply.status(503).send({ error: 'Nuvemshop não configurado' })
        const redirectUri = `${baseUrl}/ecommerce/integrations/nuvemshop/callback`
        const state = Buffer.from(JSON.stringify({ workspaceId })).toString('base64url')
        const authUrl = `https://www.nuvemshop.com.br/apps/${clientId}/authorize?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`
        return reply.send({ authUrl })

      } else if (platform === 'mercadolivre') {
        const appId = process.env.MERCADOLIVRE_APP_ID
        if (!appId) return reply.status(503).send({ error: 'Mercado Livre não configurado' })
        const redirectUri = `${baseUrl}/ecommerce/integrations/mercadolivre/callback`
        const state = Buffer.from(JSON.stringify({ workspaceId })).toString('base64url')
        const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`
        return reply.send({ authUrl })

      } else if (platform === 'shopify') {
        // Shopify requires shop domain from user
        const { shop } = (req.query as any)
        if (!shop) return reply.status(400).send({ error: 'Parâmetro shop obrigatório (ex: minha-loja.myshopify.com)' })
        const apiKey = process.env.SHOPIFY_API_KEY
        const scopes = process.env.SHOPIFY_SCOPES ?? 'read_orders,write_orders,read_inventory'
        const redirectUri = `${baseUrl}/ecommerce/integrations/shopify/callback`
        const state = Buffer.from(JSON.stringify({ workspaceId, shop })).toString('base64url')
        const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`
        return reply.send({ authUrl })

      } else {
        return reply.status(400).send({ error: `Plataforma ${platform} não suportada` })
      }
    }
  )

  // ─── Automations CRUD ────────────────────────────────────────────────────────

  app.get<{ Params: { integrationId: string } }>(
    '/ecommerce/integrations/:integrationId/automations',
    async (req, reply) => {
      const { sub, wid } = req.user as { sub: string; wid?: string }
      const workspaceId = await getWorkspaceId(sub, wid)
      const automations = await prisma.automation.findMany({
        where: { integrationId: req.params.integrationId, workspaceId },
        include: { _count: { select: { executions: true } } },
        orderBy: { createdAt: 'desc' },
      })
      return reply.send(automations)
    }
  )

  app.post<{ Params: { integrationId: string }; Body: { name: string; trigger: string; actions: unknown[] } }>(
    '/ecommerce/integrations/:integrationId/automations',
    async (req, reply) => {
      const { sub, wid } = req.user as { sub: string; wid?: string }
      const workspaceId = await getWorkspaceId(sub, wid)
      const { name, trigger, actions } = z.object({
        name: z.string().min(1),
        trigger: z.string().min(1),
        actions: z.array(z.record(z.any())),
      }).parse(req.body)
      const automation = await prisma.automation.create({
        data: { workspaceId, integrationId: req.params.integrationId, name, trigger, actions: actions as any },
      })
      return reply.status(201).send(automation)
    }
  )

  app.patch<{ Params: { id: string }; Body: { name?: string; isActive?: boolean; actions?: unknown[] } }>(
    '/ecommerce/automations/:id',
    async (req, reply) => {
      const { sub, wid } = req.user as { sub: string; wid?: string }
      const workspaceId = await getWorkspaceId(sub, wid)
      const data = z.object({
        name: z.string().optional(),
        isActive: z.boolean().optional(),
        actions: z.array(z.record(z.any())).optional(),
      }).parse(req.body)
      await prisma.automation.updateMany({
        where: { id: req.params.id, workspaceId },
        data: data as any,
      })
      return reply.send({ ok: true })
    }
  )

  app.delete<{ Params: { id: string } }>('/ecommerce/automations/:id', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    await prisma.automation.deleteMany({ where: { id: req.params.id, workspaceId } })
    return reply.send({ ok: true })
  })

  app.get<{ Params: { automationId: string } }>(
    '/ecommerce/automations/:automationId/executions',
    async (req, reply) => {
      const executions = await prisma.automationExecution.findMany({
        where: { automationId: req.params.automationId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      return reply.send(executions)
    }
  )
}
