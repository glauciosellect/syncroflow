import { decrypt } from '../../../lib/crypto'
import { prisma } from '../../../lib/prisma'
import { logger } from '../../../lib/logger'

interface HandlerParams {
  integration: { id: string; accessToken: string | null; shopId: string | null; workspaceId: string }
  automation: { id: string; actions: unknown }
  event: string
  payload: unknown
}

export async function processNuvemshopEvent({ integration, automation, event, payload }: HandlerParams) {
  const token = integration.accessToken ? decrypt(integration.accessToken) : null
  if (!token || !integration.shopId) throw new Error('Token Nuvemshop não disponível')

  const storeId = integration.shopId
  const actions: any[] = Array.isArray(automation.actions) ? automation.actions : []
  const results: unknown[] = []

  let fullPayload: any = payload
  if (event.startsWith('orders/') && (payload as any)?.id) {
    try {
      const res = await fetch(`https://api.nuvemshop.com.br/v1/${storeId}/orders/${(payload as any).id}`, {
        headers: { Authentication: `bearer ${token}`, 'User-Agent': 'SyncroFlow/1.0' },
      })
      if (res.ok) fullPayload = await res.json()
    } catch (err) {
      logger.warn('Nuvemshop: falha ao buscar dados do pedido', err)
    }
  }

  for (const action of actions) {
    if ((action as any).type === 'send_whatsapp') {
      results.push(await executeWhatsAppAction(action as any, fullPayload, integration.workspaceId))
    } else {
      logger.warn('Nuvemshop: ação desconhecida', { type: (action as any).type })
    }
  }

  return { event, actionsExecuted: results.length, results }
}

async function executeWhatsAppAction(action: any, orderData: any, workspaceId: string) {
  let phone: string | null = action.phone ?? null
  if (action.phoneVariable === 'customer_phone') {
    phone = orderData?.customer?.phone ?? orderData?.billing_address?.phone ?? null
  }
  if (!phone) return { skipped: true, reason: 'Telefone não encontrado' }

  phone = String(phone).replace(/\D/g, '')
  const message = interpolate(action.message ?? '', orderData)

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
      name: orderData?.customer?.name ?? phone, phone,
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
