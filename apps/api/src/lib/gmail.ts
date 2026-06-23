import { refreshAccessToken } from './google'

const GMAIL_API = 'https://www.googleapis.com/gmail/v1/users/me'

export interface GmailMessage {
  messageId: string
  threadId: string
  from: string
  fromName: string
  subject: string
  body: string
  references?: string
  timestamp: number
}

export function getGmailOAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
      'email',
      'profile',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

// Token do Gmail é armazenado por Channel (não por Workspace, como o Calendar) —
// um workspace pode ter uma conta Gmail diferente da conta usada no Calendar.
export async function getValidGmailToken(channelId: string): Promise<string | null> {
  const { prisma } = await import('./prisma')
  const channel = await prisma.channel.findUnique({ where: { id: channelId } })
  const cfg = channel?.config as any
  if (!cfg?.accessToken) return null

  const expiry = cfg.tokenExpiry ? new Date(cfg.tokenExpiry).getTime() : 0
  if (Date.now() < expiry - 60_000) return cfg.accessToken

  if (!cfg.refreshToken) return null
  try {
    const tokens = await refreshAccessToken(cfg.refreshToken)
    await prisma.channel.update({
      where: { id: channelId },
      data: { config: { ...cfg, accessToken: tokens.access_token, tokenExpiry: new Date(tokens.expiry_date).toISOString() } },
    })
    return tokens.access_token
  } catch {
    return null
  }
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

function encodeBase64Url(data: string): string {
  return Buffer.from(data, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function extractHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

// Extrai o corpo em texto puro, priorizando text/plain; cai para uma versão
// simplificada do HTML se só houver text/html.
function extractPlainTextBody(payload: any): string {
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }
  if (payload.parts) {
    const plain = payload.parts.find((p: any) => p.mimeType === 'text/plain')
    if (plain?.body?.data) return decodeBase64Url(plain.body.data)
    const html = payload.parts.find((p: any) => p.mimeType === 'text/html')
    if (html?.body?.data) return decodeBase64Url(html.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    // multipart/alternative aninhado
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractPlainTextBody(part)
        if (nested) return nested
      }
    }
  }
  if (payload.body?.data) return decodeBase64Url(payload.body.data)
  return ''
}

export async function listNewMessages(accessToken: string, query: string): Promise<string[]> {
  const params = new URLSearchParams({ q: query, maxResults: '20' })
  const res = await fetch(`${GMAIL_API}/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json() as any
  if (!res.ok) {
    console.error('[GMAIL] listNewMessages erro:', JSON.stringify(data))
    return []
  }
  return (data.messages || []).map((m: any) => m.id)
}

export async function getMessage(accessToken: string, messageId: string): Promise<GmailMessage | null> {
  const res = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json() as any
  if (!res.ok) {
    console.error('[GMAIL] getMessage erro:', JSON.stringify(data))
    return null
  }

  const headers = data.payload?.headers || []
  const fromRaw = extractHeader(headers, 'From') // ex: "Nome Sobrenome <email@dominio.com>"
  const fromMatch = fromRaw.match(/<(.+)>/)
  const from = (fromMatch ? fromMatch[1] : fromRaw).trim().toLowerCase()
  const fromName = fromRaw.replace(/<.+>/, '').replace(/"/g, '').trim() || from

  const subject = extractHeader(headers, 'Subject')
  const messageIdHeader = extractHeader(headers, 'Message-ID')
  const referencesHeader = extractHeader(headers, 'References')
  const references = [referencesHeader, messageIdHeader].filter(Boolean).join(' ').trim()

  const body = extractPlainTextBody(data.payload).slice(0, 8000)

  return {
    messageId: messageIdHeader || data.id,
    threadId: data.threadId,
    from,
    fromName,
    subject,
    body,
    references,
    timestamp: data.internalDate ? parseInt(data.internalDate, 10) : Date.now(),
  }
}

export async function sendReply(accessToken: string, params: {
  threadId: string
  messageId: string
  references?: string
  to: string
  subject: string
  body: string
}): Promise<void> {
  const { threadId, messageId, references, to, subject, body } = params
  const raw = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `In-Reply-To: ${messageId}`,
    `References: ${references || messageId}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ].join('\r\n')

  const res = await fetch(`${GMAIL_API}/messages/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encodeBase64Url(raw), threadId }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    console.error('[GMAIL] sendReply erro:', JSON.stringify(data))
    throw new Error('Falha ao enviar resposta por e-mail')
  }
}

export async function markAsRead(accessToken: string, messageId: string): Promise<void> {
  await fetch(`${GMAIL_API}/messages/${messageId}/modify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
  }).catch(() => {})
}
