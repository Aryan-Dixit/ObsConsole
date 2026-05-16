import { AuthProvider } from '../store/auth'
import TelemetryInit from './TelemetryInit'
import './globals.css'

export const metadata = { title: 'ObsConsole', description: 'Real-time observability platform' }

export default function RootLayout({ children }) {
  return (
    <html lang="en" dir="ltr">
      <body>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <AuthProvider>
          <TelemetryInit />
          <main id="main-content">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  )
}
