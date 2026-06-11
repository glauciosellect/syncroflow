import { prisma } from '../../../lib/prisma'
import { logger } from '../../../lib/logger'
import { decrypt } from '../../../lib/crypto'
import crypto from 'crypto'

interface HandlerParams {
  integration: {
    id: string; accessToken: string | null; refreshToken: string | null
    tokenExpiresAt: Date | null; shopId: string | null; workspaceId: string
  }
  automation: { id: string; actions: unknown }
  event: string
  payload: any
}

// Shopee API v2 — sign helper
function shopeeSign(path: string, timestamp: number, accessToken: string, shopId: string): string {
  const appKey = process.env.SHOPEE_PARTNER_KEY ?? ''
  const appSecret = process.env.SHOPEE_PARTNER_SECRET ?? ''
  const base = `${appKey}${path}${timestamp}${accessToken}${shopId}`
  return crypto.createHmac('sha256', appSecret).update(base).digest('hex')
}

async function getValidToken(integration: HandlerParams['integration']): Promise<{ token: string; shopId: string }> {
  if (!integration.accessToken || !integration.shopId) throw new Error('Token Shopee não disponível')

  const expiresAt = integration.tokenExpiresAt ? new Date(integration.tokenExpiresAt) : null
  const needsRefresh = expiresAt && expiresAt.getTime() - Date.now() < 5 * 60 * 1000

  if (!needsRefresh) return { token: decrypt(integration.accessToken), shopId: integration.shopId }
  if (!integration.refreshToken) return { token: decrypt(integration.accessToken), shopId: integration.shopId }

  const refreshToken = decrypt(integration.refreshToken)
  const appKey = process.env.SHOPEE_PARTNER_KEY ?? ''
  const appSecret = process.env.SHOPEE_PARTNER_SECRET ?? ''
  const timestamp = Math.floor(Date.now() / 1000)
  const path = '/api/v2/auth/access_token/get'
  const sign = crypto.createHmac('sha256', appSecret).update(`${appKey}${path}${timestamp}`).digest('hex')

  const host = process.env.SHOPEE_API_HOST ?? 'https://partner.shopeemobile.com'
  const res = await fetch(`${host}${path}?partner_id=${appKey}&timestamp=${timestamp}&sign=${sign}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      partner_id: Number(appKey),
      shop_id: Number(integration.shopId),
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    logger.error('Shopee token refresh failed', { status: res.status })
    return { token: decrypt(integration.accessToken), shopId: integration.shopId }
  }

  const data = await res.json() as any
  const newExpiresAt = new Date(Date.now() + (data.expire_in ?? 14400) * 1000)

  const { encrypt } = await import('../../../lib/crypto')
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      accessToken: encrypt(data.access_token),
      refreshToken: encrypt(data.refresh_token),
      tokenExpiresAt: newExpiresAt,
    },
  })

  return { token: data.access_token, shopId: integration.shopId }
}

export async function processShopeeEvent({ integration, automation, event, payload }: HandlerParams) {
  const { token, shopId } = await getValidToken(integration)
  const actions: any[] = Array.isArray(automation.actions) ? automation.actions : []
  const results: unknown[] = []

  // Fetch full order if needed
  let fullPayload: any = payload
  if (payload?.ordersn && event.startsWith('order')) {
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const path = '/api/v2/order/get_order_detail'
      const sign = shopeeSign(path, timestamp, token, shopId)
      const host = process.env.SHOPEE_API_HOST ?? 'https://partner.shopeemobile.com'
      const appKey = process.env.SHOPEE_PARTNER_KEY ?? ''
      const url = `${host}${path}?partner_id=${appKey}&shop_id=${shopId}&access_token=${token}&timestamp=${timestamp}&sign=${sign}&order_sn_list=${payload.ordersn}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json() as any
        fullPayload = data?.response?.order_list?.[0] ?? payload
      }
    } catch (err) {
      logger.warn('Shopee: falha ao buscar detalhes do pedido', err)
    }
  }

  for (const action of actions) {
    if (action.type === 'send_whatsapp') {
      results.push(await executeWhatsAppAction(action, fullPayload, integration.workspaceId))
    } else {
      logger.warn('Shopee: ação desconhecida', { type: action.type })
    }
  }

  return { event, actionsExecuted: results.length, results }
}

async function executeWhatsAppAction(action: any, payload: any, workspaceId: string) {
  // Shopee buyer info is under recipient_address or buyer_username
  const recipient = payload?.recipient_address ?? {}
  let phone: string | null = action.phone ?? null
  if (action.phoneVariable === 'buyer_phone') {
    phone = recipient?.phone ?? null
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
      name: payload?.buyer_username ?? phone, phone,
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
