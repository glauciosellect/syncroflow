'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { useSocketConnect } from '@/hooks/use-socket'

export default function ChatAppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const [hydrated, setHydrated] = useState(false)

  useSocketConnect()

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated && !user) router.push('/login')
  }, [hydrated, user, router])

  if (!hydrated || !user) return null

  return (
    <div className="h-screen h-dvh bg-[hsl(var(--background))] p-4 md:p-6">
      {children}
    </div>
  )
}
