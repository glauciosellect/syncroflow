import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  onboardingDone: boolean
  twoFactorEnabled: boolean
  language: string
  theme: string
}

interface Workspace {
  id: string
  name: string
  slug: string
  plan: string
  credits: number
  trialEndsAt: string | null
}

interface AuthState {
  user: User | null
  workspace: Workspace | null
  token: string | null
  refreshToken: string | null
  setAuth: (user: User, workspace: Workspace, token: string, refreshToken: string) => void
  setUser: (user: Partial<User>) => void
  setWorkspace: (workspace: Partial<Workspace>) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      workspace: null,
      token: null,
      refreshToken: null,
      setAuth: (user, workspace, token, refreshToken) => {
        localStorage.setItem('sf_token', token)
        localStorage.setItem('sf_refresh', refreshToken)
        set({ user, workspace, token, refreshToken })
      },
      setUser: (partial) => set((s) => ({ user: s.user ? { ...s.user, ...partial } : null })),
      setWorkspace: (partial) => set((s) => ({ workspace: s.workspace ? { ...s.workspace, ...partial } : null })),
      logout: () => {
        localStorage.removeItem('sf_token')
        localStorage.removeItem('sf_refresh')
        set({ user: null, workspace: null, token: null, refreshToken: null })
      },
    }),
    { name: 'sf-auth', partialize: (s) => ({ user: s.user, workspace: s.workspace, token: s.token, refreshToken: s.refreshToken }) }
  )
)
