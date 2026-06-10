'use client'
import { useState, useRef, useEffect } from 'react'
import { Coins, Bell, LogOut, Settings, Key, AlertTriangle, Calendar, TrendingUp, Sun, Moon } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useTheme } from '@/components/shared/theme-provider'

const planCredits: Record<string, number> = { TRIAL: 1000, BASIC: 2500, STANDARD: 11500, CORPORATE: 30000, ENTERPRISE: 50000 }

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  const { data: followUps = [] } = useQuery<any[]>({
    queryKey: ['followups-notify'],
    queryFn: () => api.get('/comercial/followups', { params: { status: 'PENDING' } }).then(r => r.data),
    refetchInterval: 5 * 60_000,
    staleTime: 3 * 60_000,
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
        className={cn(
          'relative p-2 rounded-lg transition-colors',
          open
            ? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]'
            : 'text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]'
        )}
      >
        <Bell className={cn('w-4 h-4', overdue.length > 0 ? 'text-red-500' : '')} />
        {total > 0 && (
          <span className={cn(
            'absolute -top-0.5 -right-0.5 text-white text-[9px] font-bold rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-1',
            overdue.length > 0 ? 'bg-red-500' : 'bg-[hsl(var(--primary))]'
          )}>
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-[hsl(var(--card))] rounded-xl shadow-xl border border-[hsl(var(--border))] z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--border))]">
            <span className="font-semibold text-[hsl(var(--card-foreground))] text-sm">Notificações</span>
            <Link href="/comercial" onClick={() => setOpen(false)} className="text-xs text-[hsl(var(--primary))] hover:underline">Ver todos</Link>
          </div>

          {total === 0 ? (
            <div className="py-8 text-center text-[hsl(var(--muted-foreground))] text-sm">
              <Bell className="w-6 h-6 mx-auto mb-2 opacity-40" />
              Nenhuma notificação
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-[hsl(var(--border))]">
              {overdue.map((fu: any) => (
                <div key={fu.id} className="flex items-start gap-3 px-4 py-3 bg-red-500/5 hover:bg-red-500/10 transition-colors">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-red-600 dark:text-red-400 truncate">{fu.title}</div>
                    {fu.lead && <div className="text-xs text-red-400">{fu.lead.name}</div>}
                    <div className="text-xs text-red-400 mt-0.5">
                      {new Date(fu.scheduledAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} — Atrasado
                    </div>
                  </div>
                  <button onClick={() => markDone.mutate(fu.id)} className="shrink-0 text-xs text-red-400 hover:text-red-600 border border-red-200 dark:border-red-900 rounded px-1.5 py-0.5">✓</button>
                </div>
              ))}
              {upcoming.map((fu: any) => (
                <div key={fu.id} className="flex items-start gap-3 px-4 py-3 hover:bg-[hsl(var(--accent))] transition-colors">
                  <Calendar className="w-4 h-4 text-[hsl(var(--primary))] shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[hsl(var(--card-foreground))] truncate">{fu.title}</div>
                    {fu.lead && <div className="text-xs text-[hsl(var(--muted-foreground))]">{fu.lead.name}</div>}
                    <div className="text-xs text-[hsl(var(--primary))] mt-0.5">
                      {new Date(fu.scheduledAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <button onClick={() => markDone.mutate(fu.id)} className="shrink-0 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] border border-[hsl(var(--border))] rounded px-1.5 py-0.5">✓</button>
                </div>
              ))}
            </div>
          )}

          <div className="px-4 py-2 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
            <Link href="/comercial" onClick={() => setOpen(false)} className="flex items-center justify-center gap-2 text-xs text-[hsl(var(--primary))] font-medium hover:underline py-1">
              <TrendingUp className="w-3 h-3" /> Abrir Comercial
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      className="p-2 rounded-lg text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))] transition-colors"
      title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
    >
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
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
    <header className="h-14 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] flex items-center justify-between pl-14 pr-4 md:pl-5 md:pr-5 shrink-0">
      {/* Espaço vazio — padding-left já abre espaço para o hamburger fixo */}
      <div />

      <div className="flex items-center gap-1.5">
        {/* Créditos */}
        {(() => {
          const credits = workspace?.credits ?? 0
          const total = planCredits[workspace?.plan || 'TRIAL'] || 1000
          const pct = credits / total
          const isLow = pct <= 0.2 && credits > 0
          const isEmpty = credits <= 0
          return (
            <div className="flex items-center gap-1.5 mr-1">
              {isEmpty ? (
                <Link href="/billing" className="flex items-center gap-1.5 text-xs bg-red-500/10 border border-red-500/20 text-red-500 px-3 py-1.5 rounded-lg font-medium hover:bg-red-500/20 transition-colors">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Sem créditos
                </Link>
              ) : isLow ? (
                <Link href="/billing" className="flex items-center gap-1.5 text-xs bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-lg hover:bg-amber-500/20 transition-colors">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span className="font-medium">{credits.toLocaleString()}</span>
                  <span className="hidden sm:inline opacity-70">créditos</span>
                </Link>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--foreground-muted))]">
                  <Coins className="w-3.5 h-3.5 text-yellow-500" />
                  <span className="font-semibold text-[hsl(var(--foreground))]">{credits.toLocaleString()}</span>
                  <span className="hidden sm:inline opacity-60">créditos</span>
                </div>
              )}
            </div>
          )
        })()}

        <ThemeToggle />
        <NotificationBell />

        {/* Avatar + menu */}
        <div className="relative group ml-1">
          <button className="flex items-center gap-2 hover:bg-[hsl(var(--accent))] rounded-lg px-2 py-1.5 transition-colors">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #3DBE29 0%, #1A3A8F 100%)' }}
            >
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <span className="hidden sm:inline text-sm font-medium text-[hsl(var(--foreground))]">
              {user?.name?.split(' ')[0]}
            </span>
          </button>
          <div className="absolute right-0 top-full mt-1 w-48 bg-[hsl(var(--card))] rounded-xl shadow-xl border border-[hsl(var(--border))] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
            <div className="p-1.5">
              <Link href="/api-keys" className="flex items-center gap-2.5 px-3 py-2 text-sm text-[hsl(var(--card-foreground))] rounded-lg hover:bg-[hsl(var(--accent))] transition-colors">
                <Key className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                Chaves de API
              </Link>
              <Link href="/settings" className="flex items-center gap-2.5 px-3 py-2 text-sm text-[hsl(var(--card-foreground))] rounded-lg hover:bg-[hsl(var(--accent))] transition-colors">
                <Settings className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                Configurações
              </Link>
              <hr className="my-1 border-[hsl(var(--border))]" />
              <button
                onClick={handleLogout}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-red-500 rounded-lg hover:bg-red-500/10 w-full transition-colors"
              >
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
