// src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect } from 'react'
import { authApi } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  // Restore session on page load
  useEffect(() => {
    const token = localStorage.getItem('sisigan_token')
    if (!token) { setLoading(false); return }

    authApi.me()
      .then(d => setUser(d.data.user))
      .catch(() => localStorage.removeItem('sisigan_token'))
      .finally(() => setLoading(false))
  }, [])

  async function login(email, password) {
    const data = await authApi.login(email, password)
    localStorage.setItem('sisigan_token', data.data.token)
    setUser(data.data.user)
    return data.data.user
  }

  async function logout() {
    try {
      await authApi.logout()
    } catch (_) {
      // Clear local session even if backend log endpoint fails.
    } finally {
      localStorage.removeItem('sisigan_token')
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
