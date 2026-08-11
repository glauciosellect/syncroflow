'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { useAuthStore } from '@/store/auth.store'
import { formatDate } from '@/lib/utils'
import {
  Plus, Trash2, Loader2, Eye, EyeOff, KeyRound,
  User, CreditCard, Check, Coins, Zap, AlertTriangle, Plug, ExternalLink,
  Radio, Save, Copy, ShieldAlert,
} from 'lucide-react'
import { channelLabel, cn } from '@/lib/utils'
import { ChannelIcon } from '@/components/channel-icon'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── ABA: PERFIL ──────────────────────────────────────────────────────────────
function ProfileTab() {
  const { user, workspace, setUser, setWorkspace } = useAuthStore()
  const { toast } = useToast()
  const router = useRouter()
  const [name, setName] = useState(user?.name || '')
  const [wsName, setWsName] = useState(workspace?.name || '')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const userMutation = useMutation({
    mutationFn: () => api.patch('/auth/me', { name }),
    onSuccess: (res) => { setUser({ name: res.data.name }); toast({ title: 'Perfil atualizado!' }) },
    onError: () => toast({ title: 'Erro ao atualizar', variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete('/workspaces/me'),
    onSuccess: () => {
      localStorage.clear()
      router.push('/login')
    },
    onError: () => toast({ title: 'Erro ao excluir conta', variant: 'destructive' }),
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

      {/* Zona de perigo — só OWNER */}
      {(workspace as any)?.role === 'OWNER' || true ? (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-red-600">
              <ShieldAlert className="w-4 h-4" />
              Zona de perigo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              <strong>⚠️ Ação irreversível.</strong> Ao excluir sua conta, todos os dados serão permanentemente removidos: agentes, conversas, contatos, canais, leads e configurações. Não há como desfazer.
            </div>
            {!showDeleteConfirm ? (
              <Button
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir minha conta
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-700">
                  Para confirmar, digite <strong>EXCLUIR CONTA</strong> abaixo:
                </p>
                <Input
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder="EXCLUIR CONTA"
                  className="border-red-300 focus:ring-red-300"
                />
                <div className="flex gap-2">
                  <Button
                    className="bg-red-600 hover:bg-red-700 text-white"
                    disabled={deleteConfirmText !== 'EXCLUIR CONTA' || deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate()}
                  >
                    {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Confirmar exclusão
                  </Button>
                  <Button variant="ghost" onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText('') }}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

// ─── ABA: FATURAMENTO ─────────────────────────────────────────────────────────
const BILLING_PLANS = [
  { id: 'STARTER',  name: 'Starter',  credits: 2000,  agents: 5,  highlight: false, prices: { MONTHLY: 9700,  ANNUAL: 104760  } },
  { id: 'PRO',      name: 'Pro',      credits: 5000,  agents: 15, highlight: true,  prices: { MONTHLY: 19700, ANNUAL: 212760  } },
  { id: 'BUSINESS', name: 'Business', credits: 15000, agents: 40, highlight: false, prices: { MONTHLY: 49700, ANNUAL: 536760  } },
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
function ChannelsTab() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [showTelegramForm, setShowTelegramForm] = useState(false)
  const [showLinkedInForm, setShowLinkedInForm] = useState(false)
  const [telegramName, setTelegramName] = useState('')
  const [telegramToken, setTelegramToken] = useState('')
  const [linkedinName, setLinkedinName] = useState('')
  const [linkedinToken, setLinkedinToken] = useState('')
  const [linkedinOrgId, setLinkedinOrgId] = useState('')
  const [selectedAgents, setSelectedAgents] = useState<Record<string, string>>({})
  const [allowedSendersInput, setAllowedSendersInput] = useState<Record<string, string>>({})
  const searchParams = useSearchParams()
  const { token: authTokenEmail, refreshToken: authRefreshTokenEmail } = useAuthStore()

  // Exibe toast após retorno do OAuth Meta
  useEffect(() => {
    const success = searchParams.get('meta_success')
    const error = searchParams.get('meta_error')
    if (success) {
      toast({ title: 'Instagram/Facebook conectado!', description: decodeURIComponent(success) })
      qc.invalidateQueries({ queryKey: ['channels'] })
    }
    if (error) {
      toast({ title: 'Erro ao conectar', description: decodeURIComponent(error), variant: 'destructive' })
    }
  }, [])

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

  const emailSettingsMutation = useMutation({
    mutationFn: ({ channelId, allowedSenders }: { channelId: string; allowedSenders: string[] }) =>
      api.patch(`/channels/${channelId}/email-settings`, { allowedSenders }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channels'] }); toast({ title: 'Remetentes permitidos atualizados!' }) },
    onError: () => toast({ title: 'Erro ao salvar remetentes', variant: 'destructive' }),
  })

  const whatsappEmbeddedSignupMutation = useMutation({
    mutationFn: (params: { code: string; wabaId?: string; phoneNumberId?: string; twoFactorPin?: string }) =>
      api.post('/channels/whatsapp-meta/signup', params),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['channels'] })
      if (res.data?.warning) {
        toast({ title: '⚠️ Conectado com ressalva', description: res.data.warning, variant: 'destructive' })
      } else {
        toast({ title: '✅ WhatsApp (Meta) conectado!' })
      }
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.response?.data?.error || 'Erro ao conectar', variant: 'destructive' }),
  })

  const [showVirtualNumberForm, setShowVirtualNumberForm] = useState(false)
  const [whatsappMode, setWhatsappMode] = useState<'virtual' | 'own'>('virtual')
  const [selectedAreaCode, setSelectedAreaCode] = useState<string>('')
  const [purchasedVirtualNumber, setPurchasedVirtualNumber] = useState<{ phoneNumber: string; channelId: string } | null>(null)
  // PIN de verificação em duas etapas do WhatsApp Business — só é pedido no modo
  // "número próprio", pois um número que já foi usado antes pode ter 2FA
  // configurado com um PIN diferente do padrão (000000, usado para números
  // virgens/virtuais). Ver erro "(#133005) Two step verification PIN Mismatch".
  const [ownNumberPin, setOwnNumberPin] = useState('')

  const areaCodesQuery = useQuery({
    queryKey: ['salvy-area-codes'],
    queryFn: () => api.get('/integrations/salvy/area-codes').then(r => r.data.areaCodes as { areaCode: number; available: boolean }[]),
    enabled: showVirtualNumberForm,
  })

  const buyVirtualNumberMutation = useMutation({
    mutationFn: (areaCode: number) => api.post('/integrations/salvy/virtual-numbers', { areaCode }),
    onSuccess: (res) => {
      setPurchasedVirtualNumber({ phoneNumber: res.data.salvyAccount.phoneNumber, channelId: res.data.channel.id })
      qc.invalidateQueries({ queryKey: ['channels'] })
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.response?.data?.error || 'Erro ao contratar número', variant: 'destructive' }),
  })

  const createTelegramMutation = useMutation({
    mutationFn: () => api.post('/channels/telegram', { name: telegramName, botToken: telegramToken }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['channels'] })
      setShowTelegramForm(false); setTelegramName(''); setTelegramToken('')
      const webhookUrl = `${API_URL}/webhooks/telegram/${res.data.id}`
      toast({ title: '✅ Telegram conectado!', description: `Webhook: ${webhookUrl}` })
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.response?.data?.error || 'Erro ao conectar Telegram', variant: 'destructive' }),
  })

  const createLinkedInMutation = useMutation({
    mutationFn: () => api.post('/channels/linkedin', { name: linkedinName, accessToken: linkedinToken, organizationId: linkedinOrgId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels'] })
      setShowLinkedInForm(false); setLinkedinName(''); setLinkedinToken(''); setLinkedinOrgId('')
      toast({ title: '✅ LinkedIn conectado!' })
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.response?.data?.error || 'Token inválido', variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/channels/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channels'] }); toast({ title: 'Canal desconectado' }) },
    onError: (err: any) => toast({ title: 'Erro ao desconectar', description: err.response?.data?.error || 'Tente novamente', variant: 'destructive' }),
  })

  const { token: authToken, refreshToken: authRefreshToken } = useAuthStore()

  const connectMeta = (type: 'instagram' | 'facebook') => {
    // Usa accessToken do localStorage (sempre o mais atual após TokenRefresher)
    // O backend aceita JWT com tolerância de 5 minutos e fallback para refreshToken
    const token = localStorage.getItem('sf_token') || authToken || localStorage.getItem('sf_refresh') || authRefreshToken || ''
    const url = `${API_URL}/integrations/meta/connect?token=${encodeURIComponent(token)}&type=${type}`
    window.location.href = url
  }

  // Durante o Embedded Signup, a Meta envia wabaId/phoneNumberId via postMessage
  // (em paralelo ao callback de FB.login, que só devolve o `code`)
  const embeddedSignupDataRef = useRef<{ wabaId?: string; phoneNumberId?: string }>({})

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== 'https://www.facebook.com') return
      try {
        const data = JSON.parse(event.data)
        if (data.type !== 'WA_EMBEDDED_SIGNUP') return
        if (data.event === 'FINISH') {
          embeddedSignupDataRef.current = {
            wabaId: data.data?.waba_id,
            phoneNumberId: data.data?.phone_number_id,
          }
        } else if (data.event === 'CANCEL') {
          embeddedSignupDataRef.current = {}
          toast({ title: 'Conexão cancelada', description: 'Você fechou a janela da Meta antes de concluir.' })
        } else if (data.event === 'ERROR') {
          embeddedSignupDataRef.current = {}
          toast({
            title: 'Erro na conexão com a Meta',
            description: data.data?.error_message || 'A Meta reportou um erro durante o processo. Tente novamente.',
            variant: 'destructive',
          })
        }
      } catch {}
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const connectWhatsAppMeta = () => {
    if (!window.FB) {
      toast({ title: 'SDK da Meta ainda não carregou — tente novamente em alguns segundos', variant: 'destructive' })
      return
    }
    const pin = ownNumberPin.trim()
    // A Graph API só aceita PIN de verificação em duas etapas com exatamente
    // 6 dígitos — validar aqui evita mandar pra Meta e voltar com erro genérico.
    if (pin && pin.length !== 6) {
      toast({ title: 'PIN inválido', description: 'O PIN de verificação em duas etapas deve ter exatamente 6 dígitos.', variant: 'destructive' })
      return
    }
    window.FB.login((response) => {
      const code = response.authResponse?.code
      if (!code) {
        toast({ title: 'Conexão cancelada', variant: 'destructive' })
        return
      }
      whatsappEmbeddedSignupMutation.mutate({
        code,
        ...embeddedSignupDataRef.current,
        ...(pin ? { twoFactorPin: pin } : {}),
      })
    }, {
      config_id: process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500">Conecte seus canais de atendimento e vincule agentes a cada um.</p>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowVirtualNumberForm(true)}
            className="border-green-200 text-green-700 hover:bg-green-50">
            <Plus className="w-3 h-3 mr-1" />WhatsApp
          </Button>
          <Button variant="outline" size="sm" onClick={() => connectMeta('instagram')}
            className="border-pink-200 text-pink-700 hover:bg-pink-50">
            <Plus className="w-3 h-3 mr-1" />Instagram
          </Button>
          <Button variant="outline" size="sm" onClick={() => connectMeta('facebook')}
            className="border-blue-200 text-blue-700 hover:bg-blue-50">
            <Plus className="w-3 h-3 mr-1" />Facebook
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowTelegramForm(true)}
            className="border-sky-200 text-sky-700 hover:bg-sky-50">
            <Plus className="w-3 h-3 mr-1" />Telegram
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowLinkedInForm(true)}
            className="border-blue-300 text-blue-800 hover:bg-blue-50">
            <Plus className="w-3 h-3 mr-1" />LinkedIn
          </Button>
          <Button variant="outline" size="sm"
            onClick={() => { window.location.href = `${API_URL}/channels/email/connect?token=${authRefreshTokenEmail || authTokenEmail}` }}
            className="border-red-200 text-red-700 hover:bg-red-50">
            <Plus className="w-3 h-3 mr-1" />Email
          </Button>
        </div>
      </div>

      {showVirtualNumberForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">📱 Conectar WhatsApp</CardTitle></CardHeader>
          <CardContent className="space-y-4">

            {/* Toggle de modo */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
              <button
                className={`flex-1 py-2 transition-colors ${whatsappMode === 'virtual' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                onClick={() => { setWhatsappMode('virtual'); setPurchasedVirtualNumber(null); setSelectedAreaCode('') }}
              >
                Quero um número virtual
              </button>
              <button
                className={`flex-1 py-2 transition-colors ${whatsappMode === 'own' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                onClick={() => { setWhatsappMode('own'); setPurchasedVirtualNumber(null); setSelectedAreaCode('') }}
              >
                Já tenho um número
              </button>
            </div>

            {/* Modo: número virtual Salvy */}
            {whatsappMode === 'virtual' && (
              <>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
                  Gera um número dedicado para conectar ao WhatsApp via API oficial da Meta, sem precisar de chip físico.
                </div>

                {!purchasedVirtualNumber ? (
                  <>
                    <div>
                      <Label>DDD</Label>
                      <select
                        className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                        value={selectedAreaCode}
                        onChange={e => setSelectedAreaCode(e.target.value)}
                      >
                        <option value="">Selecione um DDD</option>
                        {areaCodesQuery.data?.filter(a => a.available).map(a => (
                          <option key={a.areaCode} value={a.areaCode}>{a.areaCode}</option>
                        ))}
                      </select>
                      {areaCodesQuery.isLoading && <p className="text-xs text-gray-400 mt-1">Carregando DDDs disponíveis...</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => buyVirtualNumberMutation.mutate(Number(selectedAreaCode))}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={buyVirtualNumberMutation.isPending || !selectedAreaCode}>
                        {buyVirtualNumberMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Contratar número
                      </Button>
                      <Button variant="ghost" onClick={() => setShowVirtualNumberForm(false)}>Cancelar</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="p-4 bg-white border border-emerald-300 rounded-lg flex items-center justify-between">
                      <span className="font-mono text-lg">{purchasedVirtualNumber.phoneNumber}</span>
                      <Button variant="outline" size="sm" onClick={() => {
                        navigator.clipboard.writeText(purchasedVirtualNumber.phoneNumber)
                        toast({ title: 'Número copiado!' })
                      }}>
                        <Copy className="w-3 h-3 mr-1" />Copiar
                      </Button>
                    </div>
                    <p className="text-sm text-gray-600">
                      Cole este número quando a Meta solicitar — o código de verificação por SMS chega automaticamente.
                    </p>
                    <div className="flex gap-2">
                      <Button onClick={connectWhatsAppMeta} className="bg-green-600 hover:bg-green-700 text-white"
                        disabled={whatsappEmbeddedSignupMutation.isPending}>
                        {whatsappEmbeddedSignupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Continuar e conectar à Meta
                      </Button>
                      <Button variant="ghost" onClick={() => { setShowVirtualNumberForm(false); setPurchasedVirtualNumber(null); setSelectedAreaCode('') }}>Fechar</Button>
                    </div>
                  </>
                )}

                <div className="flex items-center justify-end gap-1.5 pt-2 border-t text-xs text-gray-400">
                  <span>powered by Salvy</span>
                </div>
              </>
            )}

            {/* Modo: número próprio */}
            {whatsappMode === 'own' && (
              <>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 space-y-1">
                  <p><strong>Atenção:</strong> ao conectar seu número à API oficial da Meta, ele será desvinculado do WhatsApp no celular.</p>
                  <p>Ligações e SMS continuam funcionando normalmente. Se cancelar o serviço, basta reinstalar o WhatsApp para recuperar o uso normal.</p>
                </div>
                <p className="text-sm text-gray-600">
                  Clique no botão abaixo para iniciar o processo. A Meta vai solicitar o número e enviar um código de verificação por SMS ou ligação.
                </p>
                <div>
                  <Label>PIN de verificação em duas etapas (deixe em branco na maioria dos casos)</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="Deixe em branco — só preencha se já apareceu um erro de PIN"
                    value={ownNumberPin}
                    onChange={e => setOwnNumberPin(e.target.value.replace(/\D/g, ''))}
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    A grande maioria dos números nunca teve verificação em duas etapas configurada — deixe este
                    campo em branco. Só preencha se você já tentou conectar este número antes, recebeu um erro
                    de PIN incorreto, e sabe o PIN de 6 dígitos que foi configurado nele na Meta.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={connectWhatsAppMeta} className="bg-green-600 hover:bg-green-700 text-white"
                    disabled={whatsappEmbeddedSignupMutation.isPending}>
                    {whatsappEmbeddedSignupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Conectar meu número à Meta
                  </Button>
                  <Button variant="ghost" onClick={() => setShowVirtualNumberForm(false)}>Cancelar</Button>
                </div>
              </>
            )}

          </CardContent>
        </Card>
      )}

      {showTelegramForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">✈️ Conectar Telegram Bot</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg text-sm text-sky-800">
              <strong>Como criar um bot:</strong> No Telegram, abra <strong>@BotFather</strong>, envie <code>/newbot</code>, escolha um nome e copie o token fornecido.
            </div>
            <div>
              <Label>Nome da conexão</Label>
              <Input placeholder="Ex: Bot de Atendimento" value={telegramName} onChange={e => setTelegramName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Token do Bot</Label>
              <Input placeholder="1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ" value={telegramToken} onChange={e => setTelegramToken(e.target.value)} className="mt-1 font-mono text-sm" />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => createTelegramMutation.mutate()} className="bg-sky-600 hover:bg-sky-700 text-white"
                disabled={createTelegramMutation.isPending || !telegramName.trim() || !telegramToken.trim()}>
                {createTelegramMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Conectar
              </Button>
              <Button variant="ghost" onClick={() => { setShowTelegramForm(false); setTelegramName(''); setTelegramToken('') }}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showLinkedInForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">💼 Conectar LinkedIn</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              <strong>Como obter o token:</strong> Acesse o <strong>LinkedIn Developer Portal</strong>, crie um app, gere um Access Token com permissão <code>w_messages</code> e cole abaixo.
            </div>
            <div>
              <Label>Nome da conexão</Label>
              <Input placeholder="Ex: Página da Empresa" value={linkedinName} onChange={e => setLinkedinName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Access Token</Label>
              <Input placeholder="AQV..." value={linkedinToken} onChange={e => setLinkedinToken(e.target.value)} className="mt-1 font-mono text-sm" />
            </div>
            <div>
              <Label>ID da Organização (opcional)</Label>
              <Input placeholder="123456789" value={linkedinOrgId} onChange={e => setLinkedinOrgId(e.target.value)} className="mt-1" />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => createLinkedInMutation.mutate()} className="bg-blue-700 hover:bg-blue-800 text-white"
                disabled={createLinkedInMutation.isPending || !linkedinName.trim() || !linkedinToken.trim()}>
                {createLinkedInMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Conectar
              </Button>
              <Button variant="ghost" onClick={() => { setShowLinkedInForm(false); setLinkedinName(''); setLinkedinToken(''); setLinkedinOrgId('') }}>Cancelar</Button>
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
                    <ChannelIcon type={channel.type} />
                    <div>
                      <div className="font-semibold text-gray-900">{channel.name}</div>
                      <Badge variant={channel.isActive ? 'success' : 'secondary'} className="text-xs mt-0.5">
                        {channel.isActive ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[10px] text-gray-400 font-mono">{channel.id}</span>
                        <button
                          onClick={() => { navigator.clipboard.writeText(channel.id); toast({ title: 'ID copiado!' }) }}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                          title="Copiar ID do canal"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">{channelLabel(channel.type)}</span>
                </div>

                {channel.type === 'WHATSAPP' && (
                  <div className="mt-3 text-center text-sm text-green-600 font-medium py-2">
                    ✓ Conectado via API oficial — {channel.config?.displayPhoneNumber || 'WhatsApp Business'}
                  </div>
                )}

                {(channel.type === 'INSTAGRAM' || channel.type === 'FACEBOOK') && channel.config?.igUsername && (
                  <div className="mt-2 text-xs text-gray-500">
                    @{channel.config.igUsername}
                    {channel.config.tokenExpiresAt && (
                      <span className="ml-2 text-amber-600">
                        · Token expira {new Date(channel.config.tokenExpiresAt).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                )}

                {channel.type === 'EMAIL' && (
                  <div className="mt-2 space-y-2">
                    <div className="text-xs text-gray-500">✓ Conectado: {channel.config?.email}</div>
                    <div>
                      <Label className="text-xs text-gray-500">Remetentes permitidos (e-mail ou @dominio.com, um por linha)</Label>
                      <textarea
                        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 mt-1 font-mono"
                        rows={3}
                        placeholder={'cliente@empresa.com\n@dominioconfiavel.com.br'}
                        value={allowedSendersInput[channel.id] ?? (channel.config?.allowedSenders || []).join('\n')}
                        onChange={e => setAllowedSendersInput(p => ({ ...p, [channel.id]: e.target.value }))}
                      />
                      <Button size="sm" variant="outline" className="mt-1 h-7 px-2 text-xs w-full"
                        disabled={emailSettingsMutation.isPending}
                        onClick={() => emailSettingsMutation.mutate({
                          channelId: channel.id,
                          allowedSenders: (allowedSendersInput[channel.id] ?? (channel.config?.allowedSenders || []).join('\n')).split('\n').map((s: string) => s.trim()).filter(Boolean),
                        })}>
                        {emailSettingsMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                        Salvar remetentes
                      </Button>
                      {!(channel.config?.allowedSenders || []).length && (
                        <p className="text-[10px] text-amber-600 mt-1">Sem remetentes configurados — nenhum e-mail será respondido até cadastrar pelo menos um.</p>
                      )}
                    </div>
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
                  <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(channel.id)} disabled={deleteMutation.isPending} className="text-red-500 hover:text-red-700 hover:bg-red-50 w-full">
                    {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Trash2 className="w-3 h-3 mr-2" />}
                    Desconectar
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
                      <PasswordInput className="font-mono text-xs h-7" placeholder="Novo valor" value={editValue} onChange={e => setEditValue(e.target.value)} />
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
