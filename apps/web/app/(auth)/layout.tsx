import Image from 'next/image'
import { PwaInstallBanner } from './pwa-banner'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-root">
      {/* Painel esquerdo com criativo — só desktop */}
      <div className="auth-left">
        <Image
          src="/criativo-auth.jpg"
          alt="SyncroFlow"
          fill
          sizes="50vw"
          style={{ objectFit: 'fill' }}
          priority
        />
      </div>

      {/* Painel direito — formulário */}
      <div className="auth-right">
        <div className="auth-form-wrap">
          {/* Logo visível só no mobile */}
          <div className="auth-mobile-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logotipo-sem-fundo.png" alt="SyncroFlow" />
          </div>
          {children}
          <PwaInstallBanner />
        </div>
      </div>
    </div>
  )
}
