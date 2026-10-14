'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { CalendarDays, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { GCalAgenda, type CalEvent } from '@/components/agenda/GCalAgenda'
import { EventModal } from '@/components/agenda/EventModal'

export default function AgendaPage() {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [defaultDate, setDefaultDate] = useState<Date | undefined>()
  const [editing, setEditing] = useState<CalEvent | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const { data: googleStatus, isLoading } = useQuery({
    queryKey: ['google-integration'],
    queryFn: () => api.get('/integrations/google').then(r => r.data),
    staleTime: 60 * 1000,
  })

  const connected = googleStatus?.connected && !googleStatus?.tokenExpired
  const tokenExpired = googleStatus?.tokenExpired

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
    <div className="rounded-xl overflow-hidden border border-gray-200 bg-background" style={{ height: 'calc(100vh - 120px)' }}>
      <GCalAgenda
        agendamentos={[]}
        googleConnected
        refreshKey={refreshKey}
        onRefresh={() => setRefreshKey(k => k + 1)}
        onOpenSettings={() => router.push('/integrations')}
        onAgendamentoCreate={(d) => { setEditing(null); setDefaultDate(d); setModalOpen(true) }}
        onGoogleEventEdit={(ev) => { setEditing(ev); setModalOpen(true) }}
      />
      <EventModal
        open={modalOpen}
        defaultDate={defaultDate}
        event={editing}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSaved={() => setRefreshKey(k => k + 1)}
      />
    </div>
  )
}
