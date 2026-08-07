'use client'
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Download, Share, PlusSquare, MoreVertical, CheckCircle2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

function getPlatform(): 'ios' | 'android' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

export function InstallChatShortcutDialog() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState<any>(null)
  const [installed, setInstalled] = useState(false)
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop')

  useEffect(() => {
    setPlatform(getPlatform())

    const handler = (e: any) => { e.preventDefault(); setPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    const onInstalled = () => setInstalled(true)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  useEffect(() => {
    if (searchParams.get('install') === '1') setOpen(true)
  }, [searchParams])

  const handleClose = (next: boolean) => {
    setOpen(next)
    if (!next && searchParams.get('install') === '1') {
      router.replace('/chat-app')
    }
  }

  const handleInstallClick = async () => {
    if (!prompt) return
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') setInstalled(true)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atalho do Chat SyncroFlow</DialogTitle>
          <DialogDescription>
            Crie um atalho que abre direto nas conversas, sem passar pelo painel — igual o WhatsApp.
          </DialogDescription>
        </DialogHeader>

        {installed ? (
          <div className="flex flex-col items-center text-center gap-2 py-4">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
            <p className="text-sm font-medium text-gray-700">Atalho instalado com sucesso!</p>
            <p className="text-xs text-gray-400">Procure o ícone "Chat SyncroFlow" na sua tela ou área de trabalho.</p>
          </div>
        ) : platform === 'ios' ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-600">No iPhone/iPad, o atalho é criado pelo Safari em 3 passos:</p>
            <ol className="space-y-2.5 text-sm text-gray-700">
              <li className="flex items-center gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-[#1565C0] text-white text-xs font-bold flex items-center justify-center">1</span>
                Toque no ícone <Share className="w-4 h-4 inline mx-0.5" /> de compartilhar, na barra do Safari
              </li>
              <li className="flex items-center gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-[#1565C0] text-white text-xs font-bold flex items-center justify-center">2</span>
                Toque em <PlusSquare className="w-4 h-4 inline mx-0.5" /> "Adicionar à Tela de Início"
              </li>
              <li className="flex items-center gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-[#1565C0] text-white text-xs font-bold flex items-center justify-center">3</span>
                Toque em "Adicionar" — pronto
              </li>
            </ol>
            <p className="text-xs text-gray-400 pt-1">
              A Apple exige que esse passo seja manual pelo Safari — não é possível automatizar no iPhone.
            </p>
          </div>
        ) : prompt ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-600">
              Seu navegador já pode instalar o atalho automaticamente, com um clique.
            </p>
            <Button onClick={handleInstallClick} className="w-full bg-[#1565C0] hover:bg-[#0D47A1]">
              <Download className="w-4 h-4 mr-2" />
              Instalar atalho agora
            </Button>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-600">
              {platform === 'android'
                ? 'Toque nos 3 pontinhos do navegador e escolha "Adicionar à tela inicial" ou "Instalar app".'
                : 'No Chrome ou Edge, clique no ícone de instalar na barra de endereço, ou nos 3 pontinhos'}
              {platform === 'desktop' && (
                <MoreVertical className="w-4 h-4 inline mx-1" />
              )}
              {platform === 'desktop' && '→ "Instalar Chat SyncroFlow".'}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
