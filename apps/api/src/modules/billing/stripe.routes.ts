import type { FastifyInstance } from 'fastify'
import Stripe from 'stripe'
import { prisma } from '../../lib/prisma'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// Price IDs criados no dashboard do Stripe — configure via env
// Formato: STRIPE_PRICE_{PLAN}_{CYCLE}
// Ex: STRIPE_PRICE_BASIC_MONTHLY, STRIPE_PRICE_STANDARD_ANNUAL
function getPriceId(plan: string, cycle: string): string | null {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${cycle.toUpperCase()}`
  return process.env[key] || null
}

// Créditos mensais por plano
const PLAN_CREDITS: Record<string, number> = {
  STARTER:  2000,
  PRO:      5000,
  BUSINESS: 15000,
}

// Preços por plano e ciclo (em centavos)
const PLAN_PRICES: Record<string, Record<string, number>> = {
  STARTER:  { MONTHLY: 6000,  ANNUAL: 5300  },
  PRO:      { MONTHLY: 14700, ANNUAL: 13000 },
  BUSINESS: { MONTHLY: 43900, ANNUAL: 38700 },
}

// Pacote de créditos avulsos (recarga única)
export const CREDIT_PACKAGES = [
  { id: 'pack_1000', name: '1.000 créditos', credits: 1000, price: 3500, priceLabel: 'R$ 35,00' },
]

async function getWorkspaceId(userId: string) {
  const member = await prisma.workspaceMember.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
  if (!member) throw new Error('Workspace não encontrado')
  return member.workspaceId
}

export async function stripeRoutes(app: FastifyInstance) {

  // Listar pacotes disponíveis (público)
  app.get('/billing/packages', async (req, reply) => {
    return reply.send(CREDIT_PACKAGES)
  })

  // Criar sessão de checkout para compra de créditos avulsos
  app.post('/billing/checkout', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { packageId } = req.body as { packageId: string }

    const pkg = CREDIT_PACKAGES.find(p => p.id === packageId)
    if (!pkg) return reply.status(400).send({ error: 'Pacote inválido' })

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: {
            name: `SyncroFlow — ${pkg.name} (${pkg.credits.toLocaleString('pt-BR')} créditos)`,
            description: `Pacote de ${pkg.credits.toLocaleString('pt-BR')} créditos`,
          },
          unit_amount: pkg.price,
        },
        quantity: 1,
      }],
      metadata: { workspaceId, type: 'credits', packageId, credits: String(pkg.credits) },
      success_url: `${process.env.FRONTEND_URL}/billing?payment=success&credits=${pkg.credits}`,
      cancel_url: `${process.env.FRONTEND_URL}/billing?payment=cancelled`,
    })

    return reply.send({ url: session.url })
  })

  // Criar sessão de checkout para assinatura de plano
  app.post('/billing/subscribe', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const { plan, cycle = 'MONTHLY' } = req.body as { plan: string; cycle?: string }

    const priceId = getPriceId(plan, cycle)

    if (!priceId) {
      // Sem Price ID configurado — cria a price dinamicamente (bom para dev/teste)
      const unitAmount = PLAN_PRICES[plan]?.[cycle]
      if (!unitAmount) return reply.status(400).send({ error: `Plano ou ciclo inválido: ${plan} / ${cycle}` })

      const intervalMap: Record<string, { interval: 'month' | 'year'; count: number }> = {
        MONTHLY: { interval: 'month', count: 1 },
        ANNUAL:  { interval: 'year',  count: 1 },
      }
      const { interval, count } = intervalMap[cycle]

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [{
          price_data: {
            currency: 'brl',
            product_data: { name: `SyncroFlow ${plan} — ${cycle}` },
            unit_amount: unitAmount,
            recurring: { interval, interval_count: count },
          },
          quantity: 1,
        }],
        metadata: { workspaceId, type: 'subscription', plan, cycle },
        subscription_data: { metadata: { workspaceId, plan, cycle } },
        success_url: `${process.env.FRONTEND_URL}/billing?payment=subscribed&plan=${plan}`,
        cancel_url: `${process.env.FRONTEND_URL}/billing?payment=cancelled`,
      })

      return reply.send({ url: session.url })
    }

    // Price ID configurado — usa o Price criado no Stripe Dashboard
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { workspaceId, type: 'subscription', plan, cycle },
      subscription_data: { metadata: { workspaceId, plan, cycle } },
      success_url: `${process.env.FRONTEND_URL}/billing?payment=subscribed&plan=${plan}`,
      cancel_url: `${process.env.FRONTEND_URL}/billing?payment=cancelled`,
    })

    return reply.send({ url: session.url })
  })

  // Portal de gerenciamento (cancelar, trocar cartão, ver faturas)
  app.post('/billing/portal', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)

    const sub_ = await prisma.subscription.findFirst({
      where: { workspaceId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    })

    if (!sub_?.externalId) {
      return reply.status(400).send({ error: 'Nenhuma assinatura ativa encontrada.' })
    }

    // Busca o customer a partir da subscription
    const stripeSubscription = await stripe.subscriptions.retrieve(sub_.externalId)
    const customerId = stripeSubscription.customer as string

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.FRONTEND_URL}/billing`,
    })

    return reply.send({ url: portalSession.url })
  })

  // Webhook do Stripe — processa todos os eventos relevantes
  app.post('/billing/webhook', { config: { rawBody: true } }, async (req, reply) => {
    const sig = req.headers['stripe-signature'] as string
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

    let event: any

    try {
      if (webhookSecret) {
        event = stripe.webhooks.constructEvent(
          (req as any).rawBody || Buffer.from(JSON.stringify(req.body)),
          sig,
          webhookSecret,
        )
      } else {
        event = req.body as any
      }
    } catch (err: any) {
      return reply.status(400).send({ error: `Webhook error: ${err.message}` })
    }

    switch (event.type) {

      // ── Créditos avulsos pagos ───────────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as any
        const meta = session.metadata || {}

        if (meta.type === 'credits' && meta.workspaceId && meta.credits) {
          await prisma.workspace.update({
            where: { id: meta.workspaceId },
            data: { credits: { increment: parseInt(meta.credits) } },
          })
          await prisma.invoice.create({
            data: {
              workspaceId: meta.workspaceId,
              amount: session.amount_total || 0,
              status: 'paid',
              externalId: session.id,
            },
          })
        }

        // Assinatura iniciada via checkout — ativa o plano imediatamente
        if (meta.type === 'subscription' && meta.workspaceId && meta.plan) {
          const credits = PLAN_CREDITS[meta.plan] || 1000
          await prisma.workspace.update({
            where: { id: meta.workspaceId },
            data: {
              plan: meta.plan as any,
              credits: { increment: credits },
              trialEndsAt: null,
            },
          })
        }
        break
      }

      // ── Assinatura criada / renovada ─────────────────────────────────────
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as any
        const meta = subscription.metadata || {}
        const workspaceId = meta.workspaceId
        const plan = meta.plan
        if (!workspaceId || !plan) break

        const isActive = subscription.status === 'active' || subscription.status === 'trialing'
        const credits = PLAN_CREDITS[plan] || 1000

        await prisma.workspace.update({
          where: { id: workspaceId },
          data: {
            plan: isActive ? (plan as any) : 'TRIAL',
            ...(isActive ? { trialEndsAt: null } : {}),
          },
        })

        await prisma.subscription.upsert({
          where: { id: subscription.id },
          create: {
            id: subscription.id,
            workspaceId,
            plan: plan as any,
            billingCycle: (meta.cycle || 'MONTHLY') as any,
            status: isActive ? 'ACTIVE' : 'CANCELED',
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            externalId: subscription.id,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          },
          update: {
            status: isActive ? 'ACTIVE' : 'CANCELED',
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          },
        })

        // Adiciona créditos do mês/ciclo quando renova
        if (event.type === 'customer.subscription.created' && isActive) {
          await prisma.workspace.update({
            where: { id: workspaceId },
            data: { credits: { increment: credits } },
          })
        }
        break
      }

      // ── Fatura paga (renovação mensal) — adiciona créditos ───────────────
      case 'invoice.paid': {
        const invoice = event.data.object as any
        const subscriptionId = invoice.subscription as string
        if (!subscriptionId) break

        const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId)
        const meta = stripeSubscription.metadata || {}
        const workspaceId = meta.workspaceId
        const plan = meta.plan
        if (!workspaceId || !plan) break

        const credits = PLAN_CREDITS[plan] || 1000

        await prisma.workspace.update({
          where: { id: workspaceId },
          data: {
            plan: plan as any,
            credits: { increment: credits },
            trialEndsAt: null,
          },
        })

        await prisma.invoice.create({
          data: {
            workspaceId,
            amount: invoice.amount_paid || 0,
            status: 'paid',
            externalId: invoice.id,
          },
        })
        break
      }

      // ── Assinatura cancelada / expirada ──────────────────────────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any
        const meta = subscription.metadata || {}
        const workspaceId = meta.workspaceId
        if (!workspaceId) break

        await prisma.workspace.update({
          where: { id: workspaceId },
          data: { plan: 'TRIAL' },
        })

        await prisma.subscription.updateMany({
          where: { workspaceId, externalId: subscription.id },
          data: { status: 'CANCELED' },
        })
        break
      }

      // ── Pagamento falhou ─────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as any
        const subscriptionId = invoice.subscription as string
        if (!subscriptionId) break

        const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId)
        const meta = stripeSubscription.metadata || {}
        const workspaceId = meta.workspaceId
        if (!workspaceId) break

        await prisma.invoice.create({
          data: {
            workspaceId,
            amount: invoice.amount_due || 0,
            status: 'failed',
            externalId: invoice.id,
          },
        })
        break
      }
    }

    return reply.send({ received: true })
  })
}
