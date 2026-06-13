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
    <>
      {/* ════════════════════════════════════════════
          DESKTOP — lado a lado, imagem fixa na metade
          Aparece somente em telas ≥ 768px
      ════════════════════════════════════════════ */}
      <div className="hidden md:flex h-screen overflow-hidden">
        {/* Painel esquerdo — imagem */}
        <div className="w-1/2 h-screen overflow-hidden shrink-0">
          <img
            src="/criativo-auth.png"
            alt="SyncroFlow"
            className="w-full h-full object-cover object-center"
          />
        </div>
        {/* Painel direito — formulário */}
        <div className="w-1/2 h-screen overflow-y-auto flex items-center justify-center bg-white p-8">
          <div className="w-full max-w-sm">
            {children}
            <PwaInstallBanner />
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          MOBILE — tela inteira, sem painel lateral
          Aparece somente em telas < 768px
      ════════════════════════════════════════════ */}
      <div className="flex md:hidden min-h-screen flex-col bg-white">
        {/* Topo: faixa com criativo */}
        <div className="relative w-full overflow-hidden" style={{ height: '160px' }}>
          <img
            src="/criativo-auth.png"
            alt="SyncroFlow"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: 'center 20%' }}
          />
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.7) 100%)' }}
          />
          <div className="absolute bottom-3 left-4 flex items-center gap-2">
            <img src="/icone.png" alt="" style={{ height: '26px', filter: 'brightness(0) invert(1)' }} />
            <span className="text-white font-bold text-base" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
              SyncroFlow
            </span>
          </div>
        </div>
        {/* Formulário */}
        <div className="flex-1 flex items-start justify-center px-5 pt-6 pb-10">
          <div className="w-full max-w-sm">
            {children}
            <PwaInstallBanner />
          </div>
        </div>
      </div>
    </>
  )
}
