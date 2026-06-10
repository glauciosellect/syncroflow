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
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0D47A1 0%, #1565C0 40%, #2E7D32 100%)' }}>
        <div className="absolute top-[-80px] right-[-80px] w-80 h-80 rounded-full opacity-10" style={{ background: '#4CAF50' }} />
        <div className="absolute bottom-[-60px] left-[-60px] w-64 h-64 rounded-full opacity-10" style={{ background: '#29B6F6' }} />
        <div className="text-white max-w-md relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <img src="/icone.png" alt="" style={{ height: '64px', width: 'auto', filter: 'brightness(0) invert(1)' }} />
            <img src="/logotipo.png" alt="SyncroFlow" style={{ height: '44px', width: 'auto', filter: 'brightness(0) invert(1)' }} />
          </div>
          <p className="text-lg text-blue-100 mb-8 leading-relaxed">
            Plataforma de atendimento omnichannel com IA. Crie agentes inteligentes para WhatsApp, Instagram, Facebook e mais.
          </p>
          <div className="space-y-4">
            {['Multi-modelo: Claude, GPT-4o e mais', 'WhatsApp, Instagram, Facebook', 'RAG inteligente com base de conhecimento', 'Analytics avançado por atendimento'].map((feat) => (
              <div key={feat} className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: '#69F0AE' }} />
                <span className="text-blue-100">{feat}</span>
              </div>
            ))}
          </div>
          <div className="mt-10 text-xs text-blue-200 opacity-60 tracking-widest uppercase">Fluxo que conecta.</div>
        </div>
      </div>

      {/* Área do formulário — ocupa tudo no mobile */}
      <div className="flex-1 flex flex-col bg-white dark:bg-[hsl(var(--background))]">
        {/* Header mobile — logo no topo */}
        <div className="lg:hidden flex items-center justify-center pt-10 pb-6 px-6"
          style={{ background: 'linear-gradient(135deg, #1A3A8F 0%, #3DBE29 100%)' }}>
          <div className="flex items-center gap-3">
            <img src="/icone.png" alt="" style={{ height: '40px', width: 'auto', filter: 'brightness(0) invert(1)' }} />
            <span className="text-white font-bold text-xl tracking-tight">SyncroFlow</span>
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
