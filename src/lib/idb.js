/**
 * IndexedDB helpers for:
 * 1. Dashboard offline edit queue (Section 2.2)
 * 2. Telemetry session persistence — last 50 sessions (Section 5.1)
 */
import { get, set, del, keys } from 'idb-keyval'

// ── Dashboard offline queue ───────────────────────────────────────────────────
export async function queueDashboardEdit(edit) {
  const existing = await get('dashboard_edit_queue') || []
  existing.push({ ...edit, queuedAt: Date.now() })
  await set('dashboard_edit_queue', existing)
}

export async function getDashboardEditQueue() {
  return await get('dashboard_edit_queue') || []
}

export async function clearDashboardEditQueue() {
  await del('dashboard_edit_queue')
}

export async function removeDashboardEdit(id) {
  const q = await get('dashboard_edit_queue') || []
  await set('dashboard_edit_queue', q.filter(e => e.id !== id))
}

// ── Telemetry sessions ────────────────────────────────────────────────────────
const MAX_SESSIONS = 50

export async function persistTelemetrySession(session) {
  try {
    const existing = await get('telemetry_sessions') || []
    const updated = [...existing, { ...session, savedAt: Date.now() }].slice(-MAX_SESSIONS)
    await set('telemetry_sessions', updated)
  } catch {}
}

export async function getTelemetrySessions() {
  try {
    return await get('telemetry_sessions') || []
  } catch { return [] }
}
