import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import axios from 'axios'

const API = 'http://localhost:8000/api/v1'

interface User {
  id: number
  email: string
}

interface AuthContextValue {
  user: User | null
  accessToken: string | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)

  const login = useCallback(async (email: string, password: string) => {
    const res = await axios.post(`${API}/auth/login`, { email, password }, { withCredentials: true })
    setAccessToken(res.data.access_token)
    setUser(res.data.user)
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    const res = await axios.post(`${API}/auth/register`, { email, password }, { withCredentials: true })
    setAccessToken(res.data.access_token)
    setUser(res.data.user)
  }, [])

  const logout = useCallback(async () => {
    await axios.post(`${API}/auth/logout`, {}, { withCredentials: true }).catch(() => {})
    setAccessToken(null)
    setUser(null)
  }, [])

  const refresh = useCallback(async (): Promise<string | null> => {
    try {
      const res = await axios.post(`${API}/auth/refresh`, {}, { withCredentials: true })
      setAccessToken(res.data.access_token)
      setUser(res.data.user)
      return res.data.access_token
    } catch {
      setAccessToken(null)
      setUser(null)
      return null
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, accessToken, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}