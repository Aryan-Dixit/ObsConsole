/**
 * / — Authenticated landing page
 *
 * In cross-origin deployments (Vercel + Railway), the refresh_token cookie
 * is stored on the Railway domain, not the Vercel domain. The RSC server
 * context cannot see it via cookies(). Auth is handled entirely client-side
 * by AuthProvider which silently refreshes on mount and redirects to /login
 * if the session is invalid.
 */
import LandingClient from './LandingClient'

export default function HomePage() {
  return <LandingClient />
}
