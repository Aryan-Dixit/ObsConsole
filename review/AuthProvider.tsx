// review/AuthProvider.tsx — INTENTIONALLY FLAWED for code review exercise
'use client'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'

interface AuthState {
  accessToken: string | null   // BUG 1: token in context state — visible in React DevTools
  userId: string | null
  isAuthenticated: boolean
}

const AuthCtx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // BUG 1: token in React state — DevTools-visible; use module-level ref instead
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    // BUG 4: no deduplication — if two components call refresh() simultaneously,
    // both fire /api/auth/refresh, the first rotates the token, the second gets 401
    // and logs the user out.
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      // BUG 5: missing X-CSRF-Token header — CSRF check on POST will reject this
    })
    if (!res.ok) { setAccessToken(null); return }
    const { accessToken: newToken, userId: uid } = await res.json()
    setAccessToken(newToken)
    setUserId(uid)
  }, []) // BUG: refresh depends on nothing — never referentially stable if deps change

  useEffect(() => {
    // BUG 2: scheduleRefresh depends on accessToken as a dependency, but the inner
    // setTimeout closes over the value at scheduling time. If a parent re-render causes
    // AuthProvider to re-render with a new string reference for the same token value,
    // this effect fires again and schedules a duplicate refresh timer without clearing
    // the previous one. Two simultaneous refresh calls will fight over the refresh token.
    if (!accessToken) return
    try {
      const { exp } = JSON.parse(atob(accessToken.split('.')[1]))
      const ms = exp * 1000 - Date.now() - 60_000
      const id = setTimeout(refresh, ms)
      return () => clearTimeout(id)
    } catch {}
  }, [accessToken, refresh])

  // BUG 3: no BroadcastChannel — in two tabs, Tab A's refresh rotates the token,
  // Tab B's next refresh fails with 401 (uses invalidated refresh token) and logs
  // the user out of Tab B silently.

  return (
    <AuthCtx.Provider value={{ accessToken, userId, isAuthenticated: !!accessToken }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
