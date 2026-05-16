'use client'
import { useState, useEffect, useRef, useCallback, useReducer, useMemo } from 'react'
import Link from 'next/link'
import { WebSocketManager } from '@lib/wsManager'
import { useAuth } from '@store/auth'
import { trackTiming, trackDropped } from '@lib/telemetry'

const API    = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000'
const LEVELS = ['DEBUG','INFO','WARN','ERROR','FATAL']
const LC = {
  DEBUG:{ text:'#94a3b8', badge:'#1e293b', border:'#334155' },
  INFO: { text:'#38bdf8', badge:'#0c2a4a', border:'#0369a1' },
  WARN: { text:'#fbbf24', badge:'#3d1f00', border:'#b45309' },
  ERROR:{ text:'#f87171', badge:'#3d0000', border:'#b91c1c' },
  FATAL:{ text:'#e879f9', badge:'#3d0050', border:'#86198f' },
}
const MAX_EVENTS  = 100000
const ROW_H       = 34
const VISIBLE     = 22

function fmtUp(s) {
  return [Math.floor(s/3600), Math.floor((s%3600)/60), s%60]
    .map(n => String(n).padStart(2,'0')).join(':')
}
function fmt(n) {
  return n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(1)+'k' : String(n)
}

function LevelBadge({ level }) {
  const c = LC[level] || LC.INFO
  return (
    <span aria-label={`Level ${level}`}
      style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:2,
        background:c.badge, color:c.text, border:`1px solid ${c.border}`, whiteSpace:'nowrap' }}>
      {level}
    </span>
  )
}

function Sparkline({ data, color, w=70, h=24 }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current; if (!c || !data?.length) return
    const ctx = c.getContext('2d'); ctx.clearRect(0,0,w,h)
    const max = Math.max(...data, 1)
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'
    data.forEach((v,i) => { const x=i/(data.length-1)*w, y=h-(v/max)*(h-2); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y) })
    ctx.stroke()
    ctx.beginPath(); ctx.fillStyle = color+'22'
    data.forEach((v,i) => { const x=i/(data.length-1)*w, y=h-(v/max)*(h-2); if(i===0){ctx.moveTo(x,h);ctx.lineTo(x,y)}else ctx.lineTo(x,y) })
    ctx.lineTo(w,h); ctx.closePath(); ctx.fill()
  }, [data,color,w,h])
  return <canvas ref={ref} width={w} height={h} aria-hidden="true" />
}

// ── Virtual windowed list ─────────────────────────────────────────────────────
function VirtualList({ events, onSelect, selectedId }) {
  const ref      = useRef(null)
  const [scroll, setScroll]     = useState(0)
  const [atBottom, setAtBottom] = useState(true)
  const totalH   = events.length * ROW_H
  const startIdx = Math.max(0, Math.floor(scroll / ROW_H) - 4)
  const endIdx   = Math.min(events.length - 1, startIdx + VISIBLE + 8)

  useEffect(() => {
    if (atBottom && ref.current) ref.current.scrollTop = ref.current.scrollHeight
  })

  const onScroll = useCallback(e => {
    setScroll(e.currentTarget.scrollTop)
    const el = e.currentTarget
    setAtBottom(Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 50)
  }, [])

  return (
    <div style={{ position:'relative', flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
      {!atBottom && (
        <button
          onClick={() => setAtBottom(true)}
          style={{ position:'absolute', bottom:10, right:14, zIndex:10,
            background:'#0284c7', color:'#fff', border:'none', borderRadius:20,
            padding:'4px 12px', fontSize:11, fontWeight:700, fontFamily:'inherit', cursor:'pointer' }}
          aria-label="Jump to latest events"
        >↓ Jump to live</button>
      )}
      <div ref={ref} onScroll={onScroll}
        role="grid" aria-label="Live event stream" aria-rowcount={events.length}
        aria-live="polite" aria-relevant="additions"
        style={{ flex:1, overflowY:'auto', position:'relative' }}>
        <div style={{ height:totalH, position:'relative' }}>
          {events.slice(startIdx, endIdx+1).map((ev, i) => {
            const idx = startIdx + i
            const c   = LC[ev.level] || LC.INFO
            const sel = ev.id === selectedId
            return (
              <div key={ev.id}
                role="row" aria-rowindex={idx+1} aria-selected={sel}
                tabIndex={0}
                onClick={() => onSelect(ev)}
                onKeyDown={e => { if (e.key==='Enter'||e.key===' ') onSelect(ev) }}
                style={{ position:'absolute', top:idx*ROW_H, left:0, right:0,
                  height:ROW_H-1, display:'flex', alignItems:'center', gap:8, padding:'0 10px',
                  background: sel?'#0c2a4a' : idx%2===0?'#040810':'#050a12',
                  borderLeft:`2px solid ${sel?'#38bdf8':c.border}`,
                  cursor:'pointer', outline:sel?'1px solid #38bdf8':'none' }}>
                <span role="cell" style={{ color:'#1e3a5f', width:50, flexShrink:0, fontSize:10 }}>
                  {ev.timestamp?.slice(11,19)}
                </span>
                <span role="cell"><LevelBadge level={ev.level} /></span>
                <span role="cell" style={{ color:'#1e3a5f', width:78, flexShrink:0,
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:10 }}>
                  {ev.host}
                </span>
                <span role="cell" style={{ color:c.text, flex:1,
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:11 }}>
                  {ev.message}
                </span>
                <span role="cell" style={{ color:'#334155', fontSize:10, width:42, textAlign:'right' }}>
                  {ev.latency}ms
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Event detail panel ────────────────────────────────────────────────────────
function DetailPanel({ event, onClose }) {
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [event])
  if (!event) return null
  const c = LC[event.level] || LC.INFO
  return (
    <div ref={ref} tabIndex={-1}
      role="complementary" aria-label="Event detail"
      style={{ width:280, background:'#060b12', borderLeft:'1px solid #0f1a2e',
        display:'flex', flexDirection:'column', flexShrink:0, overflow:'hidden' }}>
      <div style={{ padding:'8px 12px', borderBottom:'1px solid #0f1a2e',
        display:'flex', alignItems:'center', gap:8 }}>
        <LevelBadge level={event.level} />
        <span style={{ flex:1, fontSize:10, color:'#475569', fontWeight:700 }}>Event Detail</span>
        <button onClick={onClose} aria-label="Close detail panel"
          style={{ background:'none', border:'none', color:'#334155',
            fontSize:16, lineHeight:1, fontFamily:'inherit', cursor:'pointer' }}>×</button>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:12 }}>
        <div style={{ background:c.badge, border:`1px solid ${c.border}`, borderRadius:5,
          padding:9, marginBottom:12, fontSize:11, color:c.text, lineHeight:1.6, wordBreak:'break-word' }}>
          {event.message}
        </div>
        {[['ID',event.id],['Time',event.timestamp],['Host',event.host],
          ['Trace',event.traceId],['Span',event.spanId],['Latency',(event.latency||0)+'ms']].map(([k,v]) => (
          <div key={k} style={{ display:'flex', gap:8, marginBottom:6, fontSize:10 }}>
            <span style={{ color:'#334155', width:55, flexShrink:0, fontWeight:700 }}>{k}</span>
            <span style={{ color:'#64748b', wordBreak:'break-all', fontFamily:'monospace' }}>{v}</span>
          </div>
        ))}
        {event.attributes && Object.entries(event.attributes).map(([k,v]) => (
          <div key={k} style={{ display:'flex', gap:8, marginBottom:4, fontSize:10 }}>
            <span style={{ color:'#334155', width:80, flexShrink:0 }}>{k}</span>
            <span style={{ color:'#64748b', fontFamily:'monospace' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── State machine ─────────────────────────────────────────────────────────────
function initState() {
  return {
    events:[], totalRx:0, dropped:0, wsRate:0, wsState:'IDLE',
    fill:0, rateHist:[], isPaused:false, isLive:true,
    filter:'ALL', search:'', selectedEvent:null, uptime:0, alerts:[],
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'FLUSH': {
      if (state.isPaused || !state.isLive) return state
      const events = [...state.events, ...action.batch].slice(-MAX_EVENTS)
      return { ...state, events,
        totalRx: state.totalRx + action.batch.length,
        dropped: action.dropped, wsRate: action.rate, fill: action.fill,
        rateHist: [...state.rateHist.slice(-29), action.rate] }
    }
    case 'WS_STATE':     return { ...state, wsState: action.value }
    case 'TOGGLE_PAUSE': return { ...state, isPaused: !state.isPaused }
    case 'TOGGLE_LIVE':  return { ...state, isLive:  !state.isLive  }
    case 'FILTER':       return { ...state, filter:   action.value  }
    case 'SEARCH':       return { ...state, search:   action.value  }
    case 'SELECT':       return { ...state, selectedEvent: action.event }
    case 'TICK':         return { ...state, uptime: state.uptime + 1 }
    case 'ALERT':        return { ...state, alerts: [action.alert, ...state.alerts].slice(0,8) }
    default: return state
  }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LiveTailShell({ tenantSlug, serviceId }) {
  // All hooks declared unconditionally at the top — Rules of Hooks
  const { accessToken } = useAuth()
  const [state, dispatch] = useReducer(reducer, undefined, initState)
  const [serviceName, setServiceName] = useState(serviceId)
  const wsRef = useRef(null)

  // Fetch service name (best-effort, non-blocking)
  useEffect(() => {
    if (!accessToken || !serviceId) return
    // Look up name from the services list
    fetch(`${API}/api/projects/p1/services`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        // Try p1 first, then try other projects
        const svc = (d.items || []).find(s => s.id === serviceId)
        if (svc) { setServiceName(svc.name); return }
        // Try other projects
        return fetch(`${API}/api/projects/p2/services`, {
          headers: { Authorization: `Bearer ${accessToken}` }, credentials: 'include',
        }).then(r => r.ok ? r.json() : null).then(d2 => {
          const svc2 = (d2?.items || []).find(s => s.id === serviceId)
          if (svc2) setServiceName(svc2.name)
        })
      })
      .catch(() => {}) // name is cosmetic only — failure is fine
  }, [accessToken, serviceId])

  // WebSocket connection
  useEffect(() => {
    if (!serviceId) return
    const t0 = performance.now()
    const mgr = new WebSocketManager({
      serviceId,
      onBatch: ({ batch, dropped, rate, fill }) =>
        dispatch({ type:'FLUSH', batch, dropped, rate, fill }),
      onStateChange: s => dispatch({ type:'WS_STATE', value: s }),
      onDrop: n => trackDropped(n),
    })
    mgr.connect()
    wsRef.current = mgr

    const chk = setInterval(() => {
      if (mgr.totalReceived > 0) {
        trackTiming('time_to_first_event', performance.now() - t0)
        clearInterval(chk)
      }
    }, 100)

    // Periodic mock alerts
    const ALERT_MSGS = [
      'p99 latency spike detected',
      'Error rate elevated',
      'Memory pressure on pod-7',
      'DB connection pool near limit',
    ]
    const aiv = setInterval(() => {
      if (Math.random() < 0.12) {
        dispatch({ type:'ALERT', alert: {
          id: Math.random().toString(36).slice(2),
          message: ALERT_MSGS[Math.floor(Math.random()*ALERT_MSGS.length)],
          severity: Math.random() < 0.3 ? 'critical' : 'warning',
          ts: new Date().toISOString().slice(11,19),
        }})
      }
    }, 9000)

    return () => { mgr.destroy(); clearInterval(aiv); clearInterval(chk) }
  }, [serviceId])

  // Uptime clock
  useEffect(() => {
    const iv = setInterval(() => dispatch({ type:'TICK' }), 1000)
    return () => clearInterval(iv)
  }, [])

  // Derived state — filtered event list
  const filtered = useMemo(() => {
    let evs = state.events
    if (state.filter !== 'ALL') evs = evs.filter(e => e.level === state.filter)
    if (state.search) {
      const q = state.search.toLowerCase()
      evs = evs.filter(e => e.message?.toLowerCase().includes(q) || e.host?.includes(q))
    }
    return evs
  }, [state.events, state.filter, state.search])

  const errorRate = useMemo(() => {
    if (!state.events.length) return '0.0'
    return ((state.events.filter(e => e.level==='ERROR'||e.level==='FATAL').length
      / state.events.length) * 100).toFixed(1)
  }, [state.events])

  const wsColors  = { IDLE:'#334155', CONNECTING:'#fbbf24', OPEN:'#22c55e', RECONNECTING:'#f87171' }
  const acColors  = { critical:'#dc2626', warning:'#d97706', info:'#0284c7' }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column',
      overflow:'hidden', fontFamily:'JetBrains Mono, monospace' }}>

      {/* Top bar */}
      <div style={{ height:44, background:'#080d16', borderBottom:'1px solid #0f1a2e',
        display:'flex', alignItems:'center', padding:'0 14px', flexShrink:0, gap:10 }}>
        <Link href={`/t/${tenantSlug}/projects`}
          style={{ fontSize:10, color:'#475569', textDecoration:'none' }}>← Projects</Link>
        <span style={{ color:'#1e293b' }}>/</span>
        <span style={{ fontSize:11, color:'#f1f5f9', fontWeight:700 }}>{serviceName}</span>
        <div style={{ flex:1 }} />
        <span style={{ fontSize:10, color: wsColors[state.wsState]||'#334155',
          display:'flex', alignItems:'center', gap:4 }}
          aria-label={`WebSocket status: ${state.wsState}`}>
          ● {state.wsState}
        </span>
        <span style={{ fontSize:10, color:'#334155' }}>{fmtUp(state.uptime)}</span>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* Alerts sidebar */}
        {state.alerts.length > 0 && (
          <aside aria-label="Active alerts"
            style={{ width:190, background:'#060b12', borderRight:'1px solid #0a1220',
              display:'flex', flexDirection:'column', flexShrink:0 }}>
            <div style={{ padding:'8px 10px 4px', fontSize:9, color:'#1e3a5f',
              fontWeight:700, letterSpacing:'.1em' }}>ALERTS</div>
            <div style={{ flex:1, overflowY:'auto' }}>
              {state.alerts.map(a => (
                <div key={a.id} role="alert"
                  style={{ padding:'6px 10px', borderLeft:`2px solid ${acColors[a.severity]||'#334155'}`,
                    margin:'1px 0' }}>
                  <div style={{ fontSize:9, color:acColors[a.severity], fontWeight:700 }}>
                    {a.severity?.toUpperCase()}
                  </div>
                  <div style={{ fontSize:9, color:'#475569', marginTop:1, lineHeight:1.4 }}>
                    {a.message}
                  </div>
                  <div style={{ fontSize:8, color:'#1e293b', marginTop:1 }}>{a.ts}</div>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* Main content */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* Metric cards */}
          <div style={{ padding:'8px 12px', display:'grid',
            gridTemplateColumns:'repeat(4,1fr)', gap:8,
            flexShrink:0, borderBottom:'1px solid #0a0f1a' }}>
            {[
              { label:'Events/sec',    val:state.wsRate,        hist:state.rateHist, color:'#38bdf8' },
              { label:'Total received',val:fmt(state.totalRx),  sub:`${fmt(state.events.length)} buffered` },
              { label:'Error rate',    val:errorRate,           unit:'%' },
              { label:'Dropped',       val:state.dropped,       sub:state.fill>0.6?`⚠ ring ${Math.round(state.fill*100)}%`:'ring healthy' },
            ].map(m => (
              <div key={m.label} style={{ background:'#080d16', border:'1px solid #0f172a',
                borderRadius:7, padding:'9px 12px' }}>
                <div style={{ fontSize:9, color:'#475569', fontWeight:700,
                  textTransform:'uppercase', letterSpacing:'.08em', marginBottom:3 }}>{m.label}</div>
                <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between' }}>
                  <div>
                    <span style={{ fontSize:22, fontWeight:700, color:'#f1f5f9' }}>{m.val}</span>
                    {m.unit && <span style={{ fontSize:11, color:'#475569', marginLeft:3 }}>{m.unit}</span>}
                    {m.sub  && <div style={{ fontSize:9, color:'#334155', marginTop:1 }}>{m.sub}</div>}
                  </div>
                  {m.hist && <Sparkline data={m.hist} color={m.color||'#38bdf8'} />}
                </div>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div role="toolbar" aria-label="Event filters"
            style={{ padding:'6px 12px', display:'flex', alignItems:'center',
              gap:7, borderBottom:'1px solid #0a0f1a', flexShrink:0, flexWrap:'wrap' }}>
            <div role="group" aria-label="Filter by level" style={{ display:'flex', gap:2 }}>
              {['ALL',...LEVELS].map(lvl => {
                const active = state.filter === lvl; const c = LC[lvl]
                return (
                  <button key={lvl}
                    onClick={() => dispatch({ type:'FILTER', value:lvl })}
                    aria-pressed={active} aria-label={`Filter ${lvl}`}
                    style={{ background:active?(c?.badge||'#1e293b'):'none',
                      border:`1px solid ${active?(c?.border||'#475569'):'#1e293b'}`,
                      color:active?(c?.text||'#94a3b8'):'#1e3a5f',
                      borderRadius:3, padding:'2px 7px', fontSize:9, fontWeight:700,
                      fontFamily:'inherit', cursor:'pointer' }}>
                    {lvl}
                  </button>
                )
              })}
            </div>

            <label htmlFor="ev-search" className="sr-only">Search events</label>
            <input id="ev-search" type="search"
              placeholder="Search messages, hosts…"
              value={state.search}
              onChange={e => dispatch({ type:'SEARCH', value:e.target.value })}
              style={{ flex:1, maxWidth:220, background:'#0a0f1a', border:'1px solid #1e293b',
                borderRadius:4, color:'#94a3b8', padding:'3px 8px',
                fontSize:10, fontFamily:'inherit', outline:'none' }} />

            <div style={{ flex:1 }} />

            <button aria-pressed={state.isPaused}
              onClick={() => dispatch({ type:'TOGGLE_PAUSE' })}
              style={{ background:state.isPaused?'#3d1f00':'#0c4a6e',
                border:`1px solid ${state.isPaused?'#d97706':'#0284c7'}`,
                color:state.isPaused?'#fbbf24':'#38bdf8',
                borderRadius:4, padding:'3px 10px', fontSize:10,
                fontWeight:700, fontFamily:'inherit', cursor:'pointer' }}>
              {state.isPaused ? '▶ Resume' : '⏸ Pause'}
            </button>

            <button aria-pressed={state.isLive}
              onClick={() => dispatch({ type:'TOGGLE_LIVE' })}
              style={{ background:state.isLive?'#052e16':'#0f172a',
                border:`1px solid ${state.isLive?'#16a34a':'#334155'}`,
                color:state.isLive?'#4ade80':'#475569',
                borderRadius:4, padding:'3px 10px', fontSize:10, fontWeight:700,
                fontFamily:'inherit', cursor:'pointer',
                display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ width:6, height:6, borderRadius:'50%',
                background:state.isLive?'#4ade80':'#475569', display:'inline-block',
                animation:state.isLive?'pulse 2s ease-in-out infinite':'none' }}
                aria-hidden="true" />
              {state.isLive ? 'Live' : 'Off'}
            </button>
          </div>

          {/* Backpressure warning */}
          {state.fill > 0.7 && (
            <div role="status" aria-live="polite"
              style={{ background:'#1c1208', borderBottom:'1px solid #d97706',
                padding:'4px 12px', fontSize:10, color:'#fbbf24', flexShrink:0 }}>
              ⚠ Ring buffer {Math.round(state.fill*100)}% full — coalescing events · dropped: {state.dropped}
            </div>
          )}

          {/* Column headers */}
          <div role="row" aria-hidden="true"
            style={{ display:'flex', alignItems:'center', gap:8, padding:'0 10px',
              height:22, background:'#040810', borderBottom:'1px solid #0a1220',
              fontSize:9, color:'#1e3a5f', fontWeight:700,
              letterSpacing:'.08em', flexShrink:0 }}>
            <span style={{ width:50 }}>TIME</span>
            <span style={{ width:48 }}>LEVEL</span>
            <span style={{ width:78 }}>HOST</span>
            <span style={{ flex:1 }}>MESSAGE</span>
            <span style={{ width:42, textAlign:'right' }}>LAT</span>
          </div>

          {/* Event list + detail panel */}
          <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
            <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
              {filtered.length === 0 ? (
                <div role="status" aria-live="polite"
                  style={{ flex:1, display:'flex', alignItems:'center',
                    justifyContent:'center', color:'#1e3a5f', fontSize:12 }}>
                  {state.isPaused ? '⏸ Stream paused' : 'Waiting for events…'}
                </div>
              ) : (
                <VirtualList
                  events={filtered}
                  onSelect={e => dispatch({ type:'SELECT', event:e })}
                  selectedId={state.selectedEvent?.id}
                />
              )}
            </div>

            {state.selectedEvent && (
              <DetailPanel
                event={state.selectedEvent}
                onClose={() => dispatch({ type:'SELECT', event:null })}
              />
            )}
          </div>

          {/* Status bar */}
          <div role="status" aria-live="polite"
            style={{ height:22, background:'#040810', borderTop:'1px solid #0a0f1a',
              display:'flex', alignItems:'center', padding:'0 12px',
              gap:12, fontSize:9, color:'#1e3a5f', flexShrink:0 }}>
            <span>{filtered.length.toLocaleString()} shown · {state.events.length.toLocaleString()} total</span>
            {state.filter !== 'ALL' && <span>filter: {state.filter}</span>}
            {state.search && <span>search: "{state.search}"</span>}
            <span style={{ flex:1 }} />
            <span>rAF ≤200/frame · {VISIBLE} DOM rows</span>
          </div>
        </div>
      </div>
    </div>
  )
}
