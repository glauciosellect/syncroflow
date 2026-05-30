'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { X, Loader2, Headset, ShoppingCart, User, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const steps = ['Nome', 'Objetivo', 'Empresa', 'Configurações']

const schema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  purpose: z.enum(['SUPPORT', 'SALES', 'PERSONAL']),
  companyName: z.string().optional(),
  companyDesc: z.string().max(500).optional(),
  transferToHuman: z.boolean().optional(),
  useEmojis: z.boolean().optional(),
  restrictTopics: z.boolean().optional(),
  splitLongMessages: z.boolean().optional(),
})

type FormData = z.infer<typeof schema>

export function AgentWizard({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast()
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)
  const [purpose, setPurpose] = useState<'SUPPORT' | 'SALES' | 'PERSONAL'>('SUPPORT')

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { purpose: 'SUPPORT', transferToHuman: true, useEmojis: false, restrictTopics: false, splitLongMessages: false },
  })

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const agent = await api.post('/agents', { name: data.name, purpose: data.purpose, companyName: data.companyName, companyDesc: data.companyDesc })
      await api.patch(`/agents/${agent.data.id}/config`, { transferToHuman: data.transferToHuman, useEmojis: data.useEmojis, restrictTopics: data.restrictTopics, splitLongMessages: data.splitLongMessages })
      return agent.data
    },
    onSuccess: () => setDone(true),
    onError: (err: any) => toast({ title: 'Erro', description: err.response?.data?.error || 'Erro ao criar agente', variant: 'destructive' }),
  })

  const name = watch('name')

  const purposeOptions = [
    { value: 'SUPPORT', label: 'Suporte', icon: Headset, desc: 'Atendimento e suporte ao cliente' },
    { value: 'SALES', label: 'Vendas', icon: ShoppingCart, desc: 'Captação e conversão de clientes' },
    { value: 'PERSONAL', label: 'Uso pessoal', icon: User, desc: 'Assistente para uso próprio' },
  ] as const

  const toggleOptions = [
    { key: 'transferToHuman', label: 'Transferir para humano', desc: 'Permite transferir atendimento para equipe humana' },
    { key: 'useEmojis', label: 'Usar emojis nas respostas', desc: 'O agente pode usar emojis' },
    { key: 'restrictTopics', label: 'Restringir temas', desc: 'Responde apenas sobre assuntos da empresa' },
    { key: 'splitLongMessages', label: 'Dividir mensagens longas', desc: 'Separa respostas extensas em partes' },
  ] as const

  if (done) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Agente criado!</h2>
          <p className="text-gray-500 mb-6">Seu agente está pronto para ser configurado</p>
          <div className="grid grid-cols-3 gap-3">
            {[{ label: 'Treinamentos', href: 'trainings' }, { label: 'Conectar canais', href: 'channels' }, { label: 'Configurações', href: 'config' }].map((opt) => (
              <button key={opt.label} onClick={onSuccess} className="p-3 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                {opt.label}
              </button>
            ))}
          </div>
          <Button onClick={onSuccess} variant="ghost" className="mt-4 w-full">Fechar</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl max-w-lg w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Novo Agente</h2>
            <div className="flex gap-1 mt-2">
              {steps.map((s, i) => (
                <div key={s} className={cn('h-1 rounded-full flex-1 transition-colors', i <= step ? 'bg-[#1565C0]' : 'bg-gray-200')} />
              ))}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-50 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {step === 0 && (
            <div>
              <div className="flex justify-center mb-6">
                <div className="w-20 h-20 bg-gradient-to-br from-[#1565C0] to-[#2E7D32] rounded-full flex items-center justify-center text-4xl font-bold text-white shadow-lg">
                  {name?.[0]?.toUpperCase() || '?'}
                </div>
              </div>
              <Label>Qual o nome do seu agente?</Label>
              <Input placeholder="Ex: Sofia, Max, Assistente..." {...register('name')} className="mt-2" />
              {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
            </div>
          )}

          {step === 1 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-4">Qual o objetivo do agente?</h3>
              <div className="grid grid-cols-3 gap-3">
                {purposeOptions.map((opt) => (
                  <button key={opt.value} onClick={() => { setPurpose(opt.value); setValue('purpose', opt.value) }}
                    className={cn('p-4 border-2 rounded-xl flex flex-col items-center gap-2 transition-colors', purpose === opt.value ? 'border-[#1565C0] bg-blue-50' : 'border-gray-200 hover:border-gray-300')}>
                    <opt.icon className={cn('w-8 h-8', purpose === opt.value ? 'text-[#1565C0]' : 'text-gray-400')} />
                    <span className={cn('text-sm font-medium', purpose === opt.value ? 'text-[#1565C0]' : 'text-gray-600')}>{opt.label}</span>
                    <span className="text-xs text-gray-400 text-center">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && purpose !== 'PERSONAL' && (
            <div className="space-y-4">
              <div>
                <Label>Nome da empresa</Label>
                <Input placeholder="Ex: Empresa LTDA" {...register('companyName')} className="mt-2" />
              </div>
              <div>
                <Label>Descrição da empresa</Label>
                <textarea {...register('companyDesc')} placeholder="Descreva a empresa, produtos e serviços..." className="w-full mt-2 border border-input rounded-md px-3 py-2 text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
          )}

          {step === 2 && purpose === 'PERSONAL' && (
            <div className="text-center py-8 text-gray-400">
              <User className="w-12 h-12 mx-auto mb-3 text-gray-200" />
              <p>Agente de uso pessoal não precisa de dados da empresa</p>
            </div>
          )}

          {step === 3 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-4">Configurações iniciais</h3>
              <div className="space-y-3">
                {toggleOptions.map((opt) => {
                  const val = watch(opt.key as any)
                  return (
                    <div key={opt.key} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
                      <div>
                        <div className="text-sm font-medium text-gray-700">{opt.label}</div>
                        <div className="text-xs text-gray-400">{opt.desc}</div>
                      </div>
                      <button onClick={() => setValue(opt.key as any, !val)}
                        className={cn('w-10 h-5 rounded-full transition-colors', val ? 'bg-[#1565C0]' : 'bg-gray-300')}>
                        <div className={cn('w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5', val ? 'translate-x-5' : 'translate-x-0')} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-6 border-t border-gray-100">
          <Button variant="ghost" onClick={() => step > 0 ? setStep(s => s - 1) : onClose()}>
            {step === 0 ? 'Cancelar' : 'Voltar'}
          </Button>
          {step < steps.length - 1 ? (
            <Button onClick={() => setStep(s => s + 1)} className="hover:opacity-90" disabled={step === 0 && !name}>
              Continuar
            </Button>
          ) : (
            <Button onClick={handleSubmit((data) => mutation.mutate(data))} className="hover:opacity-90" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Criar Agente
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}


