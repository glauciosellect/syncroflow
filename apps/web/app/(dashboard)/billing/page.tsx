'use client'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import api from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Coins, Loader2, Zap, AlertTriangle, ExternalLink, CreditCard } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { formatDate } from '@/lib/utils'
import { useSearchParams } from 'next/navigation'
import { useToast } from '@/components/ui/use-toast'

const creditPackages = [
  { id: 'pack_500',   name: '500 créditos',    credits: 500,   priceLabel: 'R$ 9,90',   popular: false },
  { id: 'pack_2000',  name: '2.000 créditos',  credits: 2000,  priceLabel: 'R$ 29,90',  popular: false },
  { id: 'pack_5000',  name: '5.000 créditos',  credits: 5000,  priceLabel: 'R$ 59,90',  popular: true  },
  { id: 'pack_15000', name: '15.000 créditos', credits: 15000, priceLabel: 'R$ 149,90', popular: false },
]

const modelCosts: Record<string, { label: string; credits: number }> = {
  'claude-haiku-4-5': { label: 'Haiku', credits: 1 },
  'claude-3-5-sonnet-20241022': { label: 'Sonnet', credits: 3 },
  'claude-opus-4-5': { label: 'Opus', credits: 10 },
  'gpt-4o-mini': { label: 'GPT-4o Mini', credits: 1 },
  'gpt-4o': { label: 'GPT-4o', credits: 5 },
}

const cycleOptions = [
  { key: 'MONTHLY', label: 'Mensal',                      badge: ''                   },
  { key: 'ANNUAL',  label: 'Anual (pague 1x por ano)',    badge: 'Economize até R$ 624' },
]

// Preços reais por plano (centavos)
// MONTHLY = cobrado todo mês | ANNUAL = cobrado à vista 1x por ano
const PLAN_PRICES: Record<string, Record<string, number>> = {
  STARTER:  { MONTHLY: 6000,   ANNUAL: 63600  },
  PRO:      { MONTHLY: 14700,  ANNUAL: 156000 },
  BUSINESS: { MONTHLY: 43900,  ANNUAL: 464400 },
}

// Label do ciclo para exibição
const CYCLE_LABELS: Record<string, string> = {
  MONTHLY: '/mês',
  ANNUAL:  '/ano',
}

const features = ['Widget para sites', 'Intenções avançadas', 'API completa', 'Suporte por email', 'Analytics avançado']

export default function BillingPage() {
  const { workspace } = useAuthStore()
  const [cycle, setCycle] = useState('MONTHLY')
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const paymentStatus = searchParams.get('payment')
  const paymentPlan = searchParams.get('plan')

  const isTrialExpired = workspace?.plan === 'TRIAL' &&
    workspace?.trialEndsAt &&
    new Date(workspace.trialEndsAt) < new Date()

  // Compra de créditos avulsos
  const checkoutMutation = useMutation({
    mutationFn: (packageId: string) => api.post('/billing/checkout', { packageId }).then(r => r.data),
    onSuccess: (data) => { if (data.url) window.location.href = data.url },
    onError: () => toast({ title: 'Erro ao processar pagamento', variant: 'destructive' }),
  })

  // Assinatura de plano
  const subscribeMutation = useMutation({
    mutationFn: ({ plan, cycle }: { plan: string; cycle: string }) =>
      api.post('/billing/subscribe', { plan, cycle }).then(r => r.data),
    onSuccess: (data) => { if (data.url) window.location.href = data.url },
    onError: () => toast({ title: 'Erro ao iniciar assinatura', variant: 'destructive' }),
  })

  // Portal de gerenciamento (cancelar, trocar cartão)
  const portalMutation = useMutation({
    mutationFn: () => api.post('/billing/portal').then(r => r.data),
    onSuccess: (data) => { if (data.url) window.location.href = data.url },
    onError: () => toast({ title: 'Erro ao abrir portal de pagamento', variant: 'destructive' }),
  })

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['billing-plans'],
    queryFn: () => api.get('/billing/plans').then(r => r.data),
  })

  const { data: billing } = useQuery({
    queryKey: ['billing'],
    queryFn: () => api.get('/billing').then(r => r.data),
  })

  const { data: invoices } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.get('/billing/invoices').then(r => r.data),
  })

  const selectedCycleOpt = cycleOptions.find(c => c.key === cycle)
  const isBusy = subscribeMutation.isPending || checkoutMutation.isPending

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Faturamento</h1>
        <p className="text-gray-500 text-sm mt-1">Gerencie sua assinatura e créditos</p>
      </div>

      {/* Banner trial expirado */}
      {isTrialExpired && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-red-800">Seu período de teste expirou</p>
            <p className="text-sm text-red-600 mt-0.5">Assine um plano abaixo para continuar usando o SyncroFlow.</p>
          </div>
        </div>
      )}

      {/* Card status */}
      <Card className="text-white border-0" style={{ background: 'linear-gradient(135deg, #0D47A1, #1565C0 50%, #2E7D32)' }}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm opacity-80 mb-1">Sua assinatura</div>
              <div className="text-2xl font-bold">{workspace?.plan || 'Trial'}</div>
              {billing?.trialEndsAt && workspace?.plan === 'TRIAL' && (
                <div className="text-sm opacity-80 mt-1">
                  Trial {new Date(billing.trialEndsAt) > new Date() ? `até ${formatDate(billing.trialEndsAt)}` : 'expirado'}
                </div>
              )}
              {workspace?.plan !== 'TRIAL' && billing?.subscription && (
                <div className="text-sm opacity-80 mt-1">
                  Renova em {formatDate(billing.subscription.currentPeriodEnd)}
                </div>
              )}
            </div>
            <div className="text-right space-y-2">
              <div className="flex items-center gap-2 text-2xl font-bold justify-end">
                <Coins className="w-6 h-6 opacity-80" />
                {billing?.credits?.toLocaleString() || '—'}
              </div>
              <div className="text-sm opacity-80">créditos disponíveis</div>
              {workspace?.plan !== 'TRIAL' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-white border-white/40 hover:bg-white/10 text-xs"
                  onClick={() => portalMutation.mutate()}
                  disabled={portalMutation.isPending}
                >
                  {portalMutation.isPending
                    ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    : <CreditCard className="w-3 h-3 mr-1" />
                  }
                  Gerenciar assinatura
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alertas de pagamento */}
      {paymentStatus === 'subscribed' && paymentPlan && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <Check className="w-5 h-5 text-green-600 shrink-0" />
          <div>
            <div className="font-medium text-green-800">Assinatura ativada! Bem-vindo ao plano {paymentPlan}.</div>
            <div className="text-sm text-green-600">Seus créditos foram adicionados à conta.</div>
          </div>
        </div>
      )}
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
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Escolha seu plano</h2>

        <div className="flex gap-2 mb-6 flex-wrap">
          {cycleOptions.map((opt) => (
            <button key={opt.key} onClick={() => setCycle(opt.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${cycle === opt.key ? 'bg-[#1565C0] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {opt.label}
              {opt.badge && <span className={`ml-2 text-xs font-semibold ${cycle === opt.key ? 'text-green-300' : 'text-green-600'}`}>{opt.badge}</span>}
            </button>
          ))}
        </div>

        {plansLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[#1565C0]" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(plans || []).map((plan: any) => {
              const price = PLAN_PRICES[plan.id]?.[cycle] ?? plan.priceMonthly
              const isPopular = plan.id === 'PRO'
              const isCurrent = workspace?.plan === plan.id

              return (
                <div key={plan.id} className={`relative rounded-2xl border-2 p-6 ${isPopular ? 'border-[#1565C0] shadow-lg shadow-blue-100' : 'border-gray-200'}`}>
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1565C0] text-white text-xs font-bold px-3 py-1 rounded-full">
                      Mais popular
                    </div>
                  )}
                  <div className="mb-4">
                    <h3 className="font-bold text-xl text-gray-900">{plan.name}</h3>
                    <div className="mt-2">
                      <span className="text-3xl font-bold text-gray-900">
                        R$ {(price / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-gray-400 text-sm">{CYCLE_LABELS[cycle]}</span>
                    </div>
                    {cycle === 'ANNUAL' && (
                      <p className="text-xs text-green-600 mt-1">
                        Equivale a R$ {(price / 100 / 12).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês · pago à vista
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 mb-6 text-sm text-gray-600">
                    <div className="flex items-center gap-2"><Coins className="w-4 h-4 text-[#1565C0]" />{plan.credits?.toLocaleString()} créditos/mês</div>
                    <div className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" />Até {plan.agents} agentes</div>
                    {features.map((f) => (
                      <div key={f} className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" />{f}</div>
                    ))}
                  </div>

                  <Button
                    className="w-full"
                    variant={isPopular ? 'default' : 'outline'}
                    disabled={isCurrent || isBusy}
                    onClick={() => subscribeMutation.mutate({ plan: plan.id, cycle })}
                  >
                    {subscribeMutation.isPending
                      ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      : isCurrent
                      ? 'Plano atual'
                      : 'Assinar agora'
                    }
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Créditos avulsos */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-5 h-5 text-[#1565C0]" />
          <h2 className="text-lg font-semibold text-gray-900">Comprar créditos avulsos</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">Adicione créditos à sua conta a qualquer momento, sem alterar seu plano.</p>

        <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-100">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Custo por mensagem</div>
          <div className="flex flex-wrap gap-3">
            {Object.entries(modelCosts).map(([, m]) => (
              <div key={m.label} className="flex items-center gap-1.5 text-xs bg-white border border-gray-200 rounded-lg px-2 py-1">
                <span className="font-medium text-gray-700">{m.label}</span>
                <span className="text-gray-400">→</span>
                <span className="font-semibold text-[#1565C0]">{m.credits} crédito{m.credits > 1 ? 's' : ''}/msg</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 text-xs bg-white border border-gray-200 rounded-lg px-2 py-1">
              <span className="font-medium text-gray-700">Áudio/Imagem/PDF</span>
              <span className="text-gray-400">→</span>
              <span className="font-semibold text-[#1565C0]">2 créditos fixos</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {creditPackages.map((pkg) => (
            <div key={pkg.id} className={`relative rounded-xl border-2 p-4 text-center ${pkg.popular ? 'border-[#1565C0] shadow-md shadow-blue-100' : 'border-gray-200'}`}>
              {pkg.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1565C0] text-white text-xs font-bold px-3 py-0.5 rounded-full">
                  Mais popular
                </div>
              )}
              <div className="font-bold text-gray-900 mb-1">{pkg.name}</div>
              <div className="flex items-center justify-center gap-1 text-[#1565C0] mb-1">
                <Coins className="w-4 h-4" />
                <span className="font-bold text-lg">{pkg.credits.toLocaleString('pt-BR')}</span>
              </div>
              <div className="text-xs text-gray-400 mb-3">créditos</div>
              <div className="text-xl font-bold text-gray-900 mb-3">{pkg.priceLabel}</div>
              <Button
                size="sm"
                className="w-full"
                variant={pkg.popular ? 'default' : 'outline'}
                disabled={checkoutMutation.isPending}
                onClick={() => checkoutMutation.mutate(pkg.id)}
              >
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
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      R$ {(inv.amount / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={inv.status === 'paid' ? 'success' : inv.status === 'failed' ? 'destructive' : 'warning'}>
                        {inv.status === 'paid' ? 'Pago' : inv.status === 'failed' ? 'Falhou' : inv.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Link Stripe Customer Portal */}
      {workspace?.plan !== 'TRIAL' && (
        <div className="text-center">
          <button
            onClick={() => portalMutation.mutate()}
            disabled={portalMutation.isPending}
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Gerenciar cartão, cancelar ou ver faturas no portal Stripe
          </button>
        </div>
      )}
    </div>
  )
}
