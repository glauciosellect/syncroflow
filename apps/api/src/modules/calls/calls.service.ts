import { prisma } from '../../lib/prisma'
import { redis } from '../../lib/redis'
import { getIO, emitNewMessage } from '../../lib/socket'
import { MetaCloudApiProvider, normalizeBrazilianNumber } from '../channels/whatsapp/providers/meta-cloud.provider'

// Ligações de voz RECEBIDAS pelo WhatsApp Business Calling API (Meta Cloud API).
// Escopo: só o cliente ligando para a empresa — a empresa não inicia ligações.
// Fluxo: webhook "calls" (connect) → aviso por socket → atendente atende no navegador
// (WebRTC) → API faz pre_accept + accept com o SDP answer → webhook "terminate" registra
// a ligação como mensagem de sistema na conversa.

export const provider = new MetaCloudApiProvider()

export interface CallState {
  callId: string
  workspaceId: string
  channelId: string
  conversationId: string | null
  contactName: string
  phone: string
  sdp: string // SDP offer da Meta — fica só no servidor; o navegador busca por GET autenticado
  state: 'ringing' | 'accepted' | 'rejected' | 'ended'
  acceptedById?: string
  startedAt: number
}

const callKey = (id: string) => `call:${id}`
const CALL_TTL_SECONDS = 60 * 60

export async function getCall(callId: string): Promise<CallState | null> {
  const raw = await redis.get(callKey(callId))
  return raw ? (JSON.parse(raw) as CallState) : null
}

export async function saveCall(call: CallState) {
  await redis.set(callKey(call.callId), JSON.stringify(call), 'EX', CALL_TTL_SECONDS)
}

function emitToWorkspace(workspaceId: string, event: string, data: object) {
  try { getIO().to(`ws:${workspaceId}`).emit(event, data) } catch {}
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Grava a ligação como mensagem de sistema na conversa do contato e avisa o painel.
async function logCallMessage(call: CallState, status: 'answered' | 'missed' | 'rejected', durationSeconds: number) {
  if (!call.conversationId) return
  const content =
    status === 'answered' ? `📞 Ligação recebida — atendida (duração ${formatDuration(durationSeconds)})`
    : status === 'rejected' ? '📞 Ligação recebida — recusada'
    : '📞 Ligação recebida — perdida'
  const message = await prisma.message.create({
    data: {
      conversationId: call.conversationId,
      role: 'SYSTEM',
      content,
      creditsUsed: 0,
      metadata: { type: 'call', callId: call.callId, status, durationSeconds },
    },
  })
  try { emitNewMessage(call.workspaceId, call.conversationId, message) } catch {}
}

// Localiza (ou cria) contato e conversa aberta do cliente que está ligando.
async function resolveConversation(channel: any, from: string, name: string) {
  const externalId = normalizeBrazilianNumber(from)
  const workspaceId: string = channel.workspaceId

  let contact = await prisma.contact.findUnique({
    where: { workspaceId_channelId_externalId: { workspaceId, channelId: channel.id, externalId } },
  })
  if (!contact) {
    const orphan = await prisma.contact.findFirst({ where: { workspaceId, channelId: null, phone: externalId } })
    contact = orphan
      ? await prisma.contact.update({ where: { id: orphan.id }, data: { channelId: channel.id, externalId, name: orphan.name || name } })
      : await prisma.contact.create({ data: { workspaceId, channelId: channel.id, externalId, name, phone: externalId } })
  }

  let conversation = await prisma.conversation.findFirst({
    where: { channelId: channel.id, contactId: contact.id, status: { not: 'CLOSED' } },
  })
  if (!conversation) {
    const agentChannel = await prisma.agentChannel.findFirst({ where: { channelId: channel.id } })
    if (!agentChannel) return { contact, conversation: null }
    conversation = await prisma.conversation.create({
      data: { workspaceId, agentId: agentChannel.agentId, channelId: channel.id, contactId: contact.id, status: 'AI_ACTIVE' },
    })
  }
  return { contact, conversation }
}

// Entrada do webhook de campo "calls": value = entry[].changes[].value
export async function handleCallsWebhook(channel: any, value: any) {
  const calls: any[] = Array.isArray(value?.calls) ? value.calls : []
  for (const call of calls) {
    // Só tratamos ligações recebidas; a empresa não origina chamadas neste produto.
    if (call?.direction && call.direction !== 'USER_INITIATED') continue
    try {
      if (call.event === 'connect') await onConnect(channel, call, value)
      else if (call.event === 'terminate') await onTerminate(call)
    } catch (err: any) {
      console.error('[CALLS] erro ao tratar webhook:', err?.message)
    }
  }
}

async function onConnect(channel: any, call: any, value: any) {
  const sdp: string | undefined = call?.session?.sdp
  if (!call.id || !sdp) return

  const profileName = value?.contacts?.[0]?.profile?.name
  const phone = normalizeBrazilianNumber(call.from || value?.contacts?.[0]?.wa_id || '')
  const name = profileName || phone || 'Desconhecido'

  let conversationId: string | null = null
  try {
    const { conversation } = await resolveConversation(channel, phone, name)
    conversationId = conversation?.id ?? null
  } catch (err: any) {
    console.error('[CALLS] não foi possível resolver conversa:', err?.message)
  }

  const state: CallState = {
    callId: call.id, workspaceId: channel.workspaceId, channelId: channel.id,
    conversationId, contactName: name, phone, sdp, state: 'ringing', startedAt: Date.now(),
  }
  await saveCall(state)

  emitToWorkspace(channel.workspaceId, 'call:incoming', {
    callId: call.id, channelId: channel.id, conversationId, contactName: name, phone,
  })
}

async function onTerminate(call: any) {
  // Idempotência: a Meta pode reenviar o webhook.
  const first = await redis.set(`${callKey(call.id)}:done`, '1', 'EX', CALL_TTL_SECONDS, 'NX')
  if (!first) return

  const state = await getCall(call.id)
  if (!state) return

  const duration = Number(call.duration) || 0
  const answered = state.state === 'accepted' && call.status !== 'FAILED' && (duration > 0 || !!call.start_time)
  const status = answered ? 'answered' : state.state === 'rejected' ? 'rejected' : 'missed'

  await saveCall({ ...state, state: 'ended' })
  await logCallMessage(state, status, duration)
  emitToWorkspace(state.workspaceId, 'call:ended', { callId: state.callId, status, durationSeconds: duration })
}

// ── Elegibilidade do número ────────────────────────────────────────────────
// Limite diário de mensagens (messaging_limit_tier) → destinatários únicos por 24h.
const TIER_LIMITS: Record<string, number> = {
  TIER_50: 50, TIER_250: 250, TIER_500: 500, TIER_1K: 1000, TIER_2K: 2000,
  TIER_10K: 10000, TIER_100K: 100000, TIER_UNLIMITED: Infinity,
}
export const MIN_CALLING_LIMIT = 2000

export async function getCallingEligibility(workspaceId: string) {
  const channels = await prisma.channel.findMany({ where: { workspaceId, type: 'WHATSAPP', isActive: true } })
  const out = []
  for (const ch of channels) {
    const cfg = ch.config as any
    if (!cfg?.phoneNumberId || !cfg?.accessToken) continue
    const item: Record<string, any> = {
      channelId: ch.id, name: ch.name, displayPhoneNumber: cfg.displayPhoneNumber ?? null,
      minLimit: MIN_CALLING_LIMIT, tier: null, limitOk: null, callsFieldSubscribed: null,
      callingEnabled: null, restrictions: [], errors: [] as string[],
    }
    try {
      const tier = await provider.getMessagingLimitTier(ch.id)
      item.tier = tier
      const limit = tier ? TIER_LIMITS[tier] : undefined
      item.limitOk = limit === undefined ? null : limit >= MIN_CALLING_LIMIT
    } catch (e: any) { item.errors.push(`Limite de mensagens: ${e?.response?.data?.error?.message || e?.message}`) }
    try {
      const fields = await provider.getSubscribedFields(ch.id)
      item.callsFieldSubscribed = fields ? fields.includes('calls') : null
    } catch (e: any) { item.errors.push(`Campos assinados: ${e?.response?.data?.error?.message || e?.message}`) }
    try {
      const s = await provider.getCallingSettings(ch.id)
      item.callingEnabled = s.status ? s.status === 'ENABLED' : null
      item.restrictions = s.restrictions
    } catch (e: any) { item.errors.push(`Configuração de chamadas: ${e?.response?.data?.error?.message || e?.message}`) }
    item.eligible = item.limitOk === true && item.callsFieldSubscribed !== false
    out.push(item)
  }
  return out
}
