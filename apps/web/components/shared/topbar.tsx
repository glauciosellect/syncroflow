'use client'
import { Coins, Bell, LogOut, Settings, Key, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import Link from 'next/link'

const planCredits: Record<string, number> = { TRIAL: 1000, BASIC: 2500, STANDARD: 11500, CORPORATE: 30000, ENTERPRISE: 50000 }

export function Topbar() {
  const { user, workspace, logout, refreshToken } = useAuthStore()
  const router = useRouter()

  const handleLogout = async () => {
    try {
      if (refreshToken) await api.post('/auth/logout', { refreshToken })
    } catch {}
    logout()
    router.push('/login')
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-4">
        {(() => {
          const credits = workspace?.credits ?? 0
          const total = planCredits[workspace?.plan || 'TRIAL'] || 1000
          const pct = credits / total
          const isLow = pct <= 0.2 && credits > 0
          const isEmpty = credits <= 0
          return (
            <div className="flex items-center gap-1.5">
              {isEmpty ? (
                <Link href="/billing" className="flex items-center gap-1.5 text-sm bg-red-50 border border-red-200 text-red-600 px-3 py-1 rounded-lg font-medium hover:bg-red-100 transition-colors">
                  <AlertTriangle className="w-4 h-4" />
                  Sem créditos — Comprar agora
                </Link>
              ) : isLow ? (
                <Link href="/billing" className="flex items-center gap-1.5 text-sm bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1 rounded-lg hover:bg-amber-100 transition-colors">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="font-medium">{credits.toLocaleString()}</span>
                  <span className="text-amber-600">créditos restantes</span>
                </Link>
              ) : (
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Coins className="w-4 h-4 text-yellow-500" />
                  <span className="font-medium">{credits.toLocaleString()}</span>
                  <span className="text-gray-400">créditos</span>
                </div>
              )}
            </div>
          )
        })()}
        <button className="relative p-2 rounded-lg hover:bg-gray-50 text-gray-500">
          <Bell className="w-4 h-4" />
        </button>
        <div className="relative group">
          <button className="flex items-center gap-2 hover:bg-gray-50 rounded-lg px-2 py-1.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }}>
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <span className="text-sm font-medium text-gray-700">{user?.name?.split(' ')[0]}</span>
          </button>
          <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
            <div className="p-1">
              <Link href="/api-keys" className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-md hover:bg-gray-50">
                <Key className="w-4 h-4 text-gray-400" />
                Chaves de API
              </Link>
              <Link href="/settings" className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-md hover:bg-gray-50">
                <Settings className="w-4 h-4 text-gray-400" />
                Configurações
              </Link>
              <hr className="my-1 border-gray-100" />
              <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 rounded-md hover:bg-red-50 w-full">
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
