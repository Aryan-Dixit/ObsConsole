/**
 * /t/[tenant]/dashboards/[id] — Dashboard editor
 * Strategy: CSR only
 * Justification (ADR-001): Drag-resize-reorder requires synchronous client state
 * that cannot be serialised through RSC. Optimistic updates with undo/redo and
 * conflict resolution all require ephemeral client state that would be reset on
 * every SSR re-render.
 */
import DashboardEditor from './DashboardEditor'

export default function DashboardPage({ params }) {
  return <DashboardEditor tenantSlug={params.tenant} dashboardId={params.id} />
}
