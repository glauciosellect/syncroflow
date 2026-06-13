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
      style={{ display:'flex', alignItems:'center', gap:'8px', width:'100%', marginTop:'16px', padding:'10px 16px', borderRadius:'12px', border:'1px solid #BFDBFE', background:'#EFF6FF', color:'#1565C0', fontSize:'14px', fontWeight:500, cursor:'pointer' }}
    >
      <Download style={{ width:16, height:16, flexShrink:0 }} />
      <span>Instalar SyncroFlow no seu dispositivo</span>
    </button>
  )
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        /* ── Reset base ── */
        .al-root { display: flex; min-height: 100vh; background: #fff; }

        /* ── Mobile: coluna única ── */
        .al-panel { display: none; }

        .al-right {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: #fff;
        }

        /* faixa criativo topo */
        .al-banner {
          position: relative;
          width: 100%;
          height: 160px;
          overflow: hidden;
          flex-shrink: 0;
        }
        .al-banner img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 22%;
        }
        .al-banner-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.65) 100%);
        }
        .al-banner-brand {
          position: absolute;
          bottom: 12px;
          left: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .al-banner-brand img { height: 26px; filter: brightness(0) invert(1); }
        .al-banner-brand span {
          color: #fff;
          font-weight: 700;
          font-size: 15px;
          text-shadow: 0 1px 4px rgba(0,0,0,0.7);
        }

        /* área do formulário */
        .al-form {
          flex: 1;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 28px 20px 48px;
        }
        .al-form-inner {
          width: 100%;
          max-width: 380px;
        }

        /* ── Desktop: lado a lado ── */
        @media (min-width: 768px) {
          .al-root {
            flex-direction: row;
            height: 100vh;
            overflow: hidden;
          }

          /* painel esquerdo com criativo */
          .al-panel {
            display: block;
            width: 50%;
            flex-shrink: 0;
            height: 100vh;
            overflow: hidden;
          }
          .al-panel img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center center;
            display: block;
          }

          /* lado direito */
          .al-right {
            width: 50%;
            height: 100vh;
            overflow-y: auto;
          }

          /* esconde faixa mobile */
          .al-banner { display: none; }

          /* centraliza formulário vertical e horizontal */
          .al-form {
            height: 100%;
            align-items: center;
            justify-content: center;
            padding: 40px 48px;
          }
        }
      `}</style>

      <div className="al-root">
        {/* Painel esquerdo — criativo — só desktop */}
        <div className="al-panel">
          <img src="/criativo-auth.png" alt="SyncroFlow — Atendimento Inteligente que Vende 24h" />
        </div>

        {/* Coluna direita — mobile ocupa tudo, desktop ocupa 50% */}
        <div className="al-right">
          {/* Faixa criativo no topo — só mobile */}
          <div className="al-banner">
            <img src="/criativo-auth.png" alt="" />
            <div className="al-banner-overlay" />
            <div className="al-banner-brand">
              <img src="/icone.png" alt="" />
              <span>SyncroFlow</span>
            </div>
          </div>

          {/* Formulário centralizado */}
          <div className="al-form">
            <div className="al-form-inner">
              {children}
              <PwaInstallBanner />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
