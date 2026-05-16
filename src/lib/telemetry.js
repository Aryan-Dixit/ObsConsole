'use client'
/**
 * Telemetry layer — Section 5.1 requirements
 * Captures: CWV, custom timings, long tasks, slow APIs (>1s), resource timing, JS errors
 * Sampling: configurable; defaults documented in ADR-008
 * Batches + flushes via sendBeacon on hide/pagehide, fetch every 10s
 * Survives: soft nav, hard nav, tab close, offline→online (IndexedDB buffer)
 * Privacy: no user IDs, no query strings, no request bodies
 */
const API        = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000'
const SESSION_ID = typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2)

// Configurable sampling rates (ADR-008 rationale)
const SAMPLING = {
  web_vital:        1.0,   // 100% — primary regression signal
  long_task:        0.1,   // 10%  — high volume, secondary signal
  slow_api:         1.0,   // 100% — any >1s is actionable
  resource_timing:  0.1,   // 10%  — large volume, bandwidth cost
  js_error:         1.0,   // 100% — always capture errors
  custom_timing:    1.0,   // 100% — critical custom metrics
}

let queue = [], flushTimer = null, meta = {}, offlineBuffer = []

export function initTelemetry() {
  try {
    meta = {
      sessionId: SESSION_ID,
      viewport:  { width: window.innerWidth, height: window.innerHeight },
      connection: navigator?.connection?.effectiveType || 'unknown',
      deviceMemory: navigator?.deviceMemory,
      hardwareConcurrency: navigator?.hardwareConcurrency,
      route: location.pathname,
      // NOT collected: user IDs, query strings, request bodies, IP, email
    }

    // Long tasks — 10% sampled (high volume)
    if ('PerformanceObserver' in window) {
      try {
        new PerformanceObserver(list => {
          list.getEntries().forEach(e => {
            if (Math.random() < SAMPLING.long_task)
              track({ type:'long_task', name:'long_task', value: Math.round(e.duration),
                attribution: e.attribution?.[0]?.name })
          })
        }).observe({ entryTypes: ['longtask'] })
      } catch {}

      // Resource timing — top 3 largest per route (10% sessions)
      try {
        if (Math.random() < SAMPLING.resource_timing) {
          new PerformanceObserver(list => {
            const entries = list.getEntries()
              .filter(e => e.initiatorType !== 'xmlhttprequest')
              .sort((a,b) => b.transferSize - a.transferSize)
              .slice(0, 3)
            entries.forEach(e => track({
              type: 'resource_timing',
              name: new URL(e.name, location.origin).pathname,
              value: Math.round(e.duration),
              size: e.transferSize,
              cached: e.transferSize === 0 && e.decodedBodySize > 0,
            }))
          }).observe({ entryTypes: ['resource'], buffered: true })
        }
      } catch {}
    }

    // JS errors — always captured
    window.addEventListener('error', e => {
      if (Math.random() < SAMPLING.js_error)
        track({ type:'js_error', name:(e.message||'').slice(0,200), value:0,
          attribution: e.filename, route: location.pathname })
    })
    window.addEventListener('unhandledrejection', e => {
      if (Math.random() < SAMPLING.js_error)
        track({ type:'js_error', name:String(e.reason).slice(0,200), value:0,
          route: location.pathname })
    })

    // Flush triggers
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush(true)
    })
    window.addEventListener('pagehide', () => flush(true))
    window.addEventListener('online', () => replayOfflineBuffer())
    flushTimer = setInterval(() => flush(false), 10000)

    // Web Vitals
    import('web-vitals').then(({ onLCP, onINP, onCLS, onTTFB, onFCP }) => {
      onLCP( m => track({ type:'web_vital', name:'LCP',  value: Math.round(m.value), attribution: m.attribution?.element }))
      onINP( m => track({ type:'web_vital', name:'INP',  value: Math.round(m.value) }))
      onCLS( m => track({ type:'web_vital', name:'CLS',  value: parseFloat(m.value.toFixed(4)) }))
      onTTFB(m => track({ type:'web_vital', name:'TTFB', value: Math.round(m.value) }))
      onFCP( m => track({ type:'web_vital', name:'FCP',  value: Math.round(m.value) }))
    }).catch(() => {})
  } catch {}  // telemetry must never crash the page
}

export function track(event) {
  try {
    const rate = SAMPLING[event.type] ?? 1.0
    if (Math.random() > rate) return
    queue.push({ ...event, timestamp: performance.now(), route: location.pathname })
    if (queue.length >= 50) flush(false)
  } catch {}
}

export function trackTiming(name, value) {
  track({ type:'custom_timing', name, value: Math.round(value) })
}

export function trackSlowApi(url, method, status, ms) {
  // Section 5.1: always capture >1s; 10% sample for <1s
  if (ms > 1000 || Math.random() < 0.1) {
    track({ type:'slow_api', name: url.replace(/\?.*/, ''), value: Math.round(ms), method, status })
  }
}

export function trackDropped(count) {
  track({ type:'custom_timing', name:'live_tail_dropped', value: count })
}
export function trackCoalesced(count) {
  track({ type:'custom_timing', name:'live_tail_coalesced', value: count })
}

function flush(beacon) {
  try {
    if (!queue.length) return
    const events = [...queue]; queue = []
    const body = JSON.stringify({ ...meta, events })

    if (!navigator.onLine) {
      offlineBuffer.push(body)
      persistOfflineBuffer()
      return
    }

    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(`${API}/api/telemetry/ingest`,
        new Blob([body], { type:'application/json' }))
    } else {
      fetch(`${API}/api/telemetry/ingest`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body,
        keepalive: true,
      }).catch(() => {})
    }
  } catch {}
}

async function persistOfflineBuffer() {
  try {
    const { set } = await import('idb-keyval')
    await set('telemetry_offline_buffer', offlineBuffer)
  } catch {}
}

async function replayOfflineBuffer() {
  try {
    const { get, del } = await import('idb-keyval')
    const buf = await get('telemetry_offline_buffer')
    if (!buf?.length) return
    await del('telemetry_offline_buffer')
    offlineBuffer = []
    for (const body of buf) {
      fetch(`${API}/api/telemetry/ingest`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body,
      }).catch(() => {})
    }
  } catch {}
}

// Instrumented fetch — tracks slow APIs per Section 5.1
export function apiFetch(url, opts = {}) {
  const t0 = performance.now()
  const full = url.startsWith('http') ? url : `${API}${url}`
  return fetch(full, { credentials:'include', ...opts }).then(res => {
    trackSlowApi(url, opts.method || 'GET', res.status, performance.now() - t0)
    return res
  })
}
