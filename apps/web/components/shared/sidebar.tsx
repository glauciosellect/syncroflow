'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Bot, Users, MessageSquare, Contact, Settings, TrendingUp, CalendarDays, X, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { planLabel } from '@/lib/utils'
import { useState, useEffect } from 'react'

const navItems = [
  { section: 'VISÃO GERAL', items: [{ href: '/dashboard', label: 'Dashboards', icon: LayoutDashboard }] },
  { section: 'CADASTROS', items: [{ href: '/agents', label: 'Agentes', icon: Bot }, { href: '/team', label: 'Equipe', icon: Users }] },
  { section: 'COMERCIAL', items: [{ href: '/comercial', label: 'Comercial', icon: TrendingUp }] },
  { section: 'COMUNICAÇÃO', items: [{ href: '/chat', label: 'Chat', icon: MessageSquare }, { href: '/contacts', label: 'Contatos', icon: Contact }] },
  { section: 'AGENDA', items: [{ href: '/agenda', label: 'Agenda', icon: CalendarDays }] },
  { section: 'SISTEMA', items: [{ href: '/settings', label: 'Configurações', icon: Settings }] },
]

export function Sidebar() {
  const pathname = usePathname()
  const { workspace } = useAuthStore()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isTrialing = workspace?.plan === 'TRIAL'
  const trialEnds = workspace?.trialEndsAt ? new Date(workspace.trialEndsAt) : null
  const daysLeft = trialEnds ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0

  useEffect(() => { setMobileOpen(false) }, [pathname])

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-[hsl(var(--sidebar-bg))]">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-[hsl(var(--sidebar-border))] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="SyncroFlow"
            width={130}
            height={44}
            className="object-contain"
            priority
          />
        </div>
        <button
          className="md:hidden p-1.5 rounded-md text-[hsl(var(--sidebar-fg))] hover:bg-[hsl(var(--sidebar-hover-bg))] transition-colors"
          onClick={() => setMobileOpen(false)}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Workspace */}
      <div className="px-3 py-3 border-b border-[hsl(var(--sidebar-border))] shrink-0">
        <div className="text-[10px] font-semibold text-[hsl(var(--sidebar-section))] uppercase tracking-widest mb-2 px-2">
          MEU WORKSPACE
        </div>
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-[hsl(var(--sidebar-hover-bg))]">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
            style={{ background: 'linear-gradient(135deg, #3DBE29 0%, #1A3A8F 100%)' }}
          >
            {workspace?.name?.[0]?.toUpperCase()}
          </div>
          <span className="text-sm font-medium text-[hsl(var(--sidebar-fg))] truncate leading-tight">
            {workspace?.name}
          </span>
        </div>
      </div>

      {/* Navegação */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {navItems.map((group) => (
          <div key={group.section}>
            <div className="text-[10px] font-semibold text-[hsl(var(--sidebar-section))] uppercase tracking-widest px-2 mb-1.5">
              {group.section}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                      active
                        ? 'bg-[hsl(var(--sidebar-active-bg))] text-[hsl(var(--sidebar-active-fg))] shadow-sm'
                        : 'text-[hsl(var(--sidebar-fg))] hover:bg-[hsl(var(--sidebar-hover-bg))] hover:text-[hsl(var(--sidebar-active-fg))]'
                    )}
                  >
                    <item.icon className={cn('w-4 h-4 shrink-0', active ? 'opacity-100' : 'opacity-60')} />
                    {item.label}
                    {active && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#3DBE29] shrink-0" />
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Rodapé */}
      <div className="px-3 py-3 border-t border-[hsl(var(--sidebar-border))] shrink-0">
        {isTrialing && (
          <div className="rounded-xl p-3 mb-3" style={{ background: 'linear-gradient(135deg, rgba(61,190,41,0.15) 0%, rgba(26,58,143,0.25) 100%)', border: '1px solid rgba(61,190,41,0.2)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#3DBE29]">Trial</span>
              <span className="text-xs text-[hsl(var(--sidebar-fg))]">{daysLeft} dias restantes</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-1 mb-2.5">
              <div
                className="h-1 rounded-full transition-all"
                style={{
                  width: `${Math.max(5, ((14 - daysLeft) / 14) * 100)}%`,
                  background: 'linear-gradient(90deg, #3DBE29 0%, #1A3A8F 100%)',
                }}
              />
            </div>
            <Link
              href="/settings?tab=billing"
              className="block text-center text-xs text-white rounded-lg py-1.5 font-semibold transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #3DBE29 0%, #1A3A8F 100%)' }}
            >
              Fazer upgrade
            </Link>
          </div>
        )}
        <div className="text-[11px] text-[hsl(var(--sidebar-section))] text-center">
          {planLabel(workspace?.plan || '')} · {workspace?.credits?.toLocaleString()} créditos
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Botão hamburger mobile */}
      <button
        className="md:hidden fixed top-3 left-3 z-50 p-2 bg-[hsl(var(--sidebar-bg))] rounded-lg shadow-lg border border-[hsl(var(--sidebar-border))]"
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menu"
      >
        <Menu className="w-5 h-5 text-[hsl(var(--sidebar-fg))]" />
      </button>

      {/* Overlay mobile */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-60 flex-col h-full shrink-0 border-r border-[hsl(var(--sidebar-border))]">
        <SidebarContent />
      </aside>

      {/* Sidebar mobile */}
      <aside className={cn(
        'md:hidden fixed inset-y-0 left-0 z-50 w-72 flex flex-col h-full transition-transform duration-300 ease-in-out border-r border-[hsl(var(--sidebar-border))]',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <SidebarContent />
      </aside>
    </>
  )
}
