'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { Sidebar } from '@/components/shared/sidebar'
import { Topbar } from '@/components/shared/topbar'
import { useSocketConnect } from '@/hooks/use-socket'
import { AlertTriangle } from 'lucide-react'
import Link from 'next/link'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const user = useAuthStore((s) => s.user)
  const workspace = useAuthStore((s) => s.workspace)
  const [hydrated, setHydrated] = useState(false)

  useSocketConnect()

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated && !user) router.push('/login')
  }, [hydrated, user, router])

  if (!hydrated || !user) return null

  const isTrialExpired = workspace?.plan === 'TRIAL' &&
    workspace?.trialEndsAt &&
    new Date(workspace.trialEndsAt) < new Date()

  // Permite acessar apenas /billing quando trial expirado
  const isBillingPage = pathname.startsWith('/billing')

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />

        {/* Banner trial expirado — aparece em todas as páginas exceto /billing */}
        {isTrialExpired && !isBillingPage && (
          <div className="bg-red-600 text-white px-4 py-2.5 flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Seu período de teste expirou. Assine um plano para continuar usando o SyncroFlow.</span>
            </div>
            <Link
              href="/billing"
              className="shrink-0 bg-white text-red-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
            >
              Ver planos
            </Link>
          </div>
        )}

        <main className="flex-1 overflow-auto p-6">
          {/* Bloqueia conteúdo quando trial expirado (exceto página de billing) */}
          {isTrialExpired && !isBillingPage ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4">
              <AlertTriangle className="w-12 h-12 text-red-400" />
              <div>
                <h2 className="text-xl font-bold text-gray-800">Acesso suspenso</h2>
                <p className="text-gray-500 mt-1 max-w-sm">
                  Seu trial de 14 dias expirou. Assine um plano para voltar a usar o SyncroFlow.
                </p>
              </div>
              <Link
                href="/billing"
                className="bg-[#1565C0] text-white font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity"
              >
                Escolher plano
              </Link>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  )
}
