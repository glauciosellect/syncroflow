'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import { Toaster } from '@/components/ui/toaster'
import { ThemeProvider } from '@/components/shared/theme-provider'
import axios from 'axios'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const REFRESH_INTERVAL = 13 * 60 * 1000 // 13 minutos (token expira em 15m)

function TokenRefresher() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const doRefresh = async () => {
      const refreshToken = localStorage.getItem('sf_refresh')
      if (!refreshToken) return

      try {
        const res = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken })
        const { accessToken, refreshToken: newRefresh } = res.data
        localStorage.setItem('sf_token', accessToken)
        localStorage.setItem('sf_refresh', newRefresh)

        const sfAuth = localStorage.getItem('sf-auth')
        if (sfAuth) {
          try {
            const parsed = JSON.parse(sfAuth)
            parsed.state.token = accessToken
            parsed.state.refreshToken = newRefresh
            localStorage.setItem('sf-auth', JSON.stringify(parsed))
          } catch {}
        }
      } catch {
        // Refresh falhou — deixa o interceptor de 401 lidar na próxima request
      }
    }

    timerRef.current = setInterval(doRefresh, REFRESH_INTERVAL)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TokenRefresher />
        {children}
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
