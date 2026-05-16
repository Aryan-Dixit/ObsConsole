# MOCK.md — Mock Backend Setup & Data Generation

## 1. Setup

```bash
cd mock
npm install
npm start      # starts on :4000 (REST + WS + SSE)
```

The mock runs alongside the Next.js dev server:
```bash
# In two terminals:
npm run dev          # Next.js on :3000
cd mock && npm start # Mock on :4000
```

Or concurrently:
```bash
npm run dev:all      # uses concurrently: Next.js + mock
```

---

## 2. Architecture

The mock is a single Express + `ws` server (`mock/server.ts`).

```
mock/
  server.ts        # Express + ws server entry
  dataGen.ts       # Bursty Poisson event generator
  routes/
    auth.ts        # POST /api/auth/login, /refresh
    tenants.ts     # GET /api/tenants (cursor-paginated)
    projects.ts    # GET /api/tenants/:id/projects
    services.ts    # GET /api/projects/:id/services
    events.ts      # GET /api/services/:id/events (NDJSON gzip)
    summary.ts     # GET /api/services/:id/summary (800ms delay)
    share.ts       # GET /api/share/:token
    dashboards.ts  # POST + PATCH /api/dashboards
    telemetry.ts   # POST /api/telemetry/ingest
  ws/
    serviceStream.ts  # WS /stream/services/:id/events
    alertStream.ts    # SSE /stream/tenants/:id/alerts
```

---

## 3. Data Generation Strategy

### 3.1 Bursty Poisson Process

Real infrastructure telemetry is not uniform — it arrives in bursts correlated with request traffic.
The `dataGen.ts` module implements a two-level Poisson process:

```
Base rate: λ_base ∈ [50, 500] msg/sec (configurable per service)
Burst rate: every 15–45 seconds, rate spikes to 3× base for 2–8 seconds
```

Implementation:
```typescript
// Simplified from mock/dataGen.ts
function nextDelay(baseRate: number, isBurst: boolean): number {
  const rate = isBurst ? baseRate * 3 : baseRate;
  // Exponential distribution: -ln(U) / λ
  return -Math.log(Math.random()) / (rate / 1000);
}
```

This produces realistic p99 spike patterns that stress the frontend's backpressure logic.

### 3.2 Event Schema

Each event conforms to:
```typescript
interface TelemetryEvent {
  id: string;           // UUID v4
  serviceId: string;
  timestamp: string;    // ISO 8601
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  message: string;      // lorem-based with realistic error patterns
  traceId: string;      // W3C trace context format
  spanId: string;
  attributes: Record<string, string | number>;  // k8s labels, http.status, etc.
  stackTrace?: string;  // present for ERROR/FATAL, ~10% of them
}
```

### 3.3 Deliberate 409 Conflicts

The dashboard `PATCH` endpoint rejects ~15% of requests with a 409 to exercise the conflict
resolution UI:
```typescript
if (Math.random() < 0.15) {
  return res.status(409).json({
    error: 'conflict',
    serverState: dashboards.get(id),
    yourVersion: req.body.version
  });
}
```

---

## 4. Telemetry Ingestion Endpoint

`POST /api/telemetry/ingest`

**Request body schema** (JSON):
```typescript
interface TelemetryBatch {
  sessionId: string;         // anonymous UUID, rotated per session
  route: string;             // pathname only, no query string
  viewport: { width: number; height: number };
  connection: string;        // navigator.connection.effectiveType
  deviceMemory?: number;     // navigator.deviceMemory
  hardwareConcurrency: number;
  events: TelemetryEvent[];
}

interface TelemetryEvent {
  type:
    | 'web_vital'
    | 'long_task'
    | 'slow_api'
    | 'resource_timing'
    | 'js_error'
    | 'custom_timing';
  name: string;              // e.g. 'LCP', 'time_to_first_event', 'GET /api/services/:id'
  value: number;             // milliseconds for timing; score for CLS
  timestamp: number;         // performance.now()
  attribution?: string;      // PerformanceObserver attribution where available
}
```

**What is intentionally NOT collected**:
- User IDs or any other identifiers
- URL query strings (may contain sensitive filter values)
- Request/response bodies (may contain log content or secrets)
- Exact page titles (may contain tenant names)
- IP addresses (stripped at the ingestion layer)
- Cookie values

**Rationale**: This telemetry is for performance monitoring, not user analytics. The less PII
collected, the smaller the blast radius of a data breach and the simpler GDPR compliance.

---

## 5. Seed Data

`mock/seed.ts` generates a stable seed on first run:
- 3 tenants (Acme Corp, Globex Industries, Initech)
- 2–4 projects per tenant
- 2–6 services per project
- 1 share token per project (public dashboard)
- 3 user accounts: `admin@acme.com` / `editor@acme.com` / `viewer@acme.com` (password: `password`)

---

## 6. Environment Variables

```env
MOCK_PORT=4000
MOCK_WS_BASE_RATE=200        # events/sec default
MOCK_CONFLICT_RATE=0.15      # fraction of PATCH requests that return 409
MOCK_SUMMARY_DELAY=800       # ms delay for /summary endpoint
NEXT_PUBLIC_API_BASE=http://localhost:4000
NEXT_PUBLIC_WS_BASE=ws://localhost:4000
```
