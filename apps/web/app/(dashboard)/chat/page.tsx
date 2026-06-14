'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useRef, useCallback } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Search, MessageSquare, UserCheck, Bot, Send, Loader2,
  X, RotateCcw, ChevronRight, ChevronLeft, Tag, StickyNote, Variable,
  Phone, Mail, Clock, Hash, Plus, Check, Pencil,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateTime, channelLabel } from '@/lib/utils'
import { useSocketConnect, useSocketEvent } from '@/hooks/use-socket'

// Toca um beep suave ao chegar mensagem nova
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)
  } catch {}
}

const statusColors: Record<string, string> = {
  AI_ACTIVE: 'bg-blue-100 text-blue-700',
  WAITING_HUMAN: 'bg-yellow-100 text-yellow-700',
  HUMAN_ACTIVE: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-100 text-gray-500',
}
const statusLabels: Record<string, string> = {
  AI_ACTIVE: 'IA Ativa', WAITING_HUMAN: 'Em Espera', HUMAN_ACTIVE: 'Humano', CLOSED: 'Encerrada',
}

// ─── Coluna 3: Painel de Perfil do Contato ────────────────────────────────────
function ContactPanel({ contactId, workspaceId }: { contactId: string; workspaceId?: string }) {
  const qc = useQueryClient()
  const [editingNote, setEditingNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [newTag, setNewTag] = useState('')
  const [addingTag, setAddingTag] = useState(false)
  const [activeSection, setActiveSection] = useState<'info' | 'vars' | 'history'>('info')

  const { data: contact } = useQuery({
    queryKey: ['contact', contactId],
    queryFn: () => api.get(`/contacts/${contactId}`).then(r => r.data),
    enabled: !!contactId,
  })

  const { data: history } = useQuery({
    queryKey: ['contact-history', contactId],
    queryFn: () => api.get(`/contacts/${contactId}/conversations`).then(r => r.data),
    enabled: !!contactId && activeSection === 'history',
  })

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.patch(`/contacts/${contactId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact', contactId] }),
  })

  const handleSaveNote = () => {
    updateMutation.mutate({ notes: noteText })
    setEditingNote(false)
  }

  const handleAddTag = () => {
    if (!newTag.trim() || !contact) return
    const tags = [...(contact.tags || []), newTag.trim()]
    updateMutation.mutate({ tags })
    setNewTag('')
    setAddingTag(false)
  }

  const handleRemoveTag = (tag: string) => {
    if (!contact) return
    updateMutation.mutate({ tags: contact.tags.filter((t: string) => t !== tag) })
  }

  if (!contact) return (
    <div className="w-72 border-l border-gray-100 flex items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
    </div>
  )

  const vars = contact.variables ? Object.entries(contact.variables as Record<string, any>) : []

  return (
    <div className="w-72 border-l border-gray-100 flex flex-col shrink-0 bg-white">
      {/* Avatar + nome */}
      <div className="p-4 border-b border-gray-100 text-center">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#1565C0] to-[#2E7D32] flex items-center justify-center text-white text-xl font-bold mx-auto mb-2">
          {(contact.name || contact.phone || '?')[0].toUpperCase()}
        </div>
        <div className="font-semibold text-gray-900 text-sm">{contact.name || 'Sem nome'}</div>
        {contact.phone && (
          <div className="flex items-center justify-center gap-1 mt-0.5 text-xs text-gray-400">
            <Phone className="w-3 h-3" />{contact.phone}
          </div>
        )}
        {contact.email && (
          <div className="flex items-center justify-center gap-1 mt-0.5 text-xs text-gray-400">
            <Mail className="w-3 h-3" />{contact.email}
          </div>
        )}
      </div>

      {/* Tabs internas */}
      <div className="flex border-b border-gray-100">
        {[
          { key: 'info', label: 'Info' },
          { key: 'vars', label: 'Variáveis' },
          { key: 'history', label: 'Histórico' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveSection(t.key as any)}
            className={cn(
              'flex-1 py-2 text-xs font-medium transition-colors',
              activeSection === t.key
                ? 'text-[#1565C0] border-b-2 border-[#1565C0]'
                : 'text-gray-400 hover:text-gray-600'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">

        {/* ABA: INFO */}
        {activeSection === 'info' && (
          <>
            {/* Somente Humano */}
            <div className={`flex items-center justify-between rounded-lg px-3 py-2 border transition-colors ${contact.humanOnly ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200'}`}>
              <div>
                <p className="text-xs font-semibold text-gray-700">Somente atendimento humano</p>
                <p className="text-xs text-gray-400">IA não responde este contato</p>
              </div>
              <button
                onClick={() => updateMutation.mutate({ humanOnly: !contact.humanOnly })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${contact.humanOnly ? 'bg-orange-500' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${contact.humanOnly ? 'translate-x-[18px]' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* Tags */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                  <Tag className="w-3 h-3" /> Tags
                </span>
                <button
                  onClick={() => setAddingTag(true)}
                  className="text-xs text-[#1565C0] hover:underline flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" /> Adicionar
                </button>
              </div>

              {addingTag && (
                <div className="flex gap-1 mb-2">
                  <Input
                    className="h-6 text-xs"
                    placeholder="Nova tag..."
                    value={newTag}
                    onChange={e => setNewTag(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                    autoFocus
                  />
                  <button onClick={handleAddTag} className="text-green-600 hover:text-green-700">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setAddingTag(false); setNewTag('') }} className="text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {contact.tags?.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {contact.tags.map((tag: string) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 rounded-full px-2 py-0.5"
                    >
                      {tag}
                      <button onClick={() => handleRemoveTag(tag)} className="hover:text-red-500">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-300 italic">Sem tags</p>
              )}
            </div>

            {/* Notas */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                  <StickyNote className="w-3 h-3" /> Notas internas
                </span>
                {!editingNote && (
                  <button
                    onClick={() => { setNoteText(contact.notes || ''); setEditingNote(true) }}
                    className="text-xs text-[#1565C0] hover:underline flex items-center gap-0.5"
                  >
                    <Pencil className="w-3 h-3" /> Editar
                  </button>
                )}
              </div>

              {editingNote ? (
                <div>
                  <textarea
                    className="w-full border border-input rounded-lg px-2 py-1.5 text-xs h-20 resize-none focus:outline-none focus:ring-1 focus:ring-[#1565C0]"
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    placeholder="Anote observações sobre este contato..."
                    autoFocus
                  />
                  <div className="flex gap-1 mt-1">
                    <Button size="sm" className="h-6 text-xs bg-[#1565C0]" onClick={handleSaveNote} disabled={updateMutation.isPending}>
                      Salvar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingNote(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2 min-h-10 whitespace-pre-wrap">
                  {contact.notes || <span className="text-gray-300 italic">Sem notas</span>}
                </p>
              )}
            </div>

            {/* Data de criação */}
            <div className="flex items-center gap-1.5 text-xs text-gray-400 pt-1">
              <Clock className="w-3 h-3" />
              Contato desde {new Date(contact.createdAt).toLocaleDateString('pt-BR')}
            </div>
          </>
        )}

        {/* ABA: VARIÁVEIS */}
        {activeSection === 'vars' && (
          <div>
            <p className="text-xs text-gray-400 mb-3">
              Dados coletados pelas intenções do agente durante os atendimentos.
            </p>
            {vars.length === 0 ? (
              <div className="text-center py-6">
                <Variable className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-xs text-gray-400">Nenhuma variável coletada ainda</p>
              </div>
            ) : (
              <div className="space-y-2">
                {vars.map(([key, value]) => (
                  <div key={key} className="bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Hash className="w-2.5 h-2.5 text-gray-400" />
                      <span className="text-xs font-medium text-gray-500">{key}</span>
                    </div>
                    <span className="text-xs text-gray-800 font-semibold">{String(value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA: HISTÓRICO */}
        {activeSection === 'history' && (
          <div>
            {!history ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-6">
                <MessageSquare className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-xs text-gray-400">Nenhum atendimento anterior</p>
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((conv: any) => (
                  <div key={conv.id} className="bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700">{conv.agent?.name}</span>
                      <Badge className={cn('text-xs', statusColors[conv.status])}>
                        {statusLabels[conv.status]}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span>{channelLabel(conv.channel?.type)}</span>
                      <span>·</span>
                      <span>{new Date(conv.startedAt).toLocaleDateString('pt-BR')}</span>
                    </div>
                    {conv.interactionCount > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">{conv.interactionCount} interações · {conv.creditsUsed} créditos</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Página principal do Chat ─────────────────────────────────────────────────
export default function ChatPage() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<any>(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [showProfile, setShowProfile] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useSocketConnect()

  const handleNewMessage = useCallback((data: { conversationId: string; message: any }) => {
    qc.setQueryData(['messages', data.conversationId], (old: any) => {
      if (!old) return old
      const exists = old.data?.some((m: any) => m.id === data.message.id)
      if (exists) return old
      return { ...old, data: [...(old.data || []), data.message] }
    })

    // Incrementa unreadCount localmente se a conversa não está selecionada
    // e a mensagem é do usuário (não do agente/sistema)
    if (data.message.role === 'USER') {
      setSelected((prev: any) => {
        const isOpen = prev?.id === data.conversationId
        if (!isOpen) {
          // Toca som de notificação
          playNotificationSound()
          // Incrementa na lista em cache
          qc.setQueryData(['conversations', filter, search], (old: any) => {
            if (!old) return old
            return {
              ...old,
              data: old.data?.map((c: any) =>
                c.id === data.conversationId
                  ? { ...c, unreadCount: (c.unreadCount || 0) + 1 }
                  : c
              ),
            }
          })
        }
        return prev
      })
    }

    qc.invalidateQueries({ queryKey: ['conversations'] })
  }, [qc, filter, search])

  const handleConversationUpdated = useCallback((conv: any) => {
    qc.setQueryData(['conversations', filter, search], (old: any) => {
      if (!old) return old
      return { ...old, data: old.data?.map((c: any) => c.id === conv.id ? { ...c, ...conv } : c) }
    })
    setSelected((prev: any) => prev?.id === conv.id ? { ...prev, ...conv } : prev)
  }, [filter, search])

  useSocketEvent('message:new', handleNewMessage)
  useSocketEvent('conversation:updated', handleConversationUpdated)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selected?.id])

  const { data: conversations } = useQuery({
    queryKey: ['conversations', filter, search],
    queryFn: () => api.get('/conversations', {
      params: { status: filter !== 'all' ? filter : undefined, search: search || undefined },
    }).then(r => r.data),
  })

  const { data: msgs } = useQuery({
    queryKey: ['messages', selected?.id],
    queryFn: () => api.get(`/conversations/${selected.id}/messages`).then(r => r.data),
    enabled: !!selected,
  })

  useEffect(() => {
    if (msgs) messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [msgs])

  const assumeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/conversations/${id}/assume`),
    onSuccess: (res) => { setSelected((p: any) => p ? { ...p, ...res.data } : p); qc.invalidateQueries({ queryKey: ['conversations'] }) },
  })
  const transferMutation = useMutation({
    mutationFn: ({ id, to }: { id: string; to: 'human' | 'ai' }) => api.post(`/conversations/${id}/transfer`, { to }),
    onSuccess: (res) => { setSelected((p: any) => p ? { ...p, ...res.data } : p); qc.invalidateQueries({ queryKey: ['conversations'] }) },
  })
  const closeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/conversations/${id}/close`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conversations'] }); setSelected(null) },
  })
  const sendMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => api.post(`/conversations/${id}/messages`, { content }),
    onSuccess: () => setMessage(''),
  })

  const tabs = [
    { key: 'all', label: 'Todos' },
    { key: 'WAITING_HUMAN', label: 'Em espera' },
    { key: 'AI_ACTIVE', label: 'IA ativa' },
    { key: 'HUMAN_ACTIVE', label: 'Meus' },
  ]

  // Seleciona conversa e zera badge de não lidas localmente
  const handleSelectConversation = useCallback((conv: any) => {
    setSelected(conv)
    if ((conv.unreadCount || 0) > 0) {
      qc.setQueryData(['conversations', filter, search], (old: any) => {
        if (!old) return old
        return {
          ...old,
          data: old.data?.map((c: any) =>
            c.id === conv.id ? { ...c, unreadCount: 0 } : c
          ),
        }
      })
    }
  }, [qc, filter, search])

  return (
    <div className="h-full flex -m-4 md:-m-6 bg-white rounded-lg overflow-hidden border border-gray-200">

      {/* Coluna 1 — Lista (oculta no mobile quando conversa selecionada) */}
      <div className={cn('border-r border-gray-100 flex flex-col shrink-0 w-full md:w-72', selected ? 'hidden md:flex' : 'flex')}>
        <div className="p-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Buscar conversa..." className="pl-9 h-8 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1 mt-2">
            {tabs.map(t => (
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
            <button key={conv.id} onClick={() => handleSelectConversation(conv)}
              className={cn('w-full text-left p-3 border-b border-gray-50 hover:bg-gray-50 transition-colors', selected?.id === conv.id ? 'bg-blue-50 border-l-2 border-l-[#1565C0]' : '')}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={cn('font-medium text-sm truncate', (conv.unreadCount || 0) > 0 ? 'text-gray-900 font-semibold' : 'text-gray-900')}>
                      {conv.contact?.name || conv.contact?.phone || 'Desconhecido'}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">{channelLabel(conv.channel?.type)}</span>
                  </div>
                  <p className={cn('text-xs truncate', (conv.unreadCount || 0) > 0 ? 'text-gray-700 font-medium' : 'text-gray-400')}>
                    {conv.messages?.[0]?.content || 'Sem mensagens'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge className={cn('text-xs', statusColors[conv.status])}>{statusLabels[conv.status]}</Badge>
                  {(conv.unreadCount || 0) > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#1565C0] text-white text-[10px] font-bold">
                      {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-300 mt-1">{formatDateTime(conv.updatedAt)}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Coluna 2 — Conversa */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setSelected(null)}
                className="md:hidden p-1 rounded-lg text-gray-400 hover:bg-gray-100 shrink-0"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">{selected.contact?.name || selected.contact?.phone || 'Desconhecido'}</h3>
              <p className="text-xs text-gray-400">
                {channelLabel(selected.channel?.type)} ·{' '}
                <span className={cn('font-medium', {
                  'text-blue-600': selected.status === 'AI_ACTIVE',
                  'text-yellow-600': selected.status === 'WAITING_HUMAN',
                  'text-green-600': selected.status === 'HUMAN_ACTIVE',
                  'text-gray-500': selected.status === 'CLOSED',
                })}>
                  {statusLabels[selected.status]}
                </span>
              </p>
            </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {selected.status === 'WAITING_HUMAN' && (
                <Button size="sm" onClick={() => assumeMutation.mutate(selected.id)} disabled={assumeMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs">
                  <UserCheck className="w-3 h-3 mr-1" />Assumir
                </Button>
              )}
              {selected.status === 'AI_ACTIVE' && (
                <Button size="sm" variant="outline" onClick={() => transferMutation.mutate({ id: selected.id, to: 'human' })} disabled={transferMutation.isPending} className="h-7 text-xs">
                  <UserCheck className="w-3 h-3 mr-1" />Para humano
                </Button>
              )}
              {selected.status === 'HUMAN_ACTIVE' && (
                <Button size="sm" variant="outline" onClick={() => transferMutation.mutate({ id: selected.id, to: 'ai' })} disabled={transferMutation.isPending} className="h-7 text-xs text-blue-600 border-blue-200 hover:bg-blue-50">
                  <RotateCcw className="w-3 h-3 mr-1" />Para IA
                </Button>
              )}
              {selected.status !== 'CLOSED' && (
                <Button size="sm" variant="outline" onClick={() => closeMutation.mutate(selected.id)} disabled={closeMutation.isPending} className="h-7 text-xs text-red-500 border-red-200 hover:bg-red-50">
                  <X className="w-3 h-3 mr-1" />Encerrar
                </Button>
              )}
              <button
                onClick={() => setShowProfile(p => !p)}
                className={cn('p-1.5 rounded-lg border transition-colors', showProfile ? 'bg-blue-50 border-blue-200 text-[#1565C0]' : 'border-gray-200 text-gray-400 hover:bg-gray-50')}
                title="Ver perfil do contato"
              >
                <ChevronRight className={cn('w-4 h-4 transition-transform', showProfile ? 'rotate-180' : '')} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {(msgs?.data || []).map((msg: any) => (
              <div key={msg.id} className={cn('flex', msg.role === 'USER' ? 'justify-start' : msg.role === 'SYSTEM' ? 'justify-center' : 'justify-end')}>
                {msg.role === 'SYSTEM' ? (
                  <span className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-full px-3 py-1">{msg.content}</span>
                ) : (
                  <div className={cn('max-w-xs lg:max-w-sm rounded-2xl px-4 py-2.5 text-sm',
                    msg.role === 'USER' ? 'bg-gray-100 text-gray-800' :
                    msg.role === 'HUMAN' ? 'bg-green-600 text-white' : 'bg-[#1565C0] text-white')}>
                    {msg.role === 'ASSISTANT' && (
                      <div className="flex items-center gap-1 mb-1 opacity-70"><Bot className="w-3 h-3" /><span className="text-xs">IA</span></div>
                    )}
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <div className={cn('text-xs mt-1 opacity-60', msg.role !== 'USER' ? 'text-right' : '')}>
                      {new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {selected.status === 'HUMAN_ACTIVE' && (
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <Input
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Digite sua mensagem..."
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey && message.trim()) {
                    e.preventDefault()
                    sendMutation.mutate({ id: selected.id, content: message })
                  }
                }}
              />
              <Button onClick={() => sendMutation.mutate({ id: selected.id, content: message })} disabled={!message.trim() || sendMutation.isPending} className="bg-[#1565C0] hover:bg-[#0D47A1]">
                {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <MessageSquare className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Moderação de atendimentos</h3>
            <p className="text-gray-400 text-sm">Selecione uma conversa para visualizar</p>
          </div>
        </div>
      )}

      {/* Coluna 3 — Perfil do contato */}
      {selected && showProfile && selected.contactId && (
        <ContactPanel contactId={selected.contactId} />
      )}
    </div>
  )
}
