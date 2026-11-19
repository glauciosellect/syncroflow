'use client'
import { useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useSocketEvent } from '@/hooks/use-socket'

/**
 * Número de conversas com mensagens não lidas no ícone do app (como o WhatsApp) e no título da aba.
 *
 * O número no ícone usa a Badging API: funciona no app instalado (PWA) no Windows/Mac e no Android.
 * Com o app fechado ele só atualiza quando chega uma notificação push (ver "Notificações push").
 */
const PREFIXO = /^\(\d+\+?\)\s/

export function useAppBadge() {
  const qc = useQueryClient()

  const { data } = useQuery<{ conversations: number; messages: number }>({
    queryKey: ['unread-count'],
    queryFn: () => api.get('/conversations/unread-count').then((r) => r.data),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  })

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['unread-count'] }), [qc])
  useSocketEvent('message:new', refresh)
  useSocketEvent('conversation:updated', refresh)

  const total = data?.conversations ?? 0

  useEffect(() => {
    // Ícone do app instalado
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    try {
      if (total > 0) nav.setAppBadge?.(total)?.catch(() => {})
      else nav.clearAppBadge?.()?.catch(() => {})
    } catch {
      /* navegador sem Badging API: só o título da aba mostra o número */
    }
    // Título da aba: "(3) SyncroFlow — …"
    const base = document.title.replace(PREFIXO, '')
    document.title = total > 0 ? `(${total > 99 ? '99+' : total}) ${base}` : base
  }, [total])
}
