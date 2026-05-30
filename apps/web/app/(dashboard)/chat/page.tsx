'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, MessageSquare, UserCheck, Bot, Send, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateTime, channelLabel } from '@/lib/utils'

const statusColors: Record<string, string> = {
  AI_ACTIVE: 'bg-blue-100 text-blue-700',
  WAITING_HUMAN: 'bg-yellow-100 text-yellow-700',
  HUMAN_ACTIVE: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-100 text-gray-500',
}

const statusLabels: Record<string, string> = {
  AI_ACTIVE: 'IA Ativa', WAITING_HUMAN: 'Em Espera', HUMAN_ACTIVE: 'Humano', CLOSED: 'Encerrada',
}

export default function ChatPage() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<any>(null)
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')

  const { data: conversations } = useQuery({
    queryKey: ['conversations', filter, search],
    queryFn: () => api.get('/conversations', { params: { status: filter !== 'all' ? filter : undefined, search: search || undefined } }).then(r => r.data),
    refetchInterval: 5000,
  })

  const { data: msgs } = useQuery({
    queryKey: ['messages', selected?.id],
    queryFn: () => api.get(`/conversations/${selected.id}/messages`).then(r => r.data),
    enabled: !!selected,
    refetchInterval: 3000,
  })

  const assumeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/conversations/${id}/assume`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  })

  const closeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/conversations/${id}/close`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conversations'] }); setSelected(null) },
  })

  const sendMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => api.post(`/conversations/${id}/messages`, { content }),
    onSuccess: () => { setMessage(''); qc.invalidateQueries({ queryKey: ['messages', selected?.id] }) },
  })

  const tabs = [{ key: 'all', label: 'Todos' }, { key: 'WAITING_HUMAN', label: 'Em espera' }, { key: 'AI_ACTIVE', label: 'IA ativa' }, { key: 'HUMAN_ACTIVE', label: 'Meus' }]

  return (
    <div className="h-full flex -m-6 bg-white rounded-lg overflow-hidden border border-gray-200">
      <div className="w-80 border-r border-gray-100 flex flex-col">
        <div className="p-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Buscar conversa..." className="pl-9 h-8 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1 mt-2">
            {tabs.map((t) => (
              <button key={t.key} onClick={() => setFilter(t.key)}
                className={cn('text-xs px-2 py-1 rounded-md flex-1 transition-colors', filter === t.key ? 'bg-[#1565C0] text-white' : 'text-gray-500 hover:bg-gray-50')}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations?.data?.length === 0 && (
            <div className="text-center py-12">
              <MessageSquare className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Nenhuma conversa</p>
            </div>
          )}
          {(conversations?.data || []).map((conv: any) => (
            <button key={conv.id} onClick={() => setSelected(conv)}
              className={cn('w-full text-left p-3 border-b border-gray-50 hover:bg-gray-50 transition-colors', selected?.id === conv.id ? 'bg-blue-50' : '')}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm text-gray-900 truncate">{conv.contact?.name || conv.contact?.phone || 'Desconhecido'}</span>
                    <span className="text-xs text-gray-400 shrink-0">{channelLabel(conv.channel?.type)}</span>
                  </div>
                  <p className="text-xs text-gray-400 truncate">{conv.messages?.[0]?.content || 'Sem mensagens'}</p>
                </div>
                <Badge className={cn('text-xs shrink-0', statusColors[conv.status])}>{statusLabels[conv.status]}</Badge>
              </div>
              <p className="text-xs text-gray-300 mt-1">{formatDateTime(conv.updatedAt)}</p>
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <div className="flex-1 flex flex-col">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">{selected.contact?.name || selected.contact?.phone || 'Desconhecido'}</h3>
              <p className="text-xs text-gray-400">{channelLabel(selected.channel?.type)} · {statusLabels[selected.status]}</p>
            </div>
            <div className="flex items-center gap-2">
              {selected.status !== 'HUMAN_ACTIVE' && selected.status !== 'CLOSED' && (
                <Button size="sm" onClick={() => assumeMutation.mutate(selected.id)} disabled={assumeMutation.isPending} className="bg-green-600 hover:bg-green-700">
                  <UserCheck className="w-3 h-3 mr-1" />
                  Assumir
                </Button>
              )}
              {selected.status !== 'CLOSED' && (
                <Button size="sm" variant="outline" onClick={() => closeMutation.mutate(selected.id)} disabled={closeMutation.isPending}>
                  <X className="w-3 h-3 mr-1" />
                  Encerrar
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {(msgs?.data || []).map((msg: any) => (
              <div key={msg.id} className={cn('flex', msg.role === 'USER' ? 'justify-start' : 'justify-end')}>
                <div className={cn('max-w-xs lg:max-w-md xl:max-w-lg rounded-2xl px-4 py-2 text-sm', msg.role === 'USER' ? 'bg-gray-100 text-gray-800' : msg.role === 'HUMAN' ? 'bg-green-600 text-white' : msg.role === 'SYSTEM' ? 'bg-yellow-50 text-yellow-700 text-xs w-full text-center' : 'bg-[#1565C0] text-white')}>
                  {msg.role === 'ASSISTANT' && <div className="flex items-center gap-1 mb-1 opacity-70"><Bot className="w-3 h-3" /><span className="text-xs">IA</span></div>}
                  {msg.content}
                  <div className={cn('text-xs mt-1 opacity-60', msg.role !== 'USER' ? 'text-right' : '')}>
                    {new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selected.status === 'HUMAN_ACTIVE' && (
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Digite sua mensagem..." onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMutation.mutate({ id: selected.id, content: message })} />
              <Button onClick={() => sendMutation.mutate({ id: selected.id, content: message })} disabled={!message.trim() || sendMutation.isPending} className="hover:opacity-90">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <MessageSquare className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Moderação de atendimentos</h3>
            <p className="text-gray-400">Selecione uma conversa para visualizar</p>
          </div>
        </div>
      )}
    </div>
  )
}

