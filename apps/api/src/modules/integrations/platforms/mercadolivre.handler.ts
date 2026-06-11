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
  if (!integration.accessToken) throw new Error('Token ML não disponível')

  const expiresAt = integration.tokenExpiresAt ? new Date(integration.tokenExpiresAt) : null
  const needsRefresh = expiresAt && expiresAt.getTime() - Date.now() < 5 * 60 * 1000

  if (!needsRefresh) return decrypt(integration.accessToken)
  if (!integration.refreshToken) return decrypt(integration.accessToken)

  const refreshToken = decrypt(integration.refreshToken)
  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.MERCADOLIVRE_APP_ID ?? '',
      client_secret: process.env.MERCADOLIVRE_CLIENT_SECRET ?? '',
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    logger.error('ML token refresh failed', { status: res.status })
    return decrypt(integration.accessToken)
  }

  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000)

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      accessToken: encrypt(data.access_token),
      refreshToken: encrypt(data.refresh_token),
      tokenExpiresAt: newExpiresAt,
    },
  })

  return data.access_token
}

export async function processMercadoLivreEvent({ integration, automation, event, payload }: HandlerParams) {
  const token = await getValidToken(integration)
  const actions: any[] = Array.isArray(automation.actions) ? automation.actions : []
  const results: unknown[] = []

  let fullPayload: any = payload
  if (payload?.resource) {
    try {
      const res = await fetch(`https://api.mercadolibre.com${payload.resource}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) fullPayload = await res.json()
    } catch (err) {
      logger.warn('ML: falha ao buscar dados do resource', err)
    }
  }

  for (const action of actions) {
    if ((action as any).type === 'send_whatsapp') {
      results.push(await executeWhatsAppAction(action, fullPayload, integration.workspaceId))
    } else if ((action as any).type === 'answer_question') {
      results.push(await answerQuestion(token, fullPayload, action))
    } else {
      logger.warn('ML: ação desconhecida', { type: (action as any).type })
    }
  }

  return { event, actionsExecuted: results.length, results }
}

async function executeWhatsAppAction(action: any, payload: any, workspaceId: string) {
  let phone: string | null = action.phone ?? null
  if (action.phoneVariable === 'buyer_phone') {
    phone = payload?.buyer?.phone?.number
      ? `${payload.buyer.phone.area_code ?? ''}${payload.buyer.phone.number}`.replace(/\D/g, '')
      : null
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
      name: payload?.buyer?.nickname ?? phone, phone,
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

async function answerQuestion(token: string, payload: any, action: any) {
  if (!payload?.id) return { skipped: true, reason: 'ID da pergunta não encontrado' }
  const answer = interpolate(action.message ?? 'Obrigado pela sua pergunta! Em breve retornaremos.', payload)
  const res = await fetch(`https://api.mercadolibre.com/answers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ question_id: payload.id, text: answer }),
  })
  return { answered: res.ok, questionId: payload.id }
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
