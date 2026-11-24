'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Area, AreaChart, Brush, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, Table2, LineChart as LineIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { downloadCsv, EmptyState } from './ui'

const axisTick = { fontSize: 11, fill: 'var(--nc-text-2)' }

function TipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border px-3 py-2 text-xs shadow-lg" style={{ background: 'var(--nc-surface-elevated)', borderColor: 'var(--nc-border)', color: 'var(--nc-text)' }}>
      {children}
    </div>
  )
}

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

type Row = { date: string; conversations: number; leads: number; contacts: number }
const SERIES = [
  { key: 'conversations', label: 'Atendimentos', color: 'var(--nc-primary)', grad: 'g-conv' },
  { key: 'leads', label: 'Leads', color: 'var(--nc-accent)', grad: 'g-leads' },
  { key: 'contacts', label: 'Contatos novos', color: 'var(--nc-secondary)', grad: 'g-cont' },
] as const

/** Série temporal: legenda clicável, tooltip com valores exatos, zoom por seleção (Brush), tabela equivalente e CSV. */
export function TimeSeries({ data, periodLabel }: { data: Row[]; periodLabel: string }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const totals = useMemo(() => SERIES.map(s => ({ ...s, total: data.reduce((a, d) => a + (d as any)[s.key], 0) })), [data])
  const toggle = (k: string) => setHidden(h => { const n = new Set(h); n.has(k) ? n.delete(k) : n.add(k); return n })
  const summary = `Evolução diária (${periodLabel}): ` + totals.map(t => `${t.total} ${t.label.toLowerCase()}`).join(', ') + '.'
  const allZero = totals.every(t => t.total === 0)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Séries exibidas">
          {totals.map(s => {
            const off = hidden.has(s.key)
            return (
              <button key={s.key} onClick={() => toggle(s.key)} aria-pressed={!off}
                className={cn('inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium min-h-[36px] transition-opacity', off && 'opacity-50')}
                style={{ borderColor: 'var(--nc-border)' }}>
                <i className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
                {s.label}
                <b className="tabular-nums">{s.total.toLocaleString('pt-BR')}</b>
              </button>
            )
          })}
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setView(v => v === 'chart' ? 'table' : 'chart')}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium min-h-[36px]" style={{ borderColor: 'var(--nc-border)' }}>
            {view === 'chart' ? <><Table2 className="w-3.5 h-3.5" aria-hidden />Ver como tabela</> : <><LineIcon className="w-3.5 h-3.5" aria-hidden />Ver gráfico</>}
          </button>
          <button onClick={() => downloadCsv('movimento-diario.csv', [['Data', 'Atendimentos', 'Leads', 'Contatos novos'], ...data.map(d => [d.date, d.conversations, d.leads, d.contacts])])}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium min-h-[36px]" style={{ borderColor: 'var(--nc-border)' }}>
            <Download className="w-3.5 h-3.5" aria-hidden />CSV
          </button>
        </div>
      </div>

      {allZero ? (
        <EmptyState title="Sem movimento no período" hint="Quando houver atendimentos, leads ou contatos novos, eles aparecem aqui." />
      ) : view === 'table' ? (
        <div className="max-h-[300px] overflow-auto rounded-xl border" style={{ borderColor: 'var(--nc-border)' }} tabIndex={0} aria-label="Tabela de movimento diário">
          <table className="w-full text-xs tabular-nums">
            <caption className="sr-only">{summary}</caption>
            <thead className="sticky top-0" style={{ background: 'var(--nc-surface-muted)' }}>
              <tr><th scope="col" className="text-left px-3 py-2 font-semibold">Data</th>{SERIES.map(s => <th key={s.key} scope="col" className="text-right px-3 py-2 font-semibold">{s.label}</th>)}</tr>
            </thead>
            <tbody>
              {data.map(d => (
                <tr key={d.date} className="border-t" style={{ borderColor: 'var(--nc-border)' }}>
                  <th scope="row" className="text-left px-3 py-1.5 font-normal">{dmy(d.date)}</th>
                  {SERIES.map(s => <td key={s.key} className="text-right px-3 py-1.5">{(d as any)[s.key]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div role="img" aria-label={summary}>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
              <defs>
                {SERIES.map(s => (
                  <linearGradient key={s.grad} id={s.grad} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 6" stroke="var(--nc-border)" vertical={false} />
              <XAxis dataKey="date" tick={axisTick} tickFormatter={dm} axisLine={false} tickLine={false} minTickGap={28} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={44} label={{ value: 'Quantidade', angle: -90, position: 'insideLeft', style: { fill: 'var(--nc-text-2)', fontSize: 10 }, offset: 22 }} />
              <Tooltip content={({ active, payload, label }: any) => active && payload?.length ? (
                <TipBox>
                  <div className="font-semibold mb-1">{dmy(String(label))}</div>
                  {payload.map((p: any) => (
                    <div key={p.dataKey} className="flex items-center justify-between gap-6">
                      <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm" style={{ background: p.stroke }} />{p.name}</span>
                      <b className="tabular-nums">{p.value}</b>
                    </div>
                  ))}
                </TipBox>
              ) : null} />
              {SERIES.map(s => !hidden.has(s.key) && (
                <Area key={s.key} name={s.label} dataKey={s.key} type="monotone" stroke={s.color} strokeWidth={2} fill={`url(#${s.grad})`} dot={false} activeDot={{ r: 4 }} />
              ))}
              {data.length > 14 && <Brush dataKey="date" height={26} travellerWidth={10} stroke="var(--nc-border)" fill="var(--nc-surface-muted)" tickFormatter={dm} />}
            </AreaChart>
          </ResponsiveContainer>
          {data.length > 14 && <p className="text-[11px] nc-muted text-center -mt-1">Arraste as alças abaixo do gráfico para ampliar um intervalo.</p>}
        </div>
      )}
    </div>
  )
}

/** Donut com legenda clicável e valores. */
export function Donut({ slices, centerLabel, centerValue, emptyText }: {
  slices: { key: string; label: string; value: number; color: string }[]
  centerLabel: string; centerValue: string; emptyText: string
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const total = slices.reduce((a, s) => a + s.value, 0)
  const shown = slices.filter(s => !hidden.has(s.key) && s.value > 0)
  if (total === 0) return <EmptyState title={emptyText} />
  return (
    <div>
      <div className="relative h-[180px]" role="img" aria-label={slices.map(s => `${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`).join('; ')}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={shown} dataKey="value" nameKey="label" innerRadius={58} outerRadius={80} paddingAngle={shown.length > 1 ? 3 : 0} stroke="none" cornerRadius={5}>
              {shown.map(s => <Cell key={s.key} fill={s.color} />)}
            </Pie>
            <Tooltip content={({ active, payload }: any) => active && payload?.length ? (
              <TipBox><b>{payload[0].name}</b>: <span className="tabular-nums">{payload[0].value}</span> ({Math.round((payload[0].value / total) * 100)}%)</TipBox>
            ) : null} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-3xl font-semibold tabular-nums">{centerValue}</span>
          <span className="text-[11px] nc-muted">{centerLabel}</span>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {slices.map(s => {
          const off = hidden.has(s.key)
          return (
            <li key={s.key}>
              <button onClick={() => setHidden(h => { const n = new Set(h); n.has(s.key) ? n.delete(s.key) : n.add(s.key); return n })} aria-pressed={!off}
                className={cn('w-full flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm min-h-[36px] hover:opacity-80', off && 'opacity-50')}>
                <span className="inline-flex items-center gap-2"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />{s.label}</span>
                <span className="tabular-nums"><b>{s.value.toLocaleString('pt-BR')}</b> <span className="nc-muted text-xs">· {Math.round((s.value / total) * 100)}%</span></span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** Mapa de calor dia da semana × hora. Zero = célula neutra; escala identificada na legenda. */
export function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(0, ...grid.flat())
  const total = grid.flat().reduce((a, b) => a + b, 0)
  const peak = useMemo(() => {
    let best = { d: 0, h: 0, v: -1 }
    grid.forEach((row, d) => row.forEach((v, h) => { if (v > best.v) best = { d, h, v } }))
    return best
  }, [grid])
  if (total === 0) return <EmptyState title="Sem atendimentos no período" hint="O mapa mostra em quais dias e horas os clientes mais chamam." />
  return (
    <div>
      <p className="text-xs nc-muted mb-3">
        Pico: <b style={{ color: 'var(--nc-text)' }}>{DOW[peak.d]} às {String(peak.h).padStart(2, '0')}h</b> ({peak.v} atendimento{peak.v === 1 ? '' : 's'}). Horário de Brasília.
      </p>
      <div className="overflow-x-auto" tabIndex={0} aria-label="Mapa de calor de atendimentos por dia da semana e hora">
        <div className="min-w-[560px]">
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: '34px repeat(24, minmax(0, 1fr))' }} role="table" aria-label="Atendimentos por dia da semana e hora">
            <div />
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="text-[9px] text-center nc-muted tabular-nums" role="columnheader">{h % 3 === 0 ? `${h}h` : ''}</div>
            ))}
            {grid.map((row, d) => (
              <div key={d} className="contents" role="row">
                <div className="text-[10px] nc-muted flex items-center" role="rowheader">{DOW[d]}</div>
                {row.map((v, h) => (
                  <div key={h} role="cell" tabIndex={-1}
                    title={`${DOW[d]} ${String(h).padStart(2, '0')}h: ${v} atendimento${v === 1 ? '' : 's'}`}
                    aria-label={`${DOW[d]} ${h}h: ${v}`}
                    className="aspect-square rounded-[4px] border"
                    style={{
                      borderColor: 'var(--nc-border)',
                      background: v === 0 ? 'var(--nc-surface-muted)' : `color-mix(in srgb, var(--nc-primary) ${Math.round(18 + (v / max) * 82)}%, transparent)`,
                    }} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 text-[11px] nc-muted">
        <span>0</span>
        <div className="h-2 w-28 rounded-full" style={{ background: 'linear-gradient(90deg, var(--nc-surface-muted), var(--nc-primary))', border: '1px solid var(--nc-border)' }} aria-hidden />
        <span>{max} (máx.)</span>
      </div>
    </div>
  )
}

/** Funil: contagem, participação e atalho (drill-down) para o Comercial. */
export function FunnelList({ stages }: { stages: { id: string; name: string; color: string; count: number }[] }) {
  const total = stages.reduce((a, s) => a + s.count, 0)
  const max = Math.max(1, ...stages.map(s => s.count))
  if (!stages.length || total === 0) return <EmptyState title="Nenhum lead no funil" hint="Os leads criados pelo agente, pelo site ou manualmente aparecem aqui, por etapa." />
  return (
    <ul className="space-y-1" aria-label="Leads por etapa do funil">
      {stages.map(s => (
        <li key={s.id}>
          <Link href="/comercial" className="block rounded-lg px-2 py-2 hover:opacity-90 min-h-[44px]" title={`Abrir ${s.name} no Comercial`}>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="inline-flex items-center gap-2 min-w-0"><i className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} aria-hidden /><span className="truncate">{s.name}</span></span>
              <span className="tabular-nums shrink-0"><b>{s.count}</b> <span className="nc-muted text-xs">· {Math.round((s.count / total) * 100)}%</span></span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--nc-surface-muted)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, (s.count / max) * 100)}%`, background: s.color }} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
