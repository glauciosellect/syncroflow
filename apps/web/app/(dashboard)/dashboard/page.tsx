'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import api from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  TrendingUp, Bot, Coins, Users, MessageSquare, AlertTriangle,
  Target, Calendar, Plug, CheckCircle2, Clock, Activity,
  ArrowUpRight, ArrowDownRight, Minus, Phone, Wifi, WifiOff,
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, AreaChart, Area } from 'recharts'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const COLORS = ['#1565C0', '#2E7D32', '#E65100', '#6A1B9A', '#00838F', '#AD1457', '#F9A825']

const periodOptions = [
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '60 dias', days: 60 },
  { label: '90 dias', days: 90 },
]

const channelIcon: Record<string, string> = {
  WHATSAPP: '📱', INSTAGRAM: '📸', FACEBOOK: '📘', TELEGRAM: '✈️', WIDGET: '💬', EMAIL: '📧',
}

const statusLabel: Record<string, { label: string; color: string }> = {
  OPEN:          { label: 'Aberta',          color: 'bg-blue-100 text-blue-700' },
  BOT:           { label: 'Com IA',          color: 'bg-green-100 text-green-700' },
  WAITING_HUMAN: { label: 'Aguard. humano',  color: 'bg-amber-100 text-amber-700' },
  CLOSED:        { label: 'Encerrada',       color: 'bg-gray-100 text-gray-500' },
}

function Trend({ value, prev }: { value: number; prev?: number }) {
  if (prev === undefined || prev === 0) return null
  const diff = value - prev
  const pct = Math.round(Math.abs(diff / prev) * 100)
  if (diff > 0) return <span className="flex items-center gap-0.5 text-xs text-green-600 font-medium"><ArrowUpRight className="w-3 h-3" />{pct}%</span>
  if (diff < 0) return <span className="flex items-center gap-0.5 text-xs text-red-500 font-medium"><ArrowDownRight className="w-3 h-3" />{pct}%</span>
  return <span className="flex items-center gap-0.5 text-xs text-gray-400"><Minus className="w-3 h-3" />0%</span>
}

function KPICard({ title, value, icon: Icon, sub, trend, prevValue, href, accent, loading }: {
  title: string; value: string | number; icon: any; sub?: string
  trend?: number; prevValue?: number; href?: string; accent?: string; loading?: boolean
}) {
  const content = (
    <Card className={cn('transition-all hover:shadow-md', href && 'cursor-pointer', accent && 'border-l-4')}
      style={accent ? { borderLeftColor: accent } : {}}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
            <div className="mt-1.5 flex items-end gap-2">
              {loading ? (
                <div className="h-8 w-16 bg-gray-100 animate-pulse rounded" />
              ) : (
                <span className="text-3xl font-bold text-gray-900">{value ?? '—'}</span>
              )}
              {!loading && prevValue !== undefined && <Trend value={Number(value)} prev={prevValue} />}
            </div>
            {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: accent ? `${accent}15` : '#EFF6FF' }}>
            <Icon className="w-5 h-5" style={{ color: accent || '#1565C0' }} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
  return href ? <Link href={href}>{content}</Link> : content
}

export default function DashboardPage() {
  const [period, setPeriod] = useState(30)
  const STALE = 5 * 60 * 1000

  const end = new Date().toISOString()
  const start = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString()
  const prevEnd = start
  const prevStart = new Date(Date.now() - 2 * period * 24 * 60 * 60 * 1000).toISOString()

  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ['analytics-overview', period],
    queryFn: () => api.get('/analytics/overview', { params: { start, end } }).then(r => r.data),
    staleTime: STALE,
  })

  const { data: prevOverview } = useQuery({
    queryKey: ['analytics-overview-prev', period],
    queryFn: () => api.get('/analytics/overview', { params: { start: prevStart, end: prevEnd } }).then(r => r.data),
    staleTime: STALE,
  })

  const { data: timeline } = useQuery({
    queryKey: ['analytics-timeline', period],
    queryFn: () => api.get('/analytics/timeline', { params: { start, end } }).then(r => r.data),
    staleTime: STALE,
  })

  const { data: topAgents } = useQuery({
    queryKey: ['analytics-top-agents', period],
    queryFn: () => api.get('/analytics/top-agents', { params: { start, end } }).then(r => r.data),
    staleTime: STALE,
  })

  const { data: byChannel } = useQuery({
    queryKey: ['analytics-by-channel', period],
    queryFn: () => api.get('/analytics/by-channel', { params: { start, end } }).then(r => r.data),
    staleTime: STALE,
  })

  const { data: comercialStats } = useQuery({
    queryKey: ['comercial-stats'],
    queryFn: () => api.get('/comercial/stats').then(r => r.data),
    staleTime: STALE,
  })

  const { data: followUps = [] } = useQuery({
    queryKey: ['followups-dashboard'],
    queryFn: () => api.get('/comercial/followups', { params: { status: 'PENDING' } }).then(r => r.data),
    staleTime: 3 * 60 * 1000,
  })

  const { data: realtime, isLoading: loadingRealtime } = useQuery({
    queryKey: ['analytics-realtime'],
    queryFn: () => api.get('/analytics/realtime').then(r => r.data),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  })

  const overdueFollowUps = (followUps as any[]).filter((f: any) => new Date(f.scheduledAt) < new Date())
  const upcomingFollowUps = (followUps as any[]).filter((f: any) => new Date(f.scheduledAt) >= new Date()).slice(0, 4)

  const funnelData = (comercialStats?.stages || []).map((s: any, i: number) => ({
    name: s.name, value: s._count?.leads ?? 0, fill: COLORS[i % COLORS.length],
  }))

  const activeChannels = (realtime?.channels || []).filter((c: any) => c.isActive)
  const inactiveChannels = (realtime?.channels || []).filter((c: any) => !c.isActive)
  const activeAgents = (realtime?.agents || []).filter((a: any) => a.isActive)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Visão completa da sua operação · Atualizado a cada minuto</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-gray-400 mr-3">Ao vivo</span>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {periodOptions.map((o) => (
              <button key={o.days} onClick={() => setPeriod(o.days)}
                className={cn('px-3 py-1 rounded-md text-xs font-medium transition-all',
                  period === o.days ? 'bg-white text-[#1565C0] shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Status em tempo real */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-[#1565C0] to-[#0D47A1] rounded-2xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <MessageSquare className="w-5 h-5 opacity-80" />
            <span className="text-xs opacity-60">Agora</span>
          </div>
          <div className="text-3xl font-bold">{loadingRealtime ? '—' : (realtime?.openConversations ?? 0)}</div>
          <div className="text-xs opacity-70 mt-1">Conversas abertas</div>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-5 h-5 opacity-80" />
            <span className="text-xs opacity-60">Agora</span>
          </div>
          <div className="text-3xl font-bold">{loadingRealtime ? '—' : (realtime?.waitingHuman ?? 0)}</div>
          <div className="text-xs opacity-70 mt-1">Aguardando humano</div>
        </div>
        <div className="bg-gradient-to-br from-[#2E7D32] to-[#1B5E20] rounded-2xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <Plug className="w-5 h-5 opacity-80" />
            <span className="text-xs opacity-60">Canais</span>
          </div>
          <div className="text-3xl font-bold">{loadingRealtime ? '—' : activeChannels.length}</div>
          <div className="text-xs opacity-70 mt-1">{inactiveChannels.length > 0 ? `${inactiveChannels.length} inativo(s)` : 'Todos ativos'}</div>
        </div>
        <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-2xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <Users className="w-5 h-5 opacity-80" />
            <span className="text-xs opacity-60">24h</span>
          </div>
          <div className="text-3xl font-bold">{loadingRealtime ? '—' : (realtime?.newContactsToday ?? 0)}</div>
          <div className="text-xs opacity-70 mt-1">Novos contatos hoje</div>
        </div>
      </div>

      {/* KPIs do período */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Período: {periodOptions.find(o => o.days === period)?.label}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Atendimentos" value={overview?.attendances ?? '—'} icon={CheckCircle2}
            prevValue={prevOverview?.attendances} accent="#1565C0" loading={loadingOverview} />
          <KPICard title="Novos Contatos" value={overview?.newContacts ?? '—'} icon={Users}
            prevValue={prevOverview?.newContacts} accent="#2E7D32" loading={loadingOverview} href="/contacts" />
          <KPICard title="Créditos Usados" value={overview?.creditsUsed?.toLocaleString('pt-BR') ?? '—'} icon={Coins}
            prevValue={prevOverview?.creditsUsed} accent="#E65100" loading={loadingOverview} />
          <KPICard title="Créditos Restantes" value={overview?.creditsRemaining?.toLocaleString('pt-BR') ?? '—'} icon={TrendingUp}
            sub={overview?.plan} accent="#6A1B9A" loading={loadingOverview} href="/settings?tab=billing" />
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Área de créditos */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Créditos consumidos por dia</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={timeline || []} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gradCredits" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1565C0" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#1565C0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => [`${v} cr.`, 'Créditos']} labelFormatter={v => `Dia ${v}`} />
                <Area type="monotone" dataKey="credits" stroke="#1565C0" strokeWidth={2} fill="url(#gradCredits)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Por canal */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Por canal</CardTitle>
          </CardHeader>
          <CardContent>
            {(!byChannel || byChannel.length === 0) ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-300">
                <Plug className="w-8 h-8 mb-2" />
                <span className="text-sm">Sem dados</span>
              </div>
            ) : (
              <div className="space-y-3 mt-1">
                {(byChannel || []).slice(0, 6).map((c: any, i: number) => (
                  <div key={i}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="flex items-center gap-1.5 text-gray-700">
                        <span>{channelIcon[c.type] || '📡'}</span>
                        <span className="truncate max-w-[120px]">{c.name}</span>
                      </span>
                      <span className="text-xs font-semibold text-gray-600">{c.count} conv.</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{
                        width: `${Math.max(4, (c.count / Math.max(1, ...(byChannel || []).map((x: any) => x.count))) * 100)}%`,
                        background: COLORS[i % COLORS.length],
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Comercial + Follow-ups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">Pipeline de Leads</CardTitle>
            <Link href="/comercial" className="text-xs text-[#1565C0] hover:underline font-medium">Abrir →</Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-[#1565C0]">{comercialStats?.totalLeads ?? '—'}</div>
                <div className="text-xs text-gray-500 mt-0.5">Total de Leads</div>
              </div>
              <div className={cn('rounded-xl p-3 text-center', overdueFollowUps.length > 0 ? 'bg-red-50' : 'bg-green-50')}>
                <div className={cn('text-2xl font-bold', overdueFollowUps.length > 0 ? 'text-red-600' : 'text-[#2E7D32]')}>{overdueFollowUps.length}</div>
                <div className="text-xs text-gray-500 mt-0.5">Follow-ups atrasados</div>
              </div>
            </div>
            {funnelData.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">
                <Target className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Nenhuma etapa criada</p>
                <Link href="/comercial" className="text-[#1565C0] text-xs mt-1 block hover:underline">Criar pipeline →</Link>
              </div>
            ) : (
              <div className="space-y-2">
                {funnelData.map((stage: any, i: number) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: stage.fill }} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-gray-600">{stage.name}</span>
                        <span className="text-xs font-bold text-gray-900">{stage.value}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1">
                        <div className="h-1 rounded-full" style={{ width: `${Math.max(4, (stage.value / Math.max(1, comercialStats?.totalLeads || 1)) * 100)}%`, background: stage.fill }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Follow-ups */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">Próximos Follow-ups</CardTitle>
            <Link href="/comercial" className="text-xs text-[#1565C0] hover:underline font-medium">Ver todos →</Link>
          </CardHeader>
          <CardContent>
            {overdueFollowUps.length > 0 && (
              <div className="mb-3 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-sm text-red-600">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span><strong>{overdueFollowUps.length}</strong> atrasado{overdueFollowUps.length > 1 ? 's' : ''} — requer atenção</span>
              </div>
            )}
            {upcomingFollowUps.length === 0 && overdueFollowUps.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Nenhum follow-up agendado</p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingFollowUps.map((fu: any) => (
                  <div key={fu.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 hover:bg-blue-50 transition-colors">
                    <div className="w-2 h-2 rounded-full bg-[#1565C0] mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{fu.title}</div>
                      {fu.lead && <div className="text-xs text-gray-400">{fu.lead.name}</div>}
                      <div className="text-xs text-[#1565C0] mt-0.5 font-medium">
                        {new Date(fu.scheduledAt).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Agentes + Canais + Atividade recente */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Agentes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">Agentes</CardTitle>
            <Link href="/agents" className="text-xs text-[#1565C0] hover:underline font-medium">Gerenciar →</Link>
          </CardHeader>
          <CardContent>
            {(!topAgents || topAgents.length === 0) ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Nenhum dado ainda</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(topAgents || []).slice(0, 5).map((agent: any, i: number) => (
                  <div key={agent.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1565C0] to-[#2E7D32] flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {agent.name?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{agent.name}</div>
                      <div className="text-xs text-gray-400">{agent.conversations} conv. · {agent.credits?.toLocaleString()} cr.</div>
                    </div>
                    <span className="text-xs font-bold text-gray-400">#{i + 1}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status dos canais */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">Canais</CardTitle>
            <Link href="/settings?tab=channels" className="text-xs text-[#1565C0] hover:underline font-medium">Configurar →</Link>
          </CardHeader>
          <CardContent>
            {(!realtime?.channels || realtime.channels.length === 0) ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                <Plug className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Nenhum canal conectado</p>
                <Link href="/settings?tab=channels" className="text-[#1565C0] text-xs mt-1 block hover:underline">Conectar canal →</Link>
              </div>
            ) : (
              <div className="space-y-2">
                {(realtime.channels || []).map((ch: any) => (
                  <div key={ch.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-gray-100">
                    <span className="text-xl">{channelIcon[ch.type] || '📡'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{ch.name}</div>
                      <div className="text-xs text-gray-400">{ch.type}</div>
                    </div>
                    {ch.isActive ? (
                      <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                        <Wifi className="w-3 h-3" />Ativo
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <WifiOff className="w-3 h-3" />Inativo
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Atividade recente */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">Atividade recente</CardTitle>
            <Link href="/chat" className="text-xs text-[#1565C0] hover:underline font-medium">Ver chat →</Link>
          </CardHeader>
          <CardContent>
            {(!realtime?.recentConversations || realtime.recentConversations.length === 0) ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Nenhuma atividade</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(realtime.recentConversations || []).map((conv: any) => {
                  const st = statusLabel[conv.status] || statusLabel.OPEN
                  return (
                    <Link href="/chat" key={conv.id}>
                      <div className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-sm shrink-0">
                          {channelIcon[conv.channel?.type] || '💬'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-gray-900 truncate">{conv.contact?.name || conv.contact?.phone || 'Desconhecido'}</div>
                          <div className="text-[10px] text-gray-400">{conv.agent?.name} · {conv.interactionCount} msg</div>
                        </div>
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0', st.color)}>{st.label}</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Agentes ativos (cards) */}
      {realtime?.agents && realtime.agents.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Seus Agentes</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {(realtime.agents || []).map((agent: any) => (
              <Link href={`/agents/${agent.id}`} key={agent.id}>
                <div className={cn('rounded-2xl p-4 border-2 text-center transition-all hover:shadow-md', agent.isActive ? 'border-green-200 bg-green-50/50' : 'border-gray-200 bg-gray-50 opacity-60')}>
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#1565C0] to-[#2E7D32] flex items-center justify-center text-white text-xl font-bold mx-auto mb-2 shadow-sm">
                    {agent.name?.[0]?.toUpperCase()}
                  </div>
                  <div className="text-sm font-semibold text-gray-900 truncate">{agent.name}</div>
                  {agent.funcao && <div className="text-xs text-gray-400 mt-0.5 truncate">{agent.funcao}</div>}
                  <div className={cn('text-xs font-medium mt-2', agent.isActive ? 'text-green-600' : 'text-gray-400')}>
                    {agent.isActive ? '● Ativo' : '○ Inativo'}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
