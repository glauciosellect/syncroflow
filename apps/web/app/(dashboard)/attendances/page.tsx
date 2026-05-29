'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import api from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, Download, Loader2, ClipboardList } from 'lucide-react'
import { formatDateTime, channelLabel } from '@/lib/utils'

const statusColors: Record<string, string> = { CLOSED: 'secondary', AI_ACTIVE: 'default', WAITING_HUMAN: 'warning', HUMAN_ACTIVE: 'success' }
const statusLabels: Record<string, string> = { CLOSED: 'Encerrado', AI_ACTIVE: 'IA Ativa', WAITING_HUMAN: 'Aguardando', HUMAN_ACTIVE: 'Humano' }

export default function AttendancesPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['attendances', search, page],
    queryFn: () => api.get('/attendances', { params: { search: search || undefined, page, limit: 20 } }).then(r => r.data),
  })

  const exportCSV = async () => {
    const res = await api.get('/attendances/export', { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = 'atendimentos.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Atendimentos</h1>
          <p className="text-gray-500 text-sm mt-1">Histórico completo de todos os atendimentos</p>
        </div>
        <Button variant="outline" onClick={exportCSV}>
          <Download className="w-4 h-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input placeholder="Buscar por nome, telefone ou protocolo..." className="pl-10" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-violet-600" /></div>
      ) : data?.data?.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardList className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Nenhum atendimento encontrado</h3>
          <p className="text-gray-400">Os atendimentos aparecerão aqui conforme as conversas forem encerradas</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Protocolo</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Contato</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Canal</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Agente</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Início</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Duração</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Créditos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.data || []).map((a: any) => (
                  <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-xs font-mono text-gray-500">{a.protocol?.slice(0, 12)}...</td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{a.contactName || 'Desconhecido'}</div>
                      <div className="text-xs text-gray-400">{a.contactPhone}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{channelLabel(a.channelType)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{a.agentName}</td>
                    <td className="px-4 py-3">
                      <Badge variant={statusColors[a.status] as any}>{statusLabels[a.status] || a.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDateTime(a.startedAt)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {a.durationSeconds ? `${Math.floor(a.durationSeconds / 60)}m ${a.durationSeconds % 60}s` : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{a.creditsUsed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Mostrando {((page - 1) * 20) + 1}–{Math.min(page * 20, data?.total || 0)} de {data?.total} atendimentos</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 border rounded-md disabled:opacity-50 hover:bg-gray-50">Anterior</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * 20 >= (data?.total || 0)} className="px-3 py-1 border rounded-md disabled:opacity-50 hover:bg-gray-50">Próximo</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
