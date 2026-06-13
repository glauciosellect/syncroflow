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
      <style>{`
        .auth-wrapper {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: #fff;
        }

        /* Faixa do criativo no topo — mobile */
        .auth-banner {
          position: relative;
          width: 100%;
          height: 170px;
          overflow: hidden;
          flex-shrink: 0;
        }
        .auth-banner img.criativo {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 20%;
        }
        .auth-banner .overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.65) 100%);
        }
        .auth-banner .brand {
          position: absolute;
          bottom: 12px;
          left: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .auth-banner .brand img {
          height: 28px;
          filter: brightness(0) invert(1);
        }
        .auth-banner .brand span {
          color: #fff;
          font-weight: 700;
          font-size: 16px;
          text-shadow: 0 1px 4px rgba(0,0,0,0.6);
        }

        /* Painel lateral — oculto no mobile */
        .auth-side {
          display: none;
        }

        /* Área do formulário */
        .auth-form-area {
          flex: 1;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 24px 20px 40px;
        }
        .auth-form-inner {
          width: 100%;
          max-width: 360px;
        }

        /* Desktop: >= 768px */
        @media (min-width: 768px) {
          .auth-wrapper {
            flex-direction: row;
            height: 100vh;
            overflow: hidden;
          }
          .auth-banner {
            display: none;
          }
          .auth-side {
            display: block;
            width: 50%;
            flex-shrink: 0;
            height: 100vh;
            overflow: hidden;
          }
          .auth-side img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center center;
          }
          .auth-form-area {
            width: 50%;
            height: 100vh;
            overflow-y: auto;
            align-items: center;
            padding: 40px 32px;
          }
        }
      `}</style>

      <div className="auth-wrapper">

        {/* Painel esquerdo — criativo (desktop) */}
        <div className="auth-side">
          <img src="/criativo-auth.png" alt="SyncroFlow — Atendimento Inteligente que Vende 24h" />
        </div>

        {/* Área direita / mobile */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: '#fff' }}>

          {/* Faixa do criativo no topo — mobile */}
          <div className="auth-banner">
            <img className="criativo" src="/criativo-auth.png" alt="SyncroFlow" />
            <div className="overlay" />
            <div className="brand">
              <img src="/icone.png" alt="" />
              <span>SyncroFlow</span>
            </div>
          </div>

          {/* Formulário */}
          <div className="auth-form-area">
            <div className="auth-form-inner">
              {children}
              <PwaInstallBanner />
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
