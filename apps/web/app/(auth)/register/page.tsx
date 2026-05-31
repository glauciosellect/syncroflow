'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import { Loader2, ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const accountSchema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  phone: z.string().optional(),
})

type AccountData = z.infer<typeof accountSchema>

const SEGMENTS = [
  { value: 'health', label: 'Saúde & Clínicas' },
  { value: 'education', label: 'Educação & Cursos' },
  { value: 'ecommerce', label: 'E-commerce & Varejo' },
  { value: 'legal', label: 'Jurídico & Advocacia' },
  { value: 'beauty', label: 'Beleza & Estética' },
  { value: 'realestate', label: 'Imobiliário' },
  { value: 'food', label: 'Alimentação & Food' },
  { value: 'tech', label: 'Tecnologia & SaaS' },
  { value: 'services', label: 'Serviços em Geral' },
  { value: 'other', label: 'Outro segmento' },
]

const ROLES = [
  { value: 'owner', label: 'Dono(a) do negócio', desc: 'Vou usar para minha própria empresa' },
  { value: 'manager', label: 'Gestor(a) de equipe', desc: 'Gerencio times de atendimento' },
  { value: 'agency', label: 'Agência / Consultoria', desc: 'Vendo soluções para clientes' },
  { value: 'dev', label: 'Desenvolvedor(a)', desc: 'Integrando IA em projetos' },
]

const TEAM_SIZES = [
  { value: 'solo', label: 'Só eu', desc: 'Atendimento individual' },
  { value: 'small', label: '2 a 5 pessoas', desc: 'Equipe pequena' },
  { value: 'medium', label: '6 a 20 pessoas', desc: 'Time estruturado' },
  { value: 'large', label: 'Mais de 20', desc: 'Operação de grande escala' },
]

export default function RegisterPage() {
  const router = useRouter()
  const { toast } = useToast()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [segment, setSegment] = useState('')
  const [role, setRole] = useState('')
  const [teamSize, setTeamSize] = useState('')

  const { register, handleSubmit, getValues, formState: { errors, isValid } } = useForm<AccountData>({
    resolver: zodResolver(accountSchema),
    mode: 'onChange',
  })

  const canAdvanceStep1 = isValid

  const handleNext = () => {
    if (step === 1 && canAdvanceStep1) setStep(2)
    else if (step === 2 && segment) setStep(3)
  }

  const onSubmit = async () => {
    if (!role || !teamSize) return
    setLoading(true)
    const values = getValues()
    try {
      const res = await api.post('/auth/register', {
        name: values.name,
        email: values.email,
        password: values.password,
        phone: values.phone || undefined,
        segment,
        role,
        teamSize,
      })
      const { user, workspace, accessToken, refreshToken } = res.data
      setAuth(user, workspace, accessToken, refreshToken)
      router.push('/dashboard')
    } catch (err: any) {
      toast({ title: 'Erro ao criar conta', description: err.response?.data?.error || 'Tente novamente', variant: 'destructive' })
      setStep(1)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all',
                s < step ? 'bg-[#2E7D32] text-white' :
                s === step ? 'bg-[#1565C0] text-white' :
                'bg-gray-100 text-gray-400'
              )}>
                {s < step ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 3 && (
                <div className={cn('flex-1 h-0.5 transition-all', s < step ? 'bg-[#2E7D32]' : 'bg-gray-100')} />
              )}
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-400 text-right">
          {step === 1 && 'Seus dados de acesso'}
          {step === 2 && 'Seu segmento de atuação'}
          {step === 3 && 'Seu perfil de uso'}
        </div>
      </div>

      {/* PASSO 1 — Dados da conta */}
      {step === 1 && (
        <div>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Crie sua conta</h1>
            <p className="text-gray-400 mt-1 text-sm">7 dias grátis · 1.000 créditos inclusos · sem cartão</p>
          </div>

          <form onSubmit={handleSubmit(handleNext)} className="space-y-4">
            <div>
              <Label htmlFor="name">Como você se chama?</Label>
              <Input id="name" placeholder="Seu nome completo" className="mt-1" {...register('name')} />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <Label htmlFor="email">E-mail de acesso</Label>
              <Input id="email" type="email" placeholder="voce@empresa.com" className="mt-1" {...register('email')} />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <Label htmlFor="phone">WhatsApp <span className="text-gray-400 font-normal">(opcional)</span></Label>
              <Input id="phone" type="tel" placeholder="+55 11 99999-9999" className="mt-1" {...register('phone')} />
            </div>
            <div>
              <Label htmlFor="password">Crie uma senha</Label>
              <Input id="password" type="password" placeholder="Mínimo 8 caracteres" className="mt-1" {...register('password')} />
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <Button
              type="submit"
              className="w-full text-white mt-2"
              style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }}
              disabled={!canAdvanceStep1}
            >
              Continuar <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </form>

          <p className="text-center text-sm text-gray-400 mt-5">
            Já tem conta?{' '}
            <Link href="/login" className="text-[#1565C0] hover:underline font-medium">Entrar</Link>
          </p>
        </div>
      )}

      {/* PASSO 2 — Segmento */}
      {step === 2 && (
        <div>
          <div className="mb-6">
            <button onClick={() => setStep(1)} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-4">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Qual é o seu mercado?</h1>
            <p className="text-gray-400 mt-1 text-sm">Personalizamos sua experiência com base no seu setor</p>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-6">
            {SEGMENTS.map((s) => (
              <button
                key={s.value}
                onClick={() => setSegment(s.value)}
                className={cn(
                  'text-left px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all',
                  segment === s.value
                    ? 'border-[#1565C0] bg-blue-50 text-[#1565C0]'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          <Button
            onClick={handleNext}
            disabled={!segment}
            className="w-full text-white"
            style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }}
          >
            Continuar <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}

      {/* PASSO 3 — Perfil de uso */}
      {step === 3 && (
        <div>
          <div className="mb-6">
            <button onClick={() => setStep(2)} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-4">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Como você vai usar?</h1>
            <p className="text-gray-400 mt-1 text-sm">Isso nos ajuda a sugerir as configurações certas</p>
          </div>

          <div className="space-y-2 mb-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Seu papel</p>
            {ROLES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRole(r.value)}
                className={cn(
                  'w-full text-left px-4 py-3 rounded-xl border-2 transition-all',
                  role === r.value
                    ? 'border-[#1565C0] bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <div className={cn('text-sm font-semibold', role === r.value ? 'text-[#1565C0]' : 'text-gray-800')}>{r.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{r.desc}</div>
              </button>
            ))}
          </div>

          <div className="space-y-2 mb-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tamanho do time de atendimento</p>
            <div className="grid grid-cols-2 gap-2">
              {TEAM_SIZES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTeamSize(t.value)}
                  className={cn(
                    'text-left px-3 py-2.5 rounded-xl border-2 transition-all',
                    teamSize === t.value
                      ? 'border-[#1565C0] bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <div className={cn('text-sm font-semibold', teamSize === t.value ? 'text-[#1565C0]' : 'text-gray-800')}>{t.label}</div>
                  <div className="text-xs text-gray-400">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={onSubmit}
            disabled={!role || !teamSize || loading}
            className="w-full text-white"
            style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Criar minha conta grátis
          </Button>
        </div>
      )}
    </div>
  )
}
