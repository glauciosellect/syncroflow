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
import { Loader2 } from 'lucide-react'

const schema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  workspaceName: z.string().min(2, 'Nome do workspace obrigatório').optional(),
})

type FormData = z.infer<typeof schema>

export default function RegisterPage() {
  const router = useRouter()
  const { toast } = useToast()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const res = await api.post('/auth/register', data)
      const { user, workspace, accessToken, refreshToken } = res.data
      setAuth(user, workspace, accessToken, refreshToken)
      router.push('/onboarding')
    } catch (err: any) {
      toast({ title: 'Erro', description: err.response?.data?.error || 'Erro ao criar conta', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Crie sua conta grátis</h1>
        <p className="text-gray-500 mt-2">7 dias de trial com 1.000 créditos</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="name">Seu nome</Label>
          <Input id="name" placeholder="João Silva" {...register('name')} />
          {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <Label htmlFor="email">Email profissional</Label>
          <Input id="email" type="email" placeholder="joao@empresa.com" {...register('email')} />
          {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
        </div>
        <div>
          <Label htmlFor="password">Senha</Label>
          <Input id="password" type="password" placeholder="Mínimo 8 caracteres" {...register('password')} />
          {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>}
        </div>
        <div>
          <Label htmlFor="workspaceName">Nome do workspace (opcional)</Label>
          <Input id="workspaceName" placeholder="Minha Empresa" {...register('workspaceName')} />
        </div>
        <Button type="submit" className="w-full text-white hover:opacity-90" style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Criar conta grátis
        </Button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-4">
        Já tem conta?{' '}
        <Link href="/login" className="text-[#1565C0] hover:underline font-medium">
          Entrar
        </Link>
      </p>
    </div>
  )
}
