# ObsConsole — Real-Time Observability Console

A complete Next.js 14 + WebSocket observability platform with live telemetry, LCP/INP metrics, and a full mock backend.

---

## Quick Start (2 terminals)

```bash
# Install once
npm install

# Terminal 1 — Next.js dev server (port 3000)
npm run dev:next

# Terminal 2 — Mock backend (port 4000)
npm run dev:mock
```

Or run both together:
```bash
npm run dev
```

Open http://localhost:3000 → sign in → **admin@acme.com / password**

---

## What's Running

| Process | Port | Purpose |
|---------|------|---------|
| Next.js | 3000 | App Router SSR + CSR pages |
| Mock backend | 4000 | REST API + WebSocket stream + SSE alerts |

---

## File Structure

```
obs-console/
├── mock/
│   └── server.js            ← Express + ws mock backend (all-in-one)
│
├── src/
│   ├── middleware.js         ← Next.js Edge Middleware (CSRF + auth guard)
│   ├── store/
│   │   └── auth.js           ← AuthProvider: HttpOnly refresh, in-memory access token
│   ├── lib/
│   │   ├── ringBuffer.js     ← Lock-free ring buffer (backpressure)
│   │   ├── wsManager.js      ← WebSocket manager: ring buffer + rAF flush + reconnect
│   │   └── telemetry.js      ← Web Vitals + long tasks + JS errors → /api/telemetry/ingest
│   └── app/
│       ├── layout.js         ← Root layout (AuthProvider + TelemetryInit)
│       ├── globals.css       ← Base styles
│       ├── page.js           ← Home → redirects to login or renders Dashboard
│       ├── login/page.js     ← Login form (CSR)
│       └── dashboard/
│           └── Dashboard.js  ← Main dashboard (live tail + metrics + telemetry viewer)
│
├── .env.local                ← NEXT_PUBLIC_API_BASE, NEXT_PUBLIC_WS_BASE, JWT_SECRET
├── next.config.js
└── package.json
```

---

## Features

### Live Tail (↯ LIVE tab)
- Real WebSocket stream from mock backend (50–500 msg/s per service, bursty Poisson distribution)
- **RingBuffer + rAF batch flush** keeps INP < 200ms even at 500 msg/s — events arrive into a 5000-slot ring; a requestAnimationFrame loop drains ≤200 per frame (≈16ms budget), calling setState once
- Windowed virtual list — only ~20 DOM rows rendered regardless of total event count
- Level filter, text search, pause/resume, live toggle
- Click any row for full event detail panel (attributes, trace ID, span ID)
- Backpressure warning banner at > 70% ring fill
- Jump-to-live button when scrolled up

### Telemetry (◈ TELEMETRY tab)
- **Live Core Web Vitals** — LCP, INP, CLS, TTFB, FCP measured in your actual browser via `web-vitals` library
- Real p50/p75/p95 computed from accumulated session data (updates every 5s from mock ingest endpoint)
- Long task detection (PerformanceObserver, 10% sampled)
- Slow API call tracking (> 500ms)
- JS error capture (window.error + unhandledrejection)
- Session batch log — see every telemetry flush with event counts
- Flush strategy: sendBeacon on page hide (survives tab close), fetch on 10s timer, immediate at 50 events

### Auth
- Login → access token (5min JWT, in Zustand memory only — never localStorage)
- Refresh token in HttpOnly cookie, rotated on every use
- CSRF token in readable cookie, checked as X-CSRF-Token header on mutations
- Silent refresh: 60s before expiry, on visibilitychange→visible, on navigator online
- Edge Middleware blocks unauthenticated navigation

### Mock Backend
- REST: tenants, projects, services, summaries (800ms intentional delay), historical events (NDJSON), dashboards
- WebSocket: bursty Poisson event generator per service, reconnect-safe
- SSE: alert stream with random severity events
- Deliberate 409 conflicts on 15% of PATCH dashboard calls (to exercise conflict resolution)
- Telemetry ingestion + viewer endpoint

---

## Observing LCP + Performance

1. Open Chrome DevTools → **Performance** tab
2. Click **Start profiling and reload page**
3. Watch LCP marker appear — should be ≤ 2s on localhost
4. In the **◈ TELEMETRY** tab — after ~30 seconds of using the app — you'll see real LCP/INP/CLS measurements from the `web-vitals` library

To stress-test INP:
1. Go to the **↯ LIVE** tab, select **payment-processor** (450 msg/s)
2. Open DevTools → Performance → record for 10s
3. INP stays under 200ms because of the rAF batching — every JS task is < 5ms

---

## Environment Variables

```env
# .env.local
NEXT_PUBLIC_API_BASE=http://localhost:4000   # REST + SSE base
NEXT_PUBLIC_WS_BASE=ws://localhost:4000      # WebSocket base
JWT_SECRET=super-secret-dev-key-change-in-prod
MOCK_PORT=4000
MOCK_WS_BASE_RATE=200      # default events/sec (overridden per service)
MOCK_CONFLICT_RATE=0.15    # fraction of PATCH dashboard that returns 409
MOCK_SUMMARY_DELAY=800     # ms latency for /summary endpoint
```

---

## Test Credentials

| Email | Password | Role |
|-------|----------|------|
| admin@acme.com | password | owner |
| editor@acme.com | password | editor |
| viewer@acme.com | password | viewer |
