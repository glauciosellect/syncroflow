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
      onClick={async () => {
        prompt.prompt()
        const { outcome } = await prompt.userChoice
        if (outcome === 'accepted') setInstalled(true)
      }}
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
        html, body { margin: 0; padding: 0; }

        /* ══ MOBILE (padrão, < 768px) ══════════════════════════════════════ */
        .al-root {
          display: block;
          min-height: 100vh;
          background: #fff;
        }

        /* Faixa do criativo no topo */
        .al-banner {
          position: relative;
          width: 100%;
          height: 160px;
          overflow: hidden;
        }
        .al-banner-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 20%;
        }
        .al-banner-grad {
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.6) 100%);
        }
        .al-banner-logo {
          position: absolute;
          bottom: 12px;
          left: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .al-banner-logo img { height: 24px; filter: brightness(0) invert(1); }
        .al-banner-logo span {
          color: #fff;
          font-weight: 700;
          font-size: 15px;
          text-shadow: 0 1px 4px rgba(0,0,0,0.7);
        }

        /* Formulário */
        .al-form {
          display: flex;
          justify-content: center;
          padding: 28px 20px 48px;
        }
        .al-form-inner { width: 100%; max-width: 380px; }

        /* Painel desktop — oculto no mobile */
        .al-desktop-panel { display: none; }

        /* ══ DESKTOP (>= 768px) ═════════════════════════════════════════════ */
        @media (min-width: 768px) {

          /* Grid de 2 colunas, cada uma com 100vh — a página não cresce */
          .al-root {
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 100vh;
            height: 100vh;
            overflow: hidden;
          }

          /* Coluna esquerda: painel da imagem */
          .al-desktop-panel {
            display: block;
            grid-column: 1;
            grid-row: 1;
            height: 100vh;
            overflow: hidden;
          }
          .al-desktop-panel img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center top;
            display: block;
          }

          /* Coluna direita: formulário */
          .al-right-col {
            grid-column: 2;
            grid-row: 1;
            height: 100vh;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            background: #fff;
          }

          /* Esconde faixa mobile */
          .al-banner { display: none; }

          /* Centraliza formulário no desktop */
          .al-form {
            flex: 1;
            align-items: center;
            padding: 40px 48px;
          }
        }
      `}</style>

      <div className="al-root">

        {/* ── Desktop: painel esquerdo ── */}
        <div className="al-desktop-panel">
          <img src="/criativo-auth.png" alt="SyncroFlow" />
        </div>

        {/* ── Coluna direita (e tudo no mobile) ── */}
        <div className="al-right-col" style={{ display:'flex', flexDirection:'column', background:'#fff' }}>

          {/* Faixa criativo — só mobile */}
          <div className="al-banner">
            <img className="al-banner-img" src="/criativo-auth.png" alt="" />
            <div className="al-banner-grad" />
            <div className="al-banner-logo">
              <img src="/icone.png" alt="" />
              <span>SyncroFlow</span>
            </div>
          </div>

          {/* Formulário */}
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
