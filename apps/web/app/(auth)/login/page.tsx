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
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
  totpCode: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const router = useRouter()
  const { toast } = useToast()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [loading, setLoading] = useState(false)
  const [needs2FA, setNeeds2FA] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const res = await api.post('/auth/login', data)
      const { user, workspace, accessToken, refreshToken } = res.data
      setAuth(user, workspace, accessToken, refreshToken)
      router.push('/dashboard')
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Erro ao fazer login'
      if (msg.includes('2FA') || msg.includes('obrigatório')) setNeeds2FA(true)
      toast({ title: 'Erro', description: msg, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Entrar na sua conta</h1>
        <p className="text-gray-500 mt-2">Bem-vindo de volta ao SyncroFlow</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="seu@email.com" {...register('email')} />
          {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
        </div>
        <div>
          <Label htmlFor="password">Senha</Label>
          <Input id="password" type="password" placeholder="••••••••" {...register('password')} />
          {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>}
        </div>
        {needs2FA && (
          <div>
            <Label htmlFor="totpCode">Código 2FA</Label>
            <Input id="totpCode" placeholder="000000" maxLength={6} {...register('totpCode')} />
          </div>
        )}
        <Button type="submit" className="w-full text-white hover:opacity-90" style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Entrar
        </Button>
      </form>

      <div className="mt-4 text-center space-y-2">
        <Link href="/forgot-password" className="text-sm text-[#1565C0] hover:underline block">
          Esqueci minha senha
        </Link>
        <p className="text-sm text-gray-500">
          Não tem conta?{' '}
          <Link href="/register" className="text-[#1565C0] hover:underline font-medium">
            Cadastre-se grátis
          </Link>
        </p>
      </div>
    </div>
  )
}
