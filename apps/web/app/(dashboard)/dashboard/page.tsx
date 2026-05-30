'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import api from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, Bot, Coins, Users, BarChart3 } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts'

const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe']

const periodOptions = [
  { label: 'Últimos 7 dias', days: 7 },
  { label: 'Últimos 30 dias', days: 30 },
  { label: 'Últimos 60 dias', days: 60 },
  { label: 'Últimos 90 dias', days: 90 },
]

function KPICard({ title, value, icon: Icon, description }: { title: string; value: string | number; icon: any; description?: string }) {
  return (
    <Card>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Atendimentos Concluídos" value={overview?.attendances ?? '—'} icon={BarChart3} />
        <KPICard title="Créditos Gastos" value={overview?.creditsUsed?.toLocaleString() ?? '—'} icon={Coins} />
        <KPICard title="Novos Contatos" value={overview?.newContacts ?? '—'} icon={Users} />
        <KPICard title="Créditos Restantes" value={overview?.creditsRemaining?.toLocaleString() ?? '—'} icon={TrendingUp} description={overview?.plan} />
      </div>

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
                <Line type="monotone" dataKey="credits" stroke="#6366f1" strokeWidth={2} dot={false} />
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
                <Bar dataKey="credits" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Top Agentes</CardTitle>
        </CardHeader>
        <CardContent>
          {topAgents?.length === 0 && (
            <div className="text-center py-8 text-gray-400">Nenhum dado disponível ainda</div>
          )}
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
        </CardContent>
      </Card>
    </div>
  )
}

