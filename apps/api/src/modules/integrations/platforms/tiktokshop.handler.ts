import { decrypt, encrypt } from '../../../lib/crypto'
import { prisma } from '../../../lib/prisma'
import { logger } from '../../../lib/logger'

interface HandlerParams {
  integration: {
    id: string; accessToken: string | null; refreshToken: string | null
    tokenExpiresAt: Date | null; shopId: string | null; workspaceId: string
  }
  automation: { id: string; actions: unknown }
  event: string
  payload: any
}

async function getValidToken(integration: HandlerParams['integration']): Promise<string> {
  if (!integration.accessToken) throw new Error('Token TikTok Shop não disponível')

  const expiresAt = integration.tokenExpiresAt ? new Date(integration.tokenExpiresAt) : null
  const needsRefresh = expiresAt && expiresAt.getTime() - Date.now() < 5 * 60 * 1000

  if (!needsRefresh) return decrypt(integration.accessToken)
  if (!integration.refreshToken) return decrypt(integration.accessToken)

  const refreshToken = decrypt(integration.refreshToken)
  const res = await fetch('https://auth.tiktok-shops.com/api/v2/token/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_key: process.env.TIKTOKSHOP_APP_KEY ?? '',
      app_secret: process.env.TIKTOKSHOP_APP_SECRET ?? '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    logger.error('TikTok Shop token refresh failed', { status: res.status })
    return decrypt(integration.accessToken)
  }

  const data = await res.json() as any
  const tokenData = data?.data ?? data
  const newExpiresAt = new Date(Date.now() + (tokenData.access_token_expire_in ?? 3600) * 1000)

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      accessToken: encrypt(tokenData.access_token),
      refreshToken: encrypt(tokenData.refresh_token),
      tokenExpiresAt: newExpiresAt,
    },
  })

  return tokenData.access_token
}

export async function processTiktokShopEvent({ integration, automation, event, payload }: HandlerParams) {
  const token = await getValidToken(integration)
  const actions: any[] = Array.isArray(automation.actions) ? automation.actions : []
  const results: unknown[] = []

  for (const action of actions) {
    if (action.type === 'send_whatsapp') {
      results.push(await executeWhatsAppAction(action, payload, integration.workspaceId, token))
    } else {
      logger.warn('TikTok Shop: ação desconhecida', { type: action.type })
    }
  }

  return { event, actionsExecuted: results.length, results }
}

async function executeWhatsAppAction(action: any, payload: any, workspaceId: string, _token: string) {
  // TikTok Shop orders have buyer info under order.buyer_info
  const buyer = payload?.buyer_info ?? payload?.order?.buyer_info ?? {}
  let phone: string | null = action.phone ?? null
  if (action.phoneVariable === 'buyer_phone') {
    phone = buyer?.buyer_phone ?? null
  }
  if (!phone) return { skipped: true, reason: 'Telefone não encontrado' }

  phone = String(phone).replace(/\D/g, '')
  const message = interpolate(action.message ?? '', payload)

  const channel = await prisma.channel.findFirst({
    where: { workspaceId, isActive: true },
    orderBy: { createdAt: 'asc' },
  })
  const agent = await prisma.agent.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: 'asc' },
  })
  if (!channel || !agent) return { skipped: true, reason: 'Canal ou agente não configurado' }

  const contact = await prisma.contact.upsert({
    where: { workspaceId_channelId_externalId: { workspaceId, channelId: channel.id, externalId: phone } },
    create: {
      workspaceId, channelId: channel.id, externalId: phone,
      name: buyer?.buyer_username ?? phone, phone,
    },
    update: {},
  })

  let conversation = await prisma.conversation.findFirst({
    where: { workspaceId, channelId: channel.id, contactId: contact.id },
  })
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { workspaceId, channelId: channel.id, contactId: contact.id, agentId: agent.id, status: 'AI_ACTIVE' },
    })
  }

  await prisma.message.create({
    data: { role: 'ASSISTANT', content: message, conversationId: conversation.id },
  })

  return { sent: true, phone, messagePreview: message.slice(0, 60) }
}

function interpolate(template: string, data: any): string {
  return template.replace(/\{([^}]+)\}/g, (_, key) => {
    const keys = key.split('.')
    let val: any = data
    for (const k of keys) {
      val = val?.[k]
      if (val === undefined || val === null) return `{${key}}`
    }
    return String(val)
  })
}
