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
        html, body { margin: 0; padding: 0; }

        /* MOBILE */
        .al-root { display: block; min-height: 100vh; background: #fff; }

        .al-desktop-panel { display: none; }

        .al-banner {
          position: relative;
          width: 100%;
          height: 160px;
          overflow: hidden;
        }
        .al-banner-grad {
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.6) 100%);
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
          text-shadow: 0 1px 4px rgba(0,0,0,0.7);
        }

        .al-form {
          display: flex;
          justify-content: center;
          padding: 28px 20px 48px;
        }
        .al-form-inner { width: 100%; max-width: 380px; }

        /* DESKTOP */
        @media (min-width: 768px) {
          .al-root {
            display: grid;
            grid-template-columns: 1fr 1fr;
            height: 100vh;
            overflow: hidden;
          }

          .al-desktop-panel {
            display: block;
            position: relative;
            height: 100vh;
            overflow: hidden;
          }

          .al-right-col {
            height: 100vh;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            background: #fff;
          }

          .al-banner { display: none; }

          .al-form {
            flex: 1;
            align-items: center;
            padding: 40px 48px;
          }
        }
      `}</style>

      <div className="al-root">

        {/* Painel esquerdo — desktop */}
        <div className="al-desktop-panel">
          <Image
            src="/criativo-auth.jpg"
            alt="SyncroFlow"
            fill
            style={{ objectFit: 'cover', objectPosition: 'center top' }}
            priority
          />
        </div>

        {/* Coluna direita */}
        <div className="al-right-col" style={{ display:'flex', flexDirection:'column', background:'#fff' }}>

          {/* Banner mobile */}
          <div className="al-banner">
            <Image
              src="/criativo-auth.jpg"
              alt=""
              fill
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
      </div>
    </>
  )
}
