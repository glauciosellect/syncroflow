import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import { redis } from './lib/redis'
import { logger } from './lib/logger'

import { authRoutes } from './modules/auth/auth.routes'
import { workspaceRoutes } from './modules/workspaces/workspaces.routes'
import { agentRoutes } from './modules/agents/agents.routes'
import { trainingRoutes } from './modules/training/training.routes'
import { intentionRoutes } from './modules/intentions/intentions.routes'
import { channelRoutes } from './modules/channels/channels.routes'
import { conversationRoutes } from './modules/conversations/conversations.routes'
import { contactRoutes } from './modules/contacts/contacts.routes'
import { knowledgeRoutes } from './modules/knowledge/knowledge.routes'
import { analyticsRoutes } from './modules/analytics/analytics.routes'
import { attendanceRoutes } from './modules/attendances/attendances.routes'
import { billingRoutes } from './modules/billing/billing.routes'
import { stripeRoutes } from './modules/billing/stripe.routes'
import { mcpRoutes } from './modules/mcp/mcp.routes'
import { integrationRoutes } from './modules/integrations/integrations.routes'
import { apiKeyRoutes } from './modules/auth/apikeys.routes'
import { envVariableRoutes } from './modules/auth/env-variables.routes'
import { webhookRoutes } from './modules/webhooks/webhooks.routes'
import { startTrainingWorker } from './modules/ai/training.worker'
import { startMessageWorker } from './modules/webhooks/message.worker'

const app = Fastify({ logger: process.env.NODE_ENV === 'development' })

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: { sub: string }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: any
  }
}

async function bootstrap() {
  await redis.connect().catch(() => {})

  await app.register(cors, {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', process.env.FRONTEND_URL || ''].filter(Boolean),
    credentials: true,
  })

  await app.register(helmet, { contentSecurityPolicy: false })

  await app.register(jwt, { secret: process.env.JWT_SECRET || 'dev-secret-change-in-prod' })

  await app.register(rateLimit, { global: true, max: 100, timeWindow: '1 minute', redis })

  app.decorate('authenticate', async (req: any, reply: any) => {
    try {
      await req.jwtVerify()
    } catch {
      reply.status(401).send({ error: 'Não autorizado' })
    }
  })

  app.setErrorHandler((error, req, reply) => {
    logger.error('Request error', { url: req.url, error: error.message, stack: error.stack })
    console.error('[ERRO DETALHADO]', error)
    if (error.name === 'ZodError') {
      return reply.status(400).send({ error: 'Dados inválidos', details: JSON.parse(error.message) })
    }
    if (error.message === 'Email já cadastrado' || error.message.includes('inválid') || error.message.includes('não encontrado')) {
      return reply.status(400).send({ error: error.message })
    }
    reply.status(500).send({ error: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno do servidor' })
  })

  await app.register(authRoutes)
  await app.register(workspaceRoutes)
  await app.register(agentRoutes)
  await app.register(trainingRoutes)
  await app.register(intentionRoutes)
  await app.register(channelRoutes)
  await app.register(conversationRoutes)
  await app.register(contactRoutes)
  await app.register(knowledgeRoutes)
  await app.register(analyticsRoutes)
  await app.register(attendanceRoutes)
  await app.register(billingRoutes)
  await app.register(stripeRoutes)
  await app.register(mcpRoutes)
  await app.register(integrationRoutes)
  await app.register(apiKeyRoutes)
  await app.register(envVariableRoutes)
  await app.register(webhookRoutes)

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  startTrainingWorker()
  startMessageWorker()

  const port = Number(process.env.PORT) || 3001
  await app.listen({ port, host: '0.0.0.0' })
  logger.info(`API rodando na porta ${port}`)
}

bootstrap().catch((err) => {
  logger.error('Falha ao iniciar servidor', err)
  process.exit(1)
})
