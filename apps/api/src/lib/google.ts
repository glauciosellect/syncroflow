const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

export interface GoogleTokens {
  access_token: string
  refresh_token?: string
  expiry_date: number
}

export interface GoogleCalendarEvent {
  id?: string
  summary: string
  description?: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  attendees?: { email: string }[]
}

export function getOAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'email',
      'profile',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

// Login Google — só email/profile, sem calendar
export function getLoginOAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: ['email', 'profile'].join(' '),
    access_type: 'offline',
    prompt: 'select_account',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const data = await res.json() as any
  if (!res.ok) throw new Error(data.error_description ?? 'Erro ao obter tokens do Google')
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: Date.now() + data.expires_in * 1000,
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json() as any
  if (!res.ok) throw new Error(data.error_description ?? 'Erro ao renovar token do Google')
  return {
    access_token: data.access_token,
    expiry_date: Date.now() + data.expires_in * 1000,
  }
}

export async function getGoogleUserInfo(accessToken: string): Promise<{ email: string; name: string; picture?: string }> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json() as any
  return { email: data.email ?? '', name: data.name ?? '', picture: data.picture }
}

export async function listCalendars(accessToken: string): Promise<{ id: string; summary: string }[]> {
  const res = await fetch(`${CALENDAR_API}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json() as any
  return data.items ?? []
}

export async function getValidToken(workspaceId: string): Promise<string | null> {
  const { prisma } = await import('./prisma')
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      googleAccessToken: true,
      googleRefreshToken: true,
      googleTokenExpiry: true,
    } as any,
  }) as any
  if (!ws?.googleAccessToken) return null

  const expiry = ws.googleTokenExpiry ? new Date(ws.googleTokenExpiry).getTime() : 0
  if (Date.now() < expiry - 60_000) return ws.googleAccessToken

  // Token expirado — renova
  if (!ws.googleRefreshToken) return null
  try {
    const tokens = await refreshAccessToken(ws.googleRefreshToken)
    await (prisma.workspace as any).update({
      where: { id: workspaceId },
      data: {
        googleAccessToken: tokens.access_token,
        googleTokenExpiry: new Date(tokens.expiry_date),
      },
    })
    return tokens.access_token
  } catch {
    return null
  }
}

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: GoogleCalendarEvent
): Promise<string | null> {
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    }
  )
  const data = await res.json() as any
  if (!data.id) console.error('[Google Calendar] Erro ao criar evento:', JSON.stringify(data))
  return data.id ?? null
}

export async function listCalendarEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
  })
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const data = await res.json() as any
  return data.items ?? []
}

export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
  )
}
