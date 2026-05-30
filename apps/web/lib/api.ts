import axios from 'axios'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: false,
})

// Sempre pega o token mais recente do localStorage a cada requisição
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('sf_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let isRefreshing = false
let failedQueue: { resolve: (v: any) => void; reject: (e: any) => void }[] = []

function processQueue(error: any, token: string | null) {
  failedQueue.forEach((p) => error ? p.reject(error) : p.resolve(token))
  failedQueue = []
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config

    // Evitar loop: não tentar refresh na rota de refresh/login
    if (err.response?.status !== 401 || original._retry ||
        original.url?.includes('/auth/refresh') || original.url?.includes('/auth/login')) {
      return Promise.reject(err)
    }

    if (typeof window === 'undefined') return Promise.reject(err)

    const refreshToken = localStorage.getItem('sf_refresh')
    if (!refreshToken) {
      window.location.href = '/login'
      return Promise.reject(err)
    }

    // Se já está renovando, enfileira as requisições
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      })
    }

    original._retry = true
    isRefreshing = true

    try {
      const res = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken })
      const { accessToken, refreshToken: newRefresh } = res.data

      // Atualiza localStorage
      localStorage.setItem('sf_token', accessToken)
      localStorage.setItem('sf_refresh', newRefresh)

      // Atualiza o Zustand store sem importar diretamente (evita circular)
      const sfAuth = localStorage.getItem('sf-auth')
      if (sfAuth) {
        try {
          const parsed = JSON.parse(sfAuth)
          parsed.state.token = accessToken
          parsed.state.refreshToken = newRefresh
          localStorage.setItem('sf-auth', JSON.stringify(parsed))
        } catch {}
      }

      processQueue(null, accessToken)
      original.headers.Authorization = `Bearer ${accessToken}`
      return api(original)
    } catch (refreshErr) {
      processQueue(refreshErr, null)
      localStorage.removeItem('sf_token')
      localStorage.removeItem('sf_refresh')
      localStorage.removeItem('sf-auth')
      window.location.href = '/login'
      return Promise.reject(refreshErr)
    } finally {
      isRefreshing = false
    }
  }
)

export default api
