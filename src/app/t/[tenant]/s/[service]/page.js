/**
 * /t/[tenant]/s/[service] — Live tail page
 * The SSR page just passes params to the CSR shell.
 * Service metadata is fetched client-side with the Bearer token.
 */
import LiveTailShell from './LiveTailShell'

export default function LiveTailPage({ params }) {
  return (
    <LiveTailShell
      tenantSlug={params.tenant}
      serviceId={params.service}
    />
  )
}
