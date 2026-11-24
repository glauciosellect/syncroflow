'use client'
import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Paleta neon usada em gráficos e destaques. */
export const NEON = {
  cyan: '#22D3EE',
  blue: '#3B82F6',
  violet: '#8B5CF6',
  pink: '#EC4899',
  amber: '#F59E0B',
  lime: '#84CC16',
  emerald: '#10B981',
}
export const NEON_LIST = [NEON.cyan, NEON.violet, NEON.pink, NEON.amber, NEON.emerald, NEON.blue, NEON.lime]

/** Número que "sobe" até o valor final. */
export function CountUp({ value, duration = 700, className }: { value: number; duration?: number; className?: string }) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
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

/** Variação % entre o período atual e o anterior. */
export function Delta({ value, prev, className }: { value: number; prev?: number; className?: string }) {
  if (prev === undefined || prev === null) return null
  if (prev === 0) {
    if (value === 0) return null
    return <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-500', className)}><ArrowUpRight className="w-3 h-3" />novo</span>
  }
  const diff = value - prev
  const pct = Math.round(Math.abs(diff / prev) * 100)
  if (diff > 0) return <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-500', className)}><ArrowUpRight className="w-3 h-3" />{pct}%</span>
  if (diff < 0) return <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-semibold text-rose-500', className)}><ArrowDownRight className="w-3 h-3" />{pct}%</span>
  return <span className={cn('inline-flex items-center gap-0.5 text-[11px] text-muted-foreground', className)}><Minus className="w-3 h-3" />0%</span>
}

/** Mini gráfico de linha (SVG) para dentro dos cards. */
export function Sparkline({ data, color = NEON.cyan, height = 34 }: { data: number[]; color?: string; height?: number }) {
  if (!data.length) return <div style={{ height }} />
  const w = 120
  const max = Math.max(1, ...data)
  const step = data.length > 1 ? w / (data.length - 1) : w
  const pts = data.map((v, i) => [i * step, height - 3 - (v / max) * (height - 8)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const id = `sp-${color.replace('#', '')}`
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${height} L0,${height} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Painel "vidro" com linha de brilho no topo. */
export function Panel({ title, subtitle, action, children, className, accentA, accentB, delay = 0 }: {
  title?: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode
  children: React.ReactNode; className?: string; accentA?: string; accentB?: string; delay?: number
}) {
  return (
    <section
      className={cn('sf-panel sf-rise p-5', className)}
      style={{ ['--accent-a' as any]: accentA, ['--accent-b' as any]: accentB, animationDelay: `${delay}ms` }}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 mb-4">
          <div>
            {title && <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>}
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
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
