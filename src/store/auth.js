'use client'
import { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000'

const AuthContext = createContext(null)

const initialState = {
  user: null,
  accessToken: null,  // intentionally NOT in localStorage — memory only
  loading: true,
  error: null,
}

function authReducer(state, action) {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
      return { ...state, user: action.user, accessToken: action.accessToken, loading: false, error: null }
    case 'LOGOUT':
      return { ...initialState, loading: false }
    case 'TOKEN_REFRESHED':
      return { ...state, accessToken: action.accessToken }
    case 'SET_LOADING':
      return { ...state, loading: action.value }
    case 'SET_ERROR':
      return { ...state, error: action.error, loading: false }
    default:
      return state
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState)
  const refreshTimer = useRef(null)

  function scheduleRefresh(accessToken) {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    try {
      const payload = JSON.parse(atob(accessToken.split('.')[1]))
      const msLeft = payload.exp * 1000 - Date.now() - 60_000
      if (msLeft > 0) {
        refreshTimer.current = setTimeout(refresh, msLeft)
      } else {
        refresh()
      }
    } catch {}
  }

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': getCsrfCookie() },
      })
      if (!res.ok) { dispatch({ type: 'LOGOUT' }); return }
      const { accessToken } = await res.json()
      dispatch({ type: 'TOKEN_REFRESHED', accessToken })
      scheduleRefresh(accessToken)
    } catch {
      dispatch({ type: 'LOGOUT' })
    }
  }, [])

  // On mount, attempt silent refresh (restores session after page reload)
  useEffect(() => {
    refresh().finally(() => dispatch({ type: 'SET_LOADING', value: false }))
    // Refresh when tab becomes visible again
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    // Refresh on reconnect
    window.addEventListener('online', refresh)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', refresh)
      clearTimeout(refreshTimer.current)
    }
  }, [refresh])

  const login = useCallback(async (email, password) => {
    dispatch({ type: 'SET_LOADING', value: true })
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const err = await res.json()
        dispatch({ type: 'SET_ERROR', error: err.error || 'Login failed' })
        return false
      }
      const { accessToken, user } = await res.json()
      dispatch({ type: 'LOGIN_SUCCESS', user, accessToken })
      scheduleRefresh(accessToken)
      return true
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: 'Network error' })
      return false
    }
  }, [])

  const logout = useCallback(async () => {
    await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' })
    clearTimeout(refreshTimer.current)
    dispatch({ type: 'LOGOUT' })
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}

function getCsrfCookie() {
  return document.cookie.match(/csrf=([^;]+)/)?.[1] || ''
}
