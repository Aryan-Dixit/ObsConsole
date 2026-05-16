# ADR-001: Rendering Strategy per Route

**Status**: Accepted  
**Date**: 2025-01  
**Decider**: Frontend Lead  

---

## Context

The app has 7 distinct route types with radically different primary constraints. Choosing the wrong rendering mode for a route causes either poor performance (wrong LCP/INP) or broken functionality (WS state can't be SSR'd). Next.js 14 App Router supports CSR, SSR, Streaming SSR with RSC, ISR, and Parallel/Intercepting routes — each must be justified.

---

## Decision

| Route | Strategy | Justification |
|---|---|---|
| `/login` | CSR | No SEO value. Form is interactive-first. SSR causes hydration mismatch on controlled inputs. `'use client'` at top. |
| `/` | SSR auth guard + CSR data fetch | RSC verifies `refresh_token` cookie server-side (redirect to `/login` if absent). Tenant data fetched client-side with Bearer token — RSC has no access to the in-memory access token. |
| `/t/[tenant]/projects` | CSR + Parallel + Intercepting routes | Project list + modal overlay without losing list scroll state. `@modal` slot renders preview; `(..)projects/[id]` intercepting route captures in-app navigation. Direct URL navigation shows full page. |
| `/t/[tenant]/s/[service]` | CSR (WebSocket-driven) | 500 msg/s live stream. SSR rehydration is incompatible with continuous WS state. Shell renders immediately; WS connects after mount. |
| `/t/[tenant]/dashboards/[id]` | CSR | Drag-resize-reorder requires synchronous client state. Optimistic updates + undo/redo history (50 steps) + conflict resolution all require ephemeral client state incompatible with SSR. |
| `/share/[token]` | ISR with on-demand revalidation | Public, SEO-sensitive page. Statically generated at CDN edge. `revalidate = false` (on-demand only). No JS needed to render → Lighthouse ≥95. |
| `/debug/metrics` | CSR | Dev-only. Reads IndexedDB (browser API). Polls `/api/telemetry/sessions` every 5s. No SSR needed. |

---

## Alternatives Considered

**Full SSR everywhere**: Breaks the live-tail page — 500 msg/s means continuous server renders. Also impossible for in-memory token (server can't read it from a cookie).

**Full CSR (SPA)**: Kills LCP on landing page (blank screen until JS loads). Share page would score ~40 on Lighthouse mobile. Auth guard can't run before JS loads.

**RSC for tenant/project data**: RSC can only read cookies, not the in-memory Bearer token. All authed API calls must be client-side.

---

## Consequences

- **Positive**: Each route is optimised for its primary constraint.
- **Positive**: Share page achieves Lighthouse ≥95 via ISR.
- **Negative**: Team must understand 4 different rendering modes — higher cognitive load.
- **Negative**: Parallel + intercepting routes have complex file conventions documented in `src/app/t/[tenant]/projects/`.

---

## References

- `src/app/page.js` — SSR auth guard
- `src/app/LandingClient.js` — CSR tenant fetch with Bearer token
- `src/app/t/[tenant]/projects/layout.js` — Parallel routes layout
- `src/app/t/[tenant]/projects/@modal/` — Intercepting route slot
- `src/app/share/[token]/page.js` — ISR with `revalidate = false`
