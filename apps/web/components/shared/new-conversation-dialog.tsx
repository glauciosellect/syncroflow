'use client'
import { useEffect, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Loader2, Search, X, UserPlus } from 'lucide-react'
import Link from 'next/link'

interface Props {
  open: boolean
  onClose: () => void
  /** Chamado com a conversa criada/reaproveitada (já inclui requiresTemplate). */
  onStarted: (conversation: any) => void
}

// Escolhe um contato da agenda e abre (ou reaproveita) a conversa com ele.
// Se o cliente nunca escreveu, a API devolve requiresTemplate e o chat mostra o
// seletor de template — a Meta só aceita mensagem livre dentro da janela de 24h.
export function NewConversationDialog({ open, onClose, onStarted }: Props) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    if (open) { setSearch(''); setDebounced(''); setError('') }
  }, [open])

  const { data, isLoading } = useQuery({
    queryKey: ['new-conversation-contacts', debounced],
    queryFn: () => api.get('/contacts', { params: { search: debounced || undefined, limit: 30 } }).then(r => r.data),
    enabled: open,
  })

  const start = useMutation({
    mutationFn: (contactId: string) => api.post('/conversations/start', { contactId }).then(r => r.data),
    onSuccess: (conv) => { onStarted(conv); onClose() },
    onError: (err: any) => setError(err?.response?.data?.error || 'Não foi possível iniciar a conversa.'),
  })

  if (!open) return null
  const contacts: any[] = data?.data ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Nova conversa</h2>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input autoFocus placeholder="Buscar contato por nome, telefone ou e-mail" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-100">
          {isLoading ? (
            <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : contacts.length === 0 ? (
            <p className="p-4 text-center text-sm text-gray-400">Nenhum contato encontrado.</p>
          ) : contacts.map(c => (
            <button
              key={c.id}
              disabled={start.isPending}
              onClick={() => { setError(''); start.mutate(c.id) }}
              className="flex w-full items-center justify-between gap-3 border-b border-gray-50 px-3 py-2.5 text-left last:border-0 hover:bg-gray-50 disabled:opacity-60"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{c.name || c.phone || 'Sem nome'}</p>
                <p className="truncate text-xs text-gray-400">{c.phone || c.email || ''}</p>
              </div>
              {start.isPending && start.variables === c.id && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />}
            </button>
          ))}
        </div>
        <Link href="/contacts" className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[#1565C0] hover:underline">
          <UserPlus className="h-3.5 w-3.5" /> Cadastrar ou importar novos contatos
        </Link>
        <p className="mt-2 text-xs text-gray-400">
          Se o cliente ainda não escreveu para você, o WhatsApp exige começar com um modelo de mensagem aprovado.
        </p>
      </div>
    </div>
  )
}
