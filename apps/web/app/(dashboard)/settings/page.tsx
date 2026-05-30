'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Trash2, Loader2, Eye, EyeOff, KeyRound } from 'lucide-react'

export default function SettingsPage() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [showValues, setShowValues] = useState<Record<string, boolean>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const { data: vars, isLoading } = useQuery({
    queryKey: ['env-variables'],
    queryFn: () => api.get('/env-variables').then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/env-variables', { key: key.toUpperCase().replace(/\s/g, '_'), value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['env-variables'] })
      setShowForm(false); setKey(''); setValue('')
      toast({ title: 'Variável salva com criptografia!' })
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.response?.data?.message || 'Chave inválida. Use apenas letras maiúsculas, números e _', variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) => api.patch(`/env-variables/${id}`, { value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['env-variables'] })
      setEditingId(null); setEditValue('')
      toast({ title: 'Valor atualizado!' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/env-variables/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['env-variables'] }); toast({ title: 'Variável removida' }) },
  })

  const suggestions = [
    { key: 'OPENAI_API_KEY', label: 'OpenAI API Key' },
    { key: 'ANTHROPIC_API_KEY', label: 'Anthropic (Claude) API Key' },
    { key: 'STRIPE_SECRET_KEY', label: 'Stripe Secret Key' },
    { key: 'TWILIO_AUTH_TOKEN', label: 'Twilio Auth Token' },
  ]

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Variáveis de Ambiente</h1>
        <p className="text-gray-500 text-sm mt-1">Armazene chaves de API e tokens com criptografia AES-256. Os valores nunca são exibidos após salvos.</p>
      </div>

      <Card className="border-blue-100 bg-blue-50/40">
        <CardContent className="p-4 flex items-start gap-3">
          <KeyRound className="w-5 h-5 text-[#1565C0] mt-0.5 shrink-0" />
          <div className="text-sm text-[#1565C0]">
            <strong>Seus segredos estão seguros.</strong> Todos os valores são criptografados com AES-256 antes de serem salvos no banco de dados. Nem a equipe da SyncroFlow consegue ver os valores originais.
          </div>
        </CardContent>
      </Card>

      {!showForm && (
        <Button onClick={() => setShowForm(true)} className="hover:opacity-90">
          <Plus className="w-4 h-4 mr-2" /> Nova Variável
        </Button>
      )}

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">Adicionar Variável</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Nome da variável</Label>
              <Input
                className="mt-1 font-mono uppercase"
                placeholder="Ex: OPENAI_API_KEY"
                value={key}
                onChange={e => setKey(e.target.value.toUpperCase().replace(/\s/g, '_'))}
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {suggestions.map(s => (
                  <button key={s.key} onClick={() => setKey(s.key)}
                    className="text-xs px-2 py-1 bg-gray-100 hover:bg-blue-100 hover:text-[#1565C0] rounded-md text-gray-600 transition-colors">
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Valor (chave secreta)</Label>
              <div className="relative mt-1">
                <Input
                  type={showValues['new'] ? 'text' : 'password'}
                  className="font-mono pr-10"
                  placeholder="Cole aqui sua chave ou token"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                />
                <button onClick={() => setShowValues(p => ({ ...p, new: !p['new'] }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showValues['new'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => createMutation.mutate()} disabled={!key.trim() || !value.trim() || createMutation.isPending} className="hover:opacity-90">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Salvar com criptografia
              </Button>
              <Button variant="ghost" onClick={() => { setShowForm(false); setKey(''); setValue('') }}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Variáveis salvas ({vars?.length || 0})</CardTitle></CardHeader>
        <CardContent>
          {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[#1565C0]" /></div>}
          {!isLoading && vars?.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">Nenhuma variável cadastrada ainda</p>
          )}
          <div className="space-y-2">
            {(vars || []).map((v: any) => (
              <div key={v.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg">
                <KeyRound className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm font-medium text-gray-900">{v.key}</div>
                  {editingId === v.id ? (
                    <div className="flex gap-2 mt-1">
                      <Input
                        type="password"
                        className="font-mono text-xs h-7"
                        placeholder="Novo valor"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                      />
                      <Button size="sm" className="h-7 text-xs hover:opacity-90"
                        disabled={!editValue.trim() || updateMutation.isPending}
                        onClick={() => updateMutation.mutate({ id: v.id, value: editValue })}>
                        Salvar
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>Cancelar</Button>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 font-mono mt-0.5">••••••••••••••••</div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => { setEditingId(v.id); setEditValue('') }}
                    className="text-xs text-gray-400 hover:text-[#1565C0] px-2 py-1 rounded hover:bg-blue-50">
                    Atualizar
                  </button>
                  <button onClick={() => deleteMutation.mutate(v.id)}
                    className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


