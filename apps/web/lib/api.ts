import axios from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  withCredentials: false,
})

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('sf_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      const refreshToken = localStorage.getItem('sf_refresh')
      if (refreshToken) {
        try {
          const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/auth/refresh`, { refreshToken })
          const { accessToken, refreshToken: newRefresh } = res.data
          localStorage.setItem('sf_token', accessToken)
          localStorage.setItem('sf_refresh', newRefresh)
          err.config.headers.Authorization = `Bearer ${accessToken}`
          return axios(err.config)
        } catch {
          localStorage.removeItem('sf_token')
          localStorage.removeItem('sf_refresh')
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(err)
  }
)

export default api
