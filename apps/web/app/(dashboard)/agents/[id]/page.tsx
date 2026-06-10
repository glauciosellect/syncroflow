'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { ArrowLeft, Save, Loader2, Bot, Send, X, Plus, Trash2, Pencil, Volume2, PlayCircle, StopCircle } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const tabs = ['Perfil', 'Treinamentos', 'Intenções', 'Fluxos', 'Configurações']
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
  const [intentionForm, setIntentionForm] = useState({ name: '', description: '', actionType: 'INTERNAL', fixedMessage: '', calendarAction: 'SCHEDULE' })
  const [editingIntention, setEditingIntention] = useState<any>(null)
  const [showFlowForm, setShowFlowForm] = useState(false)
  const [flowForm, setFlowForm] = useState({ name: '', trigger: '', script: '' })
  const [editingFlow, setEditingFlow] = useState<any>(null)
  const [viewingTraining, setViewingTraining] = useState<any>(null)
  const [editingTrainingContent, setEditingTrainingContent] = useState('')
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

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
    onError: (err: any) => toast({ title: 'Erro ao salvar treinamento', description: err?.response?.data?.error || 'Tente novamente', variant: 'destructive' }),
  })

  const trainingUrlMutation = useMutation({
    mutationFn: (url: string) => api.post(`/agents/${id}/trainings/website`, { url }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agent', id] }); setTrainingUrl(''); toast({ title: 'Site adicionado para processamento!' }) },
    onError: (err: any) => toast({ title: 'Erro ao adicionar site', description: err?.response?.data?.error || 'Tente novamente', variant: 'destructive' }),
  })

  const deleteTrainingMutation = useMutation({
    mutationFn: (trainingId: string) => api.delete(`/agents/${id}/trainings/${trainingId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', id] }),
  })

  const updateTrainingMutation = useMutation({
    mutationFn: ({ trainingId, content }: { trainingId: string; content: string }) =>
      api.patch(`/agents/${id}/trainings/${trainingId}`, { content, title: content.slice(0, 60) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent', id] })
      setViewingTraining(null)
      toast({ title: 'Treinamento atualizado!' })
    },
    onError: () => toast({ title: 'Erro ao atualizar', variant: 'destructive' }),
  })

  const createIntentionMutation = useMutation({
    mutationFn: (data: any) => api.post(`/agents/${id}/intentions`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent', id] })
      setShowIntentionForm(false)
      setIntentionForm({ name: '', description: '', actionType: 'INTERNAL', fixedMessage: '', calendarAction: 'SCHEDULE' })
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

  const { data: flows = [] } = useQuery({
    queryKey: ['flows', id],
    queryFn: () => api.get(`/agents/${id}/flows`).then(r => r.data),
  })

  const createFlowMutation = useMutation({
    mutationFn: (data: any) => api.post(`/agents/${id}/flows`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flows', id] })
      setShowFlowForm(false)
      setFlowForm({ name: '', trigger: '', script: '' })
      toast({ title: 'Fluxo criado!' })
    },
    onError: () => toast({ title: 'Erro ao criar fluxo', variant: 'destructive' }),
  })

  const updateFlowMutation = useMutation({
    mutationFn: ({ flowId, data }: { flowId: string; data: any }) => api.patch(`/agents/${id}/flows/${flowId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flows', id] })
      setEditingFlow(null)
      setShowFlowForm(false)
      setFlowForm({ name: '', trigger: '', script: '' })
      toast({ title: 'Fluxo atualizado!' })
    },
    onError: () => toast({ title: 'Erro ao atualizar fluxo', variant: 'destructive' }),
  })

  const deleteFlowMutation = useMutation({
    mutationFn: (flowId: string) => api.delete(`/agents/${id}/flows/${flowId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['flows', id] }); toast({ title: 'Fluxo removido' }) },
  })

  const toggleFlowMutation = useMutation({
    mutationFn: ({ flowId, isActive }: { flowId: string; isActive: boolean }) => api.patch(`/agents/${id}/flows/${flowId}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flows', id] }),
  })

  const handleSaveFlow = () => {
    const { name, trigger, script } = flowForm
    if (!name.trim() || !trigger.trim() || !script.trim()) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' })
      return
    }
    if (editingFlow) {
      updateFlowMutation.mutate({ flowId: editingFlow.id, data: { name, trigger, script } })
    } else {
      createFlowMutation.mutate({ name, trigger, script })
    }
  }

  const openEditFlow = (flow: any) => {
    setFlowForm({ name: flow.name, trigger: flow.trigger, script: flow.script })
    setEditingFlow(flow)
    setShowFlowForm(true)
  }

  const handleSaveIntention = () => {
    const { name, description, actionType, fixedMessage, calendarAction } = intentionForm
    const payload = actionType === 'CALENDAR'
      ? { name, description: description || null, actionType: 'CALENDAR', calendarAction, responseMode: 'FIXED_MESSAGE', webhookBody: null }
      : { name, description: description || null, actionType: 'INTERNAL', responseMode: 'FIXED_MESSAGE', webhookBody: fixedMessage ? { fixedMessage } : null }
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
      calendarAction: (intention as any).calendarAction || 'SCHEDULE',
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
    const currentHistory = testMessages
    setTestMessages(prev => [...prev, { role: 'user', content: msg }])
    setTestLoading(true)
    try {
      const res = await api.post(`/agents/${id}/test`, {
        message: msg,
        history: currentHistory.map(m => ({ role: m.role, content: m.content })),
      })
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
          <>
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
                <Label>Comportamento <span className="text-gray-400 text-xs">({(f.behavior || '').length}/6000)</span></Label>
                <p className="text-xs text-gray-400 mt-0.5 mb-1">
                  O fluxo de atendimento padrão já está configurado abaixo. Você pode editar ou adicionar regras específicas do seu negócio — tom de voz, restrições, instruções extras.
                </p>
                <textarea
                  className="w-full mt-1 border border-input rounded-md px-3 py-2 text-sm h-40 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Descreva como o agente deve se comportar, tom de voz, regras especiais..."
                  maxLength={6000}
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
                <p className="text-xs text-gray-400 mt-0.5 mb-1">
                  Escreva um resumo do seu negócio — o agente usa isso para se contextualizar. Ex: <em>"Clínica de estética localizada em SP, especializada em tratamentos faciais e corporais. Atende de segunda a sábado."</em>
                </p>
                <textarea
                  className="w-full mt-1 border border-input rounded-md px-3 py-2 text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Ex: Escritório de advocacia especializado em direito trabalhista e previdenciário, atendendo pessoas físicas em todo o Brasil de forma 100% online."
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

          {/* Lead Automático */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lead Automático</CardTitle>
              <p className="text-sm text-gray-500">Cria um lead no pipeline comercial automaticamente quando um novo contato entra em conversa</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Criar lead ao primeiro contato</Label>
                <button
                  type="button"
                  onClick={() => setConfigForm((p: any) => ({ ...(p ?? agent.config ?? {}), autoCreateLead: !(p ?? agent.config ?? {}).autoCreateLead }))}
                  className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none', (configForm ?? agent.config ?? {}).autoCreateLead ? 'bg-[#1565C0]' : 'bg-gray-200')}
                >
                  <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow', (configForm ?? agent.config ?? {}).autoCreateLead ? 'translate-x-6' : 'translate-x-1')} />
                </button>
              </div>
              {(configForm ?? agent.config ?? {}).autoCreateLead && (
                <div>
                  <Label>ID da etapa inicial <span className="text-gray-400 text-xs">opcional — cole o ID da etapa do pipeline</span></Label>
                  <Input
                    className="mt-1"
                    placeholder="ID da etapa (deixe vazio para sem etapa)"
                    value={(configForm ?? agent.config ?? {}).autoLeadStageId ?? ''}
                    onChange={e => setConfigForm((p: any) => ({ ...(p ?? agent.config ?? {}), autoLeadStageId: e.target.value || null }))}
                  />
                </div>
              )}
              <Button
                onClick={() => configMutation.mutate(configForm ?? agent.config ?? {})}
                disabled={configMutation.isPending}
                className="bg-[#1565C0] hover:bg-[#0D47A1]"
              >
                {configMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar
              </Button>
            </CardContent>
          </Card>

          {/* Primeiro Atendimento */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Primeiro Atendimento</CardTitle>
              <p className="text-sm text-gray-500">Conteúdo enviado automaticamente quando um lead entra em contato pela primeira vez</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Ativar primeiro atendimento</Label>
                <button
                  type="button"
                  onClick={() => setConfigForm((p: any) => ({ ...(p ?? agent.config ?? {}), firstContactEnabled: !(p ?? agent.config ?? {}).firstContactEnabled }))}
                  className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none', (configForm ?? agent.config ?? {}).firstContactEnabled ? 'bg-[#1565C0]' : 'bg-gray-200')}
                >
                  <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow', (configForm ?? agent.config ?? {}).firstContactEnabled ? 'translate-x-6' : 'translate-x-1')} />
                </button>
              </div>
              {(configForm ?? agent.config ?? {}).firstContactEnabled && (
                <>
                  <div>
                    <Label>Mensagem de texto <span className="text-gray-400 text-xs">opcional</span></Label>
                    <textarea
                      className="w-full mt-1 border border-input rounded-md px-3 py-2 text-sm h-28 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="Olá! Bem-vindo(a)! Sou o assistente virtual da empresa. Aqui está nosso material de apresentação..."
                      maxLength={4000}
                      value={(configForm ?? agent.config ?? {}).firstContactText ?? ''}
                      onChange={e => setConfigForm((p: any) => ({ ...(p ?? agent.config ?? {}), firstContactText: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>URL do vídeo <span className="text-gray-400 text-xs">opcional — YouTube, Vimeo, etc.</span></Label>
                    <Input
                      className="mt-1"
                      placeholder="https://youtu.be/..."
                      value={(configForm ?? agent.config ?? {}).firstContactVideoUrl ?? ''}
                      onChange={e => setConfigForm((p: any) => ({ ...(p ?? agent.config ?? {}), firstContactVideoUrl: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>URL do arquivo <span className="text-gray-400 text-xs">opcional</span></Label>
                      <Input
                        className="mt-1"
                        placeholder="https://..."
                        value={(configForm ?? agent.config ?? {}).firstContactFileUrl ?? ''}
                        onChange={e => setConfigForm((p: any) => ({ ...(p ?? agent.config ?? {}), firstContactFileUrl: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Nome do arquivo</Label>
                      <Input
                        className="mt-1"
                        placeholder="apresentacao.pdf"
                        value={(configForm ?? agent.config ?? {}).firstContactFileName ?? ''}
                        onChange={e => setConfigForm((p: any) => ({ ...(p ?? agent.config ?? {}), firstContactFileName: e.target.value }))}
                      />
                    </div>
                  </div>
                </>
              )}
              <Button
                onClick={() => configMutation.mutate(configForm ?? agent.config ?? {})}
                disabled={configMutation.isPending}
                className="bg-[#1565C0] hover:bg-[#0D47A1]"
              >
                {configMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar
              </Button>
            </CardContent>
          </Card>
          </>
        )}

        {/* ABA: TREINAMENTOS */}
        {activeTab === 'Treinamentos' && (
          <div className="space-y-4">

            {/* Orientação ao cliente */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 dark:bg-[hsl(222_28%_15%)] dark:border-[hsl(222_28%_24%)] px-4 py-3 text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <p className="font-semibold text-gray-700 dark:text-gray-300">💡 O que colocar nos treinamentos?</p>
              <p>O comportamento e o fluxo de atendimento do agente já estão configurados na aba <strong>Perfil</strong>. Aqui você ensina o agente sobre o seu negócio:</p>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>Serviços ou produtos que oferece</li>
                <li>Preços, planos e condições de pagamento</li>
                <li>Horário de funcionamento e localização</li>
                <li>Perguntas frequentes e respostas prontas</li>
                <li>Políticas, procedimentos e informações importantes</li>
              </ul>
              <p className="mt-1">Não precisa repetir "você é o agente X da empresa Y" — isso já está configurado automaticamente.</p>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Adicionar Texto</CardTitle></CardHeader>
              <CardContent>
                <textarea
                  className="w-full border border-input rounded-md px-3 py-2 text-sm h-36 resize-y focus:outline-none focus:ring-2 focus:ring-ring mb-1"
                  placeholder="Cole aqui um texto, FAQ, contrato, informações sobre serviços, políticas..."
                  value={trainingText}
                  onChange={e => setTrainingText(e.target.value)}
                  maxLength={50000}
                />
                <div className="text-xs text-gray-400 text-right mb-3">{trainingText.length}/50.000 caracteres</div>
                <Button onClick={() => trainingTextMutation.mutate(trainingText)} disabled={!trainingText.trim() || trainingTextMutation.isPending} className="bg-[#1565C0] hover:bg-[#0D47A1]">
                  {trainingTextMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                  Adicionar Texto
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Adicionar Website</CardTitle>
                <p className="text-xs text-gray-400 mt-0.5">O agente vai <strong>ler e extrair o conteúdo</strong> da página para usar como conhecimento. Diferente do campo "Site da empresa" no Perfil — que apenas informa ao agente qual é o site oficial.</p>
              </CardHeader>
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
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-700 truncate">{t.title || t.url || 'Sem título'}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="secondary" className="text-xs">{t.type}</Badge>
                          <Badge variant={t.status === 'DONE' ? 'success' : t.status === 'ERROR' ? 'destructive' : 'secondary'} className="text-xs">
                            {t.status === 'DONE' ? 'Pronto' : t.status === 'PROCESSING' ? 'Processando...' : t.status === 'ERROR' ? 'Erro' : 'Pendente'}
                          </Badge>
                          {t.chunkCount > 0 && <span className="text-xs text-gray-400">{t.chunkCount} chunks</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        {t.type === 'TEXT' && (
                          <button onClick={() => { setViewingTraining(t); setEditingTrainingContent(t.content || '') }} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600">
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => deleteTrainingMutation.mutate(t.id)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
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

            {/* Orientação sobre intenções */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 dark:bg-[hsl(222_28%_15%)] dark:border-[hsl(222_28%_24%)] px-4 py-3 text-sm text-gray-600 dark:text-gray-400 space-y-2">
              <p className="font-semibold text-gray-700 dark:text-gray-300">💡 O que são Intenções?</p>
              <p>Intenções são atalhos inteligentes — o agente lê a mensagem do cliente, identifica o que ele quer e executa uma ação automaticamente, sem precisar gerar uma resposta de IA.</p>
              <div className="space-y-1.5 mt-1">
                <p className="font-medium text-gray-700 dark:text-gray-300">Tipos de ação disponíveis:</p>
                <div className="flex items-start gap-2">
                  <span>💬</span>
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">Mensagem fixa</span>
                    <span> — responde sempre com o mesmo texto. Use para: horário de funcionamento, endereço, preços, política de cancelamento, link de pagamento, transferência para humano.</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span>📅</span>
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">Google Calendar</span>
                    <span> — agenda, consulta ou cancela um horário direto na agenda. Requer Google Calendar configurado em Configurações.</span>
                  </div>
                </div>
              </div>
              <div className="border-t border-gray-200 dark:border-[hsl(222_28%_24%)] pt-2 mt-1 space-y-1">
                <p className="font-medium text-gray-700 dark:text-gray-300">Como o agente decide quando acionar?</p>
                <p>No campo <strong>"Quando acionar"</strong>, escreva as situações ou palavras que indicam aquela intenção. Quanto mais claro e específico, melhor a detecção.</p>
                <p>Exemplos: <em>"cliente quer saber o preço"</em> · <em>"pergunta sobre horário de funcionamento"</em> · <em>"quer marcar ou agendar um horário"</em> · <em>"pede para falar com atendente humano"</em></p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Intenções</h2>
                <p className="text-xs text-gray-400 mt-0.5">Ações automáticas quando o agente detecta uma intenção do cliente</p>
              </div>
              {!showIntentionForm && (
                <Button onClick={() => { setEditingIntention(null); setIntentionForm({ name: '', description: '', actionType: 'INTERNAL', fixedMessage: '', calendarAction: 'SCHEDULE' }); setShowIntentionForm(true) }} className="bg-[#1565C0] hover:bg-[#0D47A1]" size="sm">
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
                    <Input className="mt-1" placeholder="Ex: Agendar reunião" value={intentionForm.name} onChange={e => setIntentionForm(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Tipo de ação</Label>
                    <div className="flex gap-2 mt-1">
                      {[
                        { value: 'INTERNAL', label: '💬 Mensagem fixa' },
                        { value: 'CALENDAR', label: '📅 Google Calendar' },
                      ].map(opt => (
                        <button key={opt.value} type="button"
                          onClick={() => setIntentionForm(p => ({ ...p, actionType: opt.value }))}
                          className={cn('flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors',
                            intentionForm.actionType === opt.value ? 'border-[#1565C0] bg-blue-50 text-[#1565C0]' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Quando acionar <span className="text-gray-400 text-xs">(palavras-chave ou situações)</span></Label>
                    <textarea
                      className="w-full mt-1 border border-input rounded-md px-3 py-2 text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="Ex: cliente quer agendar reunião demonstração marcar horário"
                      value={intentionForm.description}
                      onChange={e => setIntentionForm(p => ({ ...p, description: e.target.value }))}
                    />
                  </div>
                  {intentionForm.actionType === 'CALENDAR' && (
                    <div>
                      <Label>Ação no calendário</Label>
                      <select className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm"
                        value={intentionForm.calendarAction}
                        onChange={e => setIntentionForm(p => ({ ...p, calendarAction: e.target.value }))}>
                        <option value="SCHEDULE">Agendar evento</option>
                        <option value="LIST">Consultar agenda</option>
                        <option value="CANCEL">Cancelar agendamento</option>
                      </select>
                      <p className="text-xs text-gray-400 mt-1">O agente vai extrair data/hora da conversa e criar o evento automaticamente no Google Calendar.</p>
                    </div>
                  )}
                  {intentionForm.actionType === 'INTERNAL' && (
                  <div>
                    <Label>Mensagem de resposta</Label>
                    <textarea
                      className="w-full mt-1 border border-input rounded-md px-3 py-2 text-sm h-28 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="Ex: Temos planos para todos os tamanhos de operação..."
                      value={intentionForm.fixedMessage}
                      onChange={e => setIntentionForm(p => ({ ...p, fixedMessage: e.target.value }))}
                    />
                  </div>
                  )}
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

        {/* ABA: FLUXOS */}
        {activeTab === 'Fluxos' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Fluxos de Atendimento</h2>
                <p className="text-xs text-gray-500 mt-0.5">Defina como o agente deve responder em cada situação — leads, clientes, tipo de demanda etc.</p>
              </div>
              <Button size="sm" className="bg-[#1565C0] hover:bg-blue-800 text-white gap-1"
                onClick={() => { setEditingFlow(null); setFlowForm({ name: '', trigger: '', script: '' }); setShowFlowForm(true) }}>
                <Plus className="w-4 h-4" /> Novo Fluxo
              </Button>
            </div>

            {showFlowForm && (
              <Card className="border-blue-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{editingFlow ? 'Editar Fluxo' : 'Novo Fluxo de Atendimento'}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs">Nome do fluxo</Label>
                    <Input className="mt-1 text-sm" placeholder="Ex: Atendimento para Leads, Clientes Existentes, Área Cível..." value={flowForm.name} onChange={e => setFlowForm(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Quando acionar este fluxo</Label>
                    <Input className="mt-1 text-sm" placeholder="Ex: Quando o cliente nunca contratou e quer saber sobre serviços / Quando mencionar divórcio, herança, contratos..." value={flowForm.trigger} onChange={e => setFlowForm(p => ({ ...p, trigger: e.target.value }))} />
                    <p className="text-xs text-gray-400 mt-1">Descreva em linguagem natural as situações em que este fluxo deve ser usado.</p>
                  </div>
                  <div>
                    <Label className="text-xs">Script de atendimento</Label>
                    <textarea
                      className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 min-h-[180px] resize-y focus:outline-none focus:ring-2 focus:ring-blue-300"
                      placeholder={`Ex:\nEtapa 1 — Apresentação: Se for o primeiro contato, apresente-se como advogada especializada em direito de família.\nEtapa 2 — Qualificação: Pergunte qual é a situação atual (casado, separado, em processo).\nEtapa 3 — Explicação: Explique brevemente as opções disponíveis sem dar parecer jurídico.\nEtapa 4 — CTA: Convide para uma consulta inicial.`}
                      value={flowForm.script}
                      onChange={e => setFlowForm(p => ({ ...p, script: e.target.value }))}
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => { setShowFlowForm(false); setEditingFlow(null); setFlowForm({ name: '', trigger: '', script: '' }) }}>Cancelar</Button>
                    <Button size="sm" className="bg-[#1565C0] hover:bg-blue-800 text-white" onClick={handleSaveFlow}
                      disabled={createFlowMutation.isPending || updateFlowMutation.isPending}>
                      {(createFlowMutation.isPending || updateFlowMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {editingFlow ? 'Salvar alterações' : 'Criar Fluxo'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {flows.length === 0 && !showFlowForm && (
              <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                <div className="text-3xl mb-2">🔀</div>
                <div className="font-medium text-sm text-gray-500">Nenhum fluxo criado ainda</div>
                <div className="text-xs mt-1">Crie fluxos diferentes para cada tipo de cliente ou situação</div>
              </div>
            )}

            <div className="space-y-3">
              {(flows as any[]).map((flow: any) => (
                <Card key={flow.id} className={`border ${flow.isActive ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-gray-900">{flow.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${flow.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {flow.isActive ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                        <div className="text-xs text-blue-600 mt-1 font-medium">Acionar quando: <span className="font-normal text-gray-600">{flow.trigger}</span></div>
                        <div className="text-xs text-gray-500 mt-1.5 bg-gray-50 rounded-lg p-2 whitespace-pre-wrap line-clamp-3">{flow.script}</div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => toggleFlowMutation.mutate({ flowId: flow.id, isActive: !flow.isActive })}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 text-xs">
                          {flow.isActive ? 'Desativar' : 'Ativar'}
                        </button>
                        <button onClick={() => openEditFlow(flow)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteFlowMutation.mutate(flow.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                          <Trash2 className="w-4 h-4" />
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

              {/* Seletor de voz para respostas em áudio */}
              <div>
                <Label className="flex items-center gap-2 mb-2">
                  <Volume2 className="w-4 h-4 text-[#1565C0]" />
                  Voz para respostas em áudio
                </Label>
                <p className="text-xs text-gray-400 mb-3">Escolha a voz que este agente vai usar quando responder em áudio no WhatsApp.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { value: 'onyx',    label: 'Onyx',    desc: 'Homem — Grave e sóbrio', gender: 'M' },
                    { value: 'echo',    label: 'Echo',    desc: 'Homem — Jovem e claro',  gender: 'M' },
                    { value: 'fable',   label: 'Fable',   desc: 'Homem — Caloroso',       gender: 'M' },
                    { value: 'alloy',   label: 'Alloy',   desc: 'Mulher — Neutra e profissional', gender: 'F' },
                    { value: 'nova',    label: 'Nova',    desc: 'Mulher — Jovem e animada', gender: 'F' },
                    { value: 'shimmer', label: 'Shimmer', desc: 'Mulher — Suave e elegante', gender: 'F' },
                  ].map(v => {
                    const selected = (c.ttsVoice ?? 'onyx') === v.value
                    const isFemale = v.gender === 'F'
                    const isPlaying = previewingVoice === v.value

                    const handlePreview = async (e: React.MouseEvent) => {
                      e.stopPropagation()
                      if (isPlaying) {
                        audioRef.current?.pause()
                        setPreviewingVoice(null)
                        return
                      }
                      setPreviewingVoice(v.value)
                      try {
                        const res = await api.post('/integrations/tts/preview', { voice: v.value })
                        const { audio, mimeType } = res.data
                        if (audioRef.current) audioRef.current.pause()
                        const blob = new Blob([Uint8Array.from(atob(audio), c => c.charCodeAt(0))], { type: mimeType })
                        const url = URL.createObjectURL(blob)
                        const a = new Audio(url)
                        audioRef.current = a
                        a.onended = () => { setPreviewingVoice(null); URL.revokeObjectURL(url) }
                        a.onerror = () => setPreviewingVoice(null)
                        await a.play()
                      } catch { setPreviewingVoice(null) }
                    }

                    return (
                      <button
                        key={v.value}
                        type="button"
                        onClick={() => setConfigForm((p: any) => ({ ...(p || c), ttsVoice: v.value }))}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all',
                          selected ? 'border-[#1565C0] bg-blue-50 text-[#1565C0]' : 'border-gray-200 hover:border-gray-300 text-gray-700'
                        )}
                      >
                        <span className={cn(
                          'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                          isFemale ? 'bg-pink-100 text-pink-600' : 'bg-blue-100 text-blue-600'
                        )}>
                          {v.gender}
                        </span>
                        <div className="flex-1">
                          <div className="text-sm font-medium">{v.label}</div>
                          <div className="text-xs text-gray-400">{v.desc}</div>
                        </div>
                        <button
                          type="button"
                          onClick={handlePreview}
                          title={isPlaying ? 'Parar' : 'Ouvir voz'}
                          className={cn(
                            'w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors',
                            isPlaying
                              ? 'bg-red-100 text-red-500 hover:bg-red-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-blue-100 hover:text-[#1565C0]'
                          )}
                        >
                          {isPlaying
                            ? <StopCircle className="w-4 h-4" />
                            : <PlayCircle className="w-4 h-4" />}
                        </button>
                        {selected && <div className="w-2 h-2 rounded-full bg-[#1565C0] shrink-0" />}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  * Se o ElevenLabs estiver configurado, ele usa a voz do ElevenLabs e ignora esta opção.
                </p>
              </div>

              <Button onClick={() => configMutation.mutate(configForm || c)} disabled={configMutation.isPending} className="bg-[#1565C0] hover:bg-[#0D47A1]">
                {configMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar Configurações
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modal de edição de treinamento */}
      {viewingTraining && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-900">Editar Treinamento</h3>
              <button onClick={() => setViewingTraining(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <textarea
                className="w-full h-96 border border-input rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                value={editingTrainingContent}
                onChange={e => setEditingTrainingContent(e.target.value)}
              />
            </div>
            <div className="flex gap-2 p-4 border-t">
              <Button
                onClick={() => updateTrainingMutation.mutate({ trainingId: viewingTraining.id, content: editingTrainingContent })}
                disabled={updateTrainingMutation.isPending}
                className="bg-[#1565C0] hover:bg-[#0D47A1]"
              >
                {updateTrainingMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar
              </Button>
              <Button variant="ghost" onClick={() => setViewingTraining(null)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}

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
