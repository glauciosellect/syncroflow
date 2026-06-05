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
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0D47A1 0%, #1565C0 40%, #2E7D32 100%)' }}>
        {/* Círculos decorativos */}
        <div className="absolute top-[-80px] right-[-80px] w-80 h-80 rounded-full opacity-10" style={{ background: '#4CAF50' }} />
        <div className="absolute bottom-[-60px] left-[-60px] w-64 h-64 rounded-full opacity-10" style={{ background: '#29B6F6' }} />

        <div className="text-white max-w-md relative z-10">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 32C8 24 14 16 24 14C34 12 42 18 42 28C42 36 36 42 26 42L14 44L16 34C11 31 8 28 8 32Z" fill="url(#grad1)" opacity="0.9"/>
              <circle cx="18" cy="28" r="2.5" fill="white"/>
              <circle cx="24" cy="28" r="2.5" fill="white"/>
              <circle cx="30" cy="28" r="2.5" fill="white"/>
              <defs>
                <linearGradient id="grad1" x1="8" y1="14" x2="42" y2="44" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#4CAF50"/>
                  <stop offset="100%" stopColor="#29B6F6"/>
                </linearGradient>
              </defs>
            </svg>
            <div>
              <div className="text-3xl font-bold tracking-tight">
                <span style={{ color: '#69F0AE' }}>Syncro</span>
                <span className="text-white">Flow</span>
              </div>
              <div className="text-xs tracking-widest opacity-70 uppercase">Atendimento Inteligente</div>
            </div>
          </div>

          <p className="text-lg text-blue-100 mb-8 leading-relaxed">
            Plataforma de atendimento omnichannel com IA. Crie agentes inteligentes para WhatsApp, Instagram, Telegram e mais.
          </p>
          <div className="space-y-4">
            {[
              'Multi-modelo: Claude, GPT-4, Gemini',
              'WhatsApp, Instagram, Facebook, Telegram',
              'RAG inteligente com base de conhecimento',
              'Analytics avançado por atendimento',
            ].map((feat) => (
              <div key={feat} className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: '#69F0AE' }} />
                <span className="text-blue-100">{feat}</span>
              </div>
            ))}
          </div>

          <div className="mt-10 text-xs text-blue-200 opacity-60 tracking-widest uppercase">
            Fluxo que conecta.
          </div>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          {children}
          <PwaInstallBanner />
        </div>
      </div>
    </div>
  )
}
