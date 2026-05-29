import Link from 'next/link'
import { Brain, ClipboardList, Variable, Key, CreditCard, Settings } from 'lucide-react'

const options = [
  { href: '/knowledge', label: 'Base de conhecimento', desc: 'Gerencie bases compartilhadas entre agentes', icon: Brain, color: 'bg-purple-100 text-purple-600' },
  { href: '/attendances', label: 'Atendimentos', desc: 'Histórico completo com exportação CSV', icon: ClipboardList, color: 'bg-blue-100 text-blue-600' },
  { href: '/api-keys', label: 'Chaves de API', desc: 'Gere e revogue chaves de acesso à API', icon: Key, color: 'bg-orange-100 text-orange-600' },
  { href: '/billing', label: 'Faturamento', desc: 'Planos, créditos e histórico de faturas', icon: CreditCard, color: 'bg-green-100 text-green-600' },
]

export default function MorePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Central</h1>
        <p className="text-gray-500 text-sm mt-1">Recursos adicionais para sua operação</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {options.map((opt) => (
          <Link key={opt.href} href={opt.href} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-violet-200 transition-all group">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${opt.color}`}>
              <opt.icon className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-violet-700 transition-colors">{opt.label}</h3>
            <p className="text-sm text-gray-400">{opt.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
