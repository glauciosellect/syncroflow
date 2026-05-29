'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import api from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Coins, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { formatDate } from '@/lib/utils'

const cycleOptions = [
  { key: 'MONTHLY', label: 'Mensal', discount: 0 },
  { key: 'QUARTERLY', label: 'Trimestral', discount: 5 },
  { key: 'SEMIANNUAL', label: 'Semestral', discount: 7 },
  { key: 'ANNUAL', label: 'Anual', discount: 10 },
]

const features = ['Widget para sites', 'Intenções avançadas', 'API completa', 'Suporte por email', 'Analytics avançado']

export default function BillingPage() {
  const { workspace } = useAuthStore()
  const [cycle, setCycle] = useState('MONTHLY')

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

  const cycleDiscount = cycleOptions.find(c => c.key === cycle)?.discount || 0

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Faturamento</h1>
        <p className="text-gray-500 text-sm mt-1">Gerencie sua assinatura e créditos</p>
      </div>

      <Card className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white border-0">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm opacity-80 mb-1">Sua assinatura</div>
              <div className="text-2xl font-bold">{workspace?.plan || 'Trial'}</div>
              {billing?.trialEndsAt && (
                <div className="text-sm opacity-80 mt-1">Trial até {formatDate(billing.trialEndsAt)}</div>
              )}
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 text-2xl font-bold">
                <Coins className="w-6 h-6 opacity-80" />
                {billing?.credits?.toLocaleString() || '—'}
              </div>
              <div className="text-sm opacity-80">créditos disponíveis</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Escolha seu plano</h2>

        <div className="flex gap-2 mb-6">
          {cycleOptions.map((opt) => (
            <button key={opt.key} onClick={() => setCycle(opt.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${cycle === opt.key ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {opt.label}
              {opt.discount > 0 && <span className="ml-1 text-xs opacity-80">-{opt.discount}%</span>}
            </button>
          ))}
        </div>

        {plansLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-violet-600" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(plans || []).map((plan: any) => {
              const cycleData = plan.cycles?.find((c: any) => c.cycle === cycle)
              const price = cycleData?.price || plan.priceMonthly
              const isPopular = plan.id === 'STANDARD'
              const isCurrent = workspace?.plan === plan.id

              return (
                <div key={plan.id} className={`relative rounded-2xl border-2 p-6 ${isPopular ? 'border-violet-600 shadow-lg shadow-violet-100' : 'border-gray-200'}`}>
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-violet-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                      Mais popular
                    </div>
                  )}
                  <div className="mb-4">
                    <h3 className="font-bold text-xl text-gray-900">{plan.name}</h3>
                    <div className="mt-2">
                      <span className="text-3xl font-bold text-gray-900">R$ {(price / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      <span className="text-gray-400 text-sm">/mês</span>
                    </div>
                    {cycleDiscount > 0 && <p className="text-xs text-green-600 mt-1">Economize {cycleDiscount}% no pagamento {cycle === 'ANNUAL' ? 'anual' : cycle === 'SEMIANNUAL' ? 'semestral' : 'trimestral'}</p>}
                  </div>

                  <div className="space-y-2 mb-6 text-sm text-gray-600">
                    <div className="flex items-center gap-2"><Coins className="w-4 h-4 text-violet-500" />{plan.credits?.toLocaleString()} créditos/mês</div>
                    <div className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" />Até {plan.agents} agentes</div>
                    {features.map((f) => (
                      <div key={f} className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" />{f}</div>
                    ))}
                  </div>

                  <Button className={`w-full ${isPopular ? 'bg-violet-600 hover:bg-violet-700' : ''}`} variant={isPopular ? 'default' : 'outline'} disabled={isCurrent}
                    onClick={() => alert('Integração com Stripe em desenvolvimento. Configure a variável STRIPE_SECRET_KEY.')}>
                    {isCurrent ? 'Plano atual' : 'Assinar agora'}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

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
