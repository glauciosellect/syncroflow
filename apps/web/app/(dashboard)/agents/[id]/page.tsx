'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { ArrowLeft, Save, Loader2, Bot, Send, X, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const tabs = ['Perfil', 'Treinamentos', 'Intenções', 'Configurações']
const modelOptions = [
  { value: 'claude-3-5-haiku-20241022', label: 'Claude Haiku (rápido e barato)' },
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude Sonnet (equilibrado)' },
  { value: 'claude-opus-4-5', label: 'Claude Opus (mais poderoso)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4o', label: 'GPT-4o' },
]

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { toast } = useToast()
  const qc = useQueryClient()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('Perfil')
  const [testMessage, setTestMessage] = useState('')
  const [testMessages, setTestMessages] = useState<{ role: string; content: string; credits?: number }[]>([])
  const [testLoading, setTestLoading] = useState(false)
  const [showTest, setShowTest] = useState(false)
  const [trainingText, setTrainingText] = useState('')
  const [trainingUrl, setTrainingUrl] = useState('')

  const { data: agent, isLoading } = useQuery({
    queryKey: ['agent', id],
    queryFn: () => api.get(`/agents/${id}`).then(r => r.data),
  })

  const [form, setForm] = useState<any>(null)
  const [configForm, setConfigForm] = useState<any>(null)

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.patch(`/agents/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agent', id] }); toast({ title: 'Salvo com sucesso!' }) },
    onError: () => toast({ title: 'Erro ao salvar', variant: 'destructive' }),
  })

  const configMutation = useMutation({
    mutationFn: (data: any) => api.patch(`/agents/${id}/config`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agent', id] }); toast({ title: 'Configurações salvas!' }) },
  })

  const trainingTextMutation = useMutation({
    mutationFn: (content: string) => api.post(`/agents/${id}/trainings/text`, { content, title: content.slice(0, 60) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agent', id] }); setTrainingText(''); toast({ title: 'Treinamento adicionado!' }) },
  })

  const trainingUrlMutation = useMutation({
    mutationFn: (url: string) => api.post(`/agents/${id}/trainings/website`, { url }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agent', id] }); setTrainingUrl(''); toast({ title: 'Site adicionado para processamento!' }) },
  })

  const deleteTrainingMutation = useMutation({
    mutationFn: (trainingId: string) => api.delete(`/agents/${id}/trainings/${trainingId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', id] }),
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
    </div>
  )

  if (!agent) return <div className="text-center py-16 text-gray-400">Agente não encontrado</div>

  const f = form ?? agent
  const c = configForm ?? agent.config ?? {}

  const handleSendTest = async () => {
    if (!testMessage.trim()) return
    const msg = testMessage
    setTestMessage('')
    setTestMessages(prev => [...prev, { role: 'user', content: msg }])
    setTestLoading(true)
    try {
      const res = await api.post(`/agents/${id}/test`, { message: msg })
      setTestMessages(prev => [...prev, { role: 'assistant', content: res.data.response, credits: res.data.creditsUsed }])
    } catch {
      setTestMessages(prev => [...prev, { role: 'assistant', content: 'Erro ao processar resposta.' }])
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <div className="flex gap-6 h-full">
      {/* Sidebar do agente */}
      <div className="w-56 shrink-0">
        <Link href="/agents" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>

        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-violet-400 to-indigo-500 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-2">
            {agent.name?.[0]?.toUpperCase()}
          </div>
          <div className="font-semibold text-gray-900 text-sm">{agent.name}</div>
          <div className="text-xs text-gray-400 mt-0.5">{agent.companyName}</div>

          <select
            className="mt-3 w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600"
            value={f.llmModel || agent.llmModel}
            onChange={(e) => setForm((prev: any) => ({ ...(prev || agent), llmModel: e.target.value }))}
          >
            {modelOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        <nav className="space-y-1">
          {tabs.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={cn('w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                activeTab === tab ? 'bg-violet-50 text-violet-700' : 'text-gray-600 hover:bg-gray-50')}>
              {tab}
            </button>
          ))}
        </nav>

        <Button onClick={() => setShowTest(true)} variant="outline" className="w-full mt-4 text-violet-600 border-violet-200 hover:bg-violet-50">
          Testar IA
        </Button>
      </div>

      {/* Conteúdo principal */}
      <div className="flex-1 min-w-0">

        {/* ABA: PERFIL */}
        {activeTab === 'Perfil' && (
          <Card>
            <CardHeader><CardTitle className="text-base">Perfil do Agente</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Nome do agente</Label>
                <Input className="mt-1" value={f.name ?? ''} onChange={e => setForm((p: any) => ({ ...(p || agent), name: e.target.value }))} />
              </div>
              <div>
                <Label>Estilo de comunicação</Label>
                <div className="flex gap-2 mt-1">
                  {['FORMAL', 'NORMAL', 'CASUAL'].map(s => (
                    <button key={s} onClick={() => setForm((p: any) => ({ ...(p || agent), communicationStyle: s }))}
                      className={cn('flex-1 py-2 rounded-lg border text-sm font-medium transition-colors',
                        (f.communicationStyle || 'NORMAL') === s ? 'border-violet-600 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                      {s === 'FORMAL' ? 'Formal' : s === 'NORMAL' ? 'Normal' : 'Descontraído'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Comportamento <span className="text-gray-400 text-xs">({(f.behavior || '').length}/3000)</span></Label>
                <textarea
                  className="w-full mt-1 border border-input rounded-md px-3 py-2 text-sm h-40 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Descreva como o agente deve se comportar, tom de voz, regras especiais..."
                  maxLength={3000}
                  value={f.behavior ?? ''}
                  onChange={e => setForm((p: any) => ({ ...(p || agent), behavior: e.target.value }))}
                />
              </div>
              <div>
                <Label>Empresa</Label>
                <Input className="mt-1" value={f.companyName ?? ''} onChange={e => setForm((p: any) => ({ ...(p || agent), companyName: e.target.value }))} />
              </div>
              <div>
                <Label>Site da empresa</Label>
                <Input className="mt-1" placeholder="https://..." value={f.companyWebsite ?? ''} onChange={e => setForm((p: any) => ({ ...(p || agent), companyWebsite: e.target.value }))} />
              </div>
              <div>
                <Label>Descrição da empresa</Label>
                <textarea
                  className="w-full mt-1 border border-input rounded-md px-3 py-2 text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Descreva a empresa, produtos e serviços..."
                  value={f.companyDesc ?? ''}
                  onChange={e => setForm((p: any) => ({ ...(p || agent), companyDesc: e.target.value }))}
                />
              </div>
              <Button onClick={() => updateMutation.mutate(f)} disabled={updateMutation.isPending} className="bg-violet-600 hover:bg-violet-700">
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ABA: TREINAMENTOS */}
        {activeTab === 'Treinamentos' && (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Adicionar Texto</CardTitle></CardHeader>
              <CardContent>
                <textarea
                  className="w-full border border-input rounded-md px-3 py-2 text-sm h-28 resize-none focus:outline-none focus:ring-2 focus:ring-ring mb-3"
                  placeholder="Cole aqui um texto, FAQ, informações sobre produtos, políticas..."
                  value={trainingText}
                  onChange={e => setTrainingText(e.target.value)}
                />
                <Button onClick={() => trainingTextMutation.mutate(trainingText)} disabled={!trainingText.trim() || trainingTextMutation.isPending} className="bg-violet-600 hover:bg-violet-700">
                  {trainingTextMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                  Adicionar Texto
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Adicionar Website</CardTitle></CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input placeholder="https://seusite.com/pagina" value={trainingUrl} onChange={e => setTrainingUrl(e.target.value)} />
                  <Button onClick={() => trainingUrlMutation.mutate(trainingUrl)} disabled={!trainingUrl.trim() || trainingUrlMutation.isPending} className="bg-violet-600 hover:bg-violet-700">
                    {trainingUrlMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Adicionar'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Treinamentos ({agent.trainings?.length || 0})</CardTitle></CardHeader>
              <CardContent>
                {agent.trainings?.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Nenhum treinamento ainda</p>}
                <div className="space-y-2">
                  {(agent.trainings || []).map((t: any) => (
                    <div key={t.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                      <div>
                        <div className="text-sm font-medium text-gray-700">{t.title || t.url || 'Sem título'}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="secondary" className="text-xs">{t.type}</Badge>
                          <Badge variant={t.status === 'DONE' ? 'success' : t.status === 'ERROR' ? 'destructive' : 'secondary'} className="text-xs">
                            {t.status === 'DONE' ? 'Pronto' : t.status === 'PROCESSING' ? 'Processando...' : t.status === 'ERROR' ? 'Erro' : 'Pendente'}
                          </Badge>
                          {t.chunkCount > 0 && <span className="text-xs text-gray-400">{t.chunkCount} chunks</span>}
                        </div>
                      </div>
                      <button onClick={() => deleteTrainingMutation.mutate(t.id)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ABA: INTENÇÕES */}
        {activeTab === 'Intenções' && (
          <Card>
            <CardContent className="py-12 text-center">
              <Bot className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-700 mb-2">Intenções</h3>
              <p className="text-sm text-gray-400 mb-4">Configure ações automáticas que o agente executa quando detecta uma intenção específica do cliente.</p>
              <Button className="bg-violet-600 hover:bg-violet-700">
                <Plus className="w-4 h-4 mr-2" /> Criar Intenção
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ABA: CONFIGURAÇÕES */}
        {activeTab === 'Configurações' && (
          <Card>
            <CardHeader><CardTitle className="text-base">Configurações do Agente</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: 'transferToHuman', label: 'Transferir para humano', desc: 'Permite transferir para equipe humana' },
                { key: 'useEmojis', label: 'Usar emojis nas respostas', desc: 'O agente pode usar emojis' },
                { key: 'signNameInResponses', label: 'Assinar nome nas respostas', desc: 'Agente assina as mensagens' },
                { key: 'restrictTopics', label: 'Restringir temas', desc: 'Responde só sobre a empresa' },
                { key: 'splitLongMessages', label: 'Dividir mensagens longas', desc: 'Separa respostas em partes' },
                { key: 'allowReminders', label: 'Permitir lembretes', desc: 'Agente pode registrar lembretes' },
              ].map(opt => {
                const val = c[opt.key] ?? false
                return (
                  <div key={opt.key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <div className="text-sm font-medium text-gray-700">{opt.label}</div>
                      <div className="text-xs text-gray-400">{opt.desc}</div>
                    </div>
                    <button onClick={() => setConfigForm((p: any) => ({ ...(p || c), [opt.key]: !val }))}
                      className={cn('w-10 h-5 rounded-full transition-colors', val ? 'bg-violet-600' : 'bg-gray-300')}>
                      <div className={cn('w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5', val ? 'translate-x-5' : 'translate-x-0')} />
                    </button>
                  </div>
                )
              })}

              <div>
                <Label>Delay de resposta</Label>
                <select className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm"
                  value={c.responseDelay ?? 0}
                  onChange={e => setConfigForm((p: any) => ({ ...(p || c), responseDelay: Number(e.target.value) }))}>
                  <option value={0}>Imediatamente</option>
                  <option value={3}>3 segundos</option>
                  <option value={5}>5 segundos</option>
                  <option value={10}>10 segundos</option>
                  <option value={30}>30 segundos</option>
                </select>
              </div>

              <Button onClick={() => configMutation.mutate(configForm || c)} disabled={configMutation.isPending} className="bg-violet-600 hover:bg-violet-700">
                {configMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar Configurações
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Painel de teste */}
      {showTest && (
        <div className="w-80 shrink-0">
          <Card className="h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm">Testar IA</CardTitle>
              <button onClick={() => { setShowTest(false); setTestMessages([]) }} className="p-1 hover:bg-gray-50 rounded">
                <X className="w-4 h-4" />
              </button>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-3">
              <div className="flex-1 overflow-y-auto space-y-2 mb-3 min-h-48">
                {testMessages.length === 0 && (
                  <div className="text-center py-6 text-xs text-gray-400">Envie uma mensagem para testar</div>
                )}
                {testMessages.map((m, i) => (
                  <div key={i} className={cn('text-xs rounded-xl px-3 py-2 max-w-[85%]', m.role === 'user' ? 'ml-auto bg-violet-600 text-white' : 'bg-gray-100 text-gray-700')}>
                    {m.content}
                    {m.credits && <div className="text-xs opacity-60 mt-1">{m.credits} créditos</div>}
                  </div>
                ))}
                {testLoading && <div className="bg-gray-100 rounded-xl px-3 py-2 text-xs text-gray-400 max-w-[85%]">Digitando...</div>}
              </div>
              <div className="flex gap-2">
                <Input className="text-xs h-8" placeholder="Digite uma mensagem..." value={testMessage}
                  onChange={e => setTestMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendTest()} />
                <Button size="sm" onClick={handleSendTest} disabled={testLoading || !testMessage.trim()} className="h-8 bg-violet-600 hover:bg-violet-700">
                  <Send className="w-3 h-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
