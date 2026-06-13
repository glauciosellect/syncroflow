'use client'
import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import Image from 'next/image'

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
        html, body { margin: 0; padding: 0; height: 100%; }

        /* ── MOBILE (< 768px) ─────────────────────────────── */

        /* Faixa criativo no topo */
        .al-banner {
          position: relative;
          width: 100%;
          height: 160px;
          overflow: hidden;
          display: block;
        }
        .al-banner-grad {
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0.05), rgba(0,0,0,0.65));
          z-index: 1;
        }
        .al-banner-logo {
          position: absolute;
          bottom: 12px;
          left: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          z-index: 2;
        }
        .al-banner-logo img { height: 24px; filter: brightness(0) invert(1); }
        .al-banner-logo span {
          color: #fff;
          font-weight: 700;
          font-size: 15px;
          text-shadow: 0 1px 4px rgba(0,0,0,0.8);
        }

        /* Formulário */
        .al-form {
          display: flex;
          justify-content: center;
          padding: 28px 20px 48px;
          background: #fff;
        }
        .al-form-inner { width: 100%; max-width: 380px; }

        /* Painel esquerdo — oculto no mobile */
        .al-left { display: none; }

        /* ── DESKTOP (>= 768px) ───────────────────────────── */
        @media (min-width: 768px) {
          /* Tela cheia sem scroll */
          body { overflow: hidden; height: 100vh; }

          /* Os dois painéis ficam lado a lado, cada um 50vw x 100vh */
          .al-left {
            display: block;
            position: fixed;
            top: 0;
            left: 0;
            width: 50vw;
            height: 100vh;
            overflow: hidden;
          }

          .al-right {
            position: fixed;
            top: 0;
            right: 0;
            width: 50vw;
            height: 100vh;
            overflow-y: auto;
            background: #fff;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }

          /* Esconde faixa mobile */
          .al-banner { display: none !important; }

          /* Centraliza formulário */
          .al-form {
            flex: none;
            justify-content: center;
            padding: 40px 48px;
          }
        }
      `}</style>

      {/* Painel esquerdo — só desktop */}
      <div className="al-left">
        <Image
          src="/criativo-auth.jpg"
          alt="SyncroFlow"
          fill
          sizes="50vw"
          style={{ objectFit: 'cover', objectPosition: 'center top' }}
          priority
        />
      </div>

      {/* Coluna direita — ocupa tudo no mobile, metade direita no desktop */}
      <div className="al-right">
        {/* Faixa criativo — só mobile */}
        <div className="al-banner">
          <Image
            src="/criativo-auth.jpg"
            alt=""
            fill
            sizes="100vw"
            style={{ objectFit: 'cover', objectPosition: 'center 20%' }}
            priority
          />
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
    </>
  )
}
