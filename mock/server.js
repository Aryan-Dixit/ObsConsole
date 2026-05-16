/**
 * mock/server.js  –  Express + ws mock backend
 * Ports:  REST  :4000
 *         WS    :4000  (upgraded on /stream/...)
 *         SSE   :4000  (GET /stream/alerts)
 */
const express = require('express')
const http    = require('http')
const { WebSocketServer } = require('ws')
const cookieParser = require('cookie-parser')
const cors   = require('cors')
const crypto = require('crypto')
const { v4: uuidv4 } = require('uuid')

const PORT = parseInt(process.env.MOCK_PORT || '4000')
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-dev-key-change-in-prod'
const BASE_RATE  = parseInt(process.env.MOCK_WS_BASE_RATE || '200')
const CONFLICT_RATE = parseFloat(process.env.MOCK_CONFLICT_RATE || '0.15')
const SUMMARY_DELAY = parseInt(process.env.MOCK_SUMMARY_DELAY || '800')

// ── Seed data ───────────────────────────────────────────────────────────────
const TENANTS = [
  { id: 't1', name: 'Acme Corp',          slug: 'acme',   plan: 'enterprise' },
  { id: 't2', name: 'Globex Industries',  slug: 'globex', plan: 'pro' },
  { id: 't3', name: 'Initech',            slug: 'initech',plan: 'starter' },
]
const PROJECTS = {
  t1: [
    { id: 'p1', tenantId: 't1', name: 'prod-cluster',  env: 'production' },
    { id: 'p2', tenantId: 't1', name: 'staging',        env: 'staging' },
  ],
  t2: [
    { id: 'p3', tenantId: 't2', name: 'analytics',      env: 'production' },
  ],
  t3: [
    { id: 'p4', tenantId: 't3', name: 'monolith',       env: 'production' },
  ],
}
const SERVICES = {
  p1: [
    { id: 'svc1', projectId: 'p1', name: 'api-gateway',       rate: 280 },
    { id: 'svc2', projectId: 'p1', name: 'auth-service',       rate: 95  },
    { id: 'svc3', projectId: 'p1', name: 'payment-processor',  rate: 450 },
  ],
  p2: [
    { id: 'svc4', projectId: 'p2', name: 'web-frontend',       rate: 60  },
  ],
  p3: [
    { id: 'svc5', projectId: 'p3', name: 'event-bus',          rate: 120 },
    { id: 'svc6', projectId: 'p3', name: 'data-pipeline',      rate: 200 },
  ],
  p4: [
    { id: 'svc7', projectId: 'p4', name: 'monolith-app',       rate: 150 },
  ],
}
const USERS = [
  { id: 'u1', email: 'admin@acme.com',  password: 'password', role: 'owner',  tenantId: 't1' },
  { id: 'u2', email: 'editor@acme.com', password: 'password', role: 'editor', tenantId: 't1' },
  { id: 'u3', email: 'viewer@acme.com', password: 'password', role: 'viewer', tenantId: 't1' },
]

// In-memory dashboard store
const dashboards = new Map()
dashboards.set('dash1', { id: 'dash1', tenantId: 't1', name: 'Platform Overview', version: 1, widgets: [
  { id: 'w1', type: 'line', title: 'Error rate', serviceId: 'svc1' },
  { id: 'w2', type: 'counter', title: 'Total events', serviceId: 'svc1' },
] })

// In-memory telemetry store
const telemetrySessions = []

// ── JWT helpers (no external lib — manual HMAC) ────────────────────────────
function signJwt(payload, expiresInSeconds) {
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const exp     = Math.floor(Date.now() / 1000) + expiresInSeconds
  const body    = Buffer.from(JSON.stringify({ ...payload, exp, iat: Math.floor(Date.now()/1000) })).toString('base64url')
  const sig     = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}
function verifyJwt(token) {
  try {
    const [h, b, s] = token.split('.')
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest('base64url')
    if (s !== expected) return null
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString())
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch { return null }
}

// Refresh token store (token → { userId, ua })
const refreshTokens = new Map()

// ── Data generation ─────────────────────────────────────────────────────────
const LEVELS   = ['DEBUG','INFO','INFO','INFO','WARN','ERROR','FATAL']
const MSG_TPLS = {
  DEBUG: ['Cache miss: %s', 'DB query %dms: SELECT * FROM %s', 'GC pause %dms', 'Span started: %s'],
  INFO:  ['GET /api/%s 200 in %dms', 'POST /api/%s 201 in %dms', 'User %s authenticated', 'Deploy v%s succeeded', 'Health check OK for %s'],
  WARN:  ['Retry %d/%d for %s', 'Slow query %dms on %s', 'Rate limit approaching: %d req/s', 'Memory at %d%%'],
  ERROR: ['Unhandled exception in %s: TypeError: Cannot read property of undefined', 'DB connection pool exhausted after %dms', 'Timeout calling %s after %dms', 'HTTP 502 from upstream %s'],
  FATAL: ['OOM in %s – dumping core', 'Disk full at /var/log/%s', 'Critical dep %s unreachable for %ds', 'Segfault in worker pid %d'],
}
const WORDS = ['auth','checkout','gateway','db-pool','redis','kafka','s3','nginx','grpc','payments']
const HOSTS = Array.from({length:20}, (_,i) => `pod-${i+1}.${['us-east-1','us-west-2','eu-west-1'][i%3]}`)

function ri(a) { return a[Math.floor(Math.random()*a.length)] }
function rn(lo,hi) { return lo + Math.floor(Math.random()*(hi-lo)) }

function genEvent(serviceId) {
  const lvl = ri(LEVELS)
  const tpl = ri(MSG_TPLS[lvl] || MSG_TPLS.INFO)
  const msg = tpl.replace(/%s/g,()=>ri(WORDS)).replace(/%d/g,()=>rn(1,9999))
  return {
    id:        uuidv4(),
    serviceId,
    timestamp: new Date().toISOString(),
    level:     lvl,
    message:   msg,
    traceId:   uuidv4(),
    spanId:    crypto.randomBytes(8).toString('hex'),
    host:      ri(HOSTS),
    latency:   rn(1, 2500),
    attributes: { 'k8s.pod': ri(HOSTS), 'http.status': ri(['200','200','200','429','502','503']) },
  }
}

// Bursty Poisson generator per active WS
function makeBurstGen(serviceId, baseMsgPerSec, onEvent) {
  let isBurst = false
  let burstTimer = null
  function scheduleBurst() {
    const delay = rn(15000, 45000)
    burstTimer = setTimeout(() => {
      isBurst = true
      setTimeout(() => { isBurst = false; scheduleBurst() }, rn(2000, 8000))
    }, delay)
  }
  scheduleBurst()
  function tick() {
    const rate = isBurst ? baseMsgPerSec * 3 : baseMsgPerSec
    const delayMs = Math.max(1, Math.round(-Math.log(Math.random()) / (rate / 1000)))
    return setTimeout(() => { onEvent(genEvent(serviceId)); tick() }, delayMs)
  }
  const handle = tick()
  return () => { clearTimeout(handle); clearTimeout(burstTimer) }
}

// ── Express setup ────────────────────────────────────────────────────────────
const app = express()
app.use(cors({ origin: ['http://localhost:3000'], credentials: true }))
app.use(express.json())
app.use(cookieParser())

// Auth middleware for protected routes
function requireAuth(req, res, next) {
  const auth = req.headers['authorization'] || ''
  const token = auth.replace('Bearer ', '')
  const payload = verifyJwt(token)
  if (!payload) return res.status(401).json({ error: 'unauthorized' })
  req.user = payload
  next()
}

// CSRF check for mutations
function checkCsrf(req, res, next) {
  if (['POST','PATCH','PUT','DELETE'].includes(req.method)) {
    const csrfHeader = req.headers['x-csrf-token']
    const csrfCookie = req.cookies['csrf']
    if (!csrfHeader || csrfHeader !== csrfCookie) {
      return res.status(403).json({ error: 'invalid csrf token' })
    }
  }
  next()
}

// ── Auth routes ──────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body
  const user = USERS.find(u => u.email === email && u.password === password)
  if (!user) return res.status(401).json({ error: 'invalid credentials' })

  const csrfToken = crypto.randomBytes(32).toString('hex')
  const accessToken = signJwt({ sub: user.id, email: user.email, role: user.role, tenantId: user.tenantId }, 300)
  const refreshToken = uuidv4()
  refreshTokens.set(refreshToken, { userId: user.id, ua: req.headers['user-agent'] || '' })

  res.cookie('refresh_token', refreshToken, { httpOnly: true, secure: false, sameSite: 'Strict', maxAge: 7*24*60*60*1000 })
  res.cookie('csrf', csrfToken, { httpOnly: false, secure: false, sameSite: 'Strict', maxAge: 7*24*60*60*1000 })
  res.json({ accessToken, user: { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId } })
})

app.post('/api/auth/refresh', (req, res) => {
  const rt = req.cookies['refresh_token']
  if (!rt || !refreshTokens.has(rt)) return res.status(401).json({ error: 'invalid refresh token' })
  const { userId, ua } = refreshTokens.get(rt)
  if (ua !== (req.headers['user-agent'] || '')) return res.status(401).json({ error: 'ua mismatch' })

  const user = USERS.find(u => u.id === userId)
  if (!user) return res.status(401).json({ error: 'user not found' })

  // Rotate refresh token
  refreshTokens.delete(rt)
  const newRt = uuidv4()
  refreshTokens.set(newRt, { userId, ua })

  const csrfToken = crypto.randomBytes(32).toString('hex')
  const accessToken = signJwt({ sub: user.id, email: user.email, role: user.role, tenantId: user.tenantId }, 300)

  res.cookie('refresh_token', newRt, { httpOnly: true, secure: false, sameSite: 'Strict', maxAge: 7*24*60*60*1000 })
  res.cookie('csrf', csrfToken, { httpOnly: false, secure: false, sameSite: 'Strict', maxAge: 7*24*60*60*1000 })
  res.json({ accessToken })
})

app.post('/api/auth/logout', (req, res) => {
  const rt = req.cookies['refresh_token']
  if (rt) refreshTokens.delete(rt)
  res.clearCookie('refresh_token')
  res.clearCookie('csrf')
  res.json({ ok: true })
})

// ── Data routes ──────────────────────────────────────────────────────────────
app.get('/api/tenants', requireAuth, (req, res) => {
  const cursor = parseInt(req.query.cursor || '0')
  const limit  = parseInt(req.query.limit  || '10')
  const slice  = TENANTS.slice(cursor, cursor + limit)
  res.json({ items: slice, nextCursor: cursor + limit < TENANTS.length ? cursor + limit : null })
})

app.get('/api/tenants/:tenantId/projects', requireAuth, (req, res) => {
  const projs = PROJECTS[req.params.tenantId] || []
  res.json({ items: projs })
})

app.get('/api/projects/:projectId/services', requireAuth, (req, res) => {
  const svcs = SERVICES[req.params.projectId] || []
  res.json({ items: svcs })
})

app.get('/api/services/:serviceId/summary', requireAuth, (req, res) => {
  // Intentionally slow to demonstrate SSR Suspense boundary
  setTimeout(() => {
    const svc = Object.values(SERVICES).flat().find(s => s.id === req.params.serviceId)
    if (!svc) return res.status(404).json({ error: 'not found' })
    res.json({
      serviceId: svc.id,
      uptime: '99.97%',
      errorRate: (Math.random() * 2).toFixed(2) + '%',
      p50: rn(10,120) + 'ms',
      p99: rn(400,2000) + 'ms',
      rpm: rn(100, 50000),
      alertsOpen: rn(0, 5),
    })
  }, SUMMARY_DELAY)
})

// Historical events (NDJSON)
app.get('/api/services/:serviceId/events', requireAuth, (req, res) => {
  const { from, to, level, limit = 500 } = req.query
  res.setHeader('Content-Type', 'application/x-ndjson')
  res.setHeader('Transfer-Encoding', 'chunked')
  let count = 0
  const max = Math.min(parseInt(limit), 1000)
  const interval = setInterval(() => {
    if (count >= max) { clearInterval(interval); res.end(); return }
    const ev = genEvent(req.params.serviceId)
    if (level && ev.level !== level) { count++; return }
    res.write(JSON.stringify(ev) + '\n')
    count++
  }, 5)
})

// Dashboards
app.get('/api/dashboards/:id', requireAuth, (req, res) => {
  const dash = dashboards.get(req.params.id)
  if (!dash) return res.status(404).json({ error: 'not found' })
  res.json(dash)
})

app.patch('/api/dashboards/:id', requireAuth, checkCsrf, (req, res) => {
  const dash = dashboards.get(req.params.id)
  if (!dash) return res.status(404).json({ error: 'not found' })
  // Deliberate 409 to exercise conflict resolution UI
  if (Math.random() < CONFLICT_RATE) {
    return res.status(409).json({ error: 'conflict', serverState: dash, yourVersion: req.body.version })
  }
  const updated = { ...dash, ...req.body, version: dash.version + 1, updatedAt: new Date().toISOString() }
  dashboards.set(req.params.id, updated)
  res.json(updated)
})

// Share page
app.get('/api/share/:token', (req, res) => {
  res.json({ token: req.params.token, dashboard: dashboards.get('dash1'), public: true })
})

// Telemetry ingestion
app.post('/api/telemetry/ingest', (req, res) => {
  const batch = req.body
  if (!batch || !Array.isArray(batch.events)) return res.status(400).json({ error: 'invalid' })
  telemetrySessions.push({ ...batch, receivedAt: new Date().toISOString() })
  if (telemetrySessions.length > 200) telemetrySessions.shift()
  res.json({ ok: true, received: batch.events.length })
})

// Telemetry viewer (dev only)
app.get('/api/telemetry/sessions', (req, res) => {
  res.json({ sessions: telemetrySessions.slice(-50) })
})

// SSE — alert stream
app.get('/stream/alerts', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const ALERTS = [
    { severity: 'warning',  message: 'p99 latency spike on api-gateway: 1847ms' },
    { severity: 'critical', message: 'Error rate exceeded 5% on payment-processor' },
    { severity: 'info',     message: 'Deploy v2.14.1 completed on prod-cluster' },
    { severity: 'warning',  message: 'Memory at 87% on pod-7.us-east-1' },
    { severity: 'critical', message: 'DB connection pool exhausted (auth-service)' },
  ]
  let idx = 0
  const iv = setInterval(() => {
    const alert = { ...ri(ALERTS), id: uuidv4(), timestamp: new Date().toISOString() }
    res.write(`id: ${idx++}\ndata: ${JSON.stringify(alert)}\n\n`)
  }, rn(8000, 20000))

  req.on('close', () => clearInterval(iv))
})

// ── HTTP + WebSocket server ──────────────────────────────────────────────────
const server = http.createServer(app)
const wss = new WebSocketServer({ noServer: true })

// Map: serviceId → Set of ws clients
const subscribers = new Map()
// Map: serviceId → stop function
const generators   = new Map()

wss.on('connection', (ws, req, serviceId) => {
  if (!subscribers.has(serviceId)) subscribers.set(serviceId, new Set())
  subscribers.get(serviceId).add(ws)

  // Start generator for this service if not running
  if (!generators.has(serviceId)) {
    const svc = Object.values(SERVICES).flat().find(s => s.id === serviceId)
    const rate = svc ? svc.rate : BASE_RATE
    const stop = makeBurstGen(serviceId, rate, (event) => {
      const msg = JSON.stringify(event)
      const clients = subscribers.get(serviceId)
      if (!clients) return
      for (const client of clients) {
        if (client.readyState === 1) client.send(msg)
      }
    })
    generators.set(serviceId, stop)
  }

  ws.on('close', () => {
    const clients = subscribers.get(serviceId)
    if (clients) {
      clients.delete(ws)
      if (clients.size === 0) {
        subscribers.delete(serviceId)
        const stop = generators.get(serviceId)
        if (stop) { stop(); generators.delete(serviceId) }
      }
    }
  })

  ws.send(JSON.stringify({ type: 'connected', serviceId, timestamp: new Date().toISOString() }))
})

server.on('upgrade', (req, socket, head) => {
  const url = req.url || ''
  const match = url.match(/^\/stream\/services\/([^/]+)\/events/)
  if (!match) { socket.destroy(); return }
  const serviceId = match[1]
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, serviceId)
  })
})

server.listen(PORT, () => {
  console.log(`\n🚀  Mock backend running on http://localhost:${PORT}`)
  console.log(`   REST   http://localhost:${PORT}/api/...`)
  console.log(`   WS     ws://localhost:${PORT}/stream/services/:id/events`)
  console.log(`   SSE    http://localhost:${PORT}/stream/alerts`)
  console.log(`\n   Test accounts:`)
  console.log(`   admin@acme.com  / password  (role: owner)`)
  console.log(`   editor@acme.com / password  (role: editor)`)
  console.log(`   viewer@acme.com / password  (role: viewer)\n`)
})

// POST /api/dashboards — create new dashboard (required by assignment)
app.post('/api/dashboards', requireAuth, checkCsrf, (req, res) => {
  const id = uuidv4()
  const dash = {
    id, tenantId: req.user.tenantId, name: req.body.name || 'New Dashboard',
    version: 1, widgets: req.body.widgets || [],
    createdAt: new Date().toISOString(),
  }
  dashboards.set(id, dash)
  res.status(201).json(dash)
})

// On-demand ISR revalidation (called when dashboard changes)
app.post('/api/revalidate', (req, res) => {
  console.log('[mock] Revalidation triggered for share pages')
  res.json({ revalidated: true })
})
