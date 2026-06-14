'use client'
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Search, Star, Zap, ChevronRight, CheckCircle, X, ArrowRight, ArrowLeft, Plug, MessageSquare, Settings2, Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'

const CATEGORIES = [
  { slug: 'all',       label: 'Todos',                    icon: '⚡' },
  { slug: 'ecommerce', label: 'E-commerce & Marketplaces', icon: '🛍️' },
  { slug: 'crm',       label: 'CRM & Vendas',              icon: '🤝' },
  { slug: 'finance',   label: 'Financeiro & Cobrança',     icon: '💰' },
  { slug: 'marketing', label: 'Marketing & Leads',         icon: '📣' },
  { slug: 'ai',        label: 'Inteligência Artificial',   icon: '🤖' },
  { slug: 'general',   label: 'Geral',                    icon: '🔧' },
]

const CONNECTOR_LABELS: Record<string, string> = {
  nuvemshop: 'Nuvemshop', shopify: 'Shopify', mercadolivre: 'Mercado Livre',
  whatsapp: 'WhatsApp', hubspot: 'HubSpot', pipedrive: 'Pipedrive',
  asaas: 'Asaas', pagarme: 'Pagar.me', bling: 'Bling',
  tiktokshop: 'TikTok Shop', shopee: 'Shopee', activecampaign: 'ActiveCampaign',
}

// CONNECTOR_STATUS é calculado dinamicamente via useConnectorStatus()
function useConnectorStatus() {
  const { data: channels = [] } = useQuery<{ id: string; type: string; status: string }[]>({
    queryKey: ['channels-list'],
    queryFn: () => api.get('/channels').then(r => r.data),
    staleTime: 30_000,
  })
  const { data: ecommerce = [] } = useQuery<{ platform: string; status: string }[]>({
    queryKey: ['ecommerce-integrations-list'],
    queryFn: () => api.get('/ecommerce/integrations').then(r => r.data),
    staleTime: 30_000,
  })
  const { data: finance = [] } = useQuery<{ platform: string; status: string }[]>({
    queryKey: ['finance-connections-list'],
    queryFn: () => api.get('/finance/connections').then(r => r.data),
    staleTime: 30_000,
  })

  const status: Record<string, boolean> = {}
  const whatsappConnected = channels.some(c => c.type === 'whatsapp' && c.status === 'active')
  if (whatsappConnected) status['whatsapp'] = true
  ecommerce.forEach(i => { if (i.status === 'active') status[i.platform] = true })
  finance.forEach(i => { if (i.status === 'active') status[i.platform] = true })
  return status
}

// Variáveis disponíveis por plataforma
const VARS_BY_PLATFORM: Record<string, string[]> = {
  nuvemshop:     ['{cliente.nome}', '{pedido.numero}', '{pedido.total}', '{pedido.prazo_entrega}', '{carrinho.link}', '{produto.nome}', '{produto.estoque}'],
  asaas:         ['{cliente.nome}', '{cobranca.valor}', '{cobranca.link_pix}', '{cobranca.vencimento}'],
  mercadolivre:  ['{cliente.nome}', '{pergunta.texto}', '{anuncio.titulo}'],
  whatsapp:      ['{cliente.nome}', '{cliente.telefone}', '{mensagem.texto}'],
  tiktokshop:    ['{pedido.id}', '{pedido.valor}', '{cliente.nome}'],
  shopee:        ['{cliente.nome}', '{mensagem.texto}'],
  any:           ['{cliente.nome}', '{cliente.email}'],
}

interface Template {
  id: string
  title: string
  description: string
  category: string
  connectorsRequired: string[]
  usesCount: number
  isFeatured: boolean
  tags: string[]
  createdAt: string
}

interface TemplateDetail extends Template {
  workflowConfig: any
}

// ─── Extrai campos editáveis do workflowConfig ────────────────────────────────
function extractEditableFields(config: any): { index: number; field: string; label: string; value: string; type: 'message' | 'delay' | 'threshold' }[] {
  const fields: any[] = []
  if (!config?.actions) return fields
  config.actions.forEach((action: any, i: number) => {
    if (action.message) {
      fields.push({
        index: i,
        field: 'message',
        label: action.timing ? `Mensagem (${action.timing})` : `Mensagem ${fields.length + 1}`,
        value: action.message,
        type: 'message',
      })
    }
    if (action.delay) {
      fields.push({ index: i, field: 'delay', label: 'Intervalo de envio', value: action.delay, type: 'delay' })
    }
  })
  if (config.trigger?.threshold !== undefined) {
    fields.push({ index: -1, field: 'threshold', label: 'Estoque mínimo para alerta', value: String(config.trigger.threshold), type: 'threshold' })
  }
  return fields
}

// ─── Modal de configuração step-by-step ──────────────────────────────────────
function TemplateConfigModal({
  template,
  detail,
  onClose,
  onConfirm,
  loading,
  connectorStatus,
}: {
  template: Template
  detail: TemplateDetail | undefined
  onClose: () => void
  onConfirm: (config: any) => void
  loading: boolean
  connectorStatus: Record<string, boolean>
}) {
  const [step, setStep] = useState(0)
  const config = detail?.workflowConfig ?? {}
  const initialFields = extractEditableFields(config)
  const [fields, setFields] = useState(initialFields)
  const triggerPlatform = config.trigger?.platform ?? 'any'
  const availableVars = [
    ...(VARS_BY_PLATFORM[triggerPlatform] ?? []),
    ...(VARS_BY_PLATFORM['any'] ?? []),
  ].filter((v, i, arr) => arr.indexOf(v) === i)

  const STEPS = [
    { label: 'Conectores', icon: Plug },
    { label: 'Mensagens', icon: MessageSquare },
    { label: 'Revisar', icon: Settings2 },
    { label: 'Ativar', icon: Rocket },
  ]

  const messageFields = fields.filter(f => f.type === 'message')
  const otherFields = fields.filter(f => f.type !== 'message')
  const hasMessages = messageFields.length > 0

  const updateField = (idx: number, value: string) => {
    setFields(prev => prev.map((f, i) => i === idx ? { ...f, value } : f))
  }

  const insertVar = (fieldIdx: number, variable: string) => {
    setFields(prev => prev.map((f, i) => i === fieldIdx ? { ...f, value: f.value + variable } : f))
  }

  const buildFinalConfig = () => {
    const updated = JSON.parse(JSON.stringify(config))
    fields.forEach(f => {
      if (f.index >= 0 && updated.actions?.[f.index]) {
        updated.actions[f.index][f.field] = f.type === 'threshold' ? Number(f.value) : f.value
      }
      if (f.field === 'threshold' && updated.trigger) {
        updated.trigger.threshold = Number(f.value)
      }
    })
    return updated
  }

  const canNext = () => {
    if (step === 1) return messageFields.every(f => f.value.trim().length > 0)
    return true
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="p-5 text-white shrink-0" style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs font-medium text-white/70 mb-1">Configurar template</div>
              <h2 className="font-bold text-base leading-snug">{template.title}</h2>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-full shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
          {/* Steps */}
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-1 flex-1">
                <div className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all flex-1 justify-center',
                  i === step ? 'bg-white text-[#1565C0]' : i < step ? 'bg-white/30 text-white' : 'bg-white/10 text-white/50'
                )}>
                  <s.icon className="w-3 h-3" />
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <div className={cn('w-3 h-px shrink-0', i < step ? 'bg-white/60' : 'bg-white/20')} />}
              </div>
            ))}
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* Step 0 — Conectores */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Conectores necessários</h3>
                <p className="text-xs text-gray-500">Verifique se as integrações abaixo estão conectadas antes de ativar.</p>
              </div>
              {template.connectorsRequired.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-400" />
                  <p className="text-sm">Este template não precisa de conectores externos.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {template.connectorsRequired.map(c => {
                    const connected = connectorStatus[c] ?? false
                    return (
                      <div key={c} className={cn(
                        'flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all',
                        connected ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50'
                      )}>
                        <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', connected ? 'bg-green-500' : 'bg-orange-400')} />
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-gray-900">{CONNECTOR_LABELS[c] ?? c}</div>
                          <div className={cn('text-xs mt-0.5', connected ? 'text-green-600' : 'text-orange-600')}>
                            {connected ? 'Conectado ✓' : 'Não conectado — configure em Integrações'}
                          </div>
                        </div>
                        {!connected && (
                          <a href="/integrations" className="text-xs font-semibold text-[#1565C0] hover:underline shrink-0">
                            Conectar →
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              {template.connectorsRequired.some(c => !connectorStatus[c]) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  ⚠️ Você pode continuar a configuração agora e conectar as integrações depois, mas o template só funcionará quando todas estiverem ativas.
                </div>
              )}
            </div>
          )}

          {/* Step 1 — Mensagens */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Editar mensagens</h3>
                <p className="text-xs text-gray-500">Personalize o texto. Use as variáveis abaixo para inserir dados dinâmicos.</p>
              </div>

              {!hasMessages && otherFields.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Este template não possui mensagens editáveis.</p>
                </div>
              )}

              {/* Variáveis disponíveis */}
              {(hasMessages || otherFields.length > 0) && availableVars.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-1.5">Variáveis disponíveis (clique para inserir no campo ativo):</p>
                  <div className="flex flex-wrap gap-1.5" id="var-chips">
                    {availableVars.map(v => (
                      <button
                        key={v}
                        type="button"
                        className="text-[10px] px-2 py-1 bg-blue-50 text-[#1565C0] rounded-full border border-blue-100 hover:bg-blue-100 font-mono transition-colors"
                        onClick={() => {
                          const active = document.activeElement as HTMLTextAreaElement | HTMLInputElement
                          if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
                            const idx = Number(active.dataset.fieldidx)
                            if (!isNaN(idx)) insertVar(idx, v)
                          }
                        }}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Campos de mensagem */}
              {messageFields.map((f, localIdx) => {
                const globalIdx = fields.indexOf(f)
                return (
                  <div key={localIdx} className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">{f.label}</label>
                    <textarea
                      data-fieldidx={globalIdx}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1565C0]/30 focus:border-[#1565C0] leading-relaxed"
                      rows={4}
                      value={f.value}
                      onChange={e => updateField(globalIdx, e.target.value)}
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-gray-400">Clique em uma variável acima para inserir no cursor</p>
                      <span className="text-[10px] text-gray-400">{f.value.length} chars</span>
                    </div>
                  </div>
                )
              })}

              {/* Outros campos (delay, threshold) */}
              {otherFields.map((f, localIdx) => {
                const globalIdx = fields.indexOf(f)
                return (
                  <div key={localIdx} className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">{f.label}</label>
                    <input
                      data-fieldidx={globalIdx}
                      type={f.type === 'threshold' ? 'number' : 'text'}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]/30 focus:border-[#1565C0]"
                      value={f.value}
                      onChange={e => updateField(globalIdx, e.target.value)}
                      placeholder={f.type === 'delay' ? 'Ex: 24h, 2d' : f.type === 'threshold' ? 'Ex: 5' : ''}
                    />
                    {f.type === 'delay' && (
                      <p className="text-[10px] text-gray-400">Formato: 1h = 1 hora, 1d = 1 dia, 30m = 30 minutos</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Step 2 — Revisar */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Revisão final</h3>
                <p className="text-xs text-gray-500">Confirme as configurações antes de ativar o template.</p>
              </div>

              {/* Resumo do trigger */}
              {config.trigger && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-[#1565C0] uppercase tracking-wider mb-2">Gatilho</p>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">{CONNECTOR_LABELS[config.trigger.platform] ?? config.trigger.platform}</span>
                    {' → '}
                    <span className="font-mono text-xs bg-blue-100 px-1.5 py-0.5 rounded">{config.trigger.event}</span>
                  </p>
                </div>
              )}

              {/* Mensagens configuradas */}
              {fields.map((f, i) => (
                <div key={i} className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{f.label}</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{f.value || <span className="text-gray-400 italic">(vazio)</span>}</p>
                </div>
              ))}

              {fields.length === 0 && (
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-sm text-gray-500 text-center">
                  Sem campos personalizáveis — o template será ativado com a configuração padrão.
                </div>
              )}

              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-700">
                ✅ Tudo certo! Clique em <strong>Ativar template</strong> para confirmar.
              </div>
            </div>
          )}

          {/* Step 3 — Ativado */}
          {step === 3 && (
            <div className="text-center py-6 space-y-4">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#1565C0] to-[#2E7D32] flex items-center justify-center mx-auto shadow-lg">
                {loading
                  ? <Loader2 className="w-8 h-8 text-white animate-spin" />
                  : <CheckCircle className="w-8 h-8 text-white" />
                }
              </div>
              {loading ? (
                <>
                  <h3 className="text-lg font-bold text-gray-900">Ativando template...</h3>
                  <p className="text-sm text-gray-500">Aguarde um instante</p>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-gray-900">Template ativado!</h3>
                  <p className="text-sm text-gray-500 max-w-xs mx-auto">
                    A automação está configurada e será executada automaticamente quando o gatilho for disparado.
                  </p>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-[#1565C0] text-left">
                    💡 Certifique-se que os conectores necessários estejam ativos em <strong>Integrações</strong> para que a automação funcione.
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer com navegação */}
        <div className="flex items-center justify-between p-5 border-t border-gray-100 shrink-0">
          {step === 3 ? (
            <Button onClick={onClose} className="w-full" style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }}>
              Fechar
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={step === 0 ? onClose : () => setStep(s => s - 1)} className="gap-1">
                {step === 0 ? <X className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
                {step === 0 ? 'Cancelar' : 'Voltar'}
              </Button>

              {step < 2 ? (
                <Button
                  onClick={() => setStep(s => s + 1)}
                  disabled={!canNext()}
                  className="gap-1"
                  style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }}
                >
                  Continuar <ArrowRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setStep(3)
                    onConfirm(buildFinalConfig())
                  }}
                  disabled={loading}
                  className="gap-1.5 font-semibold"
                  style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                  Ativar template
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const { toast } = useToast()
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [configuring, setConfiguring] = useState<Template | null>(null)
  const [used, setUsed] = useState<Set<string>>(new Set())
  const connectorStatus = useConnectorStatus()

  const { data, isLoading } = useQuery<{ templates: Template[]; total: number }>({
    queryKey: ['templates', category, search],
    queryFn: () => {
      const params = new URLSearchParams()
      if (category !== 'all') params.set('category', category)
      if (search.trim()) params.set('search', search.trim())
      return api.get(`/templates?${params}`).then(r => r.data)
    },
  })

  const detailQuery = useQuery<TemplateDetail>({
    queryKey: ['template-detail', configuring?.id],
    queryFn: () => api.get(`/templates/${configuring!.id}`).then(r => r.data),
    enabled: !!configuring,
  })

  const activateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/templates/${id}/use`).then(r => r.data),
    onSuccess: (_data: any, id: string) => {
      setUsed(prev => new Set(Array.from(prev).concat(id)))
      toast({ title: '✅ Template ativado!', description: 'A automação está configurada e pronta para usar.' })
    },
    onError: () => toast({ title: 'Erro ao ativar template', variant: 'destructive' }),
  })

  const templates = data?.templates ?? []
  const featured = templates.filter(t => t.isFeatured)
  const rest = templates.filter(t => !t.isFeatured)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Modal de configuração */}
      {configuring && (
        <TemplateConfigModal
          template={configuring}
          detail={detailQuery.data}
          onClose={() => setConfiguring(null)}
          onConfirm={() => activateMutation.mutate(configuring.id)}
          loading={activateMutation.isPending}
          connectorStatus={connectorStatus}
        />
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Marketplace de Templates</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Automações prontas. Clique em "Configurar" para personalizar e ativar em segundos.
        </p>
      </div>

      {/* Busca + filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-4 py-2.5 text-sm border rounded-xl bg-background"
            placeholder="Buscar templates..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Categorias */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map(cat => (
          <button
            key={cat.slug}
            onClick={() => setCategory(cat.slug)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-all',
              category === cat.slug
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-muted-foreground hover:text-foreground border-border'
            )}
          >
            <span>{cat.icon}</span> {cat.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium">Nenhum template encontrado</p>
          <p className="text-sm mt-1">Tente outra categoria ou termo de busca</p>
        </div>
      ) : (
        <>
          {/* Destaques */}
          {featured.length > 0 && category === 'all' && !search && (
            <div className="space-y-3">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> Em destaque
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {featured.map(t => (
                  <TemplateCard key={t.id} template={t} used={used.has(t.id)}
                    onConfigure={() => setConfiguring(t)} />
                ))}
              </div>
            </div>
          )}

          {/* Todos / resto */}
          {(rest.length > 0 || category !== 'all' || search) && (
            <div className="space-y-3">
              {category === 'all' && !search && rest.length > 0 && (
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Todos os templates</h2>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(category !== 'all' || search ? templates : rest).map(t => (
                  <TemplateCard key={t.id} template={t} used={used.has(t.id)}
                    onConfigure={() => setConfiguring(t)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Card de template ─────────────────────────────────────────────────────────

function TemplateCard({
  template, used, onConfigure,
}: {
  template: Template
  used: boolean
  onConfigure: () => void
}) {
  return (
    <div className="p-4 border rounded-xl bg-card space-y-3 hover:shadow-md transition-all flex flex-col">
      <div className="flex items-start gap-2">
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {template.isFeatured && <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />}
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {CATEGORIES.find(c => c.slug === template.category)?.icon} {template.category}
            </span>
          </div>
          <p className="font-semibold text-sm leading-snug">{template.title}</p>
          <p className="text-xs text-muted-foreground line-clamp-2">{template.description}</p>
        </div>
      </div>

      {/* Conectores */}
      {template.connectorsRequired.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {template.connectorsRequired.slice(0, 3).map(c => (
            <span key={c} className="text-[10px] px-2 py-0.5 rounded-full border bg-muted/50 text-muted-foreground">
              {CONNECTOR_LABELS[c] ?? c}
            </span>
          ))}
          {template.connectorsRequired.length > 3 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-muted/50 text-muted-foreground">
              +{template.connectorsRequired.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mt-auto pt-1">
        {used ? (
          <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
            <CheckCircle className="w-3.5 h-3.5" /> Ativado
          </div>
        ) : (
          <Button
            size="sm"
            className="text-xs h-7 px-3 gap-1"
            onClick={onConfigure}
            style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }}
          >
            <Settings2 className="w-3 h-3" />
            Configurar
          </Button>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto">{template.usesCount} usos</span>
      </div>
    </div>
  )
}
