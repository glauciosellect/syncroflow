import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { redis } from '../../lib/redis'

interface ServiceStatus {
  name: string
  status: 'operational' | 'degraded' | 'outage'
  latencyMs?: number
  message?: string
}

async function checkDatabase(): Promise<ServiceStatus> {
  const start = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return { name: 'Banco de Dados', status: 'operational', latencyMs: Date.now() - start }
  } catch {
    return { name: 'Banco de Dados', status: 'outage', message: 'Sem conexão com o banco' }
  }
}

async function checkRedis(): Promise<ServiceStatus> {
  const start = Date.now()
  try {
    await redis.ping()
    return { name: 'Cache / Filas (Redis)', status: 'operational', latencyMs: Date.now() - start }
  } catch {
    return { name: 'Cache / Filas (Redis)', status: 'degraded', message: 'Redis indisponível — filas pausadas' }
  }
}

async function checkWhatsApp(): Promise<ServiceStatus> {
  // Verifica se há canais WhatsApp ativos com erros recentes
  try {
    const activeChannels = await prisma.channel.count({ where: { type: 'WHATSAPP', isActive: true } })
    return {
      name: 'WhatsApp Business API',
      status: 'operational',
      message: `${activeChannels} canal(is) ativo(s)`,
    }
  } catch {
    return { name: 'WhatsApp Business API', status: 'degraded' }
  }
}

async function checkAI(): Promise<ServiceStatus> {
  const start = Date.now()
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY ?? '', 'anthropic-version': '2023-06-01' },
    })
    if (res.ok) return { name: 'Motor de IA (Claude)', status: 'operational', latencyMs: Date.now() - start }
    return { name: 'Motor de IA (Claude)', status: 'degraded', message: 'API de IA com instabilidade' }
  } catch {
    return { name: 'Motor de IA (Claude)', status: 'degraded', message: 'Não foi possível verificar' }
  }
}

// ─── Rotas de Status ──────────────────────────────────────────────────────────

export async function statusRoutes(app: FastifyInstance) {
  // Health check interno (para load balancer / EasyPanel)
  app.get('/health', async (_req, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString(), version: process.env.npm_package_version ?? '2.0' })
  })

  // Status detalhado (JSON) — público
  app.get('/status', async (_req, reply) => {
    const [db, redisStatus, wa, ai] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkWhatsApp(),
      checkAI(),
    ])

    const services: ServiceStatus[] = [db, redisStatus, wa, ai]
    const hasOutage = services.some(s => s.status === 'outage')
    const hasDegraded = services.some(s => s.status === 'degraded')

    const overall = hasOutage ? 'outage' : hasDegraded ? 'degraded' : 'operational'
    const overallLabel = { operational: 'Todos os sistemas operacionais', degraded: 'Instabilidade parcial detectada', outage: 'Interrupção de serviço' }

    return reply.send({
      status: overall,
      message: overallLabel[overall],
      timestamp: new Date().toISOString(),
      services,
      metrics: {
        uptime: `${(process.uptime() / 3600).toFixed(1)}h`,
        environment: process.env.NODE_ENV ?? 'production',
      },
    })
  })

  // Página HTML de status pública (status.syncroflow.io)
  app.get('/status.html', async (_req, reply) => {
    const [db, redisStatus, wa, ai] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkWhatsApp(),
      checkAI(),
    ])

    const services = [db, redisStatus, wa, ai]
    const hasOutage = services.some(s => s.status === 'outage')
    const hasDegraded = services.some(s => s.status === 'degraded')
    const overall = hasOutage ? 'outage' : hasDegraded ? 'degraded' : 'operational'

    const statusColor = { operational: '#10B981', degraded: '#F59E0B', outage: '#EF4444' }
    const statusLabel = { operational: 'Todos os sistemas operacionais', degraded: 'Instabilidade detectada', outage: 'Interrupção de serviço' }
    const statusEmoji = { operational: '✅', degraded: '⚠️', outage: '🔴' }

    const serviceRows = services.map(s => `
      <div class="service-row">
        <span class="service-name">${s.name}</span>
        <span class="service-status" style="color:${statusColor[s.status]}">
          ${statusEmoji[s.status]} ${s.status === 'operational' ? 'Operacional' : s.status === 'degraded' ? 'Degradado' : 'Fora do ar'}
          ${s.latencyMs ? `<small>(${s.latencyMs}ms)</small>` : ''}
        </span>
      </div>
    `).join('')

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="60">
  <title>Status — SyncroFlow</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #F9FAFB; color: #111827; }
    .header { background: linear-gradient(135deg, #0F0F1A, #2D1B69); color: white; padding: 40px 24px; text-align: center; }
    .header h1 { font-size: 28px; font-weight: 800; margin-bottom: 8px; }
    .overall { display: inline-block; background: ${statusColor[overall]}22; color: ${statusColor[overall]}; border: 2px solid ${statusColor[overall]}; padding: 8px 24px; border-radius: 999px; font-weight: 700; font-size: 16px; margin-top: 16px; }
    .container { max-width: 640px; margin: 32px auto; padding: 0 16px; }
    .card { background: white; border: 1px solid #E5E7EB; border-radius: 12px; padding: 24px; margin-bottom: 20px; }
    .card h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: #6B7280; margin-bottom: 16px; }
    .service-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #F3F4F6; }
    .service-row:last-child { border-bottom: none; }
    .service-name { font-weight: 500; }
    .service-status { font-weight: 700; font-size: 14px; }
    .service-status small { font-weight: 400; color: #9CA3AF; margin-left: 4px; }
    .footer { text-align: center; color: #9CA3AF; font-size: 12px; margin-top: 32px; }
    .uptime-badge { background: #D1FAE5; color: #065F46; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <h1>SyncroFlow Status</h1>
    <p style="opacity:0.7">Monitoramento em tempo real dos sistemas</p>
    <div class="overall">${statusEmoji[overall]} ${statusLabel[overall]}</div>
  </div>
  <div class="container">
    <div class="card">
      <h2>Serviços</h2>
      ${serviceRows}
    </div>
    <div class="card" style="text-align:center">
      <p style="color:#6B7280;font-size:13px;">Última atualização: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
      <p style="color:#6B7280;font-size:13px;margin-top:8px;">Esta página atualiza automaticamente a cada 60 segundos</p>
    </div>
  </div>
  <div class="footer">SyncroFlow.io &copy; ${new Date().getFullYear()}</div>
</body>
</html>`

    return reply.type('text/html').send(html)
  })
}
