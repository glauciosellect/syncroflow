'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import api from '@/lib/api'
import { Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react'

const schema = z.object({
  email: z.string().email('E-mail inválido'),
})
type FormData = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', data)
      setSent(true)
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível enviar o e-mail. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="w-full text-center">
        <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">E-mail enviado!</h1>
        <p className="text-gray-500 mb-6">
          Se esse e-mail estiver cadastrado, você receberá um link para redefinir sua senha em instantes. Verifique também a caixa de spam.
        </p>
        <Link href="/login" className="text-[#1565C0] hover:underline text-sm font-medium">
          Voltar para o login
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Esqueceu sua senha?</h1>
        <p className="text-gray-500 mt-2">
          Digite seu e-mail e enviaremos um link para redefinir sua senha.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            placeholder="seu@email.com"
            className="mt-1"
            {...register('email')}
          />
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
        </div>

        <Button
          type="submit"
          className="w-full text-white hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }}
          disabled={loading}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Enviar link de redefinição
        </Button>
      </form>

      <Link href="/login" className="flex items-center justify-center gap-1 text-sm text-gray-500 hover:text-gray-700 mt-6">
        <ArrowLeft className="w-4 h-4" />
        Voltar para o login
      </Link>
    </div>
  )
}
