// src/context/NotificationContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { io } from 'socket.io-client'
import { notificationsApi } from '../api/client'
import { useAuth } from './AuthContext'

const NotificationContext = createContext(null)

export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [counts, setCounts] = useState({ activeCriticalCount: 0, activeWarningCount: 0 })
  const [loading, setLoading] = useState(false)

  const refreshNotifications = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const res = await notificationsApi.list({ limit: 50 })
      const d = res?.data || {}
      setNotifications(d.notifications || [])
      setUnreadCount(d.unreadCount || 0)
      setCounts(d.counts || { activeCriticalCount: 0, activeWarningCount: 0 })
    } catch {
      // Non-blocking: notification fetch errors should not break app navigation
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      setNotifications([])
      setUnreadCount(0)
      setCounts({ activeCriticalCount: 0, activeWarningCount: 0 })
      return
    }

    refreshNotifications()

    const token = localStorage.getItem('sisigan_token')
    const backendUrl = import.meta.env.VITE_BACKEND_URL
    if (!token || !backendUrl) return

    const socket = io(backendUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    })

    socket.on('notification:new', (newNotif) => {
      if (!newNotif) return
      setNotifications((prev) => {
        if (prev.some((n) => n.id === newNotif.id)) return prev
        return [newNotif, ...prev].slice(0, 100)
      })
      if (!newNotif.isRead) {
        setUnreadCount((c) => c + 1)
      }
      if (newNotif.type === 'OUT_OF_STOCK' && !newNotif.isResolved) {
        setCounts((c) => ({ ...c, activeCriticalCount: c.activeCriticalCount + 1 }))
      } else if (newNotif.type === 'LOW_STOCK' && !newNotif.isResolved) {
        setCounts((c) => ({ ...c, activeWarningCount: c.activeWarningCount + 1 }))
      } else if (newNotif.type === 'RESTOCKED') {
        // Refresh counts and resolved states when a recovery arrives
        refreshNotifications()
      }
    })

    return () => {
      socket.disconnect()
    }
  }, [user, refreshNotifications])

  const markAsRead = useCallback(async (id) => {
    try {
      await notificationsApi.markAsRead(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
      )
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch {
      // Ignore if already read or unauthorized
    }
  }, [])

  const markAllAsRead = useCallback(async () => {
    try {
      await notificationsApi.markAllAsRead()
      const now = new Date().toISOString()
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: n.readAt || now })))
      setUnreadCount(0)
    } catch {
      // Non-blocking
    }
  }, [])

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        counts,
        loading,
        refreshNotifications,
        markAsRead,
        markAllAsRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export const useNotifications = () => useContext(NotificationContext)
