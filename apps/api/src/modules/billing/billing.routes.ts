import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'

const PLANS = {
  BASIC: { name: 'Basic', credits: 2500, agents: 5, priceMonthly: 8700 },
  STANDARD: { name: 'Standard', credits: 11500, agents: 20, priceMonthly: 39700 },
  CORPORATE: { name: 'Corporate', credits: 30000, agents: 50, priceMonthly: 99700 },
}

const CYCLE_DISCOUNTS = { MONTHLY: 0, QUARTERLY: 5, SEMIANNUAL: 7, ANNUAL: 10 }

async function getWorkspaceId(userId: string) {
  const member = await prisma.workspaceMember.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
  if (!member) throw new Error('Workspace não encontrado')
  return member.workspaceId
}

export async function billingRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  app.get('/billing', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })
    return reply.send({
      plan: workspace?.plan,
      credits: workspace?.credits,
      trialEndsAt: workspace?.trialEndsAt,
      subscription: workspace?.subscriptions[0],
    })
  })

  app.get('/billing/plans', async (req, reply) => {
    const plans = Object.entries(PLANS).map(([key, plan]) => ({
      id: key,
      ...plan,
      cycles: Object.entries(CYCLE_DISCOUNTS).map(([cycle, discount]) => ({
        cycle,
        discount,
        price: Math.round(plan.priceMonthly * (1 - discount / 100)),
      })),
    }))
    return reply.send(plans)
  })

  app.get('/billing/invoices', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    const invoices = await prisma.invoice.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(invoices)
  })

  app.post('/billing/subscribe', async (req, reply) => {
    return reply.send({ message: 'Integração com gateway de pagamento pendente. Configure Stripe no ambiente.' })
  })

  app.post('/billing/cancel', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const workspaceId = await getWorkspaceId(sub)
    await prisma.subscription.updateMany({
      where: { workspaceId, status: 'ACTIVE' },
      data: { cancelAtPeriodEnd: true },
    })
    return reply.send({ ok: true })
  })
}
