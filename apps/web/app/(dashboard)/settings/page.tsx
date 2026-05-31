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
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'
import {
  Plus, Trash2, Loader2, Eye, EyeOff, KeyRound,
  User, CreditCard, Variable, Check, Coins, Zap, AlertTriangle, Plug,
} from 'lucide-react'

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
const plans = [
  {
    id: 'BASIC', name: 'Basic', priceMonthly: 8700, credits: 2500, agents: 5,
    highlight: false,
    prices: { MONTHLY: 8700, QUARTERLY: 8265, SEMIANNUAL: 8091, ANNUAL: 7830 },
  },
  {
    id: 'STANDARD', name: 'Standard', priceMonthly: 39700, credits: 11500, agents: 20,
    highlight: true,
    prices: { MONTHLY: 39700, QUARTERLY: 37715, SEMIANNUAL: 36921, ANNUAL: 35730 },
  },
  {
    id: 'CORPORATE', name: 'Corporate', priceMonthly: 99700, credits: 30000, agents: 50,
    highlight: false,
    prices: { MONTHLY: 99700, QUARTERLY: 94715, SEMIANNUAL: 92721, ANNUAL: 89730 },
  },
]

const cycleOptions = [
  { key: 'MONTHLY', label: 'Mensal', discount: 0 },
  { key: 'QUARTERLY', label: 'Trimestral', discount: 5 },
  { key: 'SEMIANNUAL', label: 'Semestral', discount: 7 },
  { key: 'ANNUAL', label: 'Anual', discount: 10 },
]

const planFeatures = [
  'WhatsApp, Instagram, Telegram',
  'Widget para sites',
  'Intenções com webhook',
  'Base de conhecimento',
  'API completa',
  'Analytics detalhado',
]

const modelCosts: Record<string, { label: string; credits: number }> = {
  'claude-haiku': { label: 'Claude Haiku', credits: 1 },
  'claude-sonnet': { label: 'Claude Sonnet', credits: 3 },
  'claude-opus': { label: 'Claude Opus', credits: 10 },
  'gpt-4o-mini': { label: 'GPT-4o Mini', credits: 1 },
  'gpt-4o': { label: 'GPT-4o', credits: 5 },
}

function BillingTab() {
  const { workspace } = useAuthStore()
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const paymentStatus = searchParams.get('payment')
  const [cycle, setCycle] = useState('MONTHLY')

  const checkoutMutation = useMutation({
    mutationFn: (packageId: string) => api.post('/billing/checkout', { packageId }).then(r => r.data),
    onSuccess: (data) => { if (data.url) window.location.href = data.url },
    onError: () => toast({ title: 'Erro ao processar pagamento', variant: 'destructive' }),
  })

  const { data: invoices } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.get('/billing/invoices').then(r => r.data),
  })

  const cycleDiscount = cycleOptions.find(c => c.key === cycle)?.discount || 0

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
                <div className="text-sm opacity-80 mt-1">Experimente todos os recursos por 7 dias</div>
              )}
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 text-2xl font-bold">
                <Coins className="w-6 h-6 opacity-80" />
                {workspace?.credits?.toLocaleString() || '0'}
              </div>
              <div className="text-sm opacity-80">créditos disponíveis</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {paymentStatus === 'success' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <Check className="w-5 h-5 text-green-600 shrink-0" />
          <div>
            <div className="font-medium text-green-800">Pagamento confirmado!</div>
            <div className="text-sm text-green-600">Seus créditos foram adicionados à conta.</div>
          </div>
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Planos</h2>
          <div className="flex gap-1 bg-gray-100 rounded-full p-1">
            {cycleOptions.map(opt => (
              <button key={opt.key} onClick={() => setCycle(opt.key)}
                className={cn('px-3 py-1 rounded-full text-xs font-medium transition-all', cycle === opt.key ? 'bg-white text-[#1565C0] shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                {opt.label}
                {opt.discount > 0 && <span className="ml-1 text-green-600">-{opt.discount}%</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map(plan => {
            const price = plan.prices[cycle as keyof typeof plan.prices]
            const isCurrent = workspace?.plan === plan.id

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
                    <span className="text-gray-400 text-sm mb-1">/mês</span>
                  </div>
                  {cycleDiscount > 0 && (
                    <p className="text-xs text-green-600 mt-1">Economize {cycleDiscount}% no plano {cycleOptions.find(c => c.key === cycle)?.label.toLowerCase()}</p>
                  )}
                </div>

                <div className="space-y-2 mb-6 text-sm text-gray-600">
                  <div className="flex items-center gap-2 font-semibold text-gray-900">
                    <Coins className="w-4 h-4 text-[#1565C0]" />
                    {plan.credits.toLocaleString()} créditos/mês
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    Até {plan.agents} agentes
                  </div>
                  {planFeatures.map(f => (
                    <div key={f} className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />{f}
                    </div>
                  ))}
                </div>

                <Button
                  className="w-full"
                  variant={plan.highlight ? 'default' : 'outline'}
                  disabled={isCurrent}
                  onClick={() => alert('Integração com Stripe em breve!')}
                >
                  {isCurrent ? 'Plano atual' : 'Assinar agora'}
                </Button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Crédito Avulso — opção única */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-5 h-5 text-[#1565C0]" />
          <h2 className="text-lg font-semibold text-gray-900">Crédito Avulso</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">Adicione créditos à sua conta sem alterar seu plano. Ideal para picos de atendimento.</p>

        {/* Tabela de custo por modelo */}
        <div className="bg-gray-50 rounded-xl p-4 mb-5 border border-gray-100">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-3">Custo por mensagem</div>
          <div className="flex flex-wrap gap-2">
            {Object.values(modelCosts).map(m => (
              <div key={m.label} className="flex items-center gap-1.5 text-xs bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                <span className="font-medium text-gray-700">{m.label}</span>
                <span className="text-gray-300">·</span>
                <span className="font-semibold text-[#1565C0]">{m.credits} crédito{m.credits > 1 ? 's' : ''}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 text-xs bg-white border border-gray-200 rounded-lg px-3 py-1.5">
              <span className="font-medium text-gray-700">Áudio / Imagem / PDF</span>
              <span className="text-gray-300">·</span>
              <span className="font-semibold text-[#1565C0]">2 créditos</span>
            </div>
          </div>
        </div>

        <div className="max-w-xs">
          <div className="rounded-2xl border-2 border-[#1565C0] p-6 bg-white shadow-md shadow-blue-100 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Coins className="w-6 h-6 text-[#1565C0]" />
              <span className="text-3xl font-bold text-gray-900">1.000</span>
            </div>
            <div className="text-sm text-gray-500 mb-4">créditos</div>
            <div className="text-4xl font-bold text-gray-900 mb-1">R$ 34,00</div>
            <div className="text-xs text-gray-400 mb-5">pagamento único · sem renovação</div>
            <Button
              className="w-full hover:opacity-90"
              disabled={checkoutMutation.isPending}
              onClick={() => checkoutMutation.mutate('avulso-1000')}
            >
              {checkoutMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Comprar agora
            </Button>
          </div>
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

// ─── ABA: INTEGRAÇÕES ────────────────────────────────────────────────────────
function IntegrationsTab() {
  const { toast } = useToast()
  const searchParams = useSearchParams()

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
            <div className="shrink-0">
              {googleStatus?.connected ? (
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
              ) : (
                <Button
                  size="sm"
                  onClick={() => { window.location.href = `${API_URL}/integrations/google/connect` }}
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

      {/* Outros cards — em breve */}
      {[
        { name: 'ElevenLabs', desc: 'Respostas em voz humanizada', icon: '🎙️' },
        { name: 'Shopify', desc: 'Catálogo e pedidos', icon: '🛍️' },
        { name: 'Stripe', desc: 'Links de pagamento', icon: '💳' },
      ].map(item => (
        <Card key={item.name} className="opacity-60">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-2xl shrink-0">{item.icon}</div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">{item.name}</h3>
                  <Badge variant="secondary" className="text-xs">Em breve</Badge>
                </div>
                <p className="text-sm text-gray-400 mt-0.5">{item.desc}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────
const tabs = [
  { key: 'profile', label: 'Perfil', icon: User },
  { key: 'billing', label: 'Faturamento', icon: CreditCard },
  { key: 'integrations', label: 'Integrações', icon: Plug },
  { key: 'env', label: 'Variáveis', icon: Variable },
  { key: 'apikeys', label: 'Chaves de API', icon: KeyRound },
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
        {active === 'profile' && <ProfileTab />}
        {active === 'billing' && <BillingTab />}
        {active === 'integrations' && <IntegrationsTab />}
        {active === 'env' && <EnvTab />}
        {active === 'apikeys' && <ApiKeysTab />}
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
