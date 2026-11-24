'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { MessageSquare, Clock, Plug, Users, ChevronDown, X, ArrowRight, Bot, UserRound } from 'lucide-react'
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import { CountUp, timeAgo } from '@/components/futuristic'

const channelIcon: Record<string, string> = {
  WHATSAPP: '📱', INSTAGRAM: '📸', FACEBOOK: '📘', TELEGRAM: '✈️', WIDGET: '💬', EMAIL: '📧', TIKTOK: '🎵',
}

type Kind = 'open' | 'waiting'

function Tile({ icon: Icon, label, value, hint, from, to, glow, onClick, active, pulse, loading }: {
  icon: any; label: string; value: number; hint: string; from: string; to: string; glow: string
  onClick?: () => void; active?: boolean; pulse?: boolean; loading?: boolean
}) {
  const Comp: any = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      aria-expanded={onClick ? !!active : undefined}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})`, ['--glow' as any]: glow }}
      className={cn(
        'sf-sweep sf-grid-bg relative overflow-hidden rounded-2xl p-4 text-left text-white w-full transition-transform',
        'shadow-lg ring-1 ring-white/20',
        onClick && 'cursor-pointer hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
        pulse && 'sf-glow',
        active && 'ring-2 ring-white/80',
      )}
    >
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <span className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center"><Icon className="w-4 h-4" /></span>
          {onClick
            ? <ChevronDown className={cn('w-4 h-4 opacity-80 transition-transform', active && 'rotate-180')} />
            : <span className="text-[10px] uppercase tracking-widest opacity-70">ao vivo</span>}
        </div>
        <div className="text-4xl font-bold tabular-nums leading-none">{loading ? '—' : <CountUp value={value} />}</div>
        <div className="text-xs font-medium opacity-90 mt-1.5">{label}</div>
        <div className="text-[11px] opacity-70">{hint}</div>
      </div>
    </Comp>
  )
}

function ConversationList({ kind, onClose }: { kind: Kind; onClose: () => void }) {
  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: ['live-conversations', kind],
    queryFn: () => api.get('/analytics/live-conversations', { params: { kind: kind === 'waiting' ? 'waiting' : 'open' } }).then(r => r.data),
    refetchInterval: 20_000,
  })
  const waiting = kind === 'waiting'

  return (
    <div className={cn('sf-rise sf-panel p-0 overflow-hidden')}
      style={{ ['--accent-a' as any]: waiting ? '#F59E0B' : '#22D3EE', ['--accent-b' as any]: waiting ? '#EC4899' : '#3B82F6' }}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
        <div>
          <h3 className="text-sm font-semibold">{waiting ? 'Leads aguardando retorno humano' : 'Conversas abertas agora'}</h3>
          <p className="text-xs text-muted-foreground">
            {waiting ? 'A IA avisou que iria transferir — quem espera há mais tempo aparece primeiro' : 'Mais recentes primeiro'}
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" aria-label="Fechar lista"><X className="w-4 h-4" /></button>
      </div>

      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
      ) : data.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {waiting ? '🎉 Ninguém esperando retorno agora.' : 'Nenhuma conversa aberta.'}
        </div>
      ) : (
        <ul className="divide-y divide-border/50 max-h-[360px] overflow-y-auto">
          {data.map((c) => {
            const name = c.contact?.name || c.contact?.phone || 'Contato sem nome'
            const isWaiting = c.status === 'WAITING_HUMAN'
            return (
              <li key={c.id}>
                <Link href={`/chat?conversationId=${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/60 transition-colors group">
                  <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0',
                    isWaiting ? 'bg-gradient-to-br from-amber-400 to-pink-500' : 'bg-gradient-to-br from-cyan-400 to-blue-600')}>
                    {name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{name}</span>
                      <span className="text-xs" title={c.channel?.name}>{channelIcon[c.channel?.type] || '💬'}</span>
                      {c.unreadCount > 0 && <span className="text-[10px] font-bold bg-rose-500 text-white rounded-full px-1.5">{c.unreadCount}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.transferSummary || c.lastMessage?.content || '—'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={cn('text-xs font-semibold', isWaiting ? 'text-amber-500' : 'text-muted-foreground')}>
                      {timeAgo(c.waitingSince)}
                    </div>
                    <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                      {isWaiting ? <><UserRound className="w-3 h-3" />aguarda humano</> : <><Bot className="w-3 h-3" />{c.status === 'HUMAN_ACTIVE' ? 'humano' : 'IA'}</>}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Os 4 cards "ao vivo" (iguais no Dashboard e no Comercial) + lista que abre ao clicar no azul/laranja. */
export function LiveStats() {
  const [open, setOpen] = useState<Kind | null>(null)
  const { data: rt, isLoading } = useQuery({
    queryKey: ['analytics-realtime'],
    queryFn: () => api.get('/analytics/realtime').then(r => r.data),
    refetchInterval: 20_000,
  })
  const channels: any[] = rt?.channels || []
  const activeCh = channels.filter(c => c.isActive).length
  const inactiveCh = channels.length - activeCh
  const waiting = rt?.waitingHuman ?? 0

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile icon={MessageSquare} label="Conversas abertas" hint={open === 'open' ? 'clique para fechar' : 'clique para ver a lista'}
          value={rt?.openConversations ?? 0} from="#1D4ED8" to="#06B6D4" glow="rgba(34,211,238,.5)"
          onClick={() => setOpen(open === 'open' ? null : 'open')} active={open === 'open'} loading={isLoading} />
        <Tile icon={Clock} label="Aguardando humano" hint={waiting > 0 ? 'clique para ver quem espera' : 'ninguém esperando'}
          value={waiting} from="#F97316" to="#EC4899" glow="rgba(249,115,22,.6)"
          onClick={() => setOpen(open === 'waiting' ? null : 'waiting')} active={open === 'waiting'} pulse={waiting > 0} loading={isLoading} />
        <Tile icon={Plug} label="Canais ativos" hint={inactiveCh > 0 ? `${inactiveCh} inativo(s)` : 'todos ativos'}
          value={activeCh} from="#047857" to="#84CC16" glow="rgba(16,185,129,.5)" loading={isLoading} />
        <Tile icon={Users} label="Novos contatos hoje" hint="últimas 24h"
          value={rt?.newContactsToday ?? 0} from="#7C3AED" to="#D946EF" glow="rgba(139,92,246,.5)" loading={isLoading} />
      </div>
      {open && <ConversationList kind={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
