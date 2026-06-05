'use client'
import { useState, useEffect, Suspense } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import { Loader2 } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
  totpCode: z.string().optional(),
})

type FormData = z.infer<typeof schema>

function GoogleLoginButton() {
  const [loading, setLoading] = useState(false)
  return (
    <button
      type="button"
      onClick={() => { setLoading(true); window.location.href = `${API_URL}/auth/google` }}
      disabled={loading}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1565C0] focus:ring-offset-1 disabled:opacity-60"
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
      )}
      Continuar com Google
    </button>
  )
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [loading, setLoading] = useState(false)
  const [needs2FA, setNeeds2FA] = useState(false)

  // Captura tokens vindos do callback OAuth do Google
  useEffect(() => {
    const token = searchParams.get('token')
    const refresh = searchParams.get('refresh')
    const workspaceId = searchParams.get('workspaceId')
    const error = searchParams.get('error')

    if (error === 'google_auth_failed') {
      toast({ title: 'Erro ao entrar com Google', description: 'Tente novamente ou use email e senha.', variant: 'destructive' })
      return
    }

    if (token && refresh && workspaceId) {
      api.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } }).then(res => {
        const { user, workspaceMembers } = res.data
        const workspace = workspaceMembers?.[0]?.workspace
        if (user && workspace) {
          setAuth(user, workspace, token, refresh)
          router.push('/dashboard')
        }
      }).catch(() => {
        toast({ title: 'Erro ao autenticar com Google', variant: 'destructive' })
      })
    }
  }, [searchParams, setAuth, router, toast])

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
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Entrar na sua conta</h1>
        <p className="text-gray-500 mt-2">Bem-vindo de volta ao SyncroFlow</p>
      </div>

      {/* Botão Google */}
      <div className="mb-5">
        <GoogleLoginButton />
      </div>

      <div className="relative mb-5">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
        <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400">ou entre com e-mail</span></div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" placeholder="seu@email.com" className="mt-1" {...register('email')} />
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Senha</Label>
            <Link href="/forgot-password" className="text-xs text-[#1565C0] hover:underline">Esqueci minha senha</Link>
          </div>
          <Input id="password" type="password" placeholder="••••••••" className="mt-1" {...register('password')} />
          {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
        </div>
        {needs2FA && (
          <div>
            <Label htmlFor="totpCode">Código de autenticação (2FA)</Label>
            <Input id="totpCode" placeholder="000000" maxLength={6} className="mt-1" {...register('totpCode')} />
          </div>
        )}
        <Button type="submit" className="w-full text-white hover:opacity-90" style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Entrar
        </Button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-5">
        Não tem conta?{' '}
        <Link href="/register" className="text-[#1565C0] hover:underline font-medium">Cadastre-se grátis</Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
