# ADR-002: State Library Choice

**Status**: Accepted
**Date**: 2025-01

## Context

Need client state management for: live-tail (high-frequency updates), dashboard (undo/redo, optimistic),
auth (token rotation), and UI ephemeral state. Options considered: Redux Toolkit, Zustand, Jotai, Valtio,
React Query (for server state).

## Decision

**Zustand** for UI/stream state + **TanStack Query** for server state.

Zustand: minimal boilerplate, no provider wrapping, direct store access outside React (needed in
`WebSocketManager` which runs partially outside the React tree), excellent TypeScript support, built-in
middleware for `immer` (undo/redo) and `devtools`.

TanStack Query: handles deduplication of RSC-parallel fetches, stale-while-revalidate, background
refetch, pagination (cursor-based), and optimistic mutation helpers. Pairs well with RSC via the
`HydrationBoundary` pattern.

## Alternatives Considered

**Redux Toolkit**: Too verbose for this scale. The slice boilerplate adds ~30% more code with no
performance benefit. RTK Query is good but TanStack Query is better integrated with Next.js App Router.

**Jotai**: Good for fine-grained atoms but undo/redo on atoms is awkward. Dashboard requires
transactional updates across multiple atoms simultaneously.

**Context API**: Fine for auth token (low-frequency), but catastrophic for live-tail (causes full subtree
re-renders on every event). Explicitly rejected for any high-frequency state.

## Consequences

- `src/store/` contains all Zustand slices
- TanStack Query `QueryClient` is created in `src/app/providers.tsx`
- `WebSocketManager.ts` imports Zustand store directly via `useStore.getState()` (no React hook needed)

---

# ADR-003: Caching Layer

**Status**: Accepted
**Date**: 2025-01

## Context

Multiple caching concerns: API responses (tenant/project/service metadata), slow `/summary` endpoint
(~800ms), live-event history for time-travel scrub, public share-page snapshots, and user telemetry
sessions.

## Decision

Four-layer caching strategy:

1. **Next.js Data Cache** (`fetch` with `cache: 'force-cache'`): tenant/project/service metadata.
   Tag-based revalidation via `revalidateTag()` when mutations occur.

2. **TanStack Query in-memory cache** (staleTime: 5min for summaries, 30s for project lists):
   deduplicated client-side caching with background refresh.

3. **ISR static cache** (Next.js): `/share/[token]` pages cached at CDN edge. On-demand revalidation
   via `POST /api/revalidate` from the mock server when a dashboard is updated.

4. **IndexedDB** (idb-keyval): last 50 telemetry sessions, dashboard edit queue, service event chunks
   for time-travel scrub. Written asynchronously; never blocks the main thread.

## Alternatives Considered

**Redis / external cache**: Overkill for a single-process mock. Would add operational complexity. The
Next.js Data Cache is sufficient for this architecture.

**localStorage for telemetry**: Synchronous read/write blocks the main thread. IndexedDB async API is
mandatory for the telemetry pipeline requirements.

## Consequences

- `src/lib/persistence/idb.ts` wraps IndexedDB with typed helpers
- `src/app/share/[token]/page.tsx` uses `revalidate` export + `revalidateTag`
- Cache hit/miss is captured as part of Resource Timing telemetry

---

# ADR-004: Virtualization Library

**Status**: Accepted
**Date**: 2025-01

## Context

The live-tail event list must handle up to 100,000 events while maintaining INP < 200ms and being
screen-reader navigable. Virtualization is non-negotiable.

## Decision

**@tanstack/virtual** (v3, `useVirtualizer`).

Reasons:
- Headless: full control over DOM structure, enabling correct ARIA attributes (`role="grid"`,
  `aria-rowindex`, `aria-rowcount`)
- Supports dynamic row heights (events vary: single-line INFO vs multi-line stack traces)
- `estimateSize` + `measureElement` pattern handles variable heights without layout thrash
- Zero dependencies, 3KB gzipped
- `scrollToIndex` API enables the time-travel scrub and "jump to live" button

## Alternatives Considered

**react-window**: Requires fixed row height, which breaks multi-line log entries. `VariableSizeList`
requires pre-computing heights, which is impossible for streaming data. Rejected.

**react-virtuoso**: Good but 8KB gzipped and opinionated about DOM structure, limiting ARIA control.

**Custom**: Would take 2–3 days to match @tanstack/virtual's dynamic sizing accuracy. Not justified.

## Consequences

- `src/components/EventTable/VirtualEventList.tsx` (lines 45–130): core virtualization logic
- Dynamic row measurement via ResizeObserver — items re-measure on first render and when content changes
- Screen reader accessibility: `aria-rowcount={totalEvents}` + `aria-rowindex` on each row

---

# ADR-005: Build & Bundle Optimization

**Status**: Accepted
**Date**: 2025-01

## Context

Hard limits: initial route JS ≤ 90KB gzipped, main bundle ≤ 180KB gzipped. With Next.js App Router,
RSC boundaries already eliminate most client JS. The risk area is the live-tail page, which needs heavy
client libraries.

## Decision

Bundle strategy:
1. **Dynamic imports** for dashboard editor widgets (`next/dynamic` with `ssr: false`)
2. **Route-level code splitting**: each page in `app/` is automatically split by Next.js
3. **Tree-shaking audit** via `@next/bundle-analyzer` in CI (`npm run build:analyze`)
4. **Date library**: `date-fns/esm` (tree-shakable) over `moment` (monolithic)
5. **Icon library**: Tabler Icons via individual imports, not the entire icon set
6. **@tanstack/virtual**: 3KB; acceptable
7. **Zustand**: 2.9KB; acceptable
8. **i18n**: `next-intl` only loads the locale bundle for the current request

The WebSocketManager is wrapped in a dynamic import on the live-tail page to avoid including ws code in
other routes.

## Consequences

- `next.config.js` includes `bundleAnalyzer` conditional on `ANALYZE=true`
- All `import` statements for large libraries use named imports only
- `src/components/Dashboard/Editor.tsx` uses `dynamic(() => import('./DragEngine'), { ssr: false })`

---

# ADR-006: Auth & Session Strategy

**Status**: Accepted
**Date**: 2025-01

## Context

Requirements: HttpOnly cookies for refresh token, CSRF protection on writes, silent refresh surviving
tab visibility changes and offline reconnects, 5-min access token / 7-day refresh token rotation.

## Decision

**Access token**: Short-lived JWT (5 min) stored in Zustand memory. Never persisted to localStorage or
sessionStorage (XSS mitigation). Cleared on tab close.

**Refresh token**: HttpOnly, Secure, SameSite=Strict cookie. Sent automatically by browser on
`/api/auth/refresh`. Server rotates on every use (refresh token rotation — invalidates stolen tokens).

**CSRF**: `X-CSRF-Token` header on all mutating requests. Token generated server-side on login, stored
in a non-HttpOnly cookie (readable by JS, not sent automatically — this is the CSRF token pattern).
Checked in Next.js middleware for all PATCH/POST/DELETE.

**Silent refresh**: `useTokenRefresh` hook (see `src/hooks/useTokenRefresh.ts`):
- Schedules refresh 60s before expiry via `setTimeout`
- Listens to `visibilitychange` → `visible` to refresh if expired while tab was hidden
- Listens to `online` event to refresh after offline period before replaying queued writes

**Multi-tab**: Broadcast Channel API syncs token rotation across tabs without requiring each tab to
independently hit the refresh endpoint.

## Alternatives Considered

**Access token in cookie**: Would require CSRF on all reads too. More complex. No security benefit for
short-lived tokens. Rejected.

**next-auth**: Good for OAuth flows but adds abstraction over a simple custom auth server. Overkill for
this mock, and hides the implementation detail the assignment wants demonstrated.

## Consequences

- `src/middleware.ts`: CSRF check on mutations + JWT validation
- `src/hooks/useTokenRefresh.ts`: silent refresh logic
- `src/lib/auth/broadcastSync.ts`: multi-tab coordination

---

# ADR-007: Error & Retry Strategy

**Status**: Accepted
**Date**: 2025-01

## Context

Multiple failure modes: REST API errors, WS disconnections, SSE reconnects, dashboard 409 conflicts,
offline periods.

## Decision

**REST**: TanStack Query retry with exponential backoff (3 retries, 1s/2s/4s). 409 responses are NOT
retried (they indicate a conflict that requires user resolution). 401 responses trigger token refresh
then re-queue the original request.

**WebSocket**: `WebSocketManager` implements reconnect with exponential backoff + jitter (max 30s).
On reconnect, re-subscribes and fast-forwards from the last received event ID. WS state machine:
`CONNECTING → OPEN → (CLOSING | ERROR) → RECONNECTING → CONNECTING`.

**SSE (alerts)**: Native EventSource has built-in reconnect. We add a `Last-Event-ID` header so the
server can resume from the last sent alert. If the server returns 204, the stream has ended — we stop
reconnecting.

**Dashboard 409**: Server returns the current server state alongside the 409. Client shows a
non-blocking reconciliation modal with a three-way diff: `base | your changes | server version`. User
can accept either or merge manually. The optimistic update is rolled back immediately on 409 receipt.

**Telemetry errors**: All telemetry code is wrapped in try/catch. Telemetry failures are swallowed
silently — they must never crash the page.

## Consequences

- `src/lib/websocket/WebSocketManager.ts`: state machine + reconnect logic
- `src/components/Dashboard/ConflictResolver.tsx`: 409 reconciliation UI
- `src/lib/telemetry/reporter.ts`: all wrapped in try/catch with no re-throw

---

# ADR-008: Telemetry Architecture

**Status**: Accepted
**Date**: 2025-01

## Context

Required to capture: Core Web Vitals (LCP/INP/CLS/TTFB/FCP), custom timing metrics, long tasks,
slow API responses, resource timing, JS errors, and session metadata. Must survive page close, offline,
and soft navigation. Must not affect performance or privacy.

## Decision

**Capture**: `web-vitals` library for CWV; `PerformanceObserver` for long tasks and resource timing;
`window.addEventListener('error')` + `unhandledrejection` for JS errors; manual marks/measures for
custom metrics (`performance.mark`, `performance.measure`).

**Batching**: Events accumulate in a memory queue. Flush triggers:
- `visibilitychange` → `hidden`
- `pagehide`
- Queue reaches 50 items
- 10-second idle timer

**Transport**: `navigator.sendBeacon` on page close (non-blocking, survives tab close). `fetch` for
mid-session flushes. Buffer offline events in IndexedDB; replay on `online` event.

**Sampling**: Default 100% for errors and CWV; 10% for resource timing; 1% for long tasks (high volume).
Rationale: errors and CWV are the primary regression signals; resource timing is secondary.

**Privacy**: No URL query strings. No request/response bodies. No user identifiers. No PII. Viewport
size, connection type, device memory, and hardware concurrency are collected as anonymous session
metadata for performance segmentation.

**Storage**: Last 50 sessions persisted to IndexedDB with TTL of 7 days. Rendered at `/debug/metrics`.

## Consequences

- `src/lib/telemetry/reporter.ts`: central event queue + flush logic
- `src/lib/telemetry/webVitals.ts`: CWV integration
- `src/lib/telemetry/longTasks.ts`: PerformanceObserver for long tasks
- `src/lib/telemetry/apiTiming.ts`: fetch wrapper for slow API detection
- `src/app/debug/metrics/page.tsx`: session viewer + live p50/p75/p95 panel
