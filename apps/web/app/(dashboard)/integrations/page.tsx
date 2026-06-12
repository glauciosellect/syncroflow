'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Plug, Unplug, Plus, ChevronRight, CheckCircle, XCircle, Clock, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

// Catálogo de plataformas disponíveis
const PLATFORMS: { id: string; name: string; description: string; logo: string; color: string; available: boolean; badge?: string }[] = [
  {
    id: 'nuvemshop',
    name: 'Nuvemshop',
    description: 'Maior plataforma de e-commerce do Brasil',
    logo: '🛍️',
    color: '#00CDBE',
    available: true,
  },
  {
    id: 'mercadolivre',
    name: 'Mercado Livre',
    description: 'Marketplace líder na América Latina',
    logo: '🛒',
    color: '#FFE600',
    available: true,
  },
  {
    id: 'shopify',
    name: 'Shopify',
    description: 'Plataforma global de e-commerce',
    logo: '🏪',
    color: '#96BF48',
    available: true,
  },
  {
    id: 'tiktokshop',
    name: 'TikTok Shop',
    description: 'Comércio social em crescimento',
    logo: '🎵',
    color: '#FF0050',
    available: true,
  },
  {
    id: 'shopee',
    name: 'Shopee',
    description: 'Marketplace com grande base no Brasil',
    logo: '🧡',
    color: '#EE4D2D',
    available: true,
  },
]

// Triggers disponíveis por plataforma
const TRIGGERS: Record<string, { value: string; label: string }[]> = {
  nuvemshop: [
    { value: 'orders/created', label: 'Novo pedido criado' },
    { value: 'orders/paid', label: 'Pedido pago' },
    { value: 'orders/fulfilled', label: 'Pedido enviado' },
    { value: 'orders/cancelled', label: 'Pedido cancelado' },
    { value: 'customers/created', label: 'Novo cliente cadastrado' },
  ],
  mercadolivre: [
    { value: 'orders_v2', label: 'Nova venda / atualização de pedido' },
    { value: 'questions', label: 'Comprador fez pergunta' },
    { value: 'messages', label: 'Nova mensagem pós-venda' },
    { value: 'payments', label: 'Pagamento confirmado' },
  ],
  shopify: [
    { value: 'orders/created', label: 'Novo pedido' },
    { value: 'orders/paid', label: 'Pedido pago' },
    { value: 'orders/fulfilled', label: 'Pedido enviado' },
    { value: 'customers/create', label: 'Novo cliente' },
  ],
  tiktokshop: [
    { value: 'order.created', label: 'Novo pedido criado' },
    { value: 'order.status_sync', label: 'Status do pedido atualizado' },
    { value: 'order.shipping', label: 'Pedido enviado' },
    { value: 'order.cancellation', label: 'Pedido cancelado' },
  ],
  shopee: [
    { value: 'order.create_or_update', label: 'Novo pedido / atualização' },
    { value: 'order.status_sync', label: 'Status do pedido sincronizado' },
    { value: 'order.tracking_update', label: 'Rastreamento atualizado' },
    { value: 'order.cancel', label: 'Pedido cancelado' },
  ],
}

interface Integration {
  id: string
  platform: string
  status: string
  shopName: string | null
  shopUrl: string | null
  createdAt: string
  _count: { automations: number }
}

interface Automation {
  id: string
  name: string
  trigger: string
  isActive: boolean
  _count: { executions: number }
}

export default function IntegrationsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null)
  const [showNewAutomation, setShowNewAutomation] = useState(false)
  const [newAuto, setNewAuto] = useState({ name: '', trigger: '', message: '', phoneVariable: 'customer_phone' })
  const [shopifyShop, setShopifyShop] = useState('')
  const [shopifyPrompt, setShopifyPrompt] = useState(false)

  const { data: integrations = [], isLoading } = useQuery<Integration[]>({
    queryKey: ['ecommerce-integrations'],
    queryFn: () => api.get('/ecommerce/integrations').then(r => r.data),
  })

  const { data: automations = [] } = useQuery<Automation[]>({
    queryKey: ['ecommerce-automations', selectedIntegration?.id],
    queryFn: () => api.get(`/ecommerce/integrations/${selectedIntegration!.id}/automations`).then(r => r.data),
    enabled: !!selectedIntegration,
  })

  const connectMutation = useMutation({
    mutationFn: (platform: string) =>
      api.get(`/ecommerce/integrations/${platform}/connect${platform === 'shopify' ? `?shop=${shopifyShop}` : ''}`).then(r => r.data),
    onSuccess: (data: { authUrl: string }) => {
      window.location.href = data.authUrl
    },
    onError: () => toast({ title: 'Erro ao conectar', variant: 'destructive' }),
  })

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ecommerce/integrations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ecommerce-integrations'] })
      setSelectedIntegration(null)
      toast({ title: 'Integração desconectada' })
    },
  })

  const createAutomationMutation = useMutation({
    mutationFn: () => api.post(`/ecommerce/integrations/${selectedIntegration!.id}/automations`, {
      name: newAuto.name,
      trigger: newAuto.trigger,
      actions: [{
        type: 'send_whatsapp',
        phoneVariable: newAuto.phoneVariable,
        message: newAuto.message,
      }],
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
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/ecommerce/automations/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ecommerce-automations', selectedIntegration?.id] }),
  })

  const deleteAutomationMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ecommerce/automations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ecommerce-automations', selectedIntegration?.id] })
      queryClient.invalidateQueries({ queryKey: ['ecommerce-integrations'] })
    },
  })

  const connectedMap = new Map(integrations.map(i => [i.platform, i]))

  const triggerOptions = selectedIntegration ? (TRIGGERS[selectedIntegration.platform] ?? []) : []

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Conecte suas lojas e marketplaces para automatizar pedidos, notificações e muito mais.
        </p>
      </div>

      {/* Detalhe da integração selecionada */}
      {selectedIntegration && (
        <div className="bg-card border rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{PLATFORMS.find(p => p.id === selectedIntegration.platform)?.logo}</span>
              <div>
                <h2 className="font-bold text-lg capitalize">{selectedIntegration.platform}</h2>
                {selectedIntegration.shopName && (
                  <p className="text-sm text-muted-foreground">{selectedIntegration.shopName}</p>
                )}
              </div>
              <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                <CheckCircle className="w-3 h-3" /> Conectado
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowNewAutomation(true)}>
                <Plus className="w-4 h-4 mr-1" /> Nova Automação
              </Button>
              <Button
                variant="outline" size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => disconnectMutation.mutate(selectedIntegration.id)}
                disabled={disconnectMutation.isPending}
              >
                <Unplug className="w-4 h-4 mr-1" /> Desconectar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIntegration(null)}>
                Voltar
              </Button>
            </div>
          </div>

          {/* Form nova automação */}
          {showNewAutomation && (
            <div className="border rounded-xl p-4 space-y-4 bg-muted/30">
              <h3 className="font-semibold text-sm">Nova Automação</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Nome</label>
                  <input
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-background"
                    placeholder="Ex: Pedido confirmado → WhatsApp"
                    value={newAuto.name}
                    onChange={e => setNewAuto(p => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Quando isso acontecer</label>
                  <select
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-background"
                    value={newAuto.trigger}
                    onChange={e => setNewAuto(p => ({ ...p, trigger: e.target.value }))}
                  >
                    <option value="">Selecione o evento</option>
                    {triggerOptions.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Mensagem WhatsApp</label>
                <textarea
                  className="w-full px-3 py-2 text-sm border rounded-lg bg-background resize-none"
                  rows={3}
                  placeholder="Olá {customer.name}! Seu pedido #{order.number} foi confirmado. Valor: R$ {order.total}"
                  value={newAuto.message}
                  onChange={e => setNewAuto(p => ({ ...p, message: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Variáveis disponíveis: {'{customer.name}'}, {'{order.number}'}, {'{order.total}'}, {'{order.status}'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => createAutomationMutation.mutate()}
                  disabled={!newAuto.name || !newAuto.trigger || !newAuto.message || createAutomationMutation.isPending}
                >
                  {createAutomationMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
                  Criar automação
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowNewAutomation(false)}>Cancelar</Button>
              </div>
            </div>
          )}

          {/* Lista de automações */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Automações ({automations.length})</h3>
            {automations.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-xl">
                Nenhuma automação ainda. Crie a primeira acima.
              </div>
            ) : (
              automations.map(auto => (
                <div key={auto.id} className="flex items-center justify-between p-3 border rounded-xl bg-background">
                  <div className="flex items-center gap-3">
                    <Zap className={cn('w-4 h-4', auto.isActive ? 'text-green-500' : 'text-gray-400')} />
                    <div>
                      <p className="text-sm font-medium">{auto.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {triggerOptions.find(t => t.value === auto.trigger)?.label ?? auto.trigger}
                        {' · '}{auto._count.executions} execuções
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant="ghost" size="sm"
                      className="text-xs h-7 px-2"
                      onClick={() => toggleAutomationMutation.mutate({ id: auto.id, isActive: !auto.isActive })}
                    >
                      {auto.isActive ? 'Pausar' : 'Ativar'}
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="text-xs h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => deleteAutomationMutation.mutate(auto.id)}
                    >
                      Remover
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Catálogo de plataformas */}
      {!selectedIntegration && (
        <>
          {/* Conectadas */}
          {integrations.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Conectadas</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {integrations.map(integration => {
                  const platform = PLATFORMS.find(p => p.id === integration.platform)
                  return (
                    <button
                      key={integration.id}
                      className="text-left p-4 border rounded-xl bg-card hover:shadow-md transition-all group"
                      onClick={() => setSelectedIntegration(integration)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{platform?.logo ?? '🔌'}</span>
                          <div>
                            <p className="font-semibold text-sm capitalize">{integration.platform}</p>
                            {integration.shopName && (
                              <p className="text-xs text-muted-foreground truncate max-w-[140px]">{integration.shopName}</p>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="w-3 h-3" /> Ativo
                        </span>
                        <span className="text-muted-foreground">{integration._count.automations} automações</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Disponíveis */}
          <div className="space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Disponíveis</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {PLATFORMS.map(platform => {
                const connected = connectedMap.has(platform.id)
                if (connected) return null
                return (
                  <div key={platform.id} className="p-4 border rounded-xl bg-card space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{platform.logo}</span>
                        <div>
                          <p className="font-semibold text-sm">{platform.name}</p>
                          <p className="text-xs text-muted-foreground">{platform.description}</p>
                        </div>
                      </div>
                      {platform.badge && (
                        <span className="text-[10px] font-bold bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                          {platform.badge}
                        </span>
                      )}
                    </div>

                    {platform.id === 'shopify' && shopifyPrompt ? (
                      <div className="space-y-2">
                        <input
                          className="w-full px-3 py-2 text-sm border rounded-lg bg-background"
                          placeholder="minha-loja.myshopify.com"
                          value={shopifyShop}
                          onChange={e => setShopifyShop(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm" className="flex-1 text-xs"
                            onClick={() => connectMutation.mutate('shopify')}
                            disabled={!shopifyShop || connectMutation.isPending}
                          >
                            {connectMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Conectar'}
                          </Button>
                          <Button variant="outline" size="sm" className="text-xs" onClick={() => setShopifyPrompt(false)}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full text-xs"
                        disabled={!platform.available || connectMutation.isPending}
                        onClick={() => {
                          if (platform.id === 'shopify') return setShopifyPrompt(true)
                          connectMutation.mutate(platform.id)
                        }}
                      >
                        {connectMutation.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                          <Plug className="w-3 h-3 mr-1" />
                        )}
                        {platform.available ? 'Conectar' : 'Em breve'}
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
