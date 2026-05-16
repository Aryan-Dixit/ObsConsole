# Architecture — Real-Time Observability Console

> Word count: ~2000 words (target 1500–2500)

## 1. System Overview

The Observability Console is a multi-tenant Next.js 14 (App Router) application that streams live
infrastructure telemetry to SRE and security teams. The central design challenge is reconciling
**high-frequency, push-based data** (up to 500 WebSocket messages/sec per service) with
**interactive, accessible UI** that must maintain INP < 200 ms under load.

---

## 2. Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser                                                        │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │  Next.js RSC │  │  Client       │  │   Telemetry Layer   │   │
│  │  (SSR/ISR)   │  │  Components   │  │   (web-vitals +     │   │
│  │              │  │               │  │    custom metrics)  │   │
│  │  /           │  │  LiveTailPage │  │                     │   │
│  │  /t/[t]/proj │  │  Dashboard    │  │  WebVitalsReporter  │   │
│  │  /share/[tok]│  │  EventTable   │  │  LongTaskObserver   │   │
│  └──────┬───────┘  └──────┬────────┘  └──────────┬──────────┘   │
│         │                 │                       │              │
│         │         ┌───────┴────────┐              │              │
│         │         │  State Layer   │    sendBeacon │              │
│         │         │                │──────────────┘              │
│         │         │  Zustand store │                             │
│         │         │  + EventBus    │                             │
│         │         │  + IndexedDB   │                             │
│         │         └───────┬────────┘                             │
│         │                 │                                      │
└─────────┼─────────────────┼──────────────────────────────────────┘
          │ HTTP/SSR         │ WS / SSE / REST
          ▼                  ▼
┌─────────────────────────────────────┐
│  Mock Backend (Express + ws)        │
│                                     │
│  REST          Streaming    Auth    │
│  /api/tenants  WS /stream   POST    │
│  /api/projects SSE /alerts  /login  │
│  /api/services             /refresh │
│  /api/share                         │
│  /api/dashboards                    │
│                                     │
│  DataGen: bursty Poisson process    │
│  50–500 msg/sec per service         │
└─────────────────────────────────────┘
```

---

## 3. Data-Flow Diagram

### 3.1 Authenticated REST Flow (landing page /)

```
Browser                 Next.js Edge Middleware        Origin Server
   │                             │                          │
   │── GET / ──────────────────► │                          │
   │                             │── validate JWT ─────────►│
   │                             │◄─ 200 / 401 ─────────────│
   │                             │                          │
   │◄── RSC Stream begins ───────│                          │
   │    (tenant cards shell)      │── GET /api/tenants ─────►│
   │                             │◄─ cursor-paginated JSON  │
   │◄── Suspense boundary 1 ─────│  (hydrates tenant cards) │
   │                             │                          │
   │         ← 800ms →           │── GET /api/.../summary ─►│
   │◄── Suspense boundary 2 ─────│  (deferred; slow)        │
   │    (summary fills in)        │                          │
```

### 3.2 Live-Tail Data Flow (hot path)

```
WS Server          WebSocketManager      EventBuffer        VirtualList
    │                    │                    │                  │
    │── msg (event) ─────►│                   │                  │
    │                    │── push() ──────────►│                  │
    │                    │   (lock-free ring)  │                  │
    │                    │                    │                  │
    │                    │             rAF tick (60fps)          │
    │                    │                    │── flush batch ───►│
    │                    │                    │  (≤16ms budget)   │
    │                    │                    │                  │
    │                    │                    │  if overflow:    │
    │                    │                    │  coalesce + emit │
    │                    │                    │  DropIndicator   │
```

### 3.3 Dashboard Optimistic Update Flow

```
User action       Zustand store        IndexedDB          API server
     │                 │                   │                   │
     │── edit widget ─►│                   │                   │
     │                 │── optimistic ─────────────────────────►│ (PATCH)
     │                 │   apply locally   │                   │
     │                 │── queue offline ─►│                   │
     │                 │   (if no net)     │                   │
     │                 │                  │◄── 409 conflict ───│
     │                 │── rollback ───────│                   │
     │                 │   show reconcile  │                   │
     │◄── diff UI ─────│   UI              │                   │
```

---

## 4. Sequence Diagram — Live-Tail Page

```
Browser                 Next.js          WS Server       IndexedDB
  │                       │                  │               │
  │─ navigate /t/[t]/s/[s]►│                  │               │
  │                       │─ RSC render ──────────────────────►
  │                       │  (initial shell,  │               │
  │                       │   filters UI)     │               │
  │◄── shell HTML ─────────│                  │               │
  │                       │                  │               │
  │─ hydrate ─────────────►│                  │               │
  │─ load history ──────────────────────────────────────────►│
  │◄── last N events ────────────────────────────────────────│
  │                       │                  │               │
  │─ WS connect ───────────────────────────►│               │
  │◄── WS open ───────────────────────────── │               │
  │                       │                  │               │
  │                       │◄── events (burst)─│               │
  │  [WebSocketManager]   │                  │               │
  │  ring buffer fill     │                  │               │
  │  rAF flush batch      │                  │               │
  │◄── DOM update ─────────│ (VirtualList     │               │
  │   (INP ≤ 200ms)        │  re-renders      │               │
  │                        │  windowed rows)  │               │
  │                       │                  │               │
  │─ pause toggle ─────────►│                  │               │
  │  [buffer freezes;      │                  │               │
  │   events still arrive  │                  │               │
  │   into ring; overflow  │                  │               │
  │   indicator shown]     │                  │               │
  │                       │                  │               │
  │─ time-travel scrub ────►│                  │               │
  │  [fetch /api/services/ │                  │               │
  │   :id/events?from=T]   │─ REST GET ────────────────────────►
  │                       │◄── NDJSON gzip ──────────────────│
  │◄── historical events ──│                  │               │
```

---

## 5. Rendering Strategy Decisions

| Route | Strategy | Justification |
|---|---|---|
| `/login` | CSR after first paint | No SEO needed; form is interactive-first; avoids hydration mismatch on token fields |
| `/` | Streaming SSR + RSC | Tenant cards visible before slow summary call; Suspense boundaries allow partial stream |
| `/t/[tenant]/projects` | App Router parallel routes | Modal overlay without unmounting list; preserves scroll position; intercepting route shows preview on same URL |
| `/t/[tenant]/s/[service]` | CSR-heavy with SSR shell | WebSocket-driven; shell SSR'd for TTFB, then fully client-driven to support 500 msg/s without blocking |
| `/t/[tenant]/dashboards/[id]` | CSR | Drag-resize-reorder requires client state; optimistic updates incompatible with SSR rehydration |
| `/share/[token]` | ISR with on-demand revalidation | Public SEO; static for performance (Lighthouse ≥95); revalidated via webhook when dashboard changes |
| `/debug/metrics` | CSR | Dev-only; reads IndexedDB; no SSR needed |

---

## 6. State Management Architecture

State is split into three tiers by mutability and persistence:

**Tier 1 — Server state** (React Query / SWR)
Tenants, projects, services, summaries. Cached with stale-while-revalidate. Deduplicates parallel RSC fetches. Handles retries with exponential backoff.

**Tier 2 — UI ephemeral state** (Zustand)
Live-tail: `isLive`, `isPaused`, `filters`, `droppedCount`, `virtualListRef`.
Dashboard: `widgets[]`, `history[]` (undo/redo stack, ≥50 entries), `pendingEdits`, `conflictState`.
Auth: `user`, `csrfToken`, `refreshScheduled`.

**Tier 3 — Persistent offline state** (IndexedDB via idb-keyval)
Dashboard edit queue (replayed on reconnect), last 50 telemetry sessions, cached service events for time-travel.

The split means RSC Server Components never import Zustand (no client bundle pollution), and Zustand slices remain small and testable.

---

## 7. Live-Tail Backpressure Strategy

The core insight: a WebSocket that pushes 500 msg/sec into React `setState` will block the main thread. The fix is a **lock-free ring buffer** between the WS and the renderer:

1. `WebSocketManager` (Web Worker or main thread) pushes events into a fixed-size `RingBuffer<Event>` (capacity = 10,000).
2. A `requestAnimationFrame` loop runs at ~60fps, dequeuing a **batch** (≤200 events per frame) and calling `setEvents(prev => [...prev, ...batch])` once.
3. If the ring buffer is > 80% full, `WebSocketManager` sets a `dropped` flag and starts **coalescing**: events with the same service+level within 100ms windows are merged into a count summary.
4. A `DropIndicator` component subscribes to `dropped` count and renders a non-blocking banner.
5. The virtual list (`@tanstack/virtual`) renders only the ~30 rows in the viewport, so DOM node count stays constant regardless of total event count.

This keeps INP < 200ms at p95 under 500 msg/s by ensuring no single JS task takes > 10ms.

---

## 8. Authentication & Session Architecture

- **Access token**: 5-minute JWT stored in memory (Zustand). Never in localStorage.
- **Refresh token**: HttpOnly cookie, rotated on each use.
- **CSRF token**: Generated per session, sent in `X-CSRF-Token` header on all writes.
- **Silent refresh**: `useTokenRefresh` hook schedules a refresh 60s before expiry. On tab visibility change (`visibilitychange` → `visible`), checks if token is expired and refreshes immediately. On offline→online (`navigator.onLine`), re-runs refresh before replaying queued writes.
- **Token theft mitigation**: Refresh token bound to user-agent hash; server rejects mismatches.

---

## 9. Internationalization Scaffold

- `next-intl` with `[locale]` segment in the App Router.
- Locale negotiation in middleware: `Accept-Language` → cookie → default `en`.
- RTL support: `dir` attribute on `<html>`; all layout uses logical CSS properties (`margin-inline-start` not `margin-left`; `padding-block-end` not `padding-bottom`).
- The `/login` page is fully localized (en + ja) as the required demonstration.
- Translation files: `messages/en.json`, `messages/ja.json`.

---

## 10. Accessibility Architecture

- Focus management: on modal open/close, focus is trapped and restored via `@radix-ui/react-focus-trap`.
- Virtual list: each row has `role="row"`, `aria-rowindex`, `aria-label`. The list container has `role="grid"` and `aria-rowcount` (total events). `aria-live="polite"` announces drop counts; `aria-live="assertive"` announces errors.
- Skip links at top of each page.
- All interactive elements reachable via Tab; custom drag handles also have keyboard move handlers (arrow keys).
- Color is never the sole differentiator; log levels use both color and an icon glyph.
- WCAG 2.2 AA contrast ratios verified for all color pairs.

---

## 11. Key Files Reference

| Concern | File |
|---|---|
| WS + ring buffer | `src/lib/websocket/WebSocketManager.ts` |
| Ring buffer | `src/lib/websocket/RingBuffer.ts` |
| Backpressure / drop logic | `src/lib/websocket/EventBuffer.ts` |
| Zustand live-tail slice | `src/store/liveTailSlice.ts` |
| Zustand dashboard slice | `src/store/dashboardSlice.ts` |
| Virtual list | `src/components/EventTable/VirtualEventList.tsx` |
| Token refresh hook | `src/hooks/useTokenRefresh.ts` |
| CSRF hook | `src/hooks/useCsrf.ts` |
| Telemetry reporter | `src/lib/telemetry/reporter.ts` |
| Web vitals | `src/lib/telemetry/webVitals.ts` |
| IndexedDB wrapper | `src/lib/persistence/idb.ts` |
| RBAC middleware | `src/middleware.ts` |
| RBAC server guard | `src/lib/auth/serverGuard.ts` |
| RBAC client guard | `src/components/auth/RoleGuard.tsx` |
| Mock server entry | `mock/server.ts` |
| Mock data generator | `mock/dataGen.ts` |
