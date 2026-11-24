'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Search, X } from 'lucide-react'
import api from '@/lib/api'
import { timeAgo } from '@/components/futuristic'
import { Card, EmptyState, ErrorState, Skeleton, downloadCsv } from './ui'

type Row = {
  id: string; status: string; contact: { name: string | null; phone: string | null } | null; agent: string | null
  channel: { type: string; name: string } | null; waitingSince: string; interactionCount: number; transferSummary: string | null
  lastMessage: { content: string } | null
}

const STATUS: Record<string, { label: string; tone: string }> = {
  AI_ACTIVE: { label: 'IA atendendo', tone: 'var(--nc-success)' },
  HUMAN_ACTIVE: { label: 'Equipe atendendo', tone: 'var(--nc-info)' },
  WAITING_HUMAN: { label: 'Aguarda humano', tone: 'var(--nc-warning)' },
}
const PAGE = 8
type SortKey = 'contact' | 'channel' | 'agent' | 'status' | 'when' | 'msgs'

const nameOf = (r: Row) => r.contact?.name || r.contact?.phone || 'Contato sem nome'

export function ConversationsTable() {
  const { data, isLoading, isError, refetch } = useQuery<Row[]>({
    queryKey: ['live-conversations', 'open'],
    queryFn: () => api.get('/analytics/live-conversations', { params: { kind: 'open' } }).then(r => r.data),
    refetchInterval: 30_000,
  })
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'when', dir: -1 })
  const [page, setPage] = useState(0)

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    const f = (data ?? []).filter(r => (!status || r.status === status) && (!term || `${nameOf(r)} ${r.contact?.phone ?? ''} ${r.agent ?? ''} ${r.channel?.name ?? ''}`.toLowerCase().includes(term)))
    const val = (r: Row): string | number => ({
      contact: nameOf(r).toLowerCase(), channel: (r.channel?.name ?? '').toLowerCase(), agent: (r.agent ?? '').toLowerCase(),
      status: STATUS[r.status]?.label ?? r.status, when: new Date(r.waitingSince).getTime(), msgs: r.interactionCount,
    })[sort.key]
    return [...f].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir)
  }, [data, q, status, sort])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const cur = Math.min(page, pages - 1)
  const slice = rows.slice(cur * PAGE, cur * PAGE + PAGE)
  const filtersOn = !!q || !!status

  const Th = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th scope="col" aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={`px-3 py-2 font-semibold ${right ? 'text-right' : 'text-left'}`}>
      <button onClick={() => { setSort(s => s.key === k ? { key: k, dir: (s.dir * -1) as 1 | -1 } : { key: k, dir: k === 'when' || k === 'msgs' ? -1 : 1 }); setPage(0) }}
        className="inline-flex items-center gap-1 hover:opacity-80 min-h-[32px]">
        {label}{sort.key === k && (sort.dir === 1 ? <ArrowUp className="w-3 h-3" aria-hidden /> : <ArrowDown className="w-3 h-3" aria-hidden />)}
      </button>
    </th>
  )

  return (
    <Card title="Conversas em andamento" id="conv" subtitle="Todas as conversas ainda não encerradas · atualiza a cada 30 segundos"
      action={data && data.length > 0 ? (
        <button onClick={() => downloadCsv('conversas-em-andamento.csv', [['Contato', 'Telefone', 'Canal', 'Agente', 'Situação', 'Última atividade', 'Mensagens'],
          ...rows.map(r => [nameOf(r), r.contact?.phone, r.channel?.name, r.agent, STATUS[r.status]?.label ?? r.status, new Date(r.waitingSince).toLocaleString('pt-BR'), r.interactionCount])])}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium min-h-[36px]" style={{ borderColor: 'var(--nc-border)' }}>
          <Download className="w-3.5 h-3.5" aria-hidden />CSV
        </button>
      ) : undefined}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="relative flex-1 min-w-[180px]">
          <span className="sr-only">Buscar conversa</span>
          <Search className="w-4 h-4 nc-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          <input value={q} onChange={e => { setQ(e.target.value); setPage(0) }} placeholder="Buscar por contato, canal ou agente"
            className="w-full rounded-lg border bg-transparent pl-9 pr-3 py-2 text-sm min-h-[40px]" style={{ borderColor: 'var(--nc-border)' }} />
        </label>
        <label>
          <span className="sr-only">Filtrar por situação</span>
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(0) }}
            className="rounded-lg border px-3 py-2 text-sm min-h-[40px]" style={{ borderColor: 'var(--nc-border)', background: 'var(--nc-surface)' }}>
            <option value="">Todas as situações</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        {filtersOn && (
          <button onClick={() => { setQ(''); setStatus(''); setPage(0) }} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-2 min-h-[40px]" style={{ color: 'var(--nc-primary)' }}>
            <X className="w-3.5 h-3.5" aria-hidden />Limpar filtros
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Carregando conversas">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : isError ? (
        <ErrorState title="Não foi possível carregar as conversas" hint="Verifique sua conexão e tente de novo." onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState title="Nenhuma conversa em andamento" hint="Quando um cliente escrever, a conversa aparece aqui." />
      ) : rows.length === 0 ? (
        <EmptyState title="Nenhum resultado para os filtros" hint="Ajuste a busca ou limpe os filtros." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--nc-border)' }}>
            <table className="w-full text-sm min-w-[640px]">
              <caption className="sr-only">Conversas em andamento, {rows.length} resultado(s)</caption>
              <thead style={{ background: 'var(--nc-surface-muted)' }} className="text-xs">
                <tr><Th k="contact" label="Contato" /><Th k="channel" label="Canal" /><Th k="agent" label="Agente" /><Th k="status" label="Situação" /><Th k="when" label="Última atividade" /><Th k="msgs" label="Msgs" right /></tr>
              </thead>
              <tbody>
                {slice.map(r => {
                  const st = STATUS[r.status]
                  return (
                    <tr key={r.id} className="border-t hover:opacity-90" style={{ borderColor: 'var(--nc-border)' }}>
                      <th scope="row" className="px-3 py-2 text-left font-medium max-w-[220px]">
                        <Link href={`/chat?conversationId=${r.id}`} className="hover:underline block truncate">{nameOf(r)}</Link>
                        {(r.transferSummary || r.lastMessage?.content) && <span className="block text-xs font-normal nc-muted truncate">{r.transferSummary || r.lastMessage?.content}</span>}
                      </th>
                      <td className="px-3 py-2">{r.channel?.name ?? '—'}</td>
                      <td className="px-3 py-2">{r.agent ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2 py-0.5"
                          style={{ color: st?.tone, background: `color-mix(in srgb, ${st?.tone ?? 'var(--nc-text-2)'} 12%, transparent)` }}>
                          <i className="w-1.5 h-1.5 rounded-full" style={{ background: st?.tone }} aria-hidden />{st?.label ?? r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap nc-muted">{timeAgo(r.waitingSince)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.interactionCount}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-3 text-xs nc-muted">
            <span>{rows.length} conversa{rows.length === 1 ? '' : 's'}{filtersOn ? ' (filtrado)' : ''}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(0, cur - 1))} disabled={cur === 0} aria-label="Página anterior" className="p-2 rounded-lg border disabled:opacity-40 min-w-[36px] min-h-[36px] inline-flex items-center justify-center" style={{ borderColor: 'var(--nc-border)' }}><ChevronLeft className="w-4 h-4" /></button>
              <span className="px-2 tabular-nums">Página {cur + 1} de {pages}</span>
              <button onClick={() => setPage(Math.min(pages - 1, cur + 1))} disabled={cur >= pages - 1} aria-label="Próxima página" className="p-2 rounded-lg border disabled:opacity-40 min-w-[36px] min-h-[36px] inline-flex items-center justify-center" style={{ borderColor: 'var(--nc-border)' }}><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}
