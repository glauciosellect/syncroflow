'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import Link from 'next/link'

function AcceptInviteContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')
  const { token: accessToken } = useAuthStore()

  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'auth_required'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setErrorMsg('Token de convite inválido ou ausente.')
      return
    }

    if (!accessToken) {
      sessionStorage.setItem('pendingInviteToken', token)
      setStatus('auth_required')
      return
    }

    api.post('/auth/invite/accept', { token })
      .then(() => {
        setStatus('success')
        setTimeout(() => router.push('/team'), 2500)
      })
      .catch((err: any) => {
        setStatus('error')
        setErrorMsg(err.response?.data?.error || 'Erro ao aceitar o convite.')
      })
  }, [token, accessToken])

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-[#1565C0]" />
        <p className="text-gray-600">Aceitando convite...</p>
      </div>
    )
  }

  if (status === 'auth_required') {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
          <span className="text-2xl">✉️</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Você foi convidado!</h2>
        <p className="text-gray-500 text-sm max-w-xs">
          Faça login ou crie uma conta para aceitar o convite para o workspace.
        </p>
        <div className="flex flex-col gap-3 w-full mt-2">
          <Link href={`/login?next=/accept-invite?token=${token}`}>
            <Button className="w-full bg-[#1565C0] hover:bg-[#1565C0]/90 text-white">
              Entrar na minha conta
            </Button>
          </Link>
          <Link href={`/register?invite=${token}`}>
            <Button variant="outline" className="w-full">
              Criar conta nova
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <CheckCircle className="w-14 h-14 text-green-500" />
        <h2 className="text-xl font-bold text-gray-900">Convite aceito!</h2>
        <p className="text-gray-500 text-sm">Você agora faz parte do workspace. Redirecionando...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <XCircle className="w-14 h-14 text-red-500" />
      <h2 className="text-xl font-bold text-gray-900">Convite inválido</h2>
      <p className="text-gray-500 text-sm max-w-xs">{errorMsg}</p>
      <Link href="/login">
        <Button variant="outline">Ir para o login</Button>
      </Link>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl border border-gray-200 p-10 w-full max-w-sm shadow-sm">
        <div className="flex justify-center mb-6">
          <span className="text-2xl font-bold text-[#1565C0]">SyncroFlow</span>
        </div>
        <Suspense fallback={<Loader2 className="w-8 h-8 animate-spin text-[#1565C0] mx-auto" />}>
          <AcceptInviteContent />
        </Suspense>
      </div>
    </div>
  )
}
