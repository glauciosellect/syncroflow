'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Bot, Users, MessageSquare, Contact, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { planLabel } from '@/lib/utils'

const navItems = [
  { section: 'VISÃO GERAL', items: [{ href: '/dashboard', label: 'Dashboards', icon: LayoutDashboard }] },
  { section: 'CADASTROS', items: [{ href: '/agents', label: 'Agentes', icon: Bot }, { href: '/team', label: 'Equipe', icon: Users }] },
  { section: 'COMUNICAÇÃO', items: [{ href: '/chat', label: 'Chat', icon: MessageSquare }, { href: '/contacts', label: 'Contatos', icon: Contact }] },
  { section: 'SISTEMA', items: [{ href: '/settings', label: 'Configurações', icon: Settings }] },
]

export function Sidebar() {
  const pathname = usePathname()
  const { workspace } = useAuthStore()

  const isTrialing = workspace?.plan === 'TRIAL'
  const trialEnds = workspace?.trialEndsAt ? new Date(workspace.trialEndsAt) : null
  const daysLeft = trialEnds ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 32C8 24 14 16 24 14C34 12 42 18 42 28C42 36 36 42 26 42L14 44L16 34C11 31 8 28 8 32Z" fill="url(#sbgrad)"/>
            <circle cx="18" cy="28" r="2.5" fill="white"/>
            <circle cx="24" cy="28" r="2.5" fill="white"/>
            <circle cx="30" cy="28" r="2.5" fill="white"/>
            <defs>
              <linearGradient id="sbgrad" x1="8" y1="14" x2="42" y2="44" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#4CAF50"/>
                <stop offset="100%" stopColor="#1565C0"/>
              </linearGradient>
            </defs>
          </svg>
          <span className="font-bold text-lg" style={{ background: 'linear-gradient(135deg, #2E7D32, #1565C0)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>SyncroFlow</span>
        </div>
      </div>

      <div className="p-3 border-b border-gray-100">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">MEU WORKSPACE</div>
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-50">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }}>
            {workspace?.name?.[0]?.toUpperCase()}
          </div>
          <span className="text-sm font-medium text-gray-700 truncate">{workspace?.name}</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-4">
        {navItems.map((group) => (
          <div key={group.section}>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">{group.section}</div>
            {group.items.map((item) => {
              const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
              return (
                <Link key={item.href} href={item.href} className={cn('flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-colors', active ? 'bg-blue-50 text-[#1565C0]' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}>
                  <item.icon className={cn('w-4 h-4', active ? 'text-[#1565C0]' : 'text-gray-400')} />
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-gray-100">
        {isTrialing && (
          <div className="bg-blue-50 rounded-lg p-3 mb-3">
            <div className="text-xs font-semibold text-[#1565C0] mb-1">Trial — {daysLeft} dias restantes</div>
            <div className="w-full bg-blue-200 rounded-full h-1.5 mb-2">
              <div className="h-1.5 rounded-full" style={{ width: `${((7 - daysLeft) / 7) * 100}%`, background: 'linear-gradient(90deg, #1565C0, #2E7D32)' }} />
            </div>
            <Link href="/settings?tab=billing" className="block text-center text-xs text-white rounded-md py-1.5 font-medium transition-colors hover:opacity-90" style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }}>
              Fazer upgrade
            </Link>
          </div>
        )}
        <div className="text-xs text-gray-400 text-center">{planLabel(workspace?.plan || '')} · {workspace?.credits?.toLocaleString()} créditos</div>
      </div>
    </aside>
  )
}
