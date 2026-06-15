'use client'
import { useState, Suspense } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import api from '@/lib/api'
import { Loader2, CheckCircle2 } from 'lucide-react'

const schema = z.object({
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, {
  message: 'As senhas não coincidem',
  path: ['confirm'],
})
type FormData = z.infer<typeof schema>

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const token = searchParams.get('token')

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    if (!token) {
      toast({ title: 'Link inválido', description: 'Token não encontrado. Solicite um novo link.', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, password: data.password })
      setDone(true)
      setTimeout(() => router.push('/login'), 3000)
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Token inválido ou expirado. Solicite um novo link.'
      toast({ title: 'Erro', description: msg, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="w-full text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Link inválido</h1>
        <p className="text-gray-500 mb-6">Este link de redefinição é inválido ou já foi usado.</p>
        <Link href="/forgot-password" className="text-[#1565C0] hover:underline text-sm font-medium">
          Solicitar novo link
        </Link>
      </div>
    )
  }

  if (done) {
    return (
      <div className="w-full text-center">
        <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Senha redefinida!</h1>
        <p className="text-gray-500 mb-2">Sua senha foi alterada com sucesso.</p>
        <p className="text-gray-400 text-sm">Redirecionando para o login...</p>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Redefinir senha</h1>
        <p className="text-gray-500 mt-2">Digite sua nova senha abaixo.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="password">Nova senha</Label>
          <Input
            id="password"
            type="password"
            placeholder="Mínimo 8 caracteres"
            className="mt-1"
            {...register('password')}
          />
          {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
        </div>
        <div>
          <Label htmlFor="confirm">Confirmar nova senha</Label>
          <Input
            id="confirm"
            type="password"
            placeholder="Repita a senha"
            className="mt-1"
            {...register('confirm')}
          />
          {errors.confirm && <p className="text-red-500 text-xs mt-1">{errors.confirm.message}</p>}
        </div>

        <Button
          type="submit"
          className="w-full text-white hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }}
          disabled={loading}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Redefinir senha
        </Button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        <Link href="/login" className="text-[#1565C0] hover:underline">Voltar para o login</Link>
      </p>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  )
}
