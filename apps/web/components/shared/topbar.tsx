'use client'
import { useState, useRef, useEffect } from 'react'
import { Coins, Bell, LogOut, Settings, Key, AlertTriangle, Calendar, TrendingUp } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const planCredits: Record<string, number> = { TRIAL: 1000, BASIC: 2500, STANDARD: 11500, CORPORATE: 30000, ENTERPRISE: 50000 }

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  const { data: followUps = [] } = useQuery<any[]>({
    queryKey: ['followups-notify'],
    queryFn: () => api.get('/comercial/followups', { params: { status: 'PENDING' } }).then(r => r.data),
    refetchInterval: 60_000,
  })

  const markDone = useMutation({
    mutationFn: (id: string) => api.patch(`/comercial/followups/${id}`, { status: 'DONE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['followups-notify'] }),
  })

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const now = new Date()
  const overdue = followUps.filter((f: any) => new Date(f.scheduledAt) < now)
  const upcoming = followUps.filter((f: any) => new Date(f.scheduledAt) >= now).slice(0, 5)
  const total = overdue.length + upcoming.length

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={cn('relative p-2 rounded-lg hover:bg-gray-50 transition-colors', open ? 'bg-gray-50' : '')}
      >
        <Bell className={cn('w-4 h-4', overdue.length > 0 ? 'text-red-500' : 'text-gray-500')} />
        {total > 0 && (
          <span className={cn('absolute -top-0.5 -right-0.5 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1', overdue.length > 0 ? 'bg-red-500' : 'bg-[#1565C0]')}>
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="font-semibold text-gray-900 text-sm">Notificações</span>
            <Link href="/comercial" onClick={() => setOpen(false)} className="text-xs text-[#1565C0] hover:underline">Ver todos</Link>
          </div>

          {total === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">
              <Bell className="w-6 h-6 mx-auto mb-2 opacity-40" />
              Nenhuma notificação
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
              {overdue.map((fu: any) => (
                <div key={fu.id} className="flex items-start gap-3 px-4 py-3 bg-red-50 hover:bg-red-100 transition-colors">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-red-700 truncate">{fu.title}</div>
                    {fu.lead && <div className="text-xs text-red-400">{fu.lead.name}</div>}
                    <div className="text-xs text-red-400 mt-0.5">
                      {new Date(fu.scheduledAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} — Atrasado
                    </div>
                  </div>
                  <button onClick={() => markDone.mutate(fu.id)} className="shrink-0 text-xs text-red-400 hover:text-red-600 border border-red-200 rounded px-1.5 py-0.5 hover:bg-red-50">✓</button>
                </div>
              ))}
              {upcoming.map((fu: any) => (
                <div key={fu.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                  <Calendar className="w-4 h-4 text-[#1565C0] shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{fu.title}</div>
                    {fu.lead && <div className="text-xs text-gray-400">{fu.lead.name}</div>}
                    <div className="text-xs text-[#1565C0] mt-0.5">
                      {new Date(fu.scheduledAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <button onClick={() => markDone.mutate(fu.id)} className="shrink-0 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-1.5 py-0.5 hover:bg-gray-100">✓</button>
                </div>
              ))}
            </div>
          )}

          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
            <Link href="/comercial" onClick={() => setOpen(false)} className="flex items-center justify-center gap-2 text-xs text-[#1565C0] font-medium hover:underline py-1">
              <TrendingUp className="w-3 h-3" /> Abrir Comercial
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

export function Topbar() {
  const { user, workspace, logout, refreshToken } = useAuthStore()
  const router = useRouter()

  const handleLogout = async () => {
    try {
      if (refreshToken) await api.post('/auth/logout', { refreshToken })
    } catch {}
    logout()
    router.push('/login')
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-4">
        {(() => {
          const credits = workspace?.credits ?? 0
          const total = planCredits[workspace?.plan || 'TRIAL'] || 1000
          const pct = credits / total
          const isLow = pct <= 0.2 && credits > 0
          const isEmpty = credits <= 0
          return (
            <div className="flex items-center gap-1.5">
              {isEmpty ? (
                <Link href="/billing" className="flex items-center gap-1.5 text-sm bg-red-50 border border-red-200 text-red-600 px-3 py-1 rounded-lg font-medium hover:bg-red-100 transition-colors">
                  <AlertTriangle className="w-4 h-4" />
                  Sem créditos — Comprar agora
                </Link>
              ) : isLow ? (
                <Link href="/billing" className="flex items-center gap-1.5 text-sm bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1 rounded-lg hover:bg-amber-100 transition-colors">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="font-medium">{credits.toLocaleString()}</span>
                  <span className="text-amber-600">créditos restantes</span>
                </Link>
              ) : (
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Coins className="w-4 h-4 text-yellow-500" />
                  <span className="font-medium">{credits.toLocaleString()}</span>
                  <span className="text-gray-400">créditos</span>
                </div>
              )}
            </div>
          )
        })()}
        <NotificationBell />
        <div className="relative group">
          <button className="flex items-center gap-2 hover:bg-gray-50 rounded-lg px-2 py-1.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }}>
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <span className="text-sm font-medium text-gray-700">{user?.name?.split(' ')[0]}</span>
          </button>
          <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
            <div className="p-1">
              <Link href="/api-keys" className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-md hover:bg-gray-50">
                <Key className="w-4 h-4 text-gray-400" />
                Chaves de API
              </Link>
              <Link href="/settings" className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-md hover:bg-gray-50">
                <Settings className="w-4 h-4 text-gray-400" />
                Configurações
              </Link>
              <hr className="my-1 border-gray-100" />
              <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 rounded-md hover:bg-red-50 w-full">
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
