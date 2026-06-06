import { NextResponse } from 'next/server'

const PUBLIC = ['/login', '/share', '/debug']

export function middleware(request) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next()

  // In cross-origin deployments (Vercel frontend + Railway backend), the
  // refresh_token HttpOnly cookie is set on the Railway domain, not the
  // Vercel domain. The middleware cannot see it. Auth is handled entirely
  // client-side by AuthProvider which calls /api/auth/refresh on mount.
  // If the refresh fails, AuthProvider dispatches LOGOUT and the client
  // redirects to /login — so we do NOT redirect here.

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
