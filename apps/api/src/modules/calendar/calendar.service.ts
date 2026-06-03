import { prisma } from '../../lib/prisma'
import {
  getValidToken,
  createCalendarEvent,
  listCalendarEvents,
  deleteCalendarEvent,
  GoogleCalendarEvent,
} from '../../lib/google'
import { callLLM } from '../ai/ai.service'

const TZ = 'America/Sao_Paulo'

// Converte Date para string ISO local (sem Z) no fuso America/Sao_Paulo
// Necessário porque Google Calendar interpreta dateTime+timeZone como horário local,
// mas toISOString() retorna UTC (com Z), fazendo o Google ignorar o timeZone e salvar errado.
function toLocalISOString(date: Date): string {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  return formatter.format(date).replace(' ', 'T')
}

// Extrai dados de agendamento da mensagem do usuário usando IA
async function extractEventData(userMessage: string, contactName: string): Promise<{
  summary: string
  description: string
  startDateTime: string | null
  endDateTime: string | null
  attendeeEmail: string | null
} | null> {
  const now = new Date().toLocaleString('pt-BR', { timeZone: TZ })

  const res = await callLLM({
    model: 'claude-haiku-4-5',
    system: `Você extrai dados de agendamento de mensagens de WhatsApp.
Data/hora atual: ${now} (fuso: ${TZ}).
Retorne JSON com: summary (título do evento), description (observações), startDateTime (ISO 8601), endDateTime (ISO 8601, padrão = start + 1h), attendeeEmail (email do cliente se mencionado, senão null).
Se não houver data/hora clara, retorne null no campo startDateTime.
Responda APENAS com JSON válido, sem texto adicional.`,
    messages: [{
      role: 'user',
      content: `Nome do cliente: ${contactName}\nMensagem: ${userMessage}`,
    }],
    maxTokens: 300,
  })

  try {
    const json = res.content.trim().replace(/```json|```/g, '')
    return JSON.parse(json)
  } catch {
    return null
  }
}

// Cria evento no Google Calendar do workspace
export async function scheduleAppointment(opts: {
  workspaceId: string
  userMessage: string
  contactName: string
  contactPhone?: string
}): Promise<{ success: boolean; message: string; eventId?: string }> {
  const { workspaceId, userMessage, contactName, contactPhone } = opts

  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      googleCalendarEnabled: true,
      googleCalendarId: true,
    } as any,
  }) as any

  if (!ws?.googleCalendarEnabled) {
    return { success: false, message: 'A agenda não está conectada. Configure o Google Calendar nas integrações.' }
  }

  const accessToken = await getValidToken(workspaceId)
  if (!accessToken) {
    return { success: false, message: 'Não foi possível acessar a agenda. Reconecte o Google Calendar.' }
  }

  const calendarId = ws.googleCalendarId || 'primary'
  const extracted = await extractEventData(userMessage, contactName)

  if (!extracted || !extracted.startDateTime) {
    return {
      success: false,
      message: 'Não consegui identificar a data e hora da consulta. Poderia me informar quando prefere agendar?',
    }
  }

  const startDate = new Date(extracted.startDateTime)
  const endDate = extracted.endDateTime
    ? new Date(extracted.endDateTime)
    : new Date(startDate.getTime() + 60 * 60 * 1000)

  const event: GoogleCalendarEvent = {
    summary: extracted.summary || `Consulta — ${contactName}`,
    description: [
      extracted.description || '',
      contactPhone ? `WhatsApp: ${contactPhone}` : '',
    ].filter(Boolean).join('\n'),
    start: { dateTime: toLocalISOString(startDate), timeZone: TZ },
    end: { dateTime: toLocalISOString(endDate), timeZone: TZ },
    attendees: extracted.attendeeEmail ? [{ email: extracted.attendeeEmail }] : undefined,
  }

  const eventId = await createCalendarEvent(accessToken, calendarId, event)

  if (!eventId) {
    return { success: false, message: 'Erro ao criar o evento na agenda. Tente novamente.' }
  }

  const dataFormatada = startDate.toLocaleString('pt-BR', {
    timeZone: TZ,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })

  return {
    success: true,
    eventId,
    message: `✅ Consulta agendada com sucesso!\n📅 ${dataFormatada}\n📋 ${event.summary}`,
  }
}

// Lista os próximos eventos da agenda do workspace (para o agente consultar disponibilidade)
export async function listUpcomingAppointments(workspaceId: string, days = 7): Promise<{
  available: boolean
  events: { summary: string; start: string; end: string }[]
  message: string
}> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      googleCalendarEnabled: true,
      googleCalendarId: true,
    } as any,
  }) as any

  if (!ws?.googleCalendarEnabled) {
    return { available: false, events: [], message: 'Agenda não configurada.' }
  }

  const accessToken = await getValidToken(workspaceId)
  if (!accessToken) {
    return { available: false, events: [], message: 'Sem acesso à agenda.' }
  }

  const calendarId = ws.googleCalendarId || 'primary'
  const timeMin = new Date().toISOString()
  const timeMax = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

  const events = await listCalendarEvents(accessToken, calendarId, timeMin, timeMax)

  const formatted = events.map((e) => ({
    summary: e.summary,
    start: e.start.dateTime,
    end: e.end.dateTime,
  }))

  const eventLines = formatted.map((e) => {
    const start = new Date(e.start).toLocaleString('pt-BR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    return `• ${start} — ${e.summary}`
  }).join('\n')

  return {
    available: true,
    events: formatted,
    message: formatted.length === 0
      ? `Não há consultas agendadas nos próximos ${days} dias.`
      : `Consultas agendadas nos próximos ${days} dias:\n${eventLines}`,
  }
}

// Cancela o próximo evento que corresponda ao nome/descrição
export async function cancelAppointment(opts: {
  workspaceId: string
  userMessage: string
  contactName: string
}): Promise<{ success: boolean; message: string }> {
  const { workspaceId, userMessage, contactName } = opts

  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { googleCalendarEnabled: true, googleCalendarId: true } as any,
  }) as any

  if (!ws?.googleCalendarEnabled) {
    return { success: false, message: 'Agenda não configurada.' }
  }

  const accessToken = await getValidToken(workspaceId)
  if (!accessToken) return { success: false, message: 'Sem acesso à agenda.' }

  const calendarId = ws.googleCalendarId || 'primary'
  const timeMin = new Date().toISOString()
  const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const events = await listCalendarEvents(accessToken, calendarId, timeMin, timeMax)

  // Procura evento do contato
  const match = events.find((e) =>
    e.summary?.toLowerCase().includes(contactName.toLowerCase()) ||
    e.description?.toLowerCase().includes(contactName.toLowerCase())
  )

  if (!match?.id) {
    return { success: false, message: `Não encontrei nenhuma consulta agendada para ${contactName} nos próximos 30 dias.` }
  }

  await deleteCalendarEvent(accessToken, calendarId, match.id)

  const dateStr = match.start.dateTime || (match.start as any).date
  const dataFormatada = new Date(dateStr).toLocaleString('pt-BR', {
    timeZone: TZ, weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
  })

  return {
    success: true,
    message: `✅ Consulta cancelada!\n📅 ${dataFormatada}\n📋 ${match.summary}`,
  }
}

// Retorna contexto de agenda filtrado pelo contato atual — evita vazar dados de outros clientes
export async function getAgendaContextForPrompt(workspaceId: string, contactName?: string): Promise<string> {
  try {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { googleCalendarEnabled: true } as any,
    }) as any
    if (!ws?.googleCalendarEnabled) return ''

    const accessToken = await getValidToken(workspaceId)
    if (!accessToken) return ''

    const calendarId = (ws as any).googleCalendarId || 'primary'
    const timeMin = new Date().toISOString()
    const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const events = await listCalendarEvents(accessToken, calendarId, timeMin, timeMax)

    // Filtra apenas eventos deste contato para não vazar dados de outros clientes
    const contactEvents = contactName
      ? events.filter(e =>
          e.summary?.toLowerCase().includes(contactName.toLowerCase()) ||
          e.description?.toLowerCase().includes(contactName.toLowerCase())
        )
      : []

    if (contactEvents.length === 0) {
      return `\n\nAgenda: nenhuma consulta agendada para este contato. Para agendar, pergunte a data e hora desejada.`
    }

    const lines = contactEvents.map(e => {
      const dt = e.start.dateTime || (e.start as any).date
      const formatted = new Date(dt).toLocaleString('pt-BR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })
      return `• ${formatted} — ${e.summary}`
    }).join('\n')

    return `\n\nConsulta(s) agendada(s) para este contato:\n${lines}\n\nPara remarcar ou cancelar, confirme com o cliente.`
  } catch {
    return ''
  }
}
