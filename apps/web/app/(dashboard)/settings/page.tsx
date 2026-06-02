'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { useAuthStore } from '@/store/auth.store'
import { formatDate } from '@/lib/utils'
import {
  Plus, Trash2, Loader2, Eye, EyeOff, KeyRound,
  User, CreditCard, Check, Coins, Zap, AlertTriangle, Plug, ExternalLink,
  Radio, QrCode, Save,
} from 'lucide-react'
import { channelLabel, cn } from '@/lib/utils'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── ABA: PERFIL ──────────────────────────────────────────────────────────────
function ProfileTab() {
  const { user, workspace, setUser, setWorkspace } = useAuthStore()
  const { toast } = useToast()
  const [name, setName] = useState(user?.name || '')
  const [wsName, setWsName] = useState(workspace?.name || '')

  const userMutation = useMutation({
    mutationFn: () => api.patch('/auth/me', { name }),
    onSuccess: (res) => { setUser({ name: res.data.name }); toast({ title: 'Perfil atualizado!' }) },
    onError: () => toast({ title: 'Erro ao atualizar', variant: 'destructive' }),
  })

  const wsMutation = useMutation({
    mutationFn: () => api.patch('/workspaces/me', { name: wsName }),
    onSuccess: (res) => { setWorkspace({ name: res.data.name }); toast({ title: 'Workspace atualizado!' }) },
    onError: () => toast({ title: 'Erro ao atualizar workspace', variant: 'destructive' }),
  })

  const SEGMENTS = [
    { value: 'health', label: 'Saúde & Clínicas' }, { value: 'education', label: 'Educação & Cursos' },
    { value: 'ecommerce', label: 'E-commerce & Varejo' }, { value: 'legal', label: 'Jurídico & Advocacia' },
    { value: 'beauty', label: 'Beleza & Estética' }, { value: 'realestate', label: 'Imobiliário' },
    { value: 'food', label: 'Alimentação & Food' }, { value: 'tech', label: 'Tecnologia & SaaS' },
    { value: 'services', label: 'Serviços em Geral' }, { value: 'other', label: 'Outro' },
  ]
  const ROLES = [
    { value: 'owner', label: 'Dono(a) do negócio' }, { value: 'manager', label: 'Gestor(a) de equipe' },
    { value: 'agency', label: 'Agência / Consultoria' }, { value: 'dev', label: 'Desenvolvedor(a)' },
  ]

  const onboardingData = (user as any)?.onboardingData as Record<string, string> | null

  return (
    <div className="space-y-6 max-w-xl">
      <Card>
        <CardHeader><CardTitle className="text-base">Seus dados</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input className="mt-1" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input className="mt-1 bg-gray-50 text-gray-400" value={user?.email || ''} disabled />
          </div>
          <Button onClick={() => userMutation.mutate()} disabled={userMutation.isPending || name === user?.name} className="bg-[#1565C0] hover:bg-[#0D47A1]">
            {userMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Salvar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Workspace</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Nome do workspace</Label>
            <Input className="mt-1" maxLength={32} value={wsName} onChange={e => setWsName(e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">{wsName.length}/32 caracteres</p>
          </div>
          <Button onClick={() => wsMutation.mutate()} disabled={wsMutation.isPending || wsName === workspace?.name} className="bg-[#1565C0] hover:bg-[#0D47A1]">
            {wsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Salvar
          </Button>
        </CardContent>
      </Card>

      {onboardingData && (
        <Card>
          <CardHeader><CardTitle className="text-base">Perfil de uso</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {onboardingData.segment && (
              <div>
                <Label className="text-xs text-gray-500">Segmento</Label>
                <p className="text-sm font-medium text-gray-800 mt-0.5">
                  {SEGMENTS.find(s => s.value === onboardingData.segment)?.label || onboardingData.segment}
                </p>
              </div>
            )}
            {onboardingData.role && (
              <div>
                <Label className="text-xs text-gray-500">Papel</Label>
                <p className="text-sm font-medium text-gray-800 mt-0.5">
                  {ROLES.find(r => r.value === onboardingData.role)?.label || onboardingData.role}
                </p>
              </div>
            )}
            {onboardingData.teamSize && (
              <div>
                <Label className="text-xs text-gray-500">Tamanho do time</Label>
                <p className="text-sm font-medium text-gray-800 mt-0.5">{onboardingData.teamSize}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── ABA: FATURAMENTO ─────────────────────────────────────────────────────────
const BILLING_PLANS = [
  { id: 'STARTER',  name: 'Starter',  credits: 2000,  agents: 5,  highlight: false, prices: { MONTHLY: 6000,  ANNUAL: 63600  } },
  { id: 'PRO',      name: 'Pro',      credits: 5000,  agents: 15, highlight: true,  prices: { MONTHLY: 14700, ANNUAL: 156000 } },
  { id: 'BUSINESS', name: 'Business', credits: 15000, agents: 40, highlight: false, prices: { MONTHLY: 43900, ANNUAL: 464400 } },
]

const BILLING_CYCLES = [
  { key: 'MONTHLY', label: 'Mensal',                  badge: ''                    },
  { key: 'ANNUAL',  label: 'Anual (pague 1x por ano)', badge: 'Economize até R$ 624' },
]

const CREDIT_PACKS = [
  { id: 'pack_1000', name: '1.000 créditos', credits: 1000, priceLabel: 'R$ 35,00', popular: true },
]

const planFeatures = ['WhatsApp, Instagram, Telegram', 'Widget para sites', 'Intenções com webhook', 'Base de conhecimento', 'API completa', 'Analytics detalhado']

function BillingTab() {
  const { workspace } = useAuthStore()
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const paymentStatus = searchParams.get('payment')
  const [cycle, setCycle] = useState('MONTHLY')

  const subscribeMutation = useMutation({
    mutationFn: ({ plan, cycle }: { plan: string; cycle: string }) =>
      api.post('/billing/subscribe', { plan, cycle }).then(r => r.data),
    onSuccess: (data) => { if (data.url) window.location.href = data.url },
    onError: () => toast({ title: 'Erro ao iniciar assinatura', variant: 'destructive' }),
  })

  const checkoutMutation = useMutation({
    mutationFn: (packageId: string) => api.post('/billing/checkout', { packageId }).then(r => r.data),
    onSuccess: (data) => { if (data.url) window.location.href = data.url },
    onError: () => toast({ title: 'Erro ao processar pagamento', variant: 'destructive' }),
  })

  const portalMutation = useMutation({
    mutationFn: () => api.post('/billing/portal').then(r => r.data),
    onSuccess: (data) => { if (data.url) window.location.href = data.url },
    onError: () => toast({ title: 'Erro ao abrir portal', variant: 'destructive' }),
  })

  const { data: invoices } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.get('/billing/invoices').then(r => r.data),
  })

  const isBusy = subscribeMutation.isPending || checkoutMutation.isPending

  return (
    <div className="space-y-8 max-w-4xl">

      {/* Status atual */}
      <Card className="text-white border-0" style={{ background: 'linear-gradient(135deg, #0D47A1, #1565C0 50%, #2E7D32)' }}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm opacity-80 mb-1">Plano atual</div>
              <div className="text-2xl font-bold capitalize">{workspace?.plan?.toLowerCase() || 'Trial'}</div>
              {workspace?.plan === 'TRIAL' && (
                <div className="text-sm opacity-80 mt-1">Experimente todos os recursos por 14 dias</div>
              )}
            </div>
            <div className="text-right space-y-2">
              <div className="flex items-center gap-2 text-2xl font-bold justify-end">
                <Coins className="w-6 h-6 opacity-80" />
                {workspace?.credits?.toLocaleString() || '0'}
              </div>
              <div className="text-sm opacity-80">créditos disponíveis</div>
              {workspace?.plan !== 'TRIAL' && (
                <button onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending}
                  className="flex items-center gap-1 text-xs text-white/70 hover:text-white transition-colors">
                  {portalMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                  Gerenciar assinatura
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {paymentStatus === 'success' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <Check className="w-5 h-5 text-green-600 shrink-0" />
          <div><div className="font-medium text-green-800">Pagamento confirmado!</div><div className="text-sm text-green-600">Seus créditos foram adicionados à conta.</div></div>
        </div>
      )}
      {paymentStatus === 'cancelled' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="text-sm text-amber-700">Pagamento cancelado. Nenhum valor foi cobrado.</div>
        </div>
      )}

      {/* Planos */}
      <div>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Planos</h2>
          <div className="flex gap-1 bg-gray-100 rounded-full p-1">
            {BILLING_CYCLES.map(opt => (
              <button key={opt.key} onClick={() => setCycle(opt.key)}
                className={cn('px-3 py-1 rounded-full text-xs font-medium transition-all', cycle === opt.key ? 'bg-white text-[#1565C0] shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                {opt.label}
                {opt.badge && <span className={cn('ml-1.5 font-semibold', cycle === opt.key ? 'text-green-600' : 'text-green-500')}>{opt.badge}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {BILLING_PLANS.map(plan => {
            const price = plan.prices[cycle as keyof typeof plan.prices]
            const isCurrent = workspace?.plan === plan.id
            const isAnnual = cycle === 'ANNUAL'

            return (
              <div key={plan.id} className={cn('relative rounded-2xl border-2 p-6', plan.highlight ? 'border-[#1565C0] shadow-lg shadow-blue-100' : 'border-gray-200 bg-white')}>
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-white text-xs font-bold px-3 py-1 rounded-full" style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }}>
                    Mais popular
                  </div>
                )}
                <div className="mb-5">
                  <h3 className="font-bold text-xl text-gray-900">{plan.name}</h3>
                  <div className="mt-2 flex items-end gap-1">
                    <span className="text-3xl font-bold text-gray-900">R$ {(price / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    <span className="text-gray-400 text-sm mb-1">{isAnnual ? '/ano' : '/mês'}</span>
                  </div>
                  {isAnnual && (
                    <p className="text-xs text-green-600 mt-1">≈ R$ {(price / 100 / 12).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês · pago à vista</p>
                  )}
                </div>
                <div className="space-y-2 mb-6 text-sm text-gray-600">
                  <div className="flex items-center gap-2 font-semibold text-gray-900">
                    <Coins className="w-4 h-4 text-[#1565C0]" />{plan.credits.toLocaleString()} créditos/mês
                  </div>
                  <div className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" />Até {plan.agents} agentes</div>
                  {planFeatures.map(f => (
                    <div key={f} className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" />{f}</div>
                  ))}
                </div>
                <Button className="w-full" variant={plan.highlight ? 'default' : 'outline'}
                  disabled={isCurrent || isBusy}
                  onClick={() => subscribeMutation.mutate({ plan: plan.id, cycle })}>
                  {subscribeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {isCurrent ? 'Plano atual' : 'Assinar agora'}
                </Button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Créditos avulsos */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-5 h-5 text-[#1565C0]" />
          <h2 className="text-lg font-semibold text-gray-900">Créditos avulsos</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">Recarregue a qualquer momento se os créditos acabarem antes do prazo.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {CREDIT_PACKS.map(pkg => (
            <div key={pkg.id} className={cn('relative rounded-xl border-2 p-4 text-center bg-white', (pkg as any).popular ? 'border-[#1565C0] shadow-md shadow-blue-100' : 'border-gray-200')}>
              {(pkg as any).popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1565C0] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Popular</div>
              )}
              <div className="font-bold text-gray-900 text-sm mb-1">{pkg.name}</div>
              <div className="text-xl font-bold text-gray-900 mb-3">{pkg.priceLabel}</div>
              <Button size="sm" className="w-full text-xs" variant={(pkg as any).popular ? 'default' : 'outline'}
                disabled={checkoutMutation.isPending}
                onClick={() => checkoutMutation.mutate(pkg.id)}>
                {checkoutMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Comprar'}
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Histórico de faturas */}
      {invoices && invoices.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Histórico de faturas</h2>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Data</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Valor</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv: any) => (
                  <tr key={inv.id}>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(inv.createdAt)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">R$ {(inv.amount / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3">
                      <Badge variant={inv.status === 'paid' ? 'success' : 'warning'}>{inv.status === 'paid' ? 'Pago' : inv.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ABA: CANAIS ─────────────────────────────────────────────────────────────
const channelIcons: Record<string, string> = {
  WHATSAPP: '📱', INSTAGRAM: '📸', FACEBOOK: '📘', TELEGRAM: '✈️', WIDGET: '💬', EMAIL: '📧', SMS: '📩',
}

const channelForms: Record<string, { label: string; fields: { key: string; label: string; placeholder?: string }[] }> = {
  whatsapp: { label: 'WhatsApp', fields: [{ key: 'name', label: 'Nome da conexão', placeholder: 'Ex: WhatsApp Principal' }] },
  instagram: { label: 'Instagram / Facebook', fields: [{ key: 'name', label: 'Nome', placeholder: 'Ex: Instagram da Empresa' }, { key: 'pageAccessToken', label: 'Page Access Token' }, { key: 'pageId', label: 'Page ID' }, { key: 'verifyToken', label: 'Verify Token', placeholder: 'Crie uma senha qualquer para verificação' }] },
}

function ChannelsTab() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState<string | null>(null)
  const [formData, setFormData] = useState<any>({})
  const [qrData, setQrData] = useState<Record<string, { qr: string; status: string }>>({})
  const [selectedAgents, setSelectedAgents] = useState<Record<string, string>>({})

  const { data: channels, isLoading } = useQuery({
    queryKey: ['channels'],
    queryFn: () => api.get('/channels').then(r => r.data),
  })

  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.get('/agents').then(r => r.data),
  })

  const assignAgentMutation = useMutation({
    mutationFn: ({ channelId, agentId }: { channelId: string; agentId: string }) =>
      api.patch(`/channels/${channelId}/agents`, { agentIds: agentId ? [agentId] : [] }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channels'] }); toast({ title: 'Agente vinculado!' }) },
    onError: () => toast({ title: 'Erro ao vincular agente', variant: 'destructive' }),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post(`/channels/${showForm}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channels'] }); setShowForm(null); setFormData({}) },
    onError: (err: any) => toast({ title: 'Erro', description: err.response?.data?.error || 'Erro ao conectar canal', variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/channels/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channels'] }); toast({ title: 'Canal desconectado' }) },
  })

  const loadQR = async (channelId: string) => {
    try {
      const res = await api.get(`/channels/${channelId}/qr`)
      setQrData(p => ({ ...p, [channelId]: { qr: res.data.qr, status: res.data.status } }))
    } catch {
      toast({ title: 'Erro ao carregar QR Code', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">Conecte seus canais de atendimento e vincule agentes a cada um.</p>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(channelForms).map(([key, form]) => (
            <Button key={key} variant="outline" size="sm" onClick={() => setShowForm(key)}>
              <Plus className="w-3 h-3 mr-1" />{form.label}
            </Button>
          ))}
        </div>
      </div>

      {showForm && channelForms[showForm] && (
        <Card>
          <CardHeader><CardTitle className="text-base">Conectar {channelForms[showForm].label}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {channelForms[showForm].fields.map((field) => (
              <div key={field.key}>
                <Label>{field.label}</Label>
                <Input placeholder={field.placeholder} value={formData[field.key] || ''} onChange={e => setFormData((p: any) => ({ ...p, [field.key]: e.target.value }))} className="mt-1" />
              </div>
            ))}
            <div className="flex gap-2">
              <Button onClick={() => createMutation.mutate(formData)} className="bg-[#1565C0] hover:bg-[#0D47A1]" disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Conectar
              </Button>
              <Button variant="ghost" onClick={() => { setShowForm(null); setFormData({}) }}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#1565C0]" /></div>
      ) : !channels?.length ? (
        <div className="text-center py-16">
          <Plug className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Nenhum canal conectado</h3>
          <p className="text-gray-400 text-sm">Use os botões acima para conectar seu primeiro canal</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(channels || []).map((channel: any) => (
            <Card key={channel.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{channelIcons[channel.type] || '📡'}</span>
                    <div>
                      <div className="font-semibold text-gray-900">{channel.name}</div>
                      <Badge variant={channel.isActive ? 'success' : 'secondary'} className="text-xs mt-0.5">
                        {channel.isActive ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                  </div>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">{channelLabel(channel.type)}</span>
                </div>

                {channel.type === 'WHATSAPP' && (
                  <div className="mt-3">
                    {qrData[channel.id] ? (
                      qrData[channel.id].status === 'connected' ? (
                        <div className="text-center text-sm text-green-600 font-medium py-2">✓ WhatsApp conectado</div>
                      ) : qrData[channel.id].qr ? (
                        <img src={qrData[channel.id].qr} alt="QR Code" className="w-40 h-40 mx-auto rounded-lg" />
                      ) : (
                        <div className="text-center text-sm text-gray-500 py-2">Aguardando QR Code...</div>
                      )
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => loadQR(channel.id)} className="w-full">
                        <QrCode className="w-3 h-3 mr-2" />Ver QR Code
                      </Button>
                    )}
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                  <div>
                    <Label className="text-xs text-gray-500">Agente vinculado</Label>
                    <div className="flex gap-2 mt-1">
                      <select
                        className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white"
                        value={selectedAgents[channel.id] ?? (channel.agentChannels?.[0]?.agentId || '')}
                        onChange={e => setSelectedAgents(p => ({ ...p, [channel.id]: e.target.value }))}
                      >
                        <option value="">Nenhum agente</option>
                        {(agents || []).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                      <Button size="sm" variant="outline" className="shrink-0 h-7 px-2"
                        disabled={assignAgentMutation.isPending}
                        onClick={() => assignAgentMutation.mutate({ channelId: channel.id, agentId: selectedAgents[channel.id] ?? '' })}>
                        {assignAgentMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      </Button>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(channel.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 w-full">
                    <Trash2 className="w-3 h-3 mr-2" />Desconectar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── ABA: VARIÁVEIS DE AMBIENTE ───────────────────────────────────────────────
function EnvTab() {
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['env-variables'] }); setShowForm(false); setKey(''); setValue(''); toast({ title: 'Variável salva!' }) },
    onError: (err: any) => toast({ title: 'Erro', description: err.response?.data?.message || 'Chave inválida', variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) => api.patch(`/env-variables/${id}`, { value }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['env-variables'] }); setEditingId(null); setEditValue(''); toast({ title: 'Valor atualizado!' }) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/env-variables/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['env-variables'] }); toast({ title: 'Variável removida' }) },
  })

  const suggestions = [
    'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'STRIPE_SECRET_KEY', 'GOOGLE_CALENDAR_KEY',
  ]

  return (
    <div className="space-y-5 max-w-2xl">
      <Card className="border-blue-100 bg-blue-50/40">
        <CardContent className="p-4 flex items-start gap-3">
          <KeyRound className="w-5 h-5 text-[#1565C0] mt-0.5 shrink-0" />
          <p className="text-sm text-[#1565C0]">
            <strong>Segredos protegidos.</strong> Todos os valores são criptografados com AES-256. Nem a equipe da SyncroFlow consegue ver os valores originais.
          </p>
        </CardContent>
      </Card>

      {!showForm && (
        <Button onClick={() => setShowForm(true)} className="bg-[#1565C0] hover:bg-[#0D47A1]">
          <Plus className="w-4 h-4 mr-2" /> Nova Variável
        </Button>
      )}

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">Adicionar Variável</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input className="mt-1 font-mono uppercase" placeholder="Ex: OPENAI_API_KEY" value={key} onChange={e => setKey(e.target.value.toUpperCase().replace(/\s/g, '_'))} />
              <div className="flex flex-wrap gap-2 mt-2">
                {suggestions.map(s => (
                  <button key={s} onClick={() => setKey(s)} className="text-xs px-2 py-1 bg-gray-100 hover:bg-blue-100 hover:text-[#1565C0] rounded-md text-gray-600 transition-colors">{s}</button>
                ))}
              </div>
            </div>
            <div>
              <Label>Valor</Label>
              <div className="relative mt-1">
                <Input type={showValues['new'] ? 'text' : 'password'} className="font-mono pr-10" placeholder="Cole aqui sua chave ou token" value={value} onChange={e => setValue(e.target.value)} />
                <button onClick={() => setShowValues(p => ({ ...p, new: !p['new'] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showValues['new'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => createMutation.mutate()} disabled={!key.trim() || !value.trim() || createMutation.isPending} className="bg-[#1565C0] hover:bg-[#0D47A1]">
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
          {!isLoading && vars?.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Nenhuma variável cadastrada ainda</p>}
          <div className="space-y-2">
            {(vars || []).map((v: any) => (
              <div key={v.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg">
                <KeyRound className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm font-medium text-gray-900">{v.key}</div>
                  {editingId === v.id ? (
                    <div className="flex gap-2 mt-1">
                      <Input type="password" className="font-mono text-xs h-7" placeholder="Novo valor" value={editValue} onChange={e => setEditValue(e.target.value)} />
                      <Button size="sm" className="h-7 text-xs bg-[#1565C0]" disabled={!editValue.trim() || updateMutation.isPending} onClick={() => updateMutation.mutate({ id: v.id, value: editValue })}>Salvar</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>Cancelar</Button>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 font-mono mt-0.5">••••••••••••••••</div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => { setEditingId(v.id); setEditValue('') }} className="text-xs text-gray-400 hover:text-[#1565C0] px-2 py-1 rounded hover:bg-blue-50">Atualizar</button>
                  <button onClick={() => deleteMutation.mutate(v.id)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── ABA: CHAVES DE API ───────────────────────────────────────────────────────
function ApiKeysTab() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [newKeyName, setNewKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)

  const { data: keys, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.get('/api-keys').then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/api-keys', { name: newKeyName }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['api-keys'] })
      setCreatedKey(res.data.key)
      setNewKeyName('')
      toast({ title: 'Chave criada! Copie agora — não será exibida novamente.' })
    },
    onError: () => toast({ title: 'Erro ao criar chave', variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api-keys/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-keys'] }); toast({ title: 'Chave revogada' }) },
  })

  return (
    <div className="space-y-5 max-w-2xl">
      <Card>
        <CardHeader><CardTitle className="text-base">Nova chave de API</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Nome identificador</Label>
            <Input className="mt-1" placeholder="Ex: Integração n8n" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} />
          </div>
          {createdKey && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-green-700 mb-1">Copie sua chave — ela não será exibida novamente:</p>
              <div className="font-mono text-xs text-green-900 bg-white border border-green-200 rounded px-3 py-2 break-all">{createdKey}</div>
              <Button size="sm" variant="ghost" className="mt-2 text-xs text-green-700" onClick={() => { navigator.clipboard.writeText(createdKey); toast({ title: 'Copiado!' }) }}>Copiar</Button>
            </div>
          )}
          <Button onClick={() => createMutation.mutate()} disabled={!newKeyName.trim() || createMutation.isPending} className="bg-[#1565C0] hover:bg-[#0D47A1]">
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            Gerar chave
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Chaves ativas</CardTitle></CardHeader>
        <CardContent>
          {isLoading && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[#1565C0]" /></div>}
          {!isLoading && keys?.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Nenhuma chave criada</p>}
          <div className="space-y-2">
            {(keys || []).map((k: any) => (
              <div key={k.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-gray-900">{k.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">Criada em {formatDate(k.createdAt)}{k.lastUsedAt ? ` · Último uso ${formatDate(k.lastUsedAt)}` : ''}</div>
                </div>
                <button onClick={() => deleteMutation.mutate(k.id)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── CARD: ELEVENLABS ────────────────────────────────────────────────────────
function ElevenLabsCard() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [apiKey, setApiKey] = useState('')
  const [voiceId, setVoiceId] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [open, setOpen] = useState(false)

  const { data: status, isLoading } = useQuery({
    queryKey: ['elevenlabs-status'],
    queryFn: () => api.get('/integrations/elevenlabs').then(r => r.data).catch(() => ({ connected: false })),
  })

  const saveMutation = useMutation({
    mutationFn: () => api.post('/integrations/elevenlabs', { apiKey, voiceId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['elevenlabs-status'] })
      toast({ title: '✅ ElevenLabs configurado!' })
      setApiKey(''); setVoiceId(''); setOpen(false)
    },
    onError: () => toast({ title: 'Erro ao salvar', variant: 'destructive' }),
  })

  const disconnectMutation = useMutation({
    mutationFn: () => api.delete('/integrations/elevenlabs'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['elevenlabs-status'] }); toast({ title: 'ElevenLabs desconectado' }) },
  })

  const connected = status?.connected

  return (
    <Card className={connected ? 'border-green-200' : 'border-gray-200'}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-2xl shrink-0">🎙️</div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900">ElevenLabs</h3>
                {isLoading ? null : connected ? (
                  <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 rounded-full px-2 py-0.5 font-medium">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full" /> Conectado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs bg-gray-50 text-gray-500 rounded-full px-2 py-0.5 font-medium">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" /> Não configurado
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {connected
                  ? `Voice ID: ${status.voiceId || '—'} · Respostas em áudio com voz JARVIS`
                  : 'Ative respostas em áudio com voz humanizada (JARVIS) no WhatsApp'}
              </p>
            </div>
          </div>
          <div className="shrink-0 flex gap-2">
            {connected ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setOpen(o => !o)} className="text-xs">Reconfigurar</Button>
                <Button size="sm" variant="outline" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}
                  className="text-red-500 border-red-200 hover:bg-red-50 text-xs">
                  {disconnectMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Desconectar'}
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => setOpen(o => !o)} className="bg-[#1565C0] hover:bg-[#0D47A1] text-white text-xs">
                Configurar
              </Button>
            )}
          </div>
        </div>

        {open && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
            <div>
              <Label className="text-xs">API Key do ElevenLabs</Label>
              <div className="relative mt-1">
                <Input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)}
                  placeholder="sk_..." className="font-mono text-xs pr-10" />
                <button type="button" onClick={() => setShowKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Acesse elevenlabs.io → Profile → API Key</p>
            </div>
            <div>
              <Label className="text-xs">Voice ID (voz JARVIS)</Label>
              <Input value={voiceId} onChange={e => setVoiceId(e.target.value)}
                placeholder="Ex: pNInz6obpgDQGcFmaJgB" className="font-mono text-xs mt-1" />
              <p className="text-xs text-gray-400 mt-1">Vá em elevenlabs.io → Voice Library → copie o ID da voz escolhida</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveMutation.mutate()}
                disabled={!apiKey.trim() || !voiceId.trim() || saveMutation.isPending}
                className="bg-[#1565C0] hover:bg-[#0D47A1] text-xs">
                {saveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Salvar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="text-xs">Cancelar</Button>
            </div>
          </div>
        )}

        {connected && !open && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Quando um contato escolher receber respostas em áudio, o agente usará esta voz automaticamente.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── ABA: INTEGRAÇÕES ────────────────────────────────────────────────────────
function IntegrationsTab() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const { token, refreshToken } = useAuthStore()

  const { data: googleStatus, refetch } = useQuery({
    queryKey: ['google-integration'],
    queryFn: () => api.get('/integrations/google').then(r => r.data),
  })

  const disconnectMutation = useMutation({
    mutationFn: () => api.delete('/integrations/google'),
    onSuccess: () => { refetch(); toast({ title: 'Google Calendar desconectado' }) },
  })

  useEffect(() => {
    const result = searchParams.get('google')
    if (result === 'success') { refetch(); toast({ title: '✅ Google Calendar conectado!' }) }
    if (result === 'error') toast({ title: 'Erro ao conectar Google Calendar', variant: 'destructive' })
  }, [searchParams, refetch, toast])

  return (
    <div className="space-y-5 max-w-2xl">
      <p className="text-sm text-gray-500">
        Conecte serviços externos para ampliar as capacidades dos seus agentes.
      </p>

      {/* Google Calendar */}
      <Card className={googleStatus?.connected ? 'border-green-200' : 'border-gray-200'}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" className="w-7 h-7">
                  <path d="M19 3h-1V1h-2v2H8V1H6v2H5C3.9 3 3 3.9 3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z" fill="#4285F4"/>
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">Google Calendar</h3>
                  {googleStatus?.connected ? (
                    <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 rounded-full px-2 py-0.5 font-medium">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                      Conectado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs bg-gray-50 text-gray-500 rounded-full px-2 py-0.5 font-medium">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                      Não conectado
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {googleStatus?.connected
                    ? `Conta: ${googleStatus.email}${googleStatus.tokenExpired ? ' · ⚠️ Token expirado — reconecte' : ''}`
                    : 'Permita que os agentes criem e gerenciem agendamentos'}
                </p>
              </div>
            </div>
            <div className="shrink-0 flex gap-2">
              {googleStatus?.connected ? (
                <>
                  {googleStatus?.tokenExpired && (
                    <Button
                      size="sm"
                      onClick={() => { window.location.href = `${API_URL}/integrations/google/connect?token=${refreshToken || token}` }}
                      className="bg-[#4285F4] hover:bg-[#3367D6] text-white"
                    >
                      Reconectar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    className="text-red-500 border-red-200 hover:bg-red-50"
                  >
                    {disconnectMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                    Desconectar
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={() => { window.location.href = `${API_URL}/integrations/google/connect?token=${refreshToken || token}` }}
                  className="bg-[#4285F4] hover:bg-[#3367D6] text-white"
                >
                  Conectar
                </Button>
              )}
            </div>
          </div>

          {googleStatus?.connected && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Os agentes com a intenção de agendamento configurada poderão criar eventos automaticamente neste calendário durante as conversas.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ElevenLabs — voz JARVIS */}
      <ElevenLabsCard />
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────
const tabs = [
  { key: 'profile',      label: 'Perfil',            icon: User      },
  { key: 'billing',      label: 'Planos e Pagamento', icon: CreditCard },
  { key: 'channels',     label: 'Canais',             icon: Radio     },
  { key: 'integrations', label: 'Integrações',        icon: Plug      },
  { key: 'apikeys',      label: 'Chaves de API',      icon: KeyRound  },
]

function SettingsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialTab = searchParams.get('tab') || 'profile'
  const [active, setActive] = useState(initialTab)

  const handleTab = (key: string) => {
    setActive(key)
    router.replace(`/settings?tab=${key}`, { scroll: false })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
        <p className="text-gray-500 text-sm mt-1">Gerencie seu perfil, plano e integrações</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.key} onClick={() => handleTab(t.key)}
            className={cn('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              active === t.key ? 'border-[#1565C0] text-[#1565C0]' : 'border-transparent text-gray-500 hover:text-gray-700')}>
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {active === 'profile'      && <ProfileTab />}
        {active === 'billing'      && <BillingTab />}
        {active === 'channels'     && <ChannelsTab />}
        {active === 'integrations' && <IntegrationsTab />}
        {active === 'apikeys'      && <ApiKeysTab />}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  )
}
