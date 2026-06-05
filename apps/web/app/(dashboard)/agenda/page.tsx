'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import api from '@/lib/api'
import { CalendarDays, ExternalLink, AlertTriangle, Grid3X3, List, CalendarRange, LayoutList } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

type ViewMode = 'week' | 'month' | 'day' | 'agenda'

const views: { value: ViewMode; label: string; icon: any; gcMode: string }[] = [
  { value: 'week',   label: 'Semana',  icon: CalendarRange, gcMode: 'WEEK' },
  { value: 'month',  label: 'Mês',     icon: Grid3X3,       gcMode: 'MONTH' },
  { value: 'day',    label: 'Dia',     icon: CalendarDays,  gcMode: 'DAY' },
  { value: 'agenda', label: 'Lista',   icon: LayoutList,    gcMode: 'AGENDA' },
]

export default function AgendaPage() {
  const [view, setView] = useState<ViewMode>('week')

  const { data: googleStatus, isLoading } = useQuery({
    queryKey: ['google-integration'],
    queryFn: () => api.get('/integrations/google').then(r => r.data),
    staleTime: 10 * 60 * 1000,
  })

  const connected = googleStatus?.connected && !googleStatus?.tokenExpired
  const tokenExpired = googleStatus?.tokenExpired
  const email = googleStatus?.email

  const currentView = views.find(v => v.value === view)!

  const calendarSrc = email
    ? `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(email)}&ctz=America%2FSao_Paulo&showTitle=0&showNav=1&showDate=1&showPrint=0&showTabs=0&showCalendars=0&showTz=0&mode=${currentView.gcMode}&hl=pt_BR&wkst=1`
    : null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[#1565C0] border-t-transparent rounded-full animate-spin" />
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
            {tokenExpired ? 'Reconecte o Google Calendar' : 'Google Calendar não conectado'}
          </h2>
          <p className="text-gray-500 text-sm max-w-sm mx-auto">
            {tokenExpired
              ? 'Sua sessão com o Google expirou. Reconecte para continuar usando a Agenda.'
              : 'Conecte sua conta Google para visualizar e gerenciar seus agendamentos aqui.'}
          </p>
        </div>
        {tokenExpired && (
          <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Token expirado — agendamento automático pode estar falhando
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
    <div className="h-full flex flex-col gap-3" style={{ minHeight: 'calc(100vh - 120px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-[#1565C0]" />
          <h1 className="text-lg font-semibold text-gray-900">Agenda</h1>
          {email && (
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full hidden sm:inline">
              {email}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Seletor de visualização */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
            {views.map(v => (
              <button
                key={v.value}
                onClick={() => setView(v.value)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all',
                  view === v.value
                    ? 'bg-white text-[#1565C0] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <v.icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>

          <a
            href="https://calendar.google.com/calendar/r"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-[#1565C0] hover:underline font-medium px-2 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Abrir no Google</span>
          </a>
        </div>
      </div>

      {/* Iframe do Google Calendar */}
      {calendarSrc && (
        <div className="flex-1 rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-white">
          <iframe
            key={view}
            src={calendarSrc}
            className="w-full h-full"
            style={{ minHeight: 'calc(100vh - 180px)', border: 0 }}
            title="Google Calendar"
            loading="lazy"
          />
        </div>
      )}
    </div>
  )
}
