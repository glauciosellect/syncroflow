'use client'
import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'

function PwaInstallBanner() {
  const [prompt, setPrompt] = useState<any>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => setInstalled(true))
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (installed || !prompt) return null

  return (
    <button
      onClick={async () => { prompt.prompt(); const { outcome } = await prompt.userChoice; if (outcome === 'accepted') setInstalled(true) }}
      className="flex items-center gap-2 w-full mt-4 px-4 py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-[#1565C0] text-sm font-medium hover:bg-blue-100 transition-colors"
    >
      <Download className="w-4 h-4 shrink-0" />
      <span>Instalar SyncroFlow no seu dispositivo</span>
    </button>
  )
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Painel lateral — só desktop */}
      <div className="hidden lg:block lg:w-1/2 relative overflow-hidden">
        <img
          src="/criativo-auth.png"
          alt="SyncroFlow — Atendimento Inteligente que Vende 24h"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
      </div>

      {/* Área do formulário — ocupa tudo no mobile */}
      <div className="flex-1 flex flex-col bg-white dark:bg-[hsl(var(--background))]">
        {/* Header mobile — criativo como fundo */}
        <div className="lg:hidden relative overflow-hidden" style={{ height: '200px' }}>
          <img
            src="/criativo-auth.png"
            alt="SyncroFlow"
            className="absolute inset-0 w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.55) 100%)' }} />
          <div className="absolute bottom-4 left-5 flex items-center gap-2">
            <img src="/icone.png" alt="" style={{ height: '32px', width: 'auto', filter: 'brightness(0) invert(1)' }} />
            <span className="text-white font-bold text-lg tracking-tight drop-shadow">SyncroFlow</span>
          </div>
        </div>

        {/* Form centralizado */}
        <div className="flex-1 flex items-start lg:items-center justify-center px-5 py-8 lg:p-8">
          <div className="w-full max-w-sm lg:max-w-md">
            {children}
            <PwaInstallBanner />
          </div>
        </div>
      </div>
    </div>
  )
}
