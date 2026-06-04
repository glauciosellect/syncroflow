'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import api from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Bot, Coins, Users, BarChart3, Calendar, AlertTriangle, Target } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, FunnelChart, Funnel, LabelList } from 'recharts'
import Link from 'next/link'

const COLORS = ['#1565C0', '#2E7D32', '#E65100', '#6A1B9A', '#00838F', '#AD1457', '#F9A825', '#546E7A']

const periodOptions = [
  { label: 'Últimos 7 dias', days: 7 },
  { label: 'Últimos 30 dias', days: 30 },
  { label: 'Últimos 60 dias', days: 60 },
  { label: 'Últimos 90 dias', days: 90 },
]

function KPICard({ title, value, icon: Icon, description, href, accent }: { title: string; value: string | number; icon: any; description?: string; href?: string; accent?: string }) {
  const content = (
    <Card className={accent ? `border-l-4` : ''} style={accent ? { borderLeftColor: accent } : {}}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-gray-500">{title}</CardTitle>
        <Icon className="w-4 h-4 text-gray-400" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
      </CardContent>
    </Card>
  )
  return href ? <Link href={href}>{content}</Link> : content
}

export default function DashboardPage() {
  const [period, setPeriod] = useState(30)

  const end = new Date().toISOString()
  const start = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString()

  const { data: overview } = useQuery({
    queryKey: ['analytics-overview', period],
    queryFn: () => api.get('/analytics/overview', { params: { start, end } }).then(r => r.data),
  })

  const { data: timeline } = useQuery({
    queryKey: ['analytics-timeline', period],
    queryFn: () => api.get('/analytics/timeline', { params: { start, end } }).then(r => r.data),
  })

  const { data: topAgents } = useQuery({
    queryKey: ['analytics-top-agents', period],
    queryFn: () => api.get('/analytics/top-agents', { params: { start, end } }).then(r => r.data),
  })

  const { data: byChannel } = useQuery({
    queryKey: ['analytics-by-channel', period],
    queryFn: () => api.get('/analytics/by-channel', { params: { start, end } }).then(r => r.data),
  })

  const { data: comercialStats } = useQuery({
    queryKey: ['comercial-stats'],
    queryFn: () => api.get('/comercial/stats').then(r => r.data),
  })

  const { data: followUps = [] } = useQuery({
    queryKey: ['followups-dashboard'],
    queryFn: () => api.get('/comercial/followups', { params: { status: 'PENDING' } }).then(r => r.data),
  })

  const overdueFollowUps = (followUps as any[]).filter((f: any) => new Date(f.scheduledAt) < new Date())
  const upcomingFollowUps = (followUps as any[]).filter((f: any) => new Date(f.scheduledAt) >= new Date()).slice(0, 3)

  // Dados do funil de pipeline para o gráfico
  const funnelData = (comercialStats?.stages || []).map((s: any, i: number) => ({
    name: s.name,
    value: s._count.leads,
    fill: COLORS[i % COLORS.length],
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Visão geral da sua operação</p>
        </div>
        <select
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700"
          value={period}
          onChange={(e) => setPeriod(Number(e.target.value))}
        >
          {periodOptions.map((o) => (
            <option key={o.days} value={o.days}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* KPIs de Atendimento */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Atendimento</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Atendimentos Concluídos" value={overview?.attendances ?? '—'} icon={BarChart3} />
          <KPICard title="Créditos Gastos" value={overview?.creditsUsed?.toLocaleString() ?? '—'} icon={Coins} />
          <KPICard title="Novos Contatos" value={overview?.newContacts ?? '—'} icon={Users} />
          <KPICard title="Créditos Restantes" value={overview?.creditsRemaining?.toLocaleString() ?? '—'} icon={TrendingUp} description={overview?.plan} />
        </div>
      </div>

      {/* KPIs Comerciais */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Comercial</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Total de Leads" value={comercialStats?.totalLeads ?? '—'} icon={Target} href="/comercial" accent="#1565C0" />
          <KPICard title="Etapas no Pipeline" value={comercialStats?.stages?.length ?? '—'} icon={TrendingUp} href="/comercial" accent="#2E7D32" />
          <KPICard
            title="Follow-ups Pendentes"
            value={comercialStats?.pendingFollowUps ?? '—'}
            icon={Calendar}
            href="/comercial"
            accent="#E65100"
          />
          <KPICard
            title="Follow-ups Atrasados"
            value={overdueFollowUps.length}
            icon={AlertTriangle}
            description={overdueFollowUps.length > 0 ? 'Requerem atenção' : 'Tudo em dia'}
            href="/comercial"
            accent={overdueFollowUps.length > 0 ? '#AD1457' : '#2E7D32'}
          />
        </div>
      </div>

      {/* Gráficos de Atendimento */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Créditos por Período</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={timeline || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="credits" stroke="#1565C0" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Créditos por Canal</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={(byChannel || []).slice(0, 7)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} />
                <Tooltip />
                <Bar dataKey="credits" fill="#1565C0" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline + Follow-ups próximos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funil do Pipeline */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Pipeline de Leads</CardTitle>
            <Link href="/comercial" className="text-xs text-[#1565C0] hover:underline">Ver pipeline →</Link>
          </CardHeader>
          <CardContent>
            {funnelData.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                <Target className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>Nenhuma etapa criada ainda</p>
                <Link href="/comercial" className="text-[#1565C0] hover:underline text-xs mt-1 block">Criar pipeline →</Link>
              </div>
            ) : (
              <div className="space-y-2">
                {funnelData.map((stage: any, i: number) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: stage.fill }} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm text-gray-700">{stage.name}</span>
                        <span className="text-sm font-semibold text-gray-900">{stage.value}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.max(4, (stage.value / Math.max(1, comercialStats?.totalLeads || 1)) * 100)}%`, background: stage.fill }} />
                      </div>
                    </div>
                  </div>
                ))}
                {comercialStats?.totalLeads > 0 && (
                  <div className="pt-2 border-t border-gray-100 text-xs text-gray-400 text-right">
                    {comercialStats.totalLeads} leads no total
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Próximos Follow-ups */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Próximos Follow-ups</CardTitle>
            <Link href="/comercial" className="text-xs text-[#1565C0] hover:underline">Ver todos →</Link>
          </CardHeader>
          <CardContent>
            {overdueFollowUps.length > 0 && (
              <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-600">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {overdueFollowUps.length} follow-up{overdueFollowUps.length > 1 ? 's' : ''} atrasado{overdueFollowUps.length > 1 ? 's' : ''}
              </div>
            )}
            {upcomingFollowUps.length === 0 && overdueFollowUps.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>Nenhum follow-up agendado</p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingFollowUps.map((fu: any) => (
                  <div key={fu.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50">
                    <div className="w-2 h-2 rounded-full bg-[#1565C0] mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{fu.title}</div>
                      {fu.lead && <div className="text-xs text-gray-400">{fu.lead.name}</div>}
                      <div className="text-xs text-[#1565C0] mt-0.5">
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

      {/* Top Agentes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Top Agentes</CardTitle>
        </CardHeader>
        <CardContent>
          {(!topAgents || topAgents.length === 0) ? (
            <div className="text-center py-8 text-gray-400">Nenhum dado disponível ainda</div>
          ) : (
            <div className="space-y-3">
              {(topAgents || []).map((agent: any, i: number) => (
                <div key={agent.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-gray-400">#{i + 1}</span>
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-xs font-bold text-[#1565C0]">
                      {agent.name?.[0]?.toUpperCase()}
                    </div>
                    <span className="font-medium text-gray-700">{agent.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-900">{agent.credits?.toLocaleString()} cr.</div>
                    <div className="text-xs text-gray-400">{agent.conversations} conversas</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
