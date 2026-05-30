'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Search, Bot, Power, Pencil, TestTube, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { AgentWizard } from '@/components/agents/agent-wizard'

const purposeLabel: Record<string, string> = { SUPPORT: 'Suporte', SALES: 'Vendas', PERSONAL: 'Pessoal' }
const modelLabel: Record<string, string> = {
  'claude-3-5-haiku-20241022': 'Claude Haiku',
  'claude-3-5-sonnet-20241022': 'Claude Sonnet',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4o': 'GPT-4o',
}

export default function AgentsPage() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showWizard, setShowWizard] = useState(false)

  const { data: agents, isLoading } = useQuery({
    queryKey: ['agents', search],
    queryFn: () => api.get('/agents', { params: search ? { search } : {} }).then(r => r.data),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/agents/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/agents/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agents'] }); toast({ title: 'Agente excluído' }) },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agentes</h1>
          <p className="text-gray-500 text-sm mt-1">Crie e gerencie seus agentes de IA</p>
        </div>
        <Button onClick={() => setShowWizard(true)} className="hover:opacity-90">
          <Plus className="w-4 h-4 mr-2" />
          Novo Agente
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input placeholder="Buscar agentes..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#1565C0]" />
        </div>
      )}

      {!isLoading && agents?.length === 0 && (
        <div className="text-center py-16">
          <Bot className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Nenhum agente ainda</h3>
          <p className="text-gray-400 mb-6">Crie seu primeiro agente de IA para começar a atender clientes</p>
          <Button onClick={() => setShowWizard(true)} className="hover:opacity-90">
            <Plus className="w-4 h-4 mr-2" />
            Criar primeiro agente
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(agents || []).map((agent: any) => (
          <Card key={agent.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-[#1565C0] to-[#2E7D32] rounded-full flex items-center justify-center text-white text-xl font-bold shadow-sm">
                    {agent.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{agent.name}</div>
                    <Badge variant="secondary" className="text-xs mt-0.5">{purposeLabel[agent.purpose]}</Badge>
                  </div>
                </div>
                <button onClick={() => toggleMutation.mutate(agent.id)} className={`w-10 h-5 rounded-full transition-colors ${agent.isActive ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${agent.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {agent.companyName && <p className="text-sm text-gray-500 mb-2">{agent.companyName}</p>}
              <div className="text-xs text-gray-400 mb-3">{modelLabel[agent.llmModel] || agent.llmModel}</div>

              <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                <Link href={`/agents/${agent.id}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    <Pencil className="w-3 h-3 mr-1" />
                    Editar
                  </Button>
                </Link>
                <Link href={`/agents/${agent.id}?tab=test`}>
                  <Button variant="ghost" size="sm">
                    <TestTube className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {showWizard && <AgentWizard onClose={() => setShowWizard(false)} onSuccess={() => { setShowWizard(false); qc.invalidateQueries({ queryKey: ['agents'] }) }} />}
    </div>
  )
}


