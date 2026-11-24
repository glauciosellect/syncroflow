'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { MessageSquare, Clock, Plug, Users, ChevronDown, X, ArrowRight, Bot, UserRound } from 'lucide-react'
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import { CountUp, timeAgo } from '@/components/futuristic'
import { ErrorState, Skeleton } from '@/components/dashboard/ui'

const channelIcon: Record<string, string> = {
  WHATSAPP: '📱', INSTAGRAM: '📸', FACEBOOK: '📘', TELEGRAM: '✈️', WIDGET: '💬', EMAIL: '📧', TIKTOK: '🎵',
}

type Kind = 'open' | 'waiting'

function Tile({ icon: Icon, label, value, hint, color, onClick, active, attention, loading, controls }: {
  icon: any; label: string; value: number; hint: string; color: string
  onClick?: () => void; active?: boolean; attention?: boolean; loading?: boolean; controls?: string
}) {
  const Comp: any = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      aria-expanded={onClick ? !!active : undefined}
      aria-controls={onClick ? controls : undefined}
      className={cn('nc-card nc-in nc-glass !p-4 text-left w-full min-h-[104px] transition-shadow', onClick && 'cursor-pointer hover:shadow-md')}
      style={{
        borderColor: attention || active ? color : undefined,
        boxShadow: `inset 4px 0 0 ${color}, var(--nc-shadow)`,
        background: attention ? `color-mix(in srgb, ${color} 7%, var(--nc-surface))` : undefined,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-medium nc-muted">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}><Icon className="w-4 h-4" aria-hidden /></span>
          {label}
        </span>
        {onClick && <ChevronDown className={cn('w-4 h-4 nc-muted transition-transform', active && 'rotate-180')} aria-hidden />}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
        {loading ? <Skeleton className="h-8 w-14" /> : <CountUp value={value} />}
      </div>
      <div className="text-[11px] mt-0.5" style={{ color: attention ? color : 'var(--nc-text-2)', fontWeight: attention ? 600 : 400 }}>{hint}</div>
    </Comp>
  )
}

function ConversationList({ kind, onClose, id }: { kind: Kind; onClose: () => void; id: string }) {
  const { data = [], isLoading, isError, refetch } = useQuery<any[]>({
    queryKey: ['live-conversations', kind],
    queryFn: () => api.get('/analytics/live-conversations', { params: { kind: kind === 'waiting' ? 'waiting' : 'open' } }).then(r => r.data),
    refetchInterval: 20_000,
  })
  const waiting = kind === 'waiting'
  const tone = waiting ? 'var(--nc-warning)' : 'var(--nc-primary)'

  return (
    <div id={id} className="nc-card nc-in !p-0 overflow-hidden" role="region" aria-label={waiting ? 'Leads aguardando retorno humano' : 'Conversas abertas'}
      style={{ borderTopWidth: 3, borderTopColor: tone }}>
      <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--nc-border)' }}>
        <div>
          <h3 className="text-sm font-semibold">{waiting ? 'Leads aguardando retorno humano' : 'Conversas abertas agora'}</h3>
          <p className="text-xs nc-muted">{waiting ? 'A IA avisou que iria transferir — quem espera há mais tempo aparece primeiro' : 'Mais recentes primeiro'}</p>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:opacity-70 min-w-[36px] min-h-[36px] inline-flex items-center justify-center" aria-label="Fechar lista"><X className="w-4 h-4" /></button>
      </div>

      {isLoading ? (
        <div className="p-5 space-y-2" aria-busy="true">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : isError ? (
        <div className="p-4"><ErrorState title="Não foi possível carregar a lista" onRetry={() => refetch()} /></div>
      ) : data.length === 0 ? (
        <div className="p-8 text-center text-sm nc-muted">{waiting ? 'Ninguém esperando retorno agora.' : 'Nenhuma conversa aberta.'}</div>
      ) : (
        <ul className="max-h-[360px] overflow-y-auto">
          {data.map((c) => {
            const name = c.contact?.name || c.contact?.phone || 'Contato sem nome'
            const isWaiting = c.status === 'WAITING_HUMAN'
            return (
              <li key={c.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--nc-border)' }}>
                <Link href={`/chat?conversationId=${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:opacity-90 transition-opacity group min-h-[56px]">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                    style={{ background: `color-mix(in srgb, ${isWaiting ? 'var(--nc-warning)' : 'var(--nc-primary)'} 16%, transparent)`, color: isWaiting ? 'var(--nc-warning)' : 'var(--nc-primary)' }}>
                    {name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{name}</span>
                      <span className="text-xs" title={c.channel?.name} aria-label={c.channel?.name}>{channelIcon[c.channel?.type] || '💬'}</span>
                      {c.unreadCount > 0 && <span className="text-[10px] font-bold rounded-full px-1.5" style={{ background: 'var(--nc-danger)', color: '#fff' }} aria-label={`${c.unreadCount} não lidas`}>{c.unreadCount}</span>}
                    </div>
                    <p className="text-xs nc-muted truncate">{c.transferSummary || c.lastMessage?.content || '—'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-semibold" style={{ color: isWaiting ? 'var(--nc-warning)' : 'var(--nc-text-2)' }}>{timeAgo(c.waitingSince)}</div>
                    <div className="text-[10px] nc-muted inline-flex items-center gap-1">
                      {isWaiting ? <><UserRound className="w-3 h-3" aria-hidden />aguarda humano</> : <><Bot className="w-3 h-3" aria-hidden />{c.status === 'HUMAN_ACTIVE' ? 'equipe' : 'IA'}</>}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 nc-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity" aria-hidden />
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
  const { data: rt, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics-realtime'],
    queryFn: () => api.get('/analytics/realtime').then(r => r.data),
    refetchInterval: 20_000,
  })
  const channels: any[] = rt?.channels || []
  const activeCh = channels.filter(c => c.isActive).length
  const inactiveCh = channels.length - activeCh
  const waiting = rt?.waitingHuman ?? 0

  if (isError) return <ErrorState title="Não foi possível carregar os números ao vivo" hint="Verifique sua conexão." onRetry={() => refetch()} />

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile icon={MessageSquare} label="Conversas abertas" hint={open === 'open' ? 'clique para fechar' : 'clique para ver a lista'}
          value={rt?.openConversations ?? 0} color="var(--nc-primary)" controls="live-list"
          onClick={() => setOpen(open === 'open' ? null : 'open')} active={open === 'open'} loading={isLoading} />
        <Tile icon={Clock} label="Aguardando humano" hint={waiting > 0 ? 'requer atenção — clique para ver' : 'ninguém esperando'}
          value={waiting} color="var(--nc-warning)" controls="live-list"
          onClick={() => setOpen(open === 'waiting' ? null : 'waiting')} active={open === 'waiting'} attention={waiting > 0} loading={isLoading} />
        <Tile icon={Plug} label="Canais ativos" hint={inactiveCh > 0 ? `${inactiveCh} inativo(s)` : 'todos ativos'}
          value={activeCh} color="var(--nc-success)" loading={isLoading} />
        <Tile icon={Users} label="Novos contatos hoje" hint="últimas 24 horas"
          value={rt?.newContactsToday ?? 0} color="var(--nc-accent)" loading={isLoading} />
      </div>
      {open && <ConversationList id="live-list" kind={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
