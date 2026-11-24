'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Cores de destaque (hex, para quem compõe transparência). Gráficos do dashboard usam os tokens CSS --nc-*. */
export const NEON = {
  cyan: '#0E9FC9',
  blue: '#2377C8',
  violet: '#7857D6',
  pink: '#D6477A',
  amber: '#D68A1F',
  lime: '#6FA32A',
  emerald: '#16A36E',
}
export const NEON_LIST = [NEON.cyan, NEON.violet, NEON.pink, NEON.amber, NEON.emerald, NEON.blue, NEON.lime]

/** Número que "sobe" até o valor final (sem animar se o usuário pediu menos movimento). */
export function CountUp({ value, duration = 600, className }: { value: number; duration?: number; className?: string }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setShown(value); from.current = value; return }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(Math.round(a + (value - a) * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <span className={className}>{shown.toLocaleString('pt-BR')}</span>
}

/**
 * Variação em relação ao período anterior. `good` diz o sentido do indicador:
 * 'up' = subir é bom, 'down' = subir é ruim, 'neutral' = sem juízo de valor.
 * Sempre acompanhada de texto e ícone (nunca só cor).
 */
export function Delta({ value, prev, good = 'up', points, className }: { value: number; prev?: number | null; good?: 'up' | 'down' | 'neutral'; points?: boolean; className?: string }) {
  if (prev === undefined || prev === null) return null
  if (prev === 0 && !points) {
    if (value === 0) return null
    return <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-semibold nc-muted', className)}><Minus className="w-3 h-3" aria-hidden />sem base anterior</span>
  }
  const diff = value - prev
  const pct = Math.round(Math.abs(diff / prev) * 100)
  const up = diff > 0
  const tone = diff === 0 || good === 'neutral' ? 'var(--nc-text-2)' : (up === (good === 'up') ? 'var(--nc-success)' : 'var(--nc-danger)')
  const Icon = diff === 0 ? Minus : up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums', className)} style={{ color: tone }}>
      <Icon className="w-3 h-3" aria-hidden />
      {diff === 0 ? (points ? '0 p.p.' : '0%') : points ? `${up ? '+' : '−'}${Math.abs(diff)} p.p.` : `${up ? '+' : '−'}${pct}%`}
      <span className="sr-only"> em relação ao período anterior ({prev.toLocaleString('pt-BR')} antes)</span>
    </span>
  )
}

/** Mini gráfico de linha (SVG) para dentro dos cards. Decorativo: o valor exato está no próprio card. */
export function Sparkline({ data, color = 'var(--nc-primary)', height = 32 }: { data: number[]; color?: string; height?: number }) {
  const uid = useId().replace(/:/g, '')
  if (!data.length) return <div style={{ height }} />
  const w = 120
  const max = Math.max(1, ...data)
  const step = data.length > 1 ? w / (data.length - 1) : w
  const pts = data.map((v, i) => [i * step, height - 3 - (v / max) * (height - 8)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden focusable="false">
      <defs>
        <linearGradient id={`sp${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${height} L0,${height} Z`} fill={`url(#sp${uid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Painel padrão (usado no Comercial). */
export function Panel({ title, subtitle, action, children, className, accentA, accentB, delay = 0 }: {
  title?: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode
  children: React.ReactNode; className?: string; accentA?: string; accentB?: string; delay?: number
}) {
  return (
    <section
      className={cn('sf-panel nc-in p-5', className)}
      style={{ ['--accent-a' as any]: accentA, ['--accent-b' as any]: accentB, animationDelay: `${delay}ms` }}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 mb-4">
          <div>
            {title && <h3 className="text-sm font-semibold tracking-tight" style={{ color: 'var(--nc-text)' }}>{title}</h3>}
            {subtitle && <p className="text-xs nc-muted mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

/** Tempo relativo curto: "há 5 min". */
export function timeAgo(iso?: string | Date | null) {
  if (!iso) return ''
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'agora'
  const m = Math.floor(s / 60)
  if (m < 60) return `há ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h} h`
  return `há ${Math.floor(h / 24)} d`
}
