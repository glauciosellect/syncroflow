import Image from 'next/image'
import { PwaInstallBanner } from './pwa-banner'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Painel esquerdo — só desktop (CSS no globals.css) */}
      <div className="al-left">
        <Image
          src="/criativo-auth.jpg"
          alt="SyncroFlow"
          fill
          sizes="50vw"
          style={{ objectFit: 'fill' }}
          priority
        />
      </div>

      {/* Coluna direita — tudo no mobile, metade direita no desktop */}
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
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
