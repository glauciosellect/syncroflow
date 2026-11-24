'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import {
  MessageSquare, Target, Bot, CalendarCheck, UserRound, Sparkles, AlertTriangle, Calendar,
  Plug, Wifi, WifiOff, Activity,
} from 'lucide-react'
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell, PieChart, Pie,
} from 'recharts'
import { cn } from '@/lib/utils'
import { LiveStats } from '@/components/live-stats'
import { CountUp, Delta, NEON, NEON_LIST, Panel, Sparkline, timeAgo } from '@/components/futuristic'

const periodOptions = [
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '60 dias', days: 60 },
  { label: '90 dias', days: 90 },
]

const channelIcon: Record<string, string> = {
  WHATSAPP: '📱', INSTAGRAM: '📸', FACEBOOK: '📘', TELEGRAM: '✈️', WIDGET: '💬', EMAIL: '📧', TIKTOK: '🎵',
}

const statusLabel: Record<string, { label: string; color: string }> = {
  AI_ACTIVE:     { label: 'IA atendendo',   color: 'bg-emerald-500/15 text-emerald-600' },
  HUMAN_ACTIVE:  { label: 'Humano',         color: 'bg-blue-500/15 text-blue-600' },
  WAITING_HUMAN: { label: 'Aguarda humano', color: 'bg-amber-500/15 text-amber-600' },
  CLOSED:        { label: 'Encerrada',      color: 'bg-muted text-muted-foreground' },
}

const tooltipStyle = {
  contentStyle: {
    background: 'rgba(15,23,42,.92)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12,
    color: '#fff', fontSize: 12, boxShadow: '0 10px 30px rgba(0,0,0,.35)',
  },
  labelStyle: { color: '#94A3B8' },
  itemStyle: { color: '#fff' },
}

function Kpi({ icon: Icon, label, value, prev, suffix, color, spark, sub, delay }: {
  icon: any; label: string; value: number; prev?: number; suffix?: string; color: string; spark?: number[]; sub?: string; delay?: number
}) {
  return (
    <Panel accentA={color} accentB="transparent" delay={delay} className="!p-4 overflow-hidden">
      <div className="flex items-start justify-between">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}22`, boxShadow: `0 0 18px ${color}33` }}>
          <Icon className="w-[18px] h-[18px]" style={{ color }} />
        </span>
        <Delta value={value} prev={prev} />
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <CountUp value={value} className="text-3xl font-bold tabular-nums text-foreground" />
        {suffix && <span className="text-lg font-semibold text-muted-foreground">{suffix}</span>}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-muted-foreground/80">{sub}</div>}
      {spark && <div className="mt-2 -mx-1"><Sparkline data={spark} color={color} /></div>}
    </Panel>
  )
}

function Empty({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/70">
      <Icon className="w-7 h-7 mb-2 opacity-60" />
      <span className="text-sm">{text}</span>
    </div>
  )
}

export default function DashboardPage() {
  const [period, setPeriod] = useState(30)
  const STALE = 60 * 1000

  const end = new Date().toISOString()
  const start = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString()

  const { data: biz, isLoading } = useQuery({
    queryKey: ['analytics-business', period],
    queryFn: () => api.get('/analytics/business', { params: { start, end } }).then(r => r.data),
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
  const { data: realtime } = useQuery({
    queryKey: ['analytics-realtime'],
    queryFn: () => api.get('/analytics/realtime').then(r => r.data),
    refetchInterval: 20_000,
  })
  const { data: followUps = [] } = useQuery<any[]>({
    queryKey: ['followups-dashboard'],
    queryFn: () => api.get('/comercial/followups', { params: { status: 'PENDING' } }).then(r => r.data),
    staleTime: STALE,
  })

  const t = biz?.totals
  const timeline: any[] = biz?.timeline || []
  const spark = (k: 'conversations' | 'leads' | 'contacts') => timeline.map(d => d[k])
  const funnel: any[] = biz?.funnel || []
  const funnelMax = Math.max(1, ...funnel.map(f => f.count))
  const sources: any[] = biz?.sources || []
  const hours: any[] = biz?.hours || []
  const peakHour = hours.reduce((a, h) => (h.count > (a?.count ?? -1) ? h : a), null as any)
  const msgs = biz?.messages || { client: 0, ai: 0, human: 0 }
  const msgTotal = Math.max(1, msgs.client + msgs.ai + msgs.human)

  const donut = [
    { name: 'Resolvido pela IA', value: t?.aiHandled ?? 0, fill: NEON.cyan },
    { name: 'Passou para humano', value: t?.handedOff ?? 0, fill: NEON.pink },
  ]
  const donutEmpty = (t?.conversations ?? 0) === 0

  const now = Date.now()
  const overdue = followUps.filter(f => new Date(f.scheduledAt).getTime() < now)
  const upcoming = followUps.filter(f => new Date(f.scheduledAt).getTime() >= now).slice(0, 4)
  const channelMax = Math.max(1, ...(byChannel || []).map((c: any) => c.count))

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-[#1D4ED8] via-[#7C3AED] to-[#EC4899] bg-clip-text text-transparent w-fit">
            Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Resultados reais da sua operação · atualiza sozinho</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex w-2.5 h-2.5">
            <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
            <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="text-xs text-muted-foreground mr-3">Ao vivo</span>
          <div className="flex gap-1 bg-muted rounded-xl p-1">
            {periodOptions.map((o) => (
              <button key={o.days} onClick={() => setPeriod(o.days)}
                className={cn('px-3 py-1 rounded-lg text-xs font-medium transition-all',
                  period === o.days ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Ao vivo (clique no azul / laranja para ver a lista) */}
      <LiveStats />

      {/* KPIs do período */}
      <div>
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[.18em] mb-3">
          Resultados · últimos {period} dias
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi icon={MessageSquare} label="Atendimentos iniciados" value={t?.conversations ?? 0} prev={t?.prevConversations}
            color={NEON.cyan} spark={spark('conversations')} delay={0} />
          <Kpi icon={Target} label="Novos leads" value={t?.newLeads ?? 0} prev={t?.prevLeads}
            color={NEON.violet} spark={spark('leads')} sub={t ? `${t.totalLeads} no funil agora` : undefined} delay={60} />
          <Kpi icon={Bot} label="Resolvido só pela IA" value={t?.aiResolutionRate ?? 0} suffix="%"
            color={NEON.emerald} sub={t ? `${t.aiHandled} de ${t.conversations} atendimentos` : undefined} delay={120} />
          <Kpi icon={CalendarCheck} label="Agendamentos" value={biz?.appointments?.period ?? 0}
            color={NEON.amber} sub={biz ? `${biz.appointments.upcoming7d} nos próximos 7 dias` : undefined} delay={180} />
        </div>
      </div>

      {/* Gráfico principal + IA × Humano */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel className="lg:col-span-2" title="Movimento da operação"
          subtitle="Atendimentos, leads e contatos novos por dia" accentA={NEON.cyan} accentB={NEON.violet} delay={80}
          action={<div className="hidden sm:flex gap-3 text-[11px] text-muted-foreground">
            {[['Atendimentos', NEON.cyan], ['Leads', NEON.violet], ['Contatos', NEON.pink]].map(([l, c]) => (
              <span key={l} className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />{l}</span>
            ))}
          </div>}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={timeline} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
              <defs>
                {[['gc', NEON.cyan], ['gl', NEON.violet], ['gk', NEON.pink]].map(([id, c]) => (
                  <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={c} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={c} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 6" stroke="currentColor" strokeOpacity={0.08} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94A3B8' }} tickFormatter={v => v.slice(8) + '/' + v.slice(5, 7)} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip {...tooltipStyle} labelFormatter={v => `Dia ${String(v).slice(8)}/${String(v).slice(5, 7)}`} />
              <Area name="Atendimentos" type="monotone" dataKey="conversations" stroke={NEON.cyan} strokeWidth={2.5} fill="url(#gc)" dot={false} />
              <Area name="Leads" type="monotone" dataKey="leads" stroke={NEON.violet} strokeWidth={2.5} fill="url(#gl)" dot={false} />
              <Area name="Contatos" type="monotone" dataKey="contacts" stroke={NEON.pink} strokeWidth={2} fill="url(#gk)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="IA × Equipe humana" subtitle="Quem resolveu os atendimentos" accentA={NEON.emerald} accentB={NEON.cyan} delay={140}>
          <div className="relative h-[170px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donutEmpty ? [{ name: 'vazio', value: 1, fill: 'rgba(148,163,184,.25)' }] : donut}
                  dataKey="value" innerRadius={56} outerRadius={78} paddingAngle={donutEmpty ? 0 : 4} stroke="none" cornerRadius={6}>
                  {(donutEmpty ? [{ fill: 'rgba(148,163,184,.25)' }] : donut).map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                {!donutEmpty && <Tooltip {...tooltipStyle} />}
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-bold tabular-nums">{t?.aiResolutionRate ?? 0}%</span>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">pela IA</span>
            </div>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between"><span className="inline-flex items-center gap-2"><Bot className="w-4 h-4" style={{ color: NEON.cyan }} />Resolvido pela IA</span><b className="tabular-nums">{t?.aiHandled ?? 0}</b></div>
            <div className="flex items-center justify-between"><span className="inline-flex items-center gap-2"><UserRound className="w-4 h-4" style={{ color: NEON.pink }} />Passou para humano</span><b className="tabular-nums">{t?.handedOff ?? 0}</b></div>
          </div>
        </Panel>
      </div>

      {/* Funil + origem */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel className="lg:col-span-2" title="Funil de vendas" accentA={NEON.violet} accentB={NEON.pink} delay={100}
          subtitle={t ? `${t.totalLeads} leads no total${t.pipelineValue > 0 ? ` · R$ ${Number(t.pipelineValue).toLocaleString('pt-BR')} em oportunidades` : ''}` : undefined}
          action={<Link href="/comercial" className="text-xs font-medium text-primary hover:underline">Abrir Comercial →</Link>}>
          {funnel.length === 0 ? <Empty icon={Target} text="Nenhum lead ainda" /> : (
            <div className="space-y-3">
              {funnel.map((s, i) => (
                <div key={s.id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="inline-flex items-center gap-2"><i className="w-2.5 h-2.5 rounded-full" style={{ background: s.color, boxShadow: `0 0 10px ${s.color}` }} />{s.name}</span>
                    <b className="tabular-nums">{s.count}</b>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.max(3, (s.count / funnelMax) * 100)}%`, background: `linear-gradient(90deg, ${s.color}, ${NEON_LIST[(i + 1) % NEON_LIST.length]})`, boxShadow: `0 0 12px ${s.color}66` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="De onde vêm os leads" subtitle={`Novos em ${period} dias`} accentA={NEON.amber} accentB={NEON.pink} delay={160}>
          {sources.length === 0 ? <Empty icon={Sparkles} text="Sem leads no período" /> : (
            <div className="space-y-2.5">
              {sources.map((s, i) => (
                <div key={s.source} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ background: NEON_LIST[i % NEON_LIST.length] }}>{i + 1}</span>
                  <span className="flex-1 text-sm truncate">{s.source}</span>
                  <b className="text-sm tabular-nums">{s.count}</b>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Horários + mensagens + follow-ups */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="Horário de pico" accentA={NEON.blue} accentB={NEON.cyan} delay={100}
          subtitle={peakHour && peakHour.count > 0 ? `Mais conversas começam às ${String(peakHour.hour).padStart(2, '0')}h` : 'Quando seus clientes mais chamam'}>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={hours} margin={{ top: 4, right: 0, bottom: 0, left: -30 }}>
              <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} interval={3} tickFormatter={h => `${h}h`} />
              <YAxis hide allowDecimals={false} />
              <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(148,163,184,.12)' }} labelFormatter={h => `${h}h`} formatter={(v: any) => [v, 'Conversas']} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {hours.map((h, i) => <Cell key={i} fill={peakHour && h.hour === peakHour.hour && h.count > 0 ? NEON.pink : NEON.blue} fillOpacity={h.count ? 0.95 : 0.25} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Conversas em números" subtitle="Mensagens trocadas no período" accentA={NEON.pink} accentB={NEON.violet} delay={160}>
          <div className="space-y-3.5">
            {[
              { label: 'Clientes', v: msgs.client, c: NEON.amber, icon: MessageSquare },
              { label: 'Agente de IA', v: msgs.ai, c: NEON.cyan, icon: Bot },
              { label: 'Equipe humana', v: msgs.human, c: NEON.pink, icon: UserRound },
            ].map(r => (
              <div key={r.label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="inline-flex items-center gap-2"><r.icon className="w-4 h-4" style={{ color: r.c }} />{r.label}</span>
                  <b className="tabular-nums">{r.v.toLocaleString('pt-BR')}</b>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(2, (r.v / msgTotal) * 100)}%`, background: r.c, boxShadow: `0 0 10px ${r.c}88` }} />
                </div>
              </div>
            ))}
          </div>
          {t && (
            <div className="mt-4 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-muted/70 py-2"><div className="text-lg font-bold tabular-nums">{t.newContacts}</div><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Contatos novos</div></div>
              <div className="rounded-xl bg-muted/70 py-2"><div className="text-lg font-bold tabular-nums">{t.leadConversionRate}%</div><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Viraram lead</div></div>
            </div>
          )}
        </Panel>

        <Panel title="Follow-ups e agenda" accentA={NEON.amber} accentB={NEON.emerald} delay={220}
          action={<Link href="/comercial" className="text-xs font-medium text-primary hover:underline">Ver todos →</Link>}>
          <div className="grid grid-cols-3 gap-2 mb-3 text-center">
            <div className="rounded-xl bg-muted/70 py-2"><div className="text-lg font-bold tabular-nums">{biz?.followUps?.pending ?? 0}</div><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Pendentes</div></div>
            <div className={cn('rounded-xl py-2', (biz?.followUps?.overdue ?? 0) > 0 ? 'bg-rose-500/15' : 'bg-muted/70')}><div className={cn('text-lg font-bold tabular-nums', (biz?.followUps?.overdue ?? 0) > 0 && 'text-rose-500')}>{biz?.followUps?.overdue ?? 0}</div><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Atrasados</div></div>
            <div className="rounded-xl bg-emerald-500/10 py-2"><div className="text-lg font-bold tabular-nums text-emerald-500">{biz?.followUps?.done ?? 0}</div><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Feitos</div></div>
          </div>
          {overdue.length > 0 && (
            <div className="mb-2 flex items-center gap-2 text-xs text-rose-500 bg-rose-500/10 rounded-xl px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /><span><b>{overdue.length}</b> atrasado{overdue.length > 1 ? 's' : ''} — requer atenção</span>
            </div>
          )}
          {upcoming.length === 0 && overdue.length === 0 ? <Empty icon={Calendar} text="Nenhum follow-up agendado" /> : (
            <div className="space-y-1.5">
              {upcoming.map(fu => (
                <div key={fu.id} className="flex items-center gap-2.5 rounded-xl bg-muted/60 px-3 py-2">
                  <i className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: NEON.cyan, boxShadow: `0 0 8px ${NEON.cyan}` }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{fu.title}</div>
                    <div className="text-[10px] text-muted-foreground">{fu.lead?.name ? fu.lead.name + ' · ' : ''}{new Date(fu.scheduledAt).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Canais + Agentes + Atividade */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="Canais" subtitle="Atendimentos por canal no período" accentA={NEON.emerald} accentB={NEON.lime} delay={100}
          action={<Link href="/settings?tab=channels" className="text-xs font-medium text-primary hover:underline">Configurar →</Link>}>
          {(!byChannel || byChannel.length === 0) ? <Empty icon={Plug} text="Sem atendimentos no período" /> : (
            <div className="space-y-3">
              {byChannel.slice(0, 6).map((c: any, i: number) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="inline-flex items-center gap-1.5 min-w-0"><span>{channelIcon[c.type] || '📡'}</span><span className="truncate max-w-[150px]">{c.name}</span></span>
                    <span className="text-xs font-semibold tabular-nums">{c.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(4, (c.count / channelMax) * 100)}%`, background: NEON_LIST[i % NEON_LIST.length], boxShadow: `0 0 10px ${NEON_LIST[i % NEON_LIST.length]}88` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {(realtime?.channels || []).some((c: any) => !c.isActive) && (
            <div className="mt-4 pt-3 border-t border-border/60 space-y-1.5">
              {(realtime.channels as any[]).filter(c => !c.isActive).slice(0, 3).map(c => (
                <div key={c.id} className="flex items-center gap-2 text-xs text-muted-foreground"><WifiOff className="w-3 h-3" /><span className="truncate">{c.name}</span><span className="ml-auto">inativo</span></div>
              ))}
            </div>
          )}
          {(realtime?.channels || []).length > 0 && !(realtime.channels as any[]).some(c => !c.isActive) && (
            <div className="mt-4 pt-3 border-t border-border/60 flex items-center gap-2 text-xs text-emerald-500"><Wifi className="w-3 h-3" />Todos os canais conectados</div>
          )}
        </Panel>

        <Panel title="Agentes" subtitle="Quem mais atendeu no período" accentA={NEON.violet} accentB={NEON.cyan} delay={160}
          action={<Link href="/agents" className="text-xs font-medium text-primary hover:underline">Gerenciar →</Link>}>
          {(!topAgents || topAgents.length === 0) ? <Empty icon={Bot} text="Nenhum dado ainda" /> : (
            <div className="space-y-3">
              {[...topAgents].sort((a: any, b: any) => b.conversations - a.conversations).slice(0, 5).map((a: any, i: number) => (
                <div key={a.id} className="flex items-center gap-3">
                  {a.avatarUrl
                    ? <img src={a.avatarUrl} alt={a.name} className="w-9 h-9 rounded-full object-cover ring-2 ring-white/30" />
                    : <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-violet-600 flex items-center justify-center text-white text-sm font-bold">{a.name?.[0]?.toUpperCase()}</div>}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.conversations} atendimento{a.conversations === 1 ? '' : 's'}</div>
                  </div>
                  <span className="text-xs font-bold text-muted-foreground">#{i + 1}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Atividade recente" subtitle="Últimas 24 horas" accentA={NEON.pink} accentB={NEON.amber} delay={220}
          action={<Link href="/chat" className="text-xs font-medium text-primary hover:underline">Ver chat →</Link>}>
          {(!realtime?.recentConversations || realtime.recentConversations.length === 0) ? <Empty icon={Activity} text="Nenhuma atividade" /> : (
            <div className="space-y-1">
              {realtime.recentConversations.map((conv: any) => {
                const st = statusLabel[conv.status] || statusLabel.AI_ACTIVE
                return (
                  <Link href={`/chat?conversationId=${conv.id}`} key={conv.id} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-muted/60 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm shrink-0">{channelIcon[conv.channel?.type] || '💬'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{conv.contact?.name || conv.contact?.phone || 'Desconhecido'}</div>
                      <div className="text-[10px] text-muted-foreground">{conv.agent?.name} · {conv.interactionCount} msg · {timeAgo(conv.updatedAt)}</div>
                    </div>
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0', st.color)}>{st.label}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </Panel>
      </div>

      {isLoading && <p className="text-center text-xs text-muted-foreground">Carregando resultados…</p>}
    </div>
  )
}
