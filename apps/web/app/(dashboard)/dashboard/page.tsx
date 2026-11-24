'use client'
import { Suspense, useMemo } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, Bot, CalendarCheck, Calendar, MessageSquare, Plug, RefreshCw, Target, UserPlus, UserRound, Wifi, WifiOff, Download,
} from 'lucide-react'
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import { LiveStats } from '@/components/live-stats'
import { Card, EmptyState, ErrorState, Kpi, Skeleton, downloadCsv, fmtDate } from '@/components/dashboard/ui'
import { Donut, FunnelList, Heatmap, TimeSeries } from '@/components/dashboard/charts'
import { ConversationsTable } from '@/components/dashboard/conversations-table'
import { PeriodFilter, usePeriod } from '@/components/dashboard/period-filter'

const channelIcon: Record<string, string> = {
  WHATSAPP: '📱', INSTAGRAM: '📸', FACEBOOK: '📘', TELEGRAM: '✈️', WIDGET: '💬', EMAIL: '📧', TIKTOK: '🎵',
}
const SERIES_COLORS = ['var(--nc-primary)', 'var(--nc-accent)', 'var(--nc-secondary)', 'var(--nc-warning)', 'var(--nc-success)', 'var(--nc-info)']

function DashboardInner() {
  const period = usePeriod()
  const STALE = 60 * 1000
  const params = { start: period.start, end: period.end }

  const biz = useQuery({
    queryKey: ['analytics-business', period.key],
    queryFn: () => api.get('/analytics/business', { params }).then(r => r.data),
    staleTime: STALE,
  })
  const topAgents = useQuery({
    queryKey: ['analytics-top-agents', period.key],
    queryFn: () => api.get('/analytics/top-agents', { params }).then(r => r.data),
    staleTime: STALE,
  })
  const byChannel = useQuery({
    queryKey: ['analytics-by-channel', period.key],
    queryFn: () => api.get('/analytics/by-channel', { params }).then(r => r.data),
    staleTime: STALE,
  })
  const realtime = useQuery({
    queryKey: ['analytics-realtime'],
    queryFn: () => api.get('/analytics/realtime').then(r => r.data),
    refetchInterval: 20_000,
  })
  const followUps = useQuery<any[]>({
    queryKey: ['followups-dashboard'],
    queryFn: () => api.get('/comercial/followups', { params: { status: 'PENDING' } }).then(r => r.data),
    staleTime: STALE,
  })

  const t = biz.data?.totals
  const timeline: any[] = biz.data?.timeline ?? []
  const spark = (k: 'conversations' | 'leads' | 'contacts') => timeline.map(d => d[k])
  const msgs = biz.data?.messages ?? { client: 0, ai: 0, human: 0 }
  const msgTotal = msgs.client + msgs.ai + msgs.human

  const rangeLabel = `${fmtDate(period.start, { day: '2-digit', month: 'short' })} – ${fmtDate(period.end, { day: '2-digit', month: 'short', year: 'numeric' })}`
  const prevLabel = useMemo(() => {
    const span = +new Date(period.end) - +new Date(period.start)
    return `${fmtDate(new Date(+new Date(period.start) - span), { day: '2-digit', month: 'short' })} – ${fmtDate(period.start, { day: '2-digit', month: 'short' })}`
  }, [period.start, period.end])
  const ctx = `${rangeLabel}`

  const secondaryFailed = [topAgents, byChannel, realtime, followUps].some(q => q.isError)
  const refetchAll = () => { biz.refetch(); topAgents.refetch(); byChannel.refetch(); realtime.refetch(); followUps.refetch() }
  const fetching = biz.isFetching || topAgents.isFetching || byChannel.isFetching
  const updatedAt = biz.data?.generatedAt ? new Date(biz.data.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null

  const now = Date.now()
  const overdue = (followUps.data ?? []).filter(f => new Date(f.scheduledAt).getTime() < now)
  const upcoming = (followUps.data ?? []).filter(f => new Date(f.scheduledAt).getTime() >= now).slice(0, 4)
  const channelMax = Math.max(1, ...(byChannel.data ?? []).map((c: any) => c.count))
  const agents = [...(topAgents.data ?? [])].sort((a: any, b: any) => b.conversations - a.conversations).slice(0, 5)

  function exportSummary() {
    if (!t) return
    downloadCsv(`resumo-${period.key}.csv`, [
      ['Indicador', 'Período atual', 'Período anterior', `Intervalo: ${rangeLabel}`],
      ['Atendimentos iniciados', t.conversations, t.prevConversations],
      ['Novos leads', t.newLeads, t.prevLeads],
      ['Novos contatos', t.newContacts, t.prevContacts],
      ['Resolvidos só pela IA (%)', t.aiResolutionRate, t.prevAiResolutionRate ?? ''],
      ['Passaram para humano', t.handedOff, t.prevHandedOff],
      ['Agendamentos', biz.data.appointments.period, biz.data.appointments.prev],
    ])
  }

  return (
    <div className="space-y-8 max-w-[1440px] mx-auto">
      {/* Cabeçalho */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm nc-muted mt-1">
            Resultados da operação · <span className="tabular-nums">{rangeLabel}</span>
            <span className="hidden sm:inline"> · comparado a {prevLabel}</span>
          </p>
          <div className="flex items-center gap-3 mt-2 text-xs nc-muted">
            {updatedAt && <span>Atualizado às {updatedAt}</span>}
            <button onClick={refetchAll} className="inline-flex items-center gap-1.5 font-medium min-h-[32px]" style={{ color: 'var(--nc-primary)' }} disabled={fetching}>
              <RefreshCw className={cn('w-3.5 h-3.5', fetching && 'animate-spin')} aria-hidden />{fetching ? 'Atualizando…' : 'Atualizar'}
            </button>
            <button onClick={exportSummary} disabled={!t} className="inline-flex items-center gap-1.5 font-medium min-h-[32px] disabled:opacity-50" style={{ color: 'var(--nc-primary)' }}>
              <Download className="w-3.5 h-3.5" aria-hidden />Exportar resumo (CSV)
            </button>
          </div>
        </div>
        <PeriodFilter period={period} />
      </header>

      {secondaryFailed && !biz.isError && (
        <ErrorState compact title="Alguns blocos não carregaram" hint="Os demais dados estão corretos. Os blocos afetados mostram o aviso." onRetry={refetchAll} />
      )}

      {/* 1. O que exige atenção agora */}
      <section aria-label="Situação ao vivo" className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[.16em] nc-muted">Agora</h2>
        <LiveStats />
      </section>

      {biz.isError ? (
        <ErrorState title="Não foi possível carregar os resultados do período" hint="Seus dados estão seguros. Verifique a conexão e tente de novo." onRetry={() => biz.refetch()} />
      ) : (
        <>
          {/* 2. Resumo executivo */}
          <section aria-label="Resumo do período" className="space-y-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[.16em] nc-muted">Resumo do período</h2>
            <div className="grid grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
              <Kpi icon={MessageSquare} label="Atendimentos iniciados" value={t?.conversations} prev={t?.prevConversations} good="up" spark={spark('conversations')}
                color="var(--nc-primary)" context={ctx} loading={biz.isLoading}
                definition="Conversas que começaram no período (qualquer canal). Comparado a um período anterior de mesma duração." delay={0} />
              <Kpi icon={Target} label="Novos leads" value={t?.newLeads} prev={t?.prevLeads} good="up" spark={spark('leads')}
                color="var(--nc-accent)" context={t ? `${t.totalLeads} no funil agora` : undefined} loading={biz.isLoading}
                definition="Leads criados no período, pelo agente, pelo site ou manualmente." delay={40} />
              <Kpi icon={UserPlus} label="Novos contatos" value={t?.newContacts} prev={t?.prevContacts} good="up" spark={spark('contacts')}
                color="var(--nc-secondary)" context={t ? `${t.leadConversionRate}% viraram lead (leads ÷ contatos novos)` : undefined} loading={biz.isLoading}
                definition="Pessoas que entraram em contato pela primeira vez no período." delay={80} />
              <Kpi icon={Bot} label="Resolvidos só pela IA" value={t?.aiResolutionRate} suffix="%" prev={t?.prevAiResolutionRate} good="up" points
                color="var(--nc-success)" context={t ? `${t.aiHandled} de ${t.conversations} atendimentos` : undefined} loading={biz.isLoading}
                definition="Atendimentos iniciados no período que não passaram para a equipe humana (sem transferência, sem humano assumindo)." delay={120} />
              <Kpi icon={UserRound} label="Passaram para humano" value={t?.handedOff} prev={t?.prevHandedOff} good="neutral"
                color="var(--nc-warning)" context={t ? `${t.humanAttended} com resposta da equipe` : undefined} loading={biz.isLoading}
                definition="Atendimentos que foram transferidos, estão aguardando humano ou foram assumidos pela equipe. Aumentar não é necessariamente ruim: depende do seu processo." delay={160} />
              <Kpi icon={CalendarCheck} label="Agendamentos" value={biz.data?.appointments?.period} prev={biz.data?.appointments?.prev} good="up"
                color="var(--nc-info)" context={biz.data ? `${biz.data.appointments.upcoming7d} nos próximos 7 dias` : undefined} loading={biz.isLoading}
                definition="Compromissos com data dentro do período, registrados na agenda do SyncroFlow." delay={200} />
            </div>
          </section>

          {/* 3. Análise */}
          <section aria-label="Análise" className="space-y-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-[.16em] nc-muted">Análise</h2>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <Card className="xl:col-span-2" id="serie" title="Movimento da operação" subtitle="Atendimentos, leads e contatos novos por dia. Dias sem registro aparecem como 0 (contagem real).">
                {biz.isLoading ? <Skeleton className="h-[340px]" /> : <TimeSeries data={timeline} periodLabel={rangeLabel} />}
              </Card>
              <Card id="ia" title="IA × equipe humana" subtitle="Quem concluiu os atendimentos do período">
                {biz.isLoading ? <Skeleton className="h-[300px]" /> : (
                  <Donut emptyText="Sem atendimentos no período" centerValue={`${t?.aiResolutionRate ?? 0}%`} centerLabel="resolvido pela IA"
                    slices={[
                      { key: 'ia', label: 'Resolvido pela IA', value: t?.aiHandled ?? 0, color: 'var(--nc-success)' },
                      { key: 'humano', label: 'Passou para humano', value: t?.handedOff ?? 0, color: 'var(--nc-warning)' },
                    ]} />
                )}
              </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <Card id="funil" title="Funil de vendas" subtitle={t ? `${t.totalLeads} leads no total${t.pipelineValue > 0 ? ` · R$ ${Number(t.pipelineValue).toLocaleString('pt-BR')} em oportunidades` : ''}` : undefined}
                action={<Link href="/comercial" className="text-xs font-medium hover:underline min-h-[32px] inline-flex items-center" style={{ color: 'var(--nc-primary)' }}>Abrir Comercial →</Link>}>
                {biz.isLoading ? <Skeleton className="h-48" /> : <FunnelList stages={biz.data?.funnel ?? []} />}
              </Card>

              <Card id="heat" className="xl:col-span-2" title="Quando os clientes chamam" subtitle="Atendimentos iniciados por dia da semana e hora">
                {biz.isLoading ? <Skeleton className="h-48" /> : <Heatmap grid={biz.data?.heatmap ?? Array.from({ length: 7 }, () => Array(24).fill(0))} />}
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card id="origem" title="De onde vêm os leads" subtitle={`Novos leads · ${rangeLabel}`}>
                {biz.isLoading ? <Skeleton className="h-40" /> : (biz.data?.sources ?? []).length === 0 ? <EmptyState title="Sem leads novos no período" /> : (
                  <ol className="space-y-2.5">
                    {(biz.data.sources as any[]).map((s, i) => {
                      const max = Math.max(1, ...(biz.data.sources as any[]).map(x => x.count))
                      return (
                        <li key={s.source}>
                          <div className="flex items-center justify-between text-sm mb-1"><span className="truncate">{s.source}</span><b className="tabular-nums">{s.count}</b></div>
                          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--nc-surface-muted)' }}>
                            <div className="h-full rounded-full" style={{ width: `${Math.max(3, (s.count / max) * 100)}%`, background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </Card>

              <Card id="msgs" title="Mensagens trocadas" subtitle="Quem escreveu no período">
                {biz.isLoading ? <Skeleton className="h-40" /> : msgTotal === 0 ? <EmptyState title="Sem mensagens no período" /> : (
                  <>
                    <div className="flex h-3 rounded-full overflow-hidden mb-4" role="img" aria-label={`Clientes ${msgs.client}, agente de IA ${msgs.ai}, equipe ${msgs.human}`}>
                      <div style={{ width: `${(msgs.client / msgTotal) * 100}%`, background: 'var(--nc-secondary)' }} />
                      <div style={{ width: `${(msgs.ai / msgTotal) * 100}%`, background: 'var(--nc-primary)' }} />
                      <div style={{ width: `${(msgs.human / msgTotal) * 100}%`, background: 'var(--nc-warning)' }} />
                    </div>
                    <ul className="space-y-2 text-sm">
                      {[['Clientes', msgs.client, 'var(--nc-secondary)'], ['Agente de IA', msgs.ai, 'var(--nc-primary)'], ['Equipe humana', msgs.human, 'var(--nc-warning)']].map(([l, v, c]) => (
                        <li key={l as string} className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-2"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: c as string }} aria-hidden />{l}</span>
                          <span className="tabular-nums"><b>{(v as number).toLocaleString('pt-BR')}</b> <span className="nc-muted text-xs">· {Math.round(((v as number) / msgTotal) * 100)}%</span></span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Card>

              <Card id="fu" title="Follow-ups e agenda" action={<Link href="/comercial" className="text-xs font-medium hover:underline min-h-[32px] inline-flex items-center" style={{ color: 'var(--nc-primary)' }}>Ver todos →</Link>}>
                {biz.isLoading ? <Skeleton className="h-40" /> : (
                  <>
                    <dl className="grid grid-cols-3 gap-2 text-center mb-3">
                      {[['Pendentes', biz.data?.followUps?.pending ?? 0, 'var(--nc-text)'], ['Atrasados', biz.data?.followUps?.overdue ?? 0, (biz.data?.followUps?.overdue ?? 0) > 0 ? 'var(--nc-danger)' : 'var(--nc-text)'], [`Feitos`, biz.data?.followUps?.done ?? 0, 'var(--nc-success)']].map(([l, v, c]) => (
                        <div key={l as string} className="rounded-xl py-2" style={{ background: 'var(--nc-surface-muted)' }}>
                          <dd className="text-lg font-semibold tabular-nums" style={{ color: c as string }}>{v as number}</dd>
                          <dt className="text-[10px] uppercase tracking-wider nc-muted">{l}</dt>
                        </div>
                      ))}
                    </dl>
                    {followUps.isError ? <ErrorState compact title="Não foi possível carregar os follow-ups" onRetry={() => followUps.refetch()} /> : (
                      <>
                        {overdue.length > 0 && (
                          <p className="mb-2 flex items-center gap-2 text-xs rounded-xl px-3 py-2" style={{ color: 'var(--nc-danger)', background: 'color-mix(in srgb, var(--nc-danger) 10%, transparent)' }}>
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden /><span><b>{overdue.length}</b> atrasado{overdue.length > 1 ? 's' : ''} — requer atenção</span>
                          </p>
                        )}
                        {upcoming.length === 0 && overdue.length === 0 ? <EmptyState icon={Calendar} title="Nenhum follow-up agendado" /> : (
                          <ul className="space-y-1.5">
                            {upcoming.map(fu => (
                              <li key={fu.id} className="rounded-xl px-3 py-2" style={{ background: 'var(--nc-surface-muted)' }}>
                                <div className="text-xs font-medium truncate">{fu.title}</div>
                                <div className="text-[11px] nc-muted">{fu.lead?.name ? fu.lead.name + ' · ' : ''}{new Date(fu.scheduledAt).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </>
                )}
              </Card>
            </div>
          </section>
        </>
      )}

      {/* 4. Detalhamento */}
      <section aria-label="Detalhamento" className="space-y-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[.16em] nc-muted">Detalhamento</h2>
        <ConversationsTable />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card id="canais" title="Canais" subtitle={`Atendimentos por canal · ${rangeLabel}`} action={<Link href="/settings?tab=channels" className="text-xs font-medium hover:underline min-h-[32px] inline-flex items-center" style={{ color: 'var(--nc-primary)' }}>Configurar →</Link>}>
            {byChannel.isLoading ? <Skeleton className="h-32" /> : byChannel.isError ? <ErrorState compact title="Não foi possível carregar os canais" onRetry={() => byChannel.refetch()} /> :
              (byChannel.data ?? []).length === 0 ? <EmptyState icon={Plug} title="Sem atendimentos no período" /> : (
                <ul className="space-y-3">
                  {(byChannel.data as any[]).slice(0, 6).map((c, i) => (
                    <li key={i}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="inline-flex items-center gap-1.5 min-w-0"><span aria-hidden>{channelIcon[c.type] || '📡'}</span><span className="truncate">{c.name}</span></span>
                        <b className="tabular-nums">{c.count}</b>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--nc-surface-muted)' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.max(3, (c.count / channelMax) * 100)}%`, background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            {(realtime.data?.channels ?? []).length > 0 && (
              <p className="mt-4 pt-3 border-t text-xs flex items-center gap-2" style={{ borderColor: 'var(--nc-border)', color: (realtime.data.channels as any[]).some(c => !c.isActive) ? 'var(--nc-warning)' : 'var(--nc-success)' }}>
                {(realtime.data.channels as any[]).some(c => !c.isActive)
                  ? <><WifiOff className="w-3.5 h-3.5" aria-hidden />Inativo: {(realtime.data.channels as any[]).filter(c => !c.isActive).map(c => c.name).join(', ')}</>
                  : <><Wifi className="w-3.5 h-3.5" aria-hidden />Todos os canais conectados</>}
              </p>
            )}
          </Card>

          <Card id="agentes" title="Agentes" subtitle={`Atendimentos no período · ${rangeLabel}`} action={<Link href="/agents" className="text-xs font-medium hover:underline min-h-[32px] inline-flex items-center" style={{ color: 'var(--nc-primary)' }}>Gerenciar →</Link>}>
            {topAgents.isLoading ? <Skeleton className="h-32" /> : topAgents.isError ? <ErrorState compact title="Não foi possível carregar os agentes" onRetry={() => topAgents.refetch()} /> :
              agents.length === 0 ? <EmptyState icon={Bot} title="Nenhum atendimento no período" /> : (
                <ol className="space-y-3">
                  {agents.map((a: any, i: number) => (
                    <li key={a.id} className="flex items-center gap-3">
                      {a.avatarUrl
                        ? <img src={a.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
                        : <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold" style={{ background: 'color-mix(in srgb, var(--nc-primary) 16%, transparent)', color: 'var(--nc-primary)' }}>{a.name?.[0]?.toUpperCase()}</span>}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{a.name}</div>
                        <div className="text-xs nc-muted">{a.conversations} atendimento{a.conversations === 1 ? '' : 's'}</div>
                      </div>
                      <span className="text-xs font-semibold nc-muted tabular-nums">#{i + 1}</span>
                    </li>
                  ))}
                </ol>
              )}
          </Card>
        </div>
      </section>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="space-y-4" aria-busy="true"><Skeleton className="h-10 w-48" /><Skeleton className="h-28" /><Skeleton className="h-64" /></div>}>
      <DashboardInner />
    </Suspense>
  )
}
