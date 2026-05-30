import type { FastifyInstance } from 'fastify'
import Stripe from 'stripe'
import { prisma } from '../../lib/prisma'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-04-30.basil' })

async function getWorkspaceId(userId: string) {
  const member = await prisma.workspaceMember.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
  if (!member) throw new Error('Workspace não encontrado')
  return member.workspaceId
}

// Pacotes de créditos avulsos
export const CREDIT_PACKAGES = [
  { id: 'starter', name: 'Starter', credits: 2000, price: 5990, priceLabel: 'R$ 59,90' },
  { id: 'pro', name: 'Pro', credits: 5000, price: 14990, priceLabel: 'R$ 149,90' },
  { id: 'business', name: 'Business', credits: 15000, price: 49990, priceLabel: 'R$ 499,90' },
  { id: 'enterprise', name: 'Enterprise', credits: 50000, price: 149990, priceLabel: 'R$ 1.499,90' },
]

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
            description: `Pacote de ${pkg.credits.toLocaleString('pt-BR')} créditos para uso na plataforma SyncroFlow`,
          },
          unit_amount: pkg.price,
        },
        quantity: 1,
      }],
      metadata: { workspaceId, packageId, credits: String(pkg.credits) },
      success_url: `${process.env.FRONTEND_URL}/billing?payment=success&credits=${pkg.credits}`,
      cancel_url: `${process.env.FRONTEND_URL}/billing?payment=cancelled`,
    })

    return reply.send({ url: session.url })
  })

  // Webhook do Stripe — creditar após pagamento confirmado
  app.post('/billing/webhook', {
    config: { rawBody: true },
  }, async (req, reply) => {
    const sig = req.headers['stripe-signature'] as string
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

    let event: Stripe.Event

    try {
      if (webhookSecret) {
        event = stripe.webhooks.constructEvent((req as any).rawBody || req.body, sig, webhookSecret)
      } else {
        event = req.body as Stripe.Event
      }
    } catch (err: any) {
      return reply.status(400).send({ error: `Webhook error: ${err.message}` })
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const { workspaceId, credits } = session.metadata || {}

      if (workspaceId && credits) {
        await prisma.workspace.update({
          where: { id: workspaceId },
          data: { credits: { increment: parseInt(credits) } },
        })

        await prisma.invoice.create({
          data: {
            workspaceId,
            amount: session.amount_total || 0,
            status: 'paid',
            externalId: session.id,
          },
        })
      }
    }

    return reply.send({ received: true })
  })
}
