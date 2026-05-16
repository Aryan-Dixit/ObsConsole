# TRADEOFFS.md — What We Did NOT Do and Why

## 1. WebSocket in a Web Worker

**What**: Moving the WebSocketManager entirely into a dedicated Web Worker would mean zero WS
processing on the main thread, guaranteeing INP budget compliance even at 1000 msg/s.

**Why not done**: Web Workers cannot share Zustand stores or React state directly — you'd need a
MessageChannel bridge with serialization overhead. The RingBuffer + rAF batching approach keeps
individual JS tasks < 5ms on the main thread, which satisfies the INP < 200ms budget. The Worker
approach would add 2–3 days of implementation with diminishing returns at the current event rate.

**Fix with more time**: Implement `SharedArrayBuffer`-based ring buffer with Atomics, allow both
Worker and main thread to access it lock-free. Requires `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` headers.

---

## 2. Collaborative Cursors (Yjs CRDT)

**What**: Real-time collaborative cursor presence in the dashboard editor.

**Why not done**: Requires a persistent CRDT store synced via WebSocket (Yjs + y-websocket). The mock
server would need to maintain document state across connections. This is a significant engineering
investment (3–5 days) that extends well beyond the core requirements. The conflict resolution via 409
+ three-way diff is implemented instead, which handles the common case.

---

## 3. Module Federation for Dashboard Editor

**What**: Loading the dashboard editor as a remote Module Federation module.

**Why not done**: The dashboard editor is tightly coupled to the Zustand store, TanStack Query, and
the auth context. Federating it would require either exposing these as shared singletons (complex,
brittle) or duplicating them (defeats the purpose). At this app's scale, the complexity cost exceeds
the benefit. Module Federation makes sense when teams independently deploy components; this is a
monorepo.

---

## 4. Partial Pre-Rendering (PPR) for Share Page

**What**: Next.js 15 PPR — static shell + dynamic hole boundary for `/share/[token]`.

**Why not done**: We're targeting Next.js 14 for stability. PPR is experimental in Next 14 and
requires `next@canary`. The ISR approach achieves the same Lighthouse ≥ 95 goal with a stable API.
**ADR note**: would revisit on Next.js 15 GA.

---

## 5. E2E Test Suite (Playwright)

**What**: Full Playwright test suite covering all pages and interactions.

**Why not done**: Time constraint. Unit tests exist for the core logic (WebSocketManager, RingBuffer,
EventBuffer, Zustand slices, CSRF hook). E2E tests would be the next priority.

---

## 6. Real Authentication Provider (Auth0/Clerk)

**What**: Production auth with OAuth2/OIDC, MFA, and enterprise SSO.

**Why not done**: The assignment specifies building a mock backend. Integrating a real auth provider
would obscure the session/token architecture that the assignment is specifically evaluating.

---

## 7. OpenTelemetry on the Backend Mock

**What**: Propagating W3C Trace Context from the browser telemetry through the mock API for
distributed tracing.

**Why not done**: The mock is for exercising frontend behaviour. Distributed tracing would require a
backend observability stack (Jaeger, etc.) that's out of scope for the frontend assignment.
