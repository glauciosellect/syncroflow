'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Trash2, Copy, Key, Loader2, Eye, EyeOff } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { formatDate } from '@/lib/utils'

export default function ApiKeysPage() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [newKey, setNewKey] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)

  const { data: keys, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.get('/api-keys').then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => api.post('/api-keys', { name }),
    onSuccess: (res) => {
      setNewKey(res.data.key)
      setName('')
      qc.invalidateQueries({ queryKey: ['api-keys'] })
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.response?.data?.error, variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api-keys/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-keys'] }); toast({ title: 'Chave revogada' }) },
  })

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key)
    toast({ title: 'Copiado!', description: 'Chave copiada para a área de transferência' })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Chaves de API</h1>
        <p className="text-gray-500 text-sm mt-1">Gerencie o acesso à API do SyncroFlow</p>
      </div>

      {newKey && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Key className="w-5 h-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-green-800 mb-1">Chave criada com sucesso!</p>
                <p className="text-xs text-green-600 mb-3">Salve agora — esta é a única vez que você verá o valor completo.</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-white border border-green-200 rounded-md px-3 py-2 text-sm font-mono text-gray-700 truncate">
                    {showKey ? newKey : newKey.slice(0, 20) + '...'}
                  </div>
                  <button onClick={() => setShowKey(s => !s)} className="p-2 hover:bg-green-100 rounded-md">
                    {showKey ? <EyeOff className="w-4 h-4 text-green-600" /> : <Eye className="w-4 h-4 text-green-600" />}
                  </button>
                  <button onClick={() => copyKey(newKey)} className="p-2 hover:bg-green-100 rounded-md">
                    <Copy className="w-4 h-4 text-green-600" />
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova chave de API</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <div className="flex-1">
              <Input placeholder="Nome da chave (ex: Produção, Teste)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && createMutation.mutate(name)} />
            </div>
            <Button onClick={() => createMutation.mutate(name)} disabled={!name.trim() || createMutation.isPending} className="hover:opacity-90">
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Gerar
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[#1565C0]" /></div>
      ) : keys?.length === 0 ? (
        <div className="text-center py-12">
          <Key className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500">Nenhuma chave de API criada ainda</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Nome</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Criado em</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Último uso</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(keys || []).map((key: any) => (
                <tr key={key.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-900">{key.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(key.createdAt)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Nunca usado'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => deleteMutation.mutate(key.id)} className="p-1.5 hover:bg-red-50 rounded-md text-gray-400 hover:text-red-600 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

