'use client'
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ListPlus, Loader2, Pencil, Plus, Settings2, Trash2, X } from 'lucide-react'
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'

/**
 * Listas de contatos, como as "Listas" do WhatsApp: juntam contatos em grupos próprios
 * (Importante, Lead, Clientes VIP…) para filtrar o chat. Um contato pode estar em várias.
 */

export interface ContactListInfo {
  id: string
  name: string
  color: string
  count: number
  contactIds: string[]
}

const CORES = ['#1565C0', '#2E7D32', '#E65100', '#C62828', '#6A1B9A', '#00838F', '#F9A825', '#546E7A']

export function useContactLists() {
  // Se a API ainda não tem as listas (tabela não criada), o recurso simplesmente não aparece.
  return useQuery<ContactListInfo[]>({
    queryKey: ['contact-lists'],
    queryFn: () => api.get('/contact-lists').then((r) => r.data),
    retry: false,
    staleTime: 30_000,
  })
}

/** Mapa contactId → listas em que o contato está (para mostrar as etiquetas na lista de conversas). */
export function listsByContact(lists: ContactListInfo[] | undefined) {
  const map = new Map<string, ContactListInfo[]>()
  for (const l of lists ?? []) for (const id of l.contactIds) map.set(id, [...(map.get(id) ?? []), l])
  return map
}

function erroDe(err: any, padrao: string) {
  return err?.response?.data?.error || padrao
}

// ─── Faixa de filtro (acima da lista de conversas) ──────────────────────────────

export function ListFilterBar({
  lists,
  active,
  onChange,
  onManage,
}: {
  lists: ContactListInfo[]
  active: string
  onChange: (id: string) => void
  onManage: () => void
}) {
  if (lists.length === 0) return null
  return (
    <div className="flex items-center gap-1 mt-2">
      <div className="flex-1 flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none]">
        <button
          onClick={() => onChange('all')}
          className={cn('shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors',
            active === 'all' ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'text-gray-500 border-gray-200 hover:bg-gray-50')}
        >
          Todas
        </button>
        {lists.map((l) => (
          <button
            key={l.id}
            onClick={() => onChange(active === l.id ? 'all' : l.id)}
            className={cn('shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1.5',
              active === l.id ? 'text-white' : 'text-gray-600 border-gray-200 hover:bg-gray-50')}
            style={active === l.id ? { background: l.color, borderColor: l.color } : undefined}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: active === l.id ? '#fff' : l.color }} />
            {l.name}
            <span className={cn('text-[10px]', active === l.id ? 'text-white/80' : 'text-gray-400')}>{l.count}</span>
          </button>
        ))}
      </div>
      <button onClick={onManage} className="shrink-0 p-1 rounded-md text-gray-400 hover:bg-gray-100" title="Gerenciar listas" aria-label="Gerenciar listas">
        <Settings2 className="w-4 h-4" />
      </button>
    </div>
  )
}

// ─── Botão "Adicionar à lista" (cabeçalho da conversa) ──────────────────────────

export function AddToListButton({ contactId, onManage }: { contactId: string; onManage: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data: lists = [] } = useContactLists()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setOpen(false)
    }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [open])

  const toggle = useMutation({
    mutationFn: ({ list, add }: { list: ContactListInfo; add: boolean }) =>
      add
        ? api.post(`/contact-lists/${list.id}/members`, { contactIds: [contactId] })
        : api.delete(`/contact-lists/${list.id}/members/${contactId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact-lists'] }),
    onError: (err) => toast({ title: erroDe(err, 'Não foi possível atualizar a lista'), variant: 'destructive' }),
  })

  const create = useMutation({
    mutationFn: (name: string) => api.post('/contact-lists', { name, contactId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-lists'] })
      setNewName('')
      setCreating(false)
    },
    onError: (err) => toast({ title: erroDe(err, 'Não foi possível criar a lista'), variant: 'destructive' }),
  })

  const emListas = lists.filter((l) => l.contactIds.includes(contactId))

  return (
    <div className="relative" ref={raiz}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn('h-8 w-8 rounded-lg flex items-center justify-center hover:bg-gray-100', emListas.length ? 'text-[#1565C0]' : 'text-gray-500')}
        title="Adicionar à lista"
        aria-label="Adicionar à lista"
        aria-expanded={open}
      >
        <ListPlus className="w-5 h-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-64 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5">
          {lists.length === 0 && !creating && (
            <p className="px-3 py-2 text-xs text-gray-400">Você ainda não tem listas. Crie a primeira abaixo.</p>
          )}
          <div className="max-h-56 overflow-y-auto">
            {lists.map((l) => {
              const marcado = l.contactIds.includes(contactId)
              return (
                <button
                  key={l.id}
                  onClick={() => toggle.mutate({ list: l, add: !marcado })}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 text-left"
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: l.color }} />
                  <span className="flex-1 truncate">{l.name}</span>
                  <span className={cn('w-4 h-4 rounded border flex items-center justify-center shrink-0', marcado ? 'bg-[#1565C0] border-[#1565C0]' : 'border-gray-300')}>
                    {marcado && <Check className="w-3 h-3 text-white" />}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="border-t border-gray-100 mt-1 pt-1">
            {creating ? (
              <form
                className="flex items-center gap-1.5 px-2 py-1.5"
                onSubmit={(e) => { e.preventDefault(); if (newName.trim()) create.mutate(newName.trim()) }}
              >
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={40}
                  placeholder="Nome da lista"
                  className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]"
                />
                <button type="submit" disabled={create.isPending || !newName.trim()} className="p-1.5 rounded-lg bg-[#1565C0] text-white disabled:opacity-50" aria-label="Criar lista">
                  {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
              </form>
            ) : (
              <button onClick={() => setCreating(true)} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                <Plus className="w-4 h-4" /> Nova lista
              </button>
            )}
            <button
              onClick={() => { setOpen(false); onManage() }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Settings2 className="w-4 h-4" /> Gerenciar listas
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Gerenciar listas (renomear, cor, excluir) ──────────────────────────────────

export function ManageListsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data: lists = [] } = useContactLists()
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const refresh = () => qc.invalidateQueries({ queryKey: ['contact-lists'] })
  const onError = (err: any) => toast({ title: erroDe(err, 'Não foi possível salvar'), variant: 'destructive' })

  const create = useMutation({
    mutationFn: (name: string) => api.post('/contact-lists', { name, color: CORES[lists.length % CORES.length] }),
    onSuccess: () => { refresh(); setNewName('') },
    onError,
  })
  const update = useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; color?: string }) => api.patch(`/contact-lists/${id}`, data),
    onSuccess: () => { refresh(); setEditing(null) },
    onError,
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/contact-lists/${id}`),
    onSuccess: refresh,
    onError,
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gerenciar listas</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-gray-500 -mt-2">
          Listas juntam contatos em grupos (ex.: Importante, Lead). Excluir uma lista não exclui os contatos.
        </p>

        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (newName.trim()) create.mutate(newName.trim()) }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={40}
            placeholder="Nova lista…"
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]"
          />
          <Button type="submit" disabled={create.isPending || !newName.trim()} className="bg-[#1565C0] hover:bg-[#0D47A1] text-white">
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </form>

        <div className="max-h-72 overflow-y-auto divide-y border rounded-xl">
          {lists.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Nenhuma lista criada ainda.</p>}
          {lists.map((l) => (
            <div key={l.id} className="px-3 py-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: l.color }} />
                {editing === l.id ? (
                  <form className="flex-1 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (editName.trim()) update.mutate({ id: l.id, name: editName.trim() }) }}>
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={40}
                      className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]"
                    />
                    <button type="submit" className="p-1 text-green-600" aria-label="Salvar nome"><Check className="w-4 h-4" /></button>
                    <button type="button" onClick={() => setEditing(null)} className="p-1 text-gray-400" aria-label="Cancelar"><X className="w-4 h-4" /></button>
                  </form>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium truncate">{l.name}</span>
                    <span className="text-xs text-gray-400">{l.count} contato{l.count === 1 ? '' : 's'}</span>
                    <button onClick={() => { setEditing(l.id); setEditName(l.name) }} className="p-1 text-gray-400 hover:text-gray-700" aria-label={`Renomear ${l.name}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { if (confirm(`Excluir a lista "${l.name}"? Os contatos não serão excluídos.`)) remove.mutate(l.id) }}
                      className="p-1 text-gray-400 hover:text-red-500"
                      aria-label={`Excluir ${l.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
              <div className="flex gap-1.5 pl-5">
                {CORES.map((c) => (
                  <button
                    key={c}
                    onClick={() => update.mutate({ id: l.id, color: c })}
                    className={cn('w-4 h-4 rounded-full border-2', l.color.toLowerCase() === c.toLowerCase() ? 'border-gray-800' : 'border-transparent')}
                    style={{ background: c }}
                    aria-label={`Cor ${c}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
