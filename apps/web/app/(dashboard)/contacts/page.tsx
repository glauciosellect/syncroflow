'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Search, Users, Phone, Mail, Plus, Upload, MessageCircle, X, Pencil } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

function parseContactsCsv(text: string): { name: string; phone: string }[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return []

  // Se a primeira linha parece cabeçalho (contém "nome"/"name" ou "telefone"/"phone"), pula
  const firstLower = lines[0].toLowerCase()
  const startIndex = (firstLower.includes('nome') || firstLower.includes('name') || firstLower.includes('telefone') || firstLower.includes('phone')) ? 1 : 0

  const result: { name: string; phone: string }[] = []
  for (const line of lines.slice(startIndex)) {
    const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''))
    if (parts.length >= 2) {
      result.push({ name: parts[0], phone: parts[1] })
    } else if (parts.length === 1 && parts[0]) {
      // Só telefone, sem nome
      result.push({ name: '', phone: parts[0] })
    }
  }
  return result
}

function AddContactModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  const createMutation = useMutation({
    mutationFn: () => api.post('/contacts', { name, phone }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      toast({ title: 'Contato adicionado!' })
      onClose()
    },
    onError: (err: any) => toast({ title: 'Erro ao adicionar', description: err?.response?.data?.error || 'Tente novamente', variant: 'destructive' }),
  })

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Adicionar contato</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Nome</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do contato" className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">WhatsApp</label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="DDD + número (ex: 32988776655)" className="mt-1" />
          </div>
        </div>
        <Button
          className="w-full bg-[#1565C0] hover:bg-[#0D47A1]"
          disabled={!name.trim() || !phone.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Adicionar
        </Button>
      </div>
    </div>
  )
}

function EditContactModal({ contact, onClose }: { contact: any; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [name, setName] = useState(contact.name || '')
  const [phone, setPhone] = useState(contact.phone || '')

  const updateMutation = useMutation({
    mutationFn: () => api.patch(`/contacts/${contact.id}`, { name, phone }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      toast({ title: 'Contato atualizado!' })
      onClose()
    },
    onError: (err: any) => toast({ title: 'Erro ao atualizar', description: err?.response?.data?.error || 'Tente novamente', variant: 'destructive' }),
  })

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Editar contato</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Nome</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do contato" className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">WhatsApp</label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="DDD + número (ex: 32988776655)" className="mt-1" />
          </div>
        </div>
        <Button
          className="w-full bg-[#1565C0] hover:bg-[#0D47A1]"
          disabled={!name.trim() || !phone.trim() || updateMutation.isPending}
          onClick={() => updateMutation.mutate()}
        >
          {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Salvar
        </Button>
      </div>
    </div>
  )
}

function ImportContactsModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [parsed, setParsed] = useState<{ name: string; phone: string }[] | null>(null)
  const [fileName, setFileName] = useState('')

  const importMutation = useMutation({
    mutationFn: () => api.post('/contacts/import', { contacts: parsed }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      toast({ title: `${res.data.created} contato(s) importado(s)`, description: res.data.skipped > 0 ? `${res.data.skipped} ignorado(s) (já existentes ou sem telefone)` : undefined })
      onClose()
    },
    onError: (err: any) => toast({ title: 'Erro ao importar', description: err?.response?.data?.error || 'Tente novamente', variant: 'destructive' }),
  })

  const handleFile = async (file: File) => {
    setFileName(file.name)
    const text = await file.text()
    setParsed(parseContactsCsv(text))
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Importar contatos</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <p className="text-xs text-gray-500">
          Arquivo .csv com colunas <strong>nome, telefone</strong> (uma linha por contato).
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full border-2 border-dashed border-gray-200 rounded-lg py-6 flex flex-col items-center gap-2 text-gray-400 hover:border-[#1565C0] hover:text-[#1565C0] transition-colors"
        >
          <Upload className="w-6 h-6" />
          <span className="text-sm">{fileName || 'Selecionar arquivo .csv'}</span>
        </button>
        {parsed && (
          <p className="text-xs text-gray-600">
            {parsed.length} linha(s) encontrada(s) no arquivo.
          </p>
        )}
        <Button
          className="w-full bg-[#1565C0] hover:bg-[#0D47A1]"
          disabled={!parsed || parsed.length === 0 || importMutation.isPending}
          onClick={() => importMutation.mutate()}
        >
          {importMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Importar {parsed ? `(${parsed.length})` : ''}
        </Button>
      </div>
    </div>
  )
}

export default function ContactsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingContact, setEditingContact] = useState<any>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', search, page],
    queryFn: () => api.get('/contacts', { params: { search: search || undefined, page, limit: 20 } }).then(r => r.data),
  })

  const startConversationMutation = useMutation({
    mutationFn: (contactId: string) => api.post('/conversations/start', { contactId }),
    onSuccess: () => router.push('/chat'),
    onError: (err: any) => toast({ title: 'Erro ao iniciar conversa', description: err?.response?.data?.error || 'Tente novamente', variant: 'destructive' }),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contatos</h1>
          <p className="text-gray-500 text-sm mt-1">Todos os contatos que interagiram com seus agentes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <Upload className="w-4 h-4 mr-1.5" />Importar
          </Button>
          <Button size="sm" className="bg-[#1565C0] hover:bg-[#0D47A1]" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-1.5" />Adicionar contato
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input placeholder="Buscar por nome, telefone ou email..." className="pl-10" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#1565C0]" /></div>
      ) : data?.data?.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Nenhum contato ainda</h3>
          <p className="text-gray-400">Adicione contatos manualmente, importe uma lista, ou eles aparecerão aqui quando alguém interagir com seus agentes</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Contato</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Telefone</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Email</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Tags</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Criado em</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.data || []).map((contact: any) => (
                  <tr key={contact.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-xs font-bold text-[#1565C0]">
                          {contact.name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{contact.name || 'Sem nome'}</div>
                          <div className="text-xs text-gray-400">{contact.externalId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        {contact.phone && <><Phone className="w-3 h-3 text-gray-400" />{contact.phone}</>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        {contact.email && <><Mail className="w-3 h-3 text-gray-400" />{contact.email}</>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(contact.tags || []).map((tag: string) => (
                          <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(contact.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditingContact(contact)}
                          title="Editar contato"
                          className="p-1.5 rounded-full text-gray-400 hover:text-[#1565C0] hover:bg-blue-50 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {contact.phone && (
                          <button
                            onClick={() => startConversationMutation.mutate(contact.id)}
                            disabled={startConversationMutation.isPending}
                            title="Iniciar conversa no WhatsApp"
                            className="p-1.5 rounded-full text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Mostrando {((page - 1) * 20) + 1}–{Math.min(page * 20, data?.total || 0)} de {data?.total} contatos</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 border rounded-md disabled:opacity-50 hover:bg-gray-50">Anterior</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * 20 >= (data?.total || 0)} className="px-3 py-1 border rounded-md disabled:opacity-50 hover:bg-gray-50">Próximo</button>
            </div>
          </div>
        </>
      )}

      {showAdd && <AddContactModal onClose={() => setShowAdd(false)} />}
      {showImport && <ImportContactsModal onClose={() => setShowImport(false)} />}
      {editingContact && <EditContactModal contact={editingContact} onClose={() => setEditingContact(null)} />}
    </div>
  )
}
