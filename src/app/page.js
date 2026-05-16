/**
 * / — Authenticated landing page
 * Strategy: SSR auth guard → CSR data fetch
 *
 * Why not pure RSC for tenant data?
 * The access token (5-min JWT) lives in browser memory only — never in a cookie.
 * The RSC server context only has access to cookies (refresh_token, csrf).
 * So the RSC can verify a session exists, but cannot fetch authed API data.
 * The tenant list is fetched client-side after hydration using the in-memory token.
 * This is the correct pattern; the alternative (passing the token via a server
 * action or route handler) adds complexity with no user-visible benefit here.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import LandingClient from './LandingClient'

export default async function HomePage() {
  // SSR auth guard: if no refresh cookie, send to login before any JS runs
  const cookieStore = cookies()
  if (!cookieStore.has('refresh_token')) redirect('/login')
  return <LandingClient />
}
