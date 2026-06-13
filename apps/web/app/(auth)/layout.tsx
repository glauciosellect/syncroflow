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
    <div className="min-h-screen flex flex-col md:flex-row">

      {/* ── Painel lateral — só aparece em telas ≥ 768px (tablet/desktop) ── */}
      <div className="hidden md:block md:w-[45%] lg:w-1/2 relative" style={{ minHeight: '100vh' }}>
        <img
          src="/criativo-auth.png"
          alt="SyncroFlow — Atendimento Inteligente que Vende 24h"
          className="sticky top-0 w-full object-cover object-center"
          style={{ height: '100vh' }}
        />
      </div>

      {/* ── Área do formulário ── */}
      <div className="flex-1 flex flex-col bg-white">

        {/* Header mobile — só em telas < 768px */}
        <div className="md:hidden relative overflow-hidden" style={{ height: '180px' }}>
          <img
            src="/criativo-auth.png"
            alt="SyncroFlow"
            className="absolute inset-0 w-full h-full object-cover object-top"
          />
          {/* Gradiente escuro na parte inferior para legibilidade da logo */}
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.65) 100%)' }}
          />
          <div className="absolute bottom-4 left-5 flex items-center gap-2">
            <img src="/icone.png" alt="" style={{ height: '28px', width: 'auto', filter: 'brightness(0) invert(1)' }} />
            <span className="text-white font-bold text-base tracking-tight" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
              SyncroFlow
            </span>
          </div>
        </div>

        {/* Formulário */}
        <div className="flex-1 flex items-center justify-center px-5 py-8 md:p-10">
          <div className="w-full max-w-sm">
            {children}
            <PwaInstallBanner />
          </div>
        </div>
      </div>

    </div>
  )
}
