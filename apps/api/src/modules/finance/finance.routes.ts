import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import crypto from 'crypto'
import { prisma } from '../../lib/prisma'
import { encrypt, decrypt } from '../../lib/crypto'
import { getWorkspaceId } from '../../lib/workspace'
import { logger } from '../../lib/logger'

function safeEqual(a: string, b: string): boolean {
  try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)) }
  catch { return false }
}

// ─── Webhook Receiver Financeiro ──────────────────────────────────────────────

export async function financeWebhookRoutes(app: FastifyInstance) {
  app.post<{ Params: { workspaceId: string; platform: string } }>(
    '/webhooks/finance/:workspaceId/:platform',
    async (request, reply) => {
      const { workspaceId, platform } = request.params
      const body = request.body as any

      reply.status(200).send({ ok: true })

      try {
        const conn = await prisma.financeConnection.findUnique({
          where: { workspaceId_platform: { workspaceId, platform } },
        })
        if (!conn || conn.status !== 'active') return

        // Validar assinatura Asaas
        if (platform === 'asaas') {
          const sig = request.headers['asaas-access-token'] as string ?? ''
          const key = conn.apiKey ? decrypt(conn.apiKey) : ''
          if (sig && !safeEqual(sig, key)) {
            logger.warn('Asaas webhook signature mismatch', { workspaceId })
            return
          }
        }

        const event = body?.event ?? body?.type ?? 'unknown'
        logger.info('Finance webhook received', { workspaceId, platform, event })
      } catch (err) {
        logger.error('Finance webhook error', { err, workspaceId, platform })
      }
    }
  )
}

// ─── Finance CRUD + Ações (autenticado) ───────────────────────────────────────

export async function financeRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  // Listar conexões financeiras
  app.get('/finance/connections', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const connections = await prisma.financeConnection.findMany({
      where: { workspaceId },
      select: { id: true, platform: true, status: true, accountId: true, accountName: true, createdAt: true, updatedAt: true },
    })
    return reply.send(connections)
  })

  // Conectar via API Key (Asaas e Pagar.me usam API Key)
  app.post<{ Params: { platform: string }; Body: { apiKey: string } }>(
    '/finance/:platform/connect',
    async (req, reply) => {
      const { sub, wid } = req.user as { sub: string; wid?: string }
      const workspaceId = await getWorkspaceId(sub, wid)
      const { platform } = req.params
      const { apiKey } = z.object({ apiKey: z.string().min(10) }).parse(req.body)

      // Validar a key testando um endpoint real
      let accountId: string | null = null
      let accountName: string | null = null

      if (platform === 'asaas') {
        const isProduction = apiKey.startsWith('$aact_')
        const host = isProduction ? 'https://api.asaas.com' : 'https://sandbox.asaas.com'
        const testRes = await fetch(`${host}/api/v3/myAccount`, {
          headers: { access_token: apiKey },
        })
        if (!testRes.ok) return reply.status(400).send({ error: 'API Key do Asaas inválida' })
        const data = await testRes.json() as any
        accountId = data?.id ?? null
        accountName = data?.name ?? null

      } else if (platform === 'pagarme') {
        const testRes = await fetch('https://api.pagar.me/core/v5/recipients?page=1&size=1', {
          headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}` },
        })
        if (!testRes.ok) return reply.status(400).send({ error: 'API Key do Pagar.me inválida' })

      } else {
        return reply.status(400).send({ error: `Plataforma financeira ${platform} não suportada` })
      }

      await prisma.financeConnection.upsert({
        where: { workspaceId_platform: { workspaceId, platform } },
        create: { workspaceId, platform, status: 'active', apiKey: encrypt(apiKey), accountId, accountName },
        update: { apiKey: encrypt(apiKey), status: 'active', accountId, accountName },
      })

      return reply.status(201).send({ ok: true, accountId, accountName })
    }
  )

  // Desconectar
  app.delete<{ Params: { id: string } }>('/finance/connections/:id', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    await prisma.financeConnection.deleteMany({ where: { id: req.params.id, workspaceId } })
    return reply.send({ ok: true })
  })

  // ─── Actions Financeiras ──────────────────────────────────────────────────────

  app.post<{ Params: { platform: string }; Body: { action: string; payload: Record<string, any> } }>(
    '/finance/:platform/action',
    async (req, reply) => {
      const { sub, wid } = req.user as { sub: string; wid?: string }
      const workspaceId = await getWorkspaceId(sub, wid)
      const { platform } = req.params
      const { action, payload } = z.object({
        action: z.string(),
        payload: z.record(z.any()),
      }).parse(req.body)

      const conn = await prisma.financeConnection.findUnique({
        where: { workspaceId_platform: { workspaceId, platform } },
      })
      if (!conn || conn.status !== 'active') return reply.status(404).send({ error: 'Conexão financeira não encontrada' })

      const apiKey = conn.apiKey ? decrypt(conn.apiKey) : ''
      let result: any = null

      if (platform === 'asaas') result = await asaasAction(apiKey, action, payload)
      else if (platform === 'pagarme') result = await pagarmeAction(apiKey, action, payload)
      else return reply.status(400).send({ error: 'Plataforma não suportada' })

      return reply.send({ ok: true, result })
    }
  )

  // Gerar link de pagamento rápido (usado pelo agente IA)
  app.post<{ Body: { platform: string; customerId?: string; name: string; email?: string; cpfCnpj?: string; value: number; description: string; dueDate?: string } }>(
    '/finance/generate-payment-link',
    async (req, reply) => {
      const { sub, wid } = req.user as { sub: string; wid?: string }
      const workspaceId = await getWorkspaceId(sub, wid)
      const body = z.object({
        platform: z.enum(['asaas', 'pagarme']),
        name: z.string(),
        email: z.string().optional(),
        cpfCnpj: z.string().optional(),
        value: z.number().positive(),
        description: z.string(),
        dueDate: z.string().optional(),
      }).parse(req.body)

      const conn = await prisma.financeConnection.findUnique({
        where: { workspaceId_platform: { workspaceId, platform: body.platform } },
      })
      if (!conn) return reply.status(404).send({ error: 'Conexão financeira não configurada' })

      const apiKey = decrypt(conn.apiKey!)
      let paymentLink: string | null = null

      if (body.platform === 'asaas') {
        const isProduction = apiKey.startsWith('$aact_')
        const host = isProduction ? 'https://api.asaas.com' : 'https://sandbox.asaas.com'

        // Cria ou busca cliente
        let customerId = body.cpfCnpj ? null : null
        if (body.cpfCnpj) {
          const searchRes = await fetch(`${host}/api/v3/customers?cpfCnpj=${body.cpfCnpj}`, {
            headers: { access_token: apiKey },
          })
          const searchData = await searchRes.json() as any
          customerId = searchData?.data?.[0]?.id ?? null
        }

        if (!customerId) {
          const createRes = await fetch(`${host}/api/v3/customers`, {
            method: 'POST',
            headers: { access_token: apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: body.name, email: body.email, cpfCnpj: body.cpfCnpj }),
          })
          const created = await createRes.json() as any
          customerId = created?.id
        }

        // Cria cobrança PIX
        const chargeRes = await fetch(`${host}/api/v3/payments`, {
          method: 'POST',
          headers: { access_token: apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer: customerId,
            billingType: 'PIX',
            value: body.value,
            dueDate: body.dueDate ?? new Date(Date.now() + 86400000).toISOString().split('T')[0],
            description: body.description,
          }),
        })
        const chargeData = await chargeRes.json() as any
        paymentLink = chargeData?.invoiceUrl ?? chargeData?.bankSlipUrl ?? null
      }

      return reply.send({ ok: true, paymentLink })
    }
  )
}

// ─── Asaas Actions ────────────────────────────────────────────────────────────

async function asaasAction(apiKey: string, action: string, payload: Record<string, any>) {
  const isProduction = apiKey.startsWith('$aact_')
  const host = isProduction ? 'https://api.asaas.com' : 'https://sandbox.asaas.com'
  const headers = { access_token: apiKey, 'Content-Type': 'application/json' }

  if (action === 'create_payment') {
    const res = await fetch(`${host}/api/v3/payments`, {
      method: 'POST', headers,
      body: JSON.stringify({
        customer: payload.customerId,
        billingType: payload.billingType ?? 'PIX',
        value: payload.value,
        dueDate: payload.dueDate,
        description: payload.description,
      }),
    })
    return res.json()
  }
  if (action === 'get_payment') {
    const res = await fetch(`${host}/api/v3/payments/${payload.paymentId}`, { headers })
    return res.json()
  }
  if (action === 'get_payment_link') {
    const res = await fetch(`${host}/api/v3/payments/${payload.paymentId}/pixQrCode`, { headers })
    return res.json()
  }
  if (action === 'get_customer') {
    const res = await fetch(`${host}/api/v3/customers/${payload.customerId}`, { headers })
    return res.json()
  }
  if (action === 'create_subscription') {
    const res = await fetch(`${host}/api/v3/subscriptions`, {
      method: 'POST', headers,
      body: JSON.stringify({
        customer: payload.customerId,
        billingType: payload.billingType ?? 'BOLETO',
        value: payload.value,
        nextDueDate: payload.nextDueDate,
        cycle: payload.cycle ?? 'MONTHLY',
        description: payload.description,
      }),
    })
    return res.json()
  }
  if (action === 'cancel_subscription') {
    const res = await fetch(`${host}/api/v3/subscriptions/${payload.subscriptionId}`, {
      method: 'DELETE', headers,
    })
    return res.json()
  }
  throw new Error(`Ação Asaas não suportada: ${action}`)
}

// ─── Pagar.me Actions ─────────────────────────────────────────────────────────

async function pagarmeAction(apiKey: string, action: string, payload: Record<string, any>) {
  const base = 'https://api.pagar.me/core/v5'
  const auth = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`
  const headers = { Authorization: auth, 'Content-Type': 'application/json' }

  if (action === 'get_order') {
    const res = await fetch(`${base}/orders/${payload.orderId}`, { headers })
    return res.json()
  }
  if (action === 'create_refund') {
    const res = await fetch(`${base}/charges/${payload.chargeId}/cancel`, {
      method: 'DELETE', headers,
      body: JSON.stringify({ amount: payload.amount }),
    })
    return res.json()
  }
  if (action === 'get_customer') {
    const res = await fetch(`${base}/customers/${payload.customerId}`, { headers })
    return res.json()
  }
  throw new Error(`Ação Pagar.me não suportada: ${action}`)
}
