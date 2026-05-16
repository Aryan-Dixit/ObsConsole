# ADR-008: Telemetry Architecture & Sampling

**Status**: Accepted  
**Date**: 2025-01  

---

## Context

Assignment §5.1 requires capturing CWV, custom timings, long tasks, slow APIs (>1s), resource timing, and JS errors — per session, per route — with configurable sampling, offline survival, and a `/debug/metrics` viewer showing last 50 sessions + live p50/p75/p95.

---

## Decision

**Capture**:
- `web-vitals` library: LCP, INP, CLS, TTFB, FCP via callbacks (`onLCP`, `onINP`, etc.)
- `PerformanceObserver({ entryTypes: ['longtask'] })`: long tasks > 50ms
- `PerformanceObserver({ entryTypes: ['resource'], buffered: true })`: resource timing (top 3 by size)
- `window.addEventListener('error')` + `'unhandledrejection'`: JS errors with stack
- Instrumented `apiFetch` wrapper: captures method, status, duration for all API calls
- Custom `trackTiming()` calls: `time_to_first_event`, route transitions

**Sampling rates** (configurable via `SAMPLING` constant in `src/lib/telemetry.js`):

| Event type | Rate | Rationale |
|---|---|---|
| `web_vital` | 100% | Primary regression signal — never sample down |
| `js_error` | 100% | Every error is actionable |
| `slow_api` (>1s) | 100% | Always capture — threshold already filters noise |
| `slow_api` (<1s) | 10% | High volume; 10% gives statistically valid p95 |
| `long_task` | 10% | Very high volume at 60fps; 10% sufficient |
| `resource_timing` | 10% | Per-session bandwidth cost; 10% gives representative data |
| `custom_timing` | 100% | Low volume; always capture |

**Batching + flush**:
- Events accumulate in memory queue
- Flush triggers: `visibilitychange → hidden`, `pagehide`, queue reaches 50 events, 10s timer
- Transport: `navigator.sendBeacon` on page close (non-blocking, survives tab close); `fetch` otherwise

**Offline survival**:
- If `navigator.onLine === false` at flush time, buffer is written to IndexedDB
- On `online` event, buffer is replayed via `fetch`

**Privacy** — intentionally NOT collected:
- User IDs or any personally identifiable information
- URL query strings (may contain filter values or search terms)
- Request/response bodies (may contain log content or secrets)
- IP addresses (stripped at ingestion layer)
- Exact timestamps beyond route + session ID

**Session metadata** (anonymous):
- Random UUID per page load (not persisted — new UUID on reload)
- Viewport dimensions, `navigator.connection.effectiveType`, `deviceMemory`, `hardwareConcurrency`
- Current route pathname (no query string)

---

## Alternatives Considered

**OpenTelemetry**: Full distributed tracing with W3C Trace Context propagation. Overkill for a single-page app. Would require a backend collector (Jaeger, etc.). Rejected — `web-vitals` + custom `PerformanceObserver` covers all assignment requirements.

**100% sampling for long tasks**: At 60fps, long tasks can generate thousands of entries per minute. 100% sampling would make telemetry batches large enough to impact performance. 10% sampling with ≥30 min of data gives statistically significant p95. Justified.

**Persistent session ID**: Would allow correlating sessions across page reloads but constitutes user tracking. Privacy requirement says no user identifiers. Random UUID per page load is the correct choice.

---

## Consequences

- **Positive**: Telemetry survives tab close, page unload, and offline periods.
- **Positive**: Privacy-safe by design — no PII collected at any point.
- **Positive**: `/debug/metrics` provides live p50/p75/p95 updated every 5s.
- **Negative**: 10% sampling means rare events (1/session long tasks) may not appear in small sample sizes. Acceptable — p95 requires ~20 samples minimum.

---

## References

- `src/lib/telemetry.js` — full telemetry implementation + SAMPLING config
- `src/app/debug/metrics/MetricsDashboard.js` — live p50/p75/p95 viewer
- `mock/server.js` — `POST /api/telemetry/ingest`, `GET /api/telemetry/sessions`
- `MOCK.md` — ingestion payload schema documentation
