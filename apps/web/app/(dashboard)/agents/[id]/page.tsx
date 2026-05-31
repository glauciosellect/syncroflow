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
import { ArrowLeft, Save, Loader2, Bot, Send, X, Plus, Trash2, Pencil } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const tabs = ['Perfil', 'Treinamentos', 'Intenções', 'Configurações']
const modelOptions = [
  { value: 'claude-haiku-4-5', label: 'Claude Haiku', desc: 'Rápido e econômico', creditsPerMsg: 1, color: 'text-green-600' },
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude Sonnet', desc: 'Equilibrado', creditsPerMsg: 3, color: 'text-blue-600' },
  { value: 'claude-opus-4-5', label: 'Claude Opus', desc: 'Máxima inteligência', creditsPerMsg: 10, color: 'text-[#1565C0]' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', desc: 'Alternativa econômica', creditsPerMsg: 1, color: 'text-green-600' },
  { value: 'gpt-4o', label: 'GPT-4o', desc: 'Alternativa poderosa', creditsPerMsg: 5, color: 'text-orange-600' },
]

function calcMsgEstimate(credits: number, creditsPerMsg: number) {
  if (!credits || credits <= 0) return '0'
  return Math.floor(credits / creditsPerMsg).toLocaleString('pt-BR')
}

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
  const [showIntentionForm, setShowIntentionForm] = useState(false)
  const [intentionForm, setIntentionForm] = useState({ name: '', description: '', actionType: 'INTERNAL', fixedMessage: '' })
  const [editingIntention, setEditingIntention] = useState<any>(null)

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

  const createIntentionMutation = useMutation({
    mutationFn: (data: any) => api.post(`/agents/${id}/intentions`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent', id] })
      setShowIntentionForm(false)
      setIntentionForm({ name: '', description: '', actionType: 'INTERNAL', fixedMessage: '' })
      toast({ title: 'Intenção criada!' })
    },
    onError: () => toast({ title: 'Erro ao criar intenção', variant: 'destructive' }),
  })

  const updateIntentionMutation = useMutation({
    mutationFn: ({ intentId, data }: { intentId: string; data: any }) => api.patch(`/agents/${id}/intentions/${intentId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent', id] })
      setEditingIntention(null)
      toast({ title: 'Intenção atualizada!' })
    },
    onError: () => toast({ title: 'Erro ao atualizar', variant: 'destructive' }),
  })

  const deleteIntentionMutation = useMutation({
    mutationFn: (intentId: string) => api.delete(`/agents/${id}/intentions/${intentId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agent', id] }); toast({ title: 'Intenção removida' }) },
  })

  const handleSaveIntention = () => {
    const payload = {
      name: intentionForm.name,
      description: intentionForm.description || null,
      actionType: 'INTERNAL',
      responseMode: 'FIXED_MESSAGE',
      webhookBody: intentionForm.fixedMessage ? { fixedMessage: intentionForm.fixedMessage } : null,
    }
    if (editingIntention) {
      updateIntentionMutation.mutate({ intentId: editingIntention.id, data: payload })
    } else {
      createIntentionMutation.mutate(payload)
    }
  }

  const openEditIntention = (intention: any) => {
    setIntentionForm({
      name: intention.name || '',
      description: intention.description || '',
      actionType: intention.actionType || 'INTERNAL',
      fixedMessage: intention.webhookBody?.fixedMessage || '',
    })
    setEditingIntention(intention)
    setShowIntentionForm(true)
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-[#1565C0]" />
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
          <div className="w-16 h-16 bg-gradient-to-br from-[#1565C0] to-[#2E7D32] rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-2">
            {agent.name?.[0]?.toUpperCase()}
          </div>
          <div className="font-semibold text-gray-900 text-sm">{agent.name}</div>
          <div className="text-xs text-gray-400 mt-0.5">{agent.companyName}</div>

          <div className="mt-3">
            <select
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600"
              value={f.llmModel || agent.llmModel}
              onChange={(e) => setForm((prev: any) => ({ ...(prev || agent), llmModel: e.target.value }))}
            >
              {modelOptions.map(m => (
                <option key={m.value} value={m.value}>{m.label} — {m.desc}</option>
              ))}
            </select>
            {(() => {
              const selected = modelOptions.find(m => m.value === (f.llmModel || agent.llmModel))
              const wsCredits = (agent as any).workspace?.credits ?? 0
              if (!selected) return null
              return (
                <div className={`mt-1.5 text-xs rounded-lg px-2 py-1.5 bg-gray-50 border border-gray-100`}>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Custo por msg</span>
                    <span className={`font-semibold ${selected.color}`}>{selected.creditsPerMsg} crédito{selected.creditsPerMsg > 1 ? 's' : ''}</span>
                  </div>
                  {wsCredits > 0 && (
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-gray-500">Msgs estimadas</span>
                      <span className="font-semibold text-gray-700">~{calcMsgEstimate(wsCredits, selected.creditsPerMsg)}</span>
                    </div>
                  )}
                  {selected.creditsPerMsg > 3 && (
                    <div className="mt-1 text-amber-600 text-xs">⚠️ Consome {selected.creditsPerMsg}x mais que o padrão</div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>

        <nav className="space-y-1">
          {tabs.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={cn('w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                activeTab === tab ? 'bg-blue-50 text-[#1565C0]' : 'text-gray-600 hover:bg-gray-50')}>
              {tab}
            </button>
          ))}
        </nav>

        <Button onClick={() => setShowTest(true)} variant="outline" className="w-full mt-4 text-[#1565C0] border-blue-200 hover:bg-blue-50">
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
                        (f.communicationStyle || 'NORMAL') === s ? 'border-[#1565C0] bg-blue-50 text-[#1565C0]' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
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
                <Label>Descrição da empresa <span className="text-gray-400 text-xs">({(f.companyDesc || '').length}/2000)</span></Label>
                <textarea
                  className="w-full mt-1 border border-input rounded-md px-3 py-2 text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Descreva a empresa, produtos e serviços..."
                  maxLength={2000}
                  value={f.companyDesc ?? ''}
                  onChange={e => setForm((p: any) => ({ ...(p || agent), companyDesc: e.target.value }))}
                />
              </div>
              <Button onClick={() => updateMutation.mutate(f)} disabled={updateMutation.isPending} className="bg-[#1565C0] hover:bg-[#0D47A1]">
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
                <Button onClick={() => trainingTextMutation.mutate(trainingText)} disabled={!trainingText.trim() || trainingTextMutation.isPending} className="bg-[#1565C0] hover:bg-[#0D47A1]">
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
                  <Button onClick={() => trainingUrlMutation.mutate(trainingUrl)} disabled={!trainingUrl.trim() || trainingUrlMutation.isPending} className="bg-[#1565C0] hover:bg-[#0D47A1]">
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
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Intenções</h2>
                <p className="text-xs text-gray-400 mt-0.5">Ações automáticas quando o agente detecta uma intenção do cliente</p>
              </div>
              {!showIntentionForm && (
                <Button onClick={() => { setEditingIntention(null); setIntentionForm({ name: '', description: '', actionType: 'INTERNAL', fixedMessage: '' }); setShowIntentionForm(true) }} className="bg-[#1565C0] hover:bg-[#0D47A1]" size="sm">
                  <Plus className="w-3 h-3 mr-1" /> Nova Intenção
                </Button>
              )}
            </div>

            {showIntentionForm && (
              <Card>
                <CardHeader><CardTitle className="text-sm">{editingIntention ? 'Editar Intenção' : 'Nova Intenção'}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Nome da intenção</Label>
                    <Input className="mt-1" placeholder="Ex: Solicitar demonstração" value={intentionForm.name} onChange={e => setIntentionForm(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Descrição <span className="text-gray-400 text-xs">(quando o agente deve acionar esta intenção)</span></Label>
                    <textarea
                      className="w-full mt-1 border border-input rounded-md px-3 py-2 text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="Ex: Cliente pergunta sobre preços, planos ou quer saber quanto custa"
                      value={intentionForm.description}
                      onChange={e => setIntentionForm(p => ({ ...p, description: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Mensagem de resposta</Label>
                    <textarea
                      className="w-full mt-1 border border-input rounded-md px-3 py-2 text-sm h-28 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="Ex: Temos planos para todos os tamanhos de operação. Pode me informar quantos atendimentos sua empresa realiza por mês?"
                      value={intentionForm.fixedMessage}
                      onChange={e => setIntentionForm(p => ({ ...p, fixedMessage: e.target.value }))}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveIntention} disabled={!intentionForm.name.trim() || createIntentionMutation.isPending || updateIntentionMutation.isPending} className="bg-[#1565C0] hover:bg-[#0D47A1]">
                      {(createIntentionMutation.isPending || updateIntentionMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                      {editingIntention ? 'Atualizar' : 'Criar Intenção'}
                    </Button>
                    <Button variant="ghost" onClick={() => { setShowIntentionForm(false); setEditingIntention(null) }}>Cancelar</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {(agent.intentions?.length === 0 && !showIntentionForm) && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Bot className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                  <h3 className="font-semibold text-gray-700 mb-2">Nenhuma intenção cadastrada</h3>
                  <p className="text-sm text-gray-400">Crie intenções para o agente executar ações automáticas quando detectar o que o cliente precisa.</p>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              {(agent.intentions || []).map((intention: any) => (
                <Card key={intention.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm text-gray-900">{intention.name}</span>
                          <Badge variant={intention.isActive !== false ? 'success' : 'secondary'} className="text-xs">
                            {intention.isActive !== false ? 'Ativa' : 'Inativa'}
                          </Badge>
                        </div>
                        {intention.description && <p className="text-xs text-gray-500 mb-1">{intention.description}</p>}
                        {intention.webhookBody?.fixedMessage && (
                          <p className="text-xs text-gray-400 bg-gray-50 rounded px-2 py-1 mt-1 truncate">"{intention.webhookBody.fixedMessage}"</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEditIntention(intention)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteIntentionMutation.mutate(intention.id)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
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
                      className={cn('w-10 h-5 rounded-full transition-colors', val ? 'bg-[#1565C0]' : 'bg-gray-300')}>
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

              <Button onClick={() => configMutation.mutate(configForm || c)} disabled={configMutation.isPending} className="bg-[#1565C0] hover:bg-[#0D47A1]">
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
                  <div key={i} className={cn('text-xs rounded-xl px-3 py-2 max-w-[85%]', m.role === 'user' ? 'ml-auto bg-[#1565C0] text-white' : 'bg-gray-100 text-gray-700')}>
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
                <Button size="sm" onClick={handleSendTest} disabled={testLoading || !testMessage.trim()} className="h-8 bg-[#1565C0] hover:bg-[#0D47A1]">
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
