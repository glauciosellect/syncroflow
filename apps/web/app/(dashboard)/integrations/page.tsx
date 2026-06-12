'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Plug, Unplug, Plus, ChevronRight, CheckCircle, Zap, Key, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Catálogos ────────────────────────────────────────────────────────────────

const ECOMMERCE_PLATFORMS = [
  { id: 'nuvemshop',    name: 'Nuvemshop',    description: 'Maior plataforma de e-commerce do Brasil', logo: '🛍️', color: '#00CDBE', auth: 'oauth' },
  { id: 'mercadolivre', name: 'Mercado Livre', description: 'Marketplace líder na América Latina',       logo: '🛒', color: '#FFE600', auth: 'oauth' },
  { id: 'shopify',      name: 'Shopify',       description: 'Plataforma global de e-commerce',           logo: '🏪', color: '#96BF48', auth: 'oauth' },
  { id: 'tiktokshop',   name: 'TikTok Shop',   description: 'Comércio social em crescimento',            logo: '🎵', color: '#FF0050', auth: 'oauth' },
  { id: 'shopee',       name: 'Shopee',         description: 'Marketplace com grande base no Brasil',    logo: '🧡', color: '#EE4D2D', auth: 'oauth' },
]

const CRM_PLATFORMS = [
  { id: 'hubspot',  name: 'HubSpot',       description: 'CRM completo para vendas e marketing', logo: '🟠', color: '#FF7A59', auth: 'oauth' },
  { id: 'pipedrive',name: 'Pipedrive',     description: 'CRM focado em pipeline de vendas',     logo: '🟢', color: '#00C04B', auth: 'oauth' },
  { id: 'rdcrm',    name: 'RD Station CRM',description: 'CRM brasileiro da RD Station',         logo: '🔵', color: '#0056D2', auth: 'oauth' },
]

const FINANCE_PLATFORMS = [
  { id: 'asaas',   name: 'Asaas',    description: 'Cobranças, PIX e boletos automáticos', logo: '💙', color: '#0070F3', auth: 'apikey', keyLabel: 'API Key', keyPlaceholder: '$aact_...' },
  { id: 'pagarme', name: 'Pagar.me', description: 'Gateway de pagamento completo',        logo: '💚', color: '#00A868', auth: 'apikey', keyLabel: 'API Key', keyPlaceholder: 'ak_live_...' },
]

const MARKETING_PLATFORMS = [
  { id: 'rdmarketing',    name: 'RD Station Marketing', description: 'Automação de marketing digital brasileiro', logo: '📣', color: '#0056D2', auth: 'oauth' },
  { id: 'activecampaign', name: 'ActiveCampaign',       description: 'E-mail marketing e automações avançadas',  logo: '⚡', color: '#356AE6', auth: 'apikey', keyLabel: 'API Key', keyPlaceholder: 'sua-api-key', urlLabel: 'URL da conta', urlPlaceholder: 'suaconta.api-us1.com' },
]

const ECOMMERCE_TRIGGERS: Record<string, { value: string; label: string }[]> = {
  nuvemshop:    [{ value: 'orders/created', label: 'Novo pedido criado' }, { value: 'orders/paid', label: 'Pedido pago' }, { value: 'orders/fulfilled', label: 'Pedido enviado' }, { value: 'orders/cancelled', label: 'Pedido cancelado' }, { value: 'customers/created', label: 'Novo cliente' }],
  mercadolivre: [{ value: 'orders_v2', label: 'Nova venda / atualização' }, { value: 'questions', label: 'Comprador fez pergunta' }, { value: 'messages', label: 'Nova mensagem pós-venda' }, { value: 'payments', label: 'Pagamento confirmado' }],
  shopify:      [{ value: 'orders/created', label: 'Novo pedido' }, { value: 'orders/paid', label: 'Pedido pago' }, { value: 'orders/fulfilled', label: 'Pedido enviado' }, { value: 'customers/create', label: 'Novo cliente' }],
  tiktokshop:   [{ value: 'order.created', label: 'Novo pedido criado' }, { value: 'order.status_sync', label: 'Status atualizado' }, { value: 'order.shipping', label: 'Pedido enviado' }, { value: 'order.cancellation', label: 'Pedido cancelado' }],
  shopee:       [{ value: 'order.create_or_update', label: 'Novo pedido / atualização' }, { value: 'order.status_sync', label: 'Status sincronizado' }, { value: 'order.tracking_update', label: 'Rastreamento atualizado' }, { value: 'order.cancel', label: 'Pedido cancelado' }],
}

const TABS = [
  { id: 'ecommerce', label: 'E-commerce', icon: '🛍️' },
  { id: 'crm',       label: 'CRM',        icon: '🤝' },
  { id: 'finance',   label: 'Financeiro', icon: '💰' },
  { id: 'marketing', label: 'Marketing',  icon: '📣' },
]

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface EcommerceIntegration { id: string; platform: string; status: string; shopName: string | null; shopUrl: string | null; createdAt: string; _count: { automations: number } }
interface Automation { id: string; name: string; trigger: string; isActive: boolean; _count: { executions: number } }
interface CrmConnection { id: string; platform: string; status: string; accountName: string | null; createdAt: string }
interface FinanceConnection { id: string; platform: string; status: string; accountName: string | null; createdAt: string }
interface MarketingConnection { id: string; platform: string; status: string; accountName: string | null; createdAt: string }

// ─── Componente principal ─────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'ecommerce' | 'crm' | 'finance' | 'marketing'>('ecommerce')

  // E-commerce state
  const [selectedIntegration, setSelectedIntegration] = useState<EcommerceIntegration | null>(null)
  const [showNewAutomation, setShowNewAutomation] = useState(false)
  const [newAuto, setNewAuto] = useState({ name: '', trigger: '', message: '', phoneVariable: 'customer_phone' })
  const [shopifyShop, setShopifyShop] = useState('')
  const [shopifyPrompt, setShopifyPrompt] = useState(false)

  // CRM/Finance/Marketing state — apikey forms
  const [apiKeyForm, setApiKeyForm] = useState<Record<string, { key: string; url: string }>>({})

  // ─── Queries ────────────────────────────────────────────────────────────────

  const { data: ecommerceIntegrations = [], isLoading: loadingEcommerce } = useQuery<EcommerceIntegration[]>({
    queryKey: ['ecommerce-integrations'],
    queryFn: () => api.get('/ecommerce/integrations').then(r => r.data),
  })

  const { data: automations = [] } = useQuery<Automation[]>({
    queryKey: ['ecommerce-automations', selectedIntegration?.id],
    queryFn: () => api.get(`/ecommerce/integrations/${selectedIntegration!.id}/automations`).then(r => r.data),
    enabled: !!selectedIntegration,
  })

  const { data: crmConnections = [], isLoading: loadingCrm } = useQuery<CrmConnection[]>({
    queryKey: ['crm-connections'],
    queryFn: () => api.get('/crm/connections').then(r => r.data),
    enabled: activeTab === 'crm',
  })

  const { data: financeConnections = [], isLoading: loadingFinance } = useQuery<FinanceConnection[]>({
    queryKey: ['finance-connections'],
    queryFn: () => api.get('/finance/connections').then(r => r.data),
    enabled: activeTab === 'finance',
  })

  const { data: marketingConnections = [], isLoading: loadingMarketing } = useQuery<MarketingConnection[]>({
    queryKey: ['marketing-connections'],
    queryFn: () => api.get('/marketing/connections').then(r => r.data),
    enabled: activeTab === 'marketing',
  })

  // ─── Mutations E-commerce ────────────────────────────────────────────────────

  const connectEcommerceMutation = useMutation({
    mutationFn: (platform: string) =>
      api.get(`/ecommerce/integrations/${platform}/connect${platform === 'shopify' ? `?shop=${shopifyShop}` : ''}`).then(r => r.data),
    onSuccess: (data: { authUrl: string }) => { window.location.href = data.authUrl },
    onError: () => toast({ title: 'Erro ao conectar', variant: 'destructive' }),
  })

  const disconnectEcommerceMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ecommerce/integrations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ecommerce-integrations'] })
      setSelectedIntegration(null)
      toast({ title: 'Integração desconectada' })
    },
  })

  const createAutomationMutation = useMutation({
    mutationFn: () => api.post(`/ecommerce/integrations/${selectedIntegration!.id}/automations`, {
      name: newAuto.name, trigger: newAuto.trigger,
      actions: [{ type: 'send_whatsapp', phoneVariable: newAuto.phoneVariable, message: newAuto.message }],
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ecommerce-automations', selectedIntegration?.id] })
      queryClient.invalidateQueries({ queryKey: ['ecommerce-integrations'] })
      setShowNewAutomation(false)
      setNewAuto({ name: '', trigger: '', message: '', phoneVariable: 'customer_phone' })
      toast({ title: 'Automação criada!' })
    },
    onError: () => toast({ title: 'Erro ao criar automação', variant: 'destructive' }),
  })

  const toggleAutomationMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/ecommerce/automations/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ecommerce-automations', selectedIntegration?.id] }),
  })

  const deleteAutomationMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ecommerce/automations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ecommerce-automations', selectedIntegration?.id] })
      queryClient.invalidateQueries({ queryKey: ['ecommerce-integrations'] })
    },
  })

  // ─── Mutations CRM ───────────────────────────────────────────────────────────

  const connectCrmOAuthMutation = useMutation({
    mutationFn: (platform: string) => api.get(`/crm/connect/${platform}`).then(r => r.data),
    onSuccess: (data: { authUrl: string }) => { window.location.href = data.authUrl },
    onError: () => toast({ title: 'Erro ao conectar CRM', variant: 'destructive' }),
  })

  const disconnectCrmMutation = useMutation({
    mutationFn: (platform: string) => api.delete(`/crm/connections/${platform}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-connections'] })
      toast({ title: 'CRM desconectado' })
    },
  })

  // ─── Mutations Finance ───────────────────────────────────────────────────────

  const connectFinanceMutation = useMutation({
    mutationFn: ({ platform, apiKey }: { platform: string; apiKey: string }) =>
      api.post('/finance/connect', { platform, apiKey }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['finance-connections'] })
      setApiKeyForm(p => ({ ...p, [vars.platform]: { key: '', url: '' } }))
      toast({ title: 'Conectado com sucesso!' })
    },
    onError: (err: any) => toast({ title: err?.response?.data?.error ?? 'Erro ao conectar', variant: 'destructive' }),
  })

  const disconnectFinanceMutation = useMutation({
    mutationFn: (platform: string) => api.delete(`/finance/connections/${platform}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-connections'] })
      toast({ title: 'Desconectado' })
    },
  })

  // ─── Mutations Marketing ─────────────────────────────────────────────────────

  const connectMarketingOAuthMutation = useMutation({
    mutationFn: (platform: string) => api.get(`/marketing/connect/${platform}`).then(r => r.data),
    onSuccess: (data: { authUrl: string }) => { window.location.href = data.authUrl },
    onError: () => toast({ title: 'Erro ao conectar', variant: 'destructive' }),
  })

  const connectMarketingApiKeyMutation = useMutation({
    mutationFn: ({ platform, apiKey, accountUrl }: { platform: string; apiKey: string; accountUrl?: string }) =>
      api.post('/marketing/connect/apikey', { platform, apiKey, accountUrl }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['marketing-connections'] })
      setApiKeyForm(p => ({ ...p, [vars.platform]: { key: '', url: '' } }))
      toast({ title: 'Conectado com sucesso!' })
    },
    onError: (err: any) => toast({ title: err?.response?.data?.error ?? 'Erro ao conectar', variant: 'destructive' }),
  })

  const disconnectMarketingMutation = useMutation({
    mutationFn: (platform: string) => api.delete(`/marketing/connections/${platform}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-connections'] })
      toast({ title: 'Desconectado' })
    },
  })

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const ecommerceMap = new Map(ecommerceIntegrations.map(i => [i.platform, i]))
  const crmMap = new Map(crmConnections.map(c => [c.platform, c]))
  const financeMap = new Map(financeConnections.map(c => [c.platform, c]))
  const marketingMap = new Map(marketingConnections.map(c => [c.platform, c]))
  const triggerOptions = selectedIntegration ? (ECOMMERCE_TRIGGERS[selectedIntegration.platform] ?? []) : []

  const getFormVal = (platform: string, field: 'key' | 'url') => apiKeyForm[platform]?.[field] ?? ''
  const setFormVal = (platform: string, field: 'key' | 'url', value: string) =>
    setApiKeyForm(p => ({ ...p, [platform]: { ...p[platform], [field]: value } }))

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Conecte suas plataformas de e-commerce, CRM, financeiro e marketing para automatizar tudo.
        </p>
      </div>

      {/* Abas */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id as any); setSelectedIntegration(null) }}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all',
              activeTab === tab.id ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {/* ── ABA E-COMMERCE ─────────────────────────────────────────────────────── */}
      {activeTab === 'ecommerce' && (
        <>
          {/* Detalhe integração selecionada */}
          {selectedIntegration && (
            <div className="bg-card border rounded-2xl p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{ECOMMERCE_PLATFORMS.find(p => p.id === selectedIntegration.platform)?.logo}</span>
                  <div>
                    <h2 className="font-bold text-lg capitalize">{selectedIntegration.platform}</h2>
                    {selectedIntegration.shopName && <p className="text-sm text-muted-foreground">{selectedIntegration.shopName}</p>}
                  </div>
                  <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                    <CheckCircle className="w-3 h-3" /> Conectado
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowNewAutomation(true)}>
                    <Plus className="w-4 h-4 mr-1" /> Nova Automação
                  </Button>
                  <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => disconnectEcommerceMutation.mutate(selectedIntegration.id)}
                    disabled={disconnectEcommerceMutation.isPending}>
                    <Unplug className="w-4 h-4 mr-1" /> Desconectar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedIntegration(null)}>Voltar</Button>
                </div>
              </div>

              {showNewAutomation && (
                <div className="border rounded-xl p-4 space-y-4 bg-muted/30">
                  <h3 className="font-semibold text-sm">Nova Automação</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Nome</label>
                      <input className="w-full px-3 py-2 text-sm border rounded-lg bg-background"
                        placeholder="Ex: Pedido confirmado → WhatsApp"
                        value={newAuto.name} onChange={e => setNewAuto(p => ({ ...p, name: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Quando isso acontecer</label>
                      <select className="w-full px-3 py-2 text-sm border rounded-lg bg-background"
                        value={newAuto.trigger} onChange={e => setNewAuto(p => ({ ...p, trigger: e.target.value }))}>
                        <option value="">Selecione o evento</option>
                        {triggerOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Mensagem WhatsApp</label>
                    <textarea className="w-full px-3 py-2 text-sm border rounded-lg bg-background resize-none" rows={3}
                      placeholder="Olá {customer.name}! Seu pedido #{order.number} foi confirmado."
                      value={newAuto.message} onChange={e => setNewAuto(p => ({ ...p, message: e.target.value }))} />
                    <p className="text-xs text-muted-foreground">Variáveis: {'{customer.name}'}, {'{order.number}'}, {'{order.total}'}, {'{order.status}'}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => createAutomationMutation.mutate()}
                      disabled={!newAuto.name || !newAuto.trigger || !newAuto.message || createAutomationMutation.isPending}>
                      {createAutomationMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
                      Criar automação
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowNewAutomation(false)}>Cancelar</Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Automações ({automations.length})</h3>
                {automations.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-xl">
                    Nenhuma automação ainda. Crie a primeira acima.
                  </div>
                ) : automations.map(auto => (
                  <div key={auto.id} className="flex items-center justify-between p-3 border rounded-xl bg-background">
                    <div className="flex items-center gap-3">
                      <Zap className={cn('w-4 h-4', auto.isActive ? 'text-green-500' : 'text-gray-400')} />
                      <div>
                        <p className="text-sm font-medium">{auto.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {triggerOptions.find(t => t.value === auto.trigger)?.label ?? auto.trigger} · {auto._count.executions} execuções
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <Button variant="ghost" size="sm" className="text-xs h-7 px-2"
                        onClick={() => toggleAutomationMutation.mutate({ id: auto.id, isActive: !auto.isActive })}>
                        {auto.isActive ? 'Pausar' : 'Ativar'}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => deleteAutomationMutation.mutate(auto.id)}>
                        Remover
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Catálogo e-commerce */}
          {!selectedIntegration && (
            <>
              {ecommerceIntegrations.length > 0 && (
                <div className="space-y-3">
                  <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Conectadas</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {ecommerceIntegrations.map(integration => {
                      const platform = ECOMMERCE_PLATFORMS.find(p => p.id === integration.platform)
                      return (
                        <button key={integration.id} onClick={() => setSelectedIntegration(integration)}
                          className="text-left p-4 border rounded-xl bg-card hover:shadow-md transition-all group">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-2xl">{platform?.logo ?? '🔌'}</span>
                              <div>
                                <p className="font-semibold text-sm capitalize">{integration.platform}</p>
                                {integration.shopName && <p className="text-xs text-muted-foreground truncate max-w-[140px]">{integration.shopName}</p>}
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1 text-green-600"><CheckCircle className="w-3 h-3" /> Ativo</span>
                            <span className="text-muted-foreground">{integration._count.automations} automações</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Disponíveis</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {ECOMMERCE_PLATFORMS.map(platform => {
                    if (ecommerceMap.has(platform.id)) return null
                    return (
                      <div key={platform.id} className="p-4 border rounded-xl bg-card space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{platform.logo}</span>
                          <div>
                            <p className="font-semibold text-sm">{platform.name}</p>
                            <p className="text-xs text-muted-foreground">{platform.description}</p>
                          </div>
                        </div>
                        {platform.id === 'shopify' && shopifyPrompt ? (
                          <div className="space-y-2">
                            <input className="w-full px-3 py-2 text-sm border rounded-lg bg-background"
                              placeholder="minha-loja.myshopify.com" value={shopifyShop}
                              onChange={e => setShopifyShop(e.target.value)} />
                            <div className="flex gap-2">
                              <Button size="sm" className="flex-1 text-xs" onClick={() => connectEcommerceMutation.mutate('shopify')}
                                disabled={!shopifyShop || connectEcommerceMutation.isPending}>
                                {connectEcommerceMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Conectar'}
                              </Button>
                              <Button variant="outline" size="sm" className="text-xs" onClick={() => setShopifyPrompt(false)}>Cancelar</Button>
                            </div>
                          </div>
                        ) : (
                          <Button size="sm" className="w-full text-xs" disabled={connectEcommerceMutation.isPending}
                            onClick={() => platform.id === 'shopify' ? setShopifyPrompt(true) : connectEcommerceMutation.mutate(platform.id)}>
                            {connectEcommerceMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plug className="w-3 h-3 mr-1" />}
                            Conectar
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ── ABA CRM ────────────────────────────────────────────────────────────── */}
      {activeTab === 'crm' && (
        <div className="space-y-6">
          {loadingCrm ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {crmConnections.length > 0 && (
                <div className="space-y-3">
                  <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Conectados</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {crmConnections.map(conn => {
                      const platform = CRM_PLATFORMS.find(p => p.id === conn.platform)
                      return (
                        <div key={conn.id} className="p-4 border rounded-xl bg-card space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-2xl">{platform?.logo}</span>
                              <div>
                                <p className="font-semibold text-sm">{platform?.name}</p>
                                {conn.accountName && <p className="text-xs text-muted-foreground">{conn.accountName}</p>}
                              </div>
                            </div>
                            <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                              <CheckCircle className="w-3 h-3" /> Ativo
                            </span>
                          </div>
                          <Button variant="outline" size="sm" className="w-full text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => disconnectCrmMutation.mutate(conn.platform)}
                            disabled={disconnectCrmMutation.isPending}>
                            <Unplug className="w-3 h-3 mr-1" /> Desconectar
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Disponíveis</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {CRM_PLATFORMS.map(platform => {
                    if (crmMap.has(platform.id)) return null
                    return (
                      <div key={platform.id} className="p-4 border rounded-xl bg-card space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{platform.logo}</span>
                          <div>
                            <p className="font-semibold text-sm">{platform.name}</p>
                            <p className="text-xs text-muted-foreground">{platform.description}</p>
                          </div>
                        </div>
                        <Button size="sm" className="w-full text-xs"
                          onClick={() => connectCrmOAuthMutation.mutate(platform.id)}
                          disabled={connectCrmOAuthMutation.isPending}>
                          {connectCrmOAuthMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <ExternalLink className="w-3 h-3 mr-1" />}
                          Conectar via OAuth
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ABA FINANCEIRO ──────────────────────────────────────────────────────── */}
      {activeTab === 'finance' && (
        <div className="space-y-6">
          {loadingFinance ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {financeConnections.length > 0 && (
                <div className="space-y-3">
                  <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Conectados</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {financeConnections.map(conn => {
                      const platform = FINANCE_PLATFORMS.find(p => p.id === conn.platform)
                      return (
                        <div key={conn.id} className="p-4 border rounded-xl bg-card space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-2xl">{platform?.logo}</span>
                              <div>
                                <p className="font-semibold text-sm">{platform?.name}</p>
                                {conn.accountName && <p className="text-xs text-muted-foreground">{conn.accountName}</p>}
                              </div>
                            </div>
                            <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                              <CheckCircle className="w-3 h-3" /> Ativo
                            </span>
                          </div>
                          <Button variant="outline" size="sm" className="w-full text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => disconnectFinanceMutation.mutate(conn.platform)}
                            disabled={disconnectFinanceMutation.isPending}>
                            <Unplug className="w-3 h-3 mr-1" /> Desconectar
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Disponíveis</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {FINANCE_PLATFORMS.map(platform => {
                    if (financeMap.has(platform.id)) return null
                    const keyVal = getFormVal(platform.id, 'key')
                    return (
                      <div key={platform.id} className="p-4 border rounded-xl bg-card space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{platform.logo}</span>
                          <div>
                            <p className="font-semibold text-sm">{platform.name}</p>
                            <p className="text-xs text-muted-foreground">{platform.description}</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5">
                            <Key className="w-3 h-3 text-muted-foreground" />
                            <label className="text-xs font-medium">{platform.keyLabel}</label>
                          </div>
                          <input className="w-full px-3 py-2 text-sm border rounded-lg bg-background font-mono"
                            placeholder={platform.keyPlaceholder} value={keyVal}
                            onChange={e => setFormVal(platform.id, 'key', e.target.value)} />
                          <Button size="sm" className="w-full text-xs"
                            disabled={!keyVal || connectFinanceMutation.isPending}
                            onClick={() => connectFinanceMutation.mutate({ platform: platform.id, apiKey: keyVal })}>
                            {connectFinanceMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plug className="w-3 h-3 mr-1" />}
                            Conectar
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ABA MARKETING ──────────────────────────────────────────────────────── */}
      {activeTab === 'marketing' && (
        <div className="space-y-6">
          {loadingMarketing ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {marketingConnections.length > 0 && (
                <div className="space-y-3">
                  <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Conectados</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {marketingConnections.map(conn => {
                      const platform = MARKETING_PLATFORMS.find(p => p.id === conn.platform)
                      return (
                        <div key={conn.id} className="p-4 border rounded-xl bg-card space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-2xl">{platform?.logo}</span>
                              <div>
                                <p className="font-semibold text-sm">{platform?.name}</p>
                                {conn.accountName && <p className="text-xs text-muted-foreground">{conn.accountName}</p>}
                              </div>
                            </div>
                            <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                              <CheckCircle className="w-3 h-3" /> Ativo
                            </span>
                          </div>
                          <Button variant="outline" size="sm" className="w-full text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => disconnectMarketingMutation.mutate(conn.platform)}
                            disabled={disconnectMarketingMutation.isPending}>
                            <Unplug className="w-3 h-3 mr-1" /> Desconectar
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Disponíveis</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {MARKETING_PLATFORMS.map(platform => {
                    if (marketingMap.has(platform.id)) return null
                    const keyVal = getFormVal(platform.id, 'key')
                    const urlVal = getFormVal(platform.id, 'url')
                    return (
                      <div key={platform.id} className="p-4 border rounded-xl bg-card space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{platform.logo}</span>
                          <div>
                            <p className="font-semibold text-sm">{platform.name}</p>
                            <p className="text-xs text-muted-foreground">{platform.description}</p>
                          </div>
                        </div>
                        {platform.auth === 'oauth' ? (
                          <Button size="sm" className="w-full text-xs"
                            onClick={() => connectMarketingOAuthMutation.mutate(platform.id)}
                            disabled={connectMarketingOAuthMutation.isPending}>
                            {connectMarketingOAuthMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <ExternalLink className="w-3 h-3 mr-1" />}
                            Conectar via OAuth
                          </Button>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5">
                              <Key className="w-3 h-3 text-muted-foreground" />
                              <label className="text-xs font-medium">{(platform as any).keyLabel}</label>
                            </div>
                            <input className="w-full px-3 py-2 text-sm border rounded-lg bg-background font-mono"
                              placeholder={(platform as any).keyPlaceholder} value={keyVal}
                              onChange={e => setFormVal(platform.id, 'key', e.target.value)} />
                            {(platform as any).urlLabel && (
                              <>
                                <label className="text-xs font-medium">{(platform as any).urlLabel}</label>
                                <input className="w-full px-3 py-2 text-sm border rounded-lg bg-background font-mono"
                                  placeholder={(platform as any).urlPlaceholder} value={urlVal}
                                  onChange={e => setFormVal(platform.id, 'url', e.target.value)} />
                              </>
                            )}
                            <Button size="sm" className="w-full text-xs"
                              disabled={!keyVal || connectMarketingApiKeyMutation.isPending}
                              onClick={() => connectMarketingApiKeyMutation.mutate({ platform: platform.id, apiKey: keyVal, accountUrl: urlVal || undefined })}>
                              {connectMarketingApiKeyMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plug className="w-3 h-3 mr-1" />}
                              Conectar
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
