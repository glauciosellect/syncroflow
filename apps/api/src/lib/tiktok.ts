import axios from 'axios'
import crypto from 'crypto'
import { prisma } from './prisma'

// TikTok API for Business — comentários orgânicos.
// ATENÇÃO: caminhos/campos abaixo seguem a doc pública (business-api.tiktok.com/portal/docs)
// e ainda NÃO foram testados contra a API real (depende da aprovação do app "TikTok Accounts").
// Se algo divergir no primeiro teste, o ajuste é só neste arquivo.
const BASE = process.env.TIKTOK_API_BASE || 'https://business-api.tiktok.com/open_api/v1.3'

// Limite do comentário no TikTok: ~150 caracteres. Corta no fim de frase/palavra, nunca no meio.
export const TIKTOK_MAX_REPLY = 150
export function shortenForTikTok(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= TIKTOK_MAX_REPLY) return clean
  const cut = clean.slice(0, TIKTOK_MAX_REPLY - 1)
  const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  if (sentenceEnd >= 60) return cut.slice(0, sentenceEnd + 1)
  return cut.replace(/\s+\S*$/, '').trimEnd() + '…'
}

export const TIKTOK_SCOPES = 'user.info.basic,user.info.username,video.list,comment.list,comment.list.manage'

export function tiktokEnv() {
  return {
    appId: process.env.TIKTOK_APP_ID || '',
    appSecret: process.env.TIKTOK_APP_SECRET || '',
    redirectUri: `${process.env.API_URL}/integrations/tiktok/callback`,
  }
}

export type TikTokConfig = {
  accessToken: string
  refreshToken?: string
  accessTokenExpiresAt?: string
  refreshTokenExpiresAt?: string
  businessId: string // open_id da conta
  username?: string
  displayName?: string
  needsReconnect?: boolean
}

type TokenData = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  refresh_token_expires_in?: number
  open_id?: string
}

function unwrap<T = any>(res: any): T {
  const data = res?.data
  if (data?.code !== undefined && data.code !== 0) {
    const err: any = new Error(`TikTok API ${data.code}: ${data.message}`)
    err.tiktokCode = data.code
    throw err
  }
  return data?.data as T
}

export async function exchangeAuthCode(authCode: string): Promise<TokenData> {
  const { appId, appSecret } = tiktokEnv()
  const res = await axios.post(`${BASE}/tt_user/oauth2/token/`, {
    client_id: appId,
    client_secret: appSecret,
    grant_type: 'authorization_code',
    auth_code: authCode,
    redirect_uri: tiktokEnv().redirectUri,
  })
  return unwrap<TokenData>(res)
}

async function refreshToken(refresh: string): Promise<TokenData> {
  const { appId, appSecret } = tiktokEnv()
  const res = await axios.post(`${BASE}/tt_user/oauth2/refresh_token/`, {
    client_id: appId,
    client_secret: appSecret,
    grant_type: 'refresh_token',
    refresh_token: refresh,
  })
  return unwrap<TokenData>(res)
}

export async function fetchAccountInfo(accessToken: string, businessId: string) {
  const res = await axios.get(`${BASE}/business/get/`, {
    headers: { 'Access-Token': accessToken },
    params: { business_id: businessId, fields: JSON.stringify(['username', 'display_name']) },
  })
  const d = unwrap<any>(res)
  return { username: d?.username as string | undefined, displayName: d?.display_name as string | undefined }
}

export function tokenFields(t: TokenData) {
  const now = Date.now()
  return {
    accessToken: t.access_token,
    ...(t.refresh_token ? { refreshToken: t.refresh_token } : {}),
    accessTokenExpiresAt: new Date(now + (t.expires_in ?? 86400) * 1000).toISOString(),
    ...(t.refresh_token_expires_in
      ? { refreshTokenExpiresAt: new Date(now + t.refresh_token_expires_in * 1000).toISOString() }
      : {}),
  }
}

// Retorna um access token válido, renovando (e persistindo) se faltar < 10 min para expirar.
async function getValidToken(channelId: string, cfg: TikTokConfig): Promise<string> {
  const expiresAt = cfg.accessTokenExpiresAt ? new Date(cfg.accessTokenExpiresAt).getTime() : 0
  if (expiresAt - Date.now() > 10 * 60 * 1000 || !cfg.refreshToken) return cfg.accessToken
  try {
    const fresh = await refreshToken(cfg.refreshToken)
    const next = { ...cfg, ...tokenFields(fresh) }
    await prisma.channel.update({ where: { id: channelId }, data: { config: next as any } })
    return next.accessToken
  } catch (err: any) {
    console.error('[TIKTOK] falha ao renovar token:', err?.message)
    await prisma.channel.update({ where: { id: channelId }, data: { config: { ...cfg, needsReconnect: true } as any } })
    throw err
  }
}

export type TikTokComment = {
  commentId: string
  videoId: string
  text: string
  userId: string
  username: string
  isOwner: boolean
  isPublic: boolean
}

// Webhook "comment.update" não traz autor nem sempre o texto: busca o comentário na lista do vídeo.
export async function fetchComment(
  channelId: string,
  cfg: TikTokConfig,
  videoId: string,
  commentId: string,
): Promise<TikTokComment | null> {
  const token = await getValidToken(channelId, cfg)
  const res = await axios.get(`${BASE}/business/comment/list/`, {
    headers: { 'Access-Token': token },
    params: { business_id: cfg.businessId, video_id: videoId, page_size: 30 },
  })
  const list: any[] = unwrap<any>(res)?.comments || []
  const c = list.find((x) => String(x.comment_id) === String(commentId))
  if (!c) return null
  return {
    commentId: String(c.comment_id),
    videoId,
    text: c.text || '',
    userId: String(c.user_id || c.username || ''),
    username: c.username || c.display_name || 'Usuário TikTok',
    isOwner: c.owner === true,
    isPublic: !c.status || c.status === 'PUBLIC',
  }
}

export async function replyToComment(
  channelId: string,
  cfg: TikTokConfig,
  videoId: string,
  commentId: string,
  text: string,
) {
  const token = await getValidToken(channelId, cfg)
  const res = await axios.post(
    `${BASE}/business/comment/reply/create/`,
    { business_id: cfg.businessId, video_id: videoId, comment_id: commentId, comment_type: 'REPLY', text },
    { headers: { 'Access-Token': token } },
  )
  return unwrap<any>(res)
}

// Registra a URL única de webhook do app (só existe UMA por app TikTok).
export async function registerCommentWebhook(appToken: string, url: string) {
  const { appId, appSecret } = tiktokEnv()
  const res = await axios.post(
    `${BASE}/business/webhook/update/`,
    { app_id: appId, secret: appSecret, event_type: 'COMMENT', callback_url: url },
    { headers: { 'Access-Token': appToken } },
  )
  return unwrap<any>(res)
}

// Assinatura do webhook: header TikTok-Signature, HMAC-SHA256(app secret, corpo bruto).
// Aceita tanto "<hex>" quanto "t=<ts>,s=<hex>" (assina "<ts>.<corpo>").
export function isValidTikTokSignature(rawBody: Buffer, header: string | undefined): boolean {
  const secret = tiktokEnv().appSecret
  if (!secret) return false
  if (!header) return false
  const safeEq = (a: string, b: string) => {
    try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)) } catch { return false }
  }
  if (header.includes('s=')) {
    const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]))
    const ts = parts.t
    if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false
    const expected = crypto.createHmac('sha256', secret).update(`${ts}.${rawBody.toString('utf8')}`).digest('hex')
    return safeEq(parts.s || '', expected)
  }
  return safeEq(header, crypto.createHmac('sha256', secret).update(rawBody).digest('hex'))
}
