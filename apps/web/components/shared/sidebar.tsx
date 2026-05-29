'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Bot, Users, Radio, MessageSquare, Contact, MoreHorizontal, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { planLabel } from '@/lib/utils'

const navItems = [
  { section: 'VISÃO GERAL', items: [{ href: '/dashboard', label: 'Dashboards', icon: LayoutDashboard }] },
  { section: 'CADASTROS', items: [{ href: '/agents', label: 'Agentes', icon: Bot }, { href: '/team', label: 'Equipe', icon: Users }, { href: '/channels', label: 'Canais', icon: Radio }] },
  { section: 'COMUNICAÇÃO', items: [{ href: '/chat', label: 'Chat', icon: MessageSquare }, { href: '/contacts', label: 'Contatos', icon: Contact }] },
  { section: 'CENTRAL', items: [{ href: '/more', label: 'Mais opções', icon: MoreHorizontal }] },
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
          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg text-gray-900">SyncroFlow</span>
        </div>
      </div>

      <div className="p-3 border-b border-gray-100">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">MEU WORKSPACE</div>
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-50">
          <div className="w-6 h-6 bg-violet-100 rounded-full flex items-center justify-center text-xs font-bold text-violet-600">
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
                <Link key={item.href} href={item.href} className={cn('flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-colors', active ? 'bg-violet-50 text-violet-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}>
                  <item.icon className={cn('w-4 h-4', active ? 'text-violet-600' : 'text-gray-400')} />
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-gray-100">
        {isTrialing && (
          <div className="bg-violet-50 rounded-lg p-3 mb-3">
            <div className="text-xs font-semibold text-violet-700 mb-1">Trial — {daysLeft} dias restantes</div>
            <div className="w-full bg-violet-200 rounded-full h-1.5 mb-2">
              <div className="bg-violet-600 h-1.5 rounded-full" style={{ width: `${((7 - daysLeft) / 7) * 100}%` }} />
            </div>
            <Link href="/billing" className="block text-center text-xs bg-violet-600 text-white rounded-md py-1.5 font-medium hover:bg-violet-700 transition-colors">
              Fazer upgrade
            </Link>
          </div>
        )}
        <div className="text-xs text-gray-400 text-center">{planLabel(workspace?.plan || '')} · {workspace?.credits?.toLocaleString()} créditos</div>
      </div>
    </aside>
  )
}
