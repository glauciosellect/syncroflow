'use client'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { CalendarDays, RefreshCw, ExternalLink, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function AgendaPage() {
  const { data: googleStatus } = useQuery({
    queryKey: ['google-integration'],
    queryFn: () => api.get('/integrations/google').then(r => r.data),
  })

  const connected = googleStatus?.connected && !googleStatus?.tokenExpired
  const tokenExpired = googleStatus?.tokenExpired
  const email = googleStatus?.email

  // URL pública do Google Calendar para embed (modo agenda)
  // Usamos o iframe do Google Calendar com o e-mail conectado
  const calendarSrc = email
    ? `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(email)}&ctz=America%2FSao_Paulo&showTitle=0&showNav=1&showDate=1&showPrint=0&showTabs=1&showCalendars=0&mode=WEEK&hl=pt_BR`
    : null

  if (!googleStatus) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
          <CalendarDays className="w-8 h-8 text-[#1565C0]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">
            {tokenExpired ? 'Token expirado — reconecte o Google Calendar' : 'Google Calendar não conectado'}
          </h2>
          <p className="text-gray-500 text-sm max-w-sm mx-auto">
            {tokenExpired
              ? 'Sua sessão com o Google expirou. Reconecte para continuar usando a Agenda.'
              : 'Conecte sua conta Google para visualizar e gerenciar seus agendamentos diretamente aqui.'}
          </p>
        </div>
        {tokenExpired && (
          <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Token expirado — o agendamento automático pode estar falhando
          </div>
        )}
        <Link
          href="/settings?tab=integrations"
          className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-medium text-sm hover:opacity-90 transition-opacity"
          style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }}
        >
          <CalendarDays className="w-4 h-4" />
          {tokenExpired ? 'Reconectar Google Calendar' : 'Conectar Google Calendar'}
        </Link>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-[#1565C0]" />
          <h1 className="text-lg font-semibold text-gray-900">Agenda</h1>
          {email && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{email}</span>}
        </div>
        <a
          href={`https://calendar.google.com/calendar/r`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-[#1565C0] hover:underline font-medium"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Abrir no Google Calendar
        </a>
      </div>

      {calendarSrc ? (
        <div className="flex-1 rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-white min-h-[500px]">
          <iframe
            src={calendarSrc}
            className="w-full h-full"
            style={{ minHeight: '600px', border: 0 }}
            title="Google Calendar"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
          Não foi possível carregar o calendário.{' '}
          <Link href="/settings?tab=integrations" className="text-[#1565C0] ml-1 hover:underline">Verificar configurações</Link>
        </div>
      )}
    </div>
  )
}
