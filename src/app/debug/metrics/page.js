/**
 * /debug/metrics — Telemetry viewer
 * Strategy: CSR (reads IndexedDB, live updates from mock ingestion endpoint)
 * Shows: last 50 sessions + live-updating p50/p75/p95 panel for all metrics
 */
import MetricsDashboard from './MetricsDashboard'

export default function MetricsPage() {
  return <MetricsDashboard />
}
