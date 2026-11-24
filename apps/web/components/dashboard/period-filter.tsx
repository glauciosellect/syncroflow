'use client'
import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarRange } from 'lucide-react'
import { cn } from '@/lib/utils'

export const PRESETS = [7, 30, 60, 90] as const
const MAX_DAYS = 365

export type Period = { start: string; end: string; days: number; key: string; custom: boolean }

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Lê o período da URL (?dias=30 ou ?de=AAAA-MM-DD&ate=AAAA-MM-DD). Filtro global: vale para todo o painel. */
export function usePeriod(): Period {
  const sp = useSearchParams()
  const de = sp.get('de'); const ate = sp.get('ate'); const dias = Number(sp.get('dias'))
  return useMemo(() => {
    const re = /^\d{4}-\d{2}-\d{2}$/
    if (de && ate && re.test(de) && re.test(ate)) {
      const s = new Date(`${de}T00:00:00`); const e = new Date(`${ate}T23:59:59`)
      if (!isNaN(+s) && !isNaN(+e) && e >= s && (+e - +s) / 86400000 <= MAX_DAYS) {
        return { start: s.toISOString(), end: e.toISOString(), days: Math.ceil((+e - +s) / 86400000), key: `${de}_${ate}`, custom: true }
      }
    }
    const d = (PRESETS as readonly number[]).includes(dias) ? dias : 30
    const now = new Date()
    return { start: new Date(now.getTime() - d * 86400000).toISOString(), end: now.toISOString(), days: d, key: `d${d}`, custom: false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [de, ate, dias])
}

export function PeriodFilter({ period }: { period: Period }) {
  const router = useRouter(); const pathname = usePathname()
  const [open, setOpen] = useState(period.custom)
  const [from, setFrom] = useState(ymd(new Date(period.start))); const [to, setTo] = useState(ymd(new Date(period.end)))
  const invalid = !from || !to || from > to || (+new Date(to) - +new Date(from)) / 86400000 > MAX_DAYS

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-1 rounded-xl p-1" style={{ background: 'var(--nc-surface-muted)', border: '1px solid var(--nc-border)' }} role="group" aria-label="Período">
        {PRESETS.map(d => (
          <button key={d} onClick={() => { setOpen(false); router.replace(`${pathname}?dias=${d}`, { scroll: false }) }} aria-pressed={!period.custom && period.days === d}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium min-h-[36px] transition-colors')}
            style={!period.custom && period.days === d ? { background: 'var(--nc-surface)', color: 'var(--nc-primary)', boxShadow: 'var(--nc-shadow)' } : { color: 'var(--nc-text-2)' }}>
            {d} dias
          </button>
        ))}
        <button onClick={() => setOpen(o => !o)} aria-expanded={open} aria-pressed={period.custom}
          className="px-3 py-1.5 rounded-lg text-xs font-medium min-h-[36px] inline-flex items-center gap-1.5"
          style={period.custom ? { background: 'var(--nc-surface)', color: 'var(--nc-primary)', boxShadow: 'var(--nc-shadow)' } : { color: 'var(--nc-text-2)' }}>
          <CalendarRange className="w-3.5 h-3.5" aria-hidden />Personalizado
        </button>
      </div>
      {open && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); if (!invalid) router.replace(`${pathname}?de=${from}&ate=${to}`, { scroll: false }) }}>
          <label className="text-xs nc-muted">De<input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} className="block mt-1 rounded-lg border bg-transparent px-2 py-1.5 text-sm min-h-[40px]" style={{ borderColor: 'var(--nc-border)', color: 'var(--nc-text)' }} /></label>
          <label className="text-xs nc-muted">Até<input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} className="block mt-1 rounded-lg border bg-transparent px-2 py-1.5 text-sm min-h-[40px]" style={{ borderColor: 'var(--nc-border)', color: 'var(--nc-text)' }} /></label>
          <button type="submit" disabled={invalid} className="rounded-lg px-3 py-2 text-sm font-medium min-h-[40px] disabled:opacity-50" style={{ background: 'var(--nc-primary)', color: 'var(--nc-bg)' }}>Aplicar</button>
          {invalid && <span role="alert" className="text-xs" style={{ color: 'var(--nc-danger)' }}>Datas inválidas (máx. {MAX_DAYS} dias).</span>}
        </form>
      )}
    </div>
  )
}
