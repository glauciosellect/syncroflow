'use client'
import { AlertTriangle, Info, RefreshCw, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CountUp, Delta, Sparkline } from '@/components/futuristic'

/** Cartão padrão do dashboard. */
export function Card({ title, subtitle, action, children, className, id, glass }: {
  title?: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode
  className?: string; id?: string; glass?: boolean
}) {
  const hid = id ? `${id}-title` : undefined
  return (
    <section aria-labelledby={title ? hid : undefined} className={cn('nc-card nc-in', glass && 'nc-glass', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            {title && <h3 id={hid} className="text-sm font-semibold tracking-tight">{title}</h3>}
            {subtitle && <p className="text-xs nc-muted mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

/** Ícone de ajuda com a definição do indicador (acessível por foco e por leitor de tela). */
export function InfoTip({ text }: { text: string }) {
  return (
    <span tabIndex={0} role="img" aria-label={`Definição: ${text}`} title={text}
      className="inline-flex nc-muted hover:opacity-80 cursor-help align-middle nc-focus">
      <Info className="w-3.5 h-3.5" aria-hidden />
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('nc-skel', className)} aria-hidden />
}

export function EmptyState({ title, hint, icon: Icon = Inbox }: { title: string; hint?: string; icon?: any }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4">
      <span className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: 'var(--nc-surface-muted)' }}>
        <Icon className="w-5 h-5 nc-muted" aria-hidden />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-xs nc-muted mt-1 max-w-xs">{hint}</p>}
    </div>
  )
}

export function ErrorState({ title = 'Não foi possível carregar', hint, onRetry, compact }: { title?: string; hint?: string; onRetry?: () => void; compact?: boolean }) {
  return (
    <div role="alert" className={cn('flex items-center gap-3 rounded-xl border px-4 py-3', compact ? 'text-xs' : 'text-sm')}
      style={{ borderColor: 'color-mix(in srgb, var(--nc-danger) 40%, transparent)', background: 'color-mix(in srgb, var(--nc-danger) 8%, transparent)' }}>
      <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: 'var(--nc-danger)' }} aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="font-medium">{title}</p>
        {hint && <p className="nc-muted text-xs mt-0.5">{hint}</p>}
      </div>
      {onRetry && (
        <button onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:opacity-80 min-h-[36px]"
          style={{ borderColor: 'var(--nc-border)' }}>
          <RefreshCw className="w-3.5 h-3.5" aria-hidden />Tentar de novo
        </button>
      )}
    </div>
  )
}

/** KPI: rótulo, valor, variação com sentido, contexto do período e definição. */
export function Kpi({ label, value, suffix, prev, good = 'up', points, spark, color = 'var(--nc-primary)', context, definition, icon: Icon, loading, delay = 0 }: {
  label: string; value?: number; suffix?: string; prev?: number | null; good?: 'up' | 'down' | 'neutral'; points?: boolean
  spark?: number[]; color?: string; context?: string; definition: string; icon: any; loading?: boolean; delay?: number
}) {
  return (
    <div className="nc-card nc-in !p-4 flex flex-col" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-medium nc-muted min-w-0">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
            <Icon className="w-4 h-4" aria-hidden />
          </span>
          <span className="truncate">{label}</span>
        </span>
        <InfoTip text={definition} />
      </div>
      <div className="mt-3 flex items-baseline gap-1.5 flex-wrap">
        {loading || value === undefined ? <Skeleton className="h-8 w-20" /> : (
          <>
            <CountUp value={value} className="text-3xl font-semibold tabular-nums tracking-tight" />
            {suffix && <span className="text-base font-medium nc-muted">{suffix}</span>}
            {prev !== undefined && <Delta value={value} prev={prev} good={good} points={points} className="ml-1" />}
          </>
        )}
      </div>
      {context && <p className="text-[11px] nc-muted mt-1">{context}</p>}
      {spark && spark.length > 1 && <div className="mt-2 -mx-1"><Sparkline data={spark} color={color} /></div>}
    </div>
  )
}

/** Baixa um CSV (com BOM para abrir certo no Excel). */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export const fmtDate = (iso: string | Date, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }) =>
  new Date(iso).toLocaleDateString('pt-BR', opts)
