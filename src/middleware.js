import { NextResponse } from 'next/server'

const PUBLIC = ['/login', '/share']

export function middleware(request) {
  const { pathname } = request.nextUrl
  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next()
  const hasRefresh = request.cookies.has('refresh_token')
  if (!hasRefresh) return NextResponse.redirect(new URL('/login', request.url))
  if (['POST','PATCH','PUT','DELETE'].includes(request.method)) {
    const csrfH = request.headers.get('x-csrf-token')
    const csrfC = request.cookies.get('csrf')?.value
    if (!csrfH || csrfH !== csrfC)
      return NextResponse.json({ error: 'invalid csrf' }, { status: 403 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
