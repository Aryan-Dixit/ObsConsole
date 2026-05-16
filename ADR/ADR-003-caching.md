# ADR-003: Caching Layer

**Status**: Accepted  
**Date**: 2025-01  

---

## Context

Multiple caching concerns: tenant/project/service metadata (changes rarely), the intentionally slow `/summary` endpoint (~800ms, cacheable), public share-page snapshots (CDN-cacheable), and telemetry sessions (local persistence across browser sessions).

---

## Decision

Three-layer caching strategy:

**Layer 1 — Next.js fetch cache** (`next: { tags: ['tenants'] }`): Used for RSC fetches where applicable. Tag-based invalidation via `revalidateTag()`.

**Layer 2 — ISR static cache**: `/share/[token]` pages are statically generated at first request and served from CDN edge. On-demand revalidation only (`revalidate = false`). Triggered by `POST /api/revalidate` from mock when dashboard changes.

**Layer 3 — IndexedDB** (idb-keyval): Dashboard offline edit queue + last 50 telemetry sessions. Written asynchronously — never blocks the main thread. TTL of 7 days (telemetry sessions purged automatically as ring buffer fills).

**No** Redis or external cache: single-process mock, adds operational complexity with zero benefit.

---

## Alternatives Considered

**localStorage for telemetry**: Synchronous read/write blocks the main thread. IndexedDB async API is mandatory for the telemetry pipeline. Rejected.

**Service Worker cache**: Would make the share page work fully offline (stretch goal). Not implemented. Would add ~2 days of work for the update flow alone (see TRADEOFFS.md).

**SWR/TanStack Query client cache**: Would provide stale-while-revalidate for project/service lists with automatic background refresh. Not implemented — manual `useEffect` fetch is sufficient for this scope.

---

## Consequences

- **Positive**: Share page served from CDN edge → Lighthouse ≥95 with no JS.
- **Positive**: IndexedDB offline queue survives browser restarts.
- **Negative**: Manual cache invalidation for tenant data (no automatic refresh on mutation).

---

## References

- `src/app/share/[token]/page.js` — ISR with `revalidate = false`
- `src/lib/idb.js` — IndexedDB helpers
- `mock/server.js` — `POST /api/revalidate` endpoint
