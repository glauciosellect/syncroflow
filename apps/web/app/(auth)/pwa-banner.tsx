'use client'
import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'

export function PwaInstallBanner() {
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
