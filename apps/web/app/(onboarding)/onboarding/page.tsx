'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Loader2, Zap } from 'lucide-react'

const steps = [
  {
    title: 'Como está sua experiência com IA?',
    options: [
      { value: 'beginner', label: 'Estamos dando os primeiros passos com IA' },
      { value: 'intermediate', label: 'Já temos experiências iniciais implementadas' },
      { value: 'advanced', label: 'Já temos soluções maduras rodando' },
    ],
  },
  {
    title: 'Para qual objetivo você usará o SyncroFlow?',
    options: [
      { value: 'own', label: 'Para minha própria empresa ou produto' },
      { value: 'clients', label: 'Para oferecer serviços de IA para outras empresas' },
    ],
  },
  {
    title: 'Qual setor sua empresa atende?',
    options: [
      { value: 'education', label: 'Educação' },
      { value: 'health', label: 'Clínicas / Saúde' },
      { value: 'beauty', label: 'Salão de Beleza / Barbearia' },
      { value: 'legal', label: 'Advocacia / Jurídico' },
      { value: 'ecommerce', label: 'E-commerce' },
      { value: 'realestate', label: 'Imobiliário' },
      { value: 'food', label: 'Restaurantes / Food' },
      { value: 'tech', label: 'Tecnologia' },
      { value: 'other', label: 'Outros' },
    ],
  },
  {
    title: 'Há quanto tempo sua empresa está no mercado?',
    options: [
      { value: 'lt1', label: 'Menos de 1 ano' },
      { value: '1to5', label: 'Entre 1 e 5 anos' },
      { value: '5to10', label: 'Entre 5 e 10 anos' },
      { value: 'gt10', label: 'Mais de 10 anos' },
    ],
  },
]

export default function OnboardingPage() {
  const router = useRouter()
  const { setUser } = useAuthStore()
  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)

  const step = steps[currentStep]
  const selected = answers[currentStep]
  const isLast = currentStep === steps.length - 1

  const handleSelect = (value: string) => {
    setAnswers(prev => ({ ...prev, [currentStep]: value }))
  }

  const handleNext = async () => {
    if (!selected) return
    if (!isLast) {
      setCurrentStep(s => s + 1)
      return
    }
    setLoading(true)
    try {
      await api.patch('/auth/me', { onboardingDone: true, onboardingData: answers })
      setUser({ onboardingDone: true })
    } catch {}
    router.push('/dashboard')
  }

  return (
    <div className="w-full max-w-lg">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-gray-900">SyncroFlow</span>
        </div>
        <div className="flex gap-1.5 justify-center mb-6">
          {steps.map((_, i) => (
            <div key={i} className={cn('h-1.5 rounded-full transition-all', i === currentStep ? 'w-8 bg-violet-600' : i < currentStep ? 'w-4 bg-violet-300' : 'w-4 bg-gray-200')} />
          ))}
        </div>
        <p className="text-sm text-gray-400">Passo {currentStep + 1} de {steps.length}</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <h2 className="text-xl font-bold text-gray-900 mb-6">{step.title}</h2>
        <div className="space-y-3">
          {step.options.map((opt) => (
            <button key={opt.value} onClick={() => handleSelect(opt.value)}
              className={cn('w-full text-left px-4 py-3 rounded-xl border-2 transition-all text-sm font-medium',
                selected === opt.value ? 'border-violet-600 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-700 hover:border-gray-300')}>
              {opt.label}
            </button>
          ))}
        </div>

        <Button onClick={handleNext} disabled={!selected || loading} className="w-full mt-6 bg-violet-600 hover:bg-violet-700">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {isLast ? 'Entrar no painel' : 'Continuar'}
        </Button>
      </div>
    </div>
  )
}
