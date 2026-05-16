'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000'

function pct(arr, p) {
  if (!arr.length) return null
  const s = [...arr].sort((a,b)=>a-b)
  return s[Math.floor(s.length * p / 100)]
}

function MetricRow({ name, values, unit='ms', budget=null }) {
  const p50 = pct(values, 50), p75 = pct(values, 75), p95 = pct(values, 95)
  const pass = budget ? (p75 !== null && p75 <= budget) : null
  const fmt = v => v === null ? '—' : name === 'CLS' ? v?.toFixed(4) : v + unit
  return (
    <tr style={{ borderTop:'1px solid #0a0f1a' }}>
      <td style={{ padding:'6px 8px', color:'#64748b', fontSize:11 }}>{name}</td>
      <td style={{ padding:'6px 8px', color:'#94a3b8', fontSize:11, fontFamily:'monospace', textAlign:'right' }}>{fmt(p50)}</td>
      <td style={{ padding:'6px 8px', color:'#94a3b8', fontSize:11, fontFamily:'monospace', textAlign:'right' }}>{fmt(p75)}</td>
      <td style={{ padding:'6px 8px', color:'#94a3b8', fontSize:11, fontFamily:'monospace', textAlign:'right' }}>{fmt(p95)}</td>
      <td style={{ padding:'6px 8px', textAlign:'center' }}>
        {pass !== null && (
          <span style={{ fontSize:9,padding:'1px 5px',borderRadius:2,fontWeight:700,
            background:pass?'#052e16':'#450a0a',color:pass?'#4ade80':'#f87171' }}>
            {pass?'PASS':'FAIL'}{budget ? ` ≤${budget}${unit}` : ''}
          </span>
        )}
        {pass === null && <span style={{ fontSize:9,color:'#334155' }}>{values.length} samples</span>}
      </td>
    </tr>
  )
}

export default function MetricsDashboard() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('vitals')

  useEffect(() => {
    const load = () =>
      fetch(`${API}/api/telemetry/sessions`)
        .then(r=>r.json())
        .then(d=>{ setSessions(d.sessions||[]); setLoading(false) })
        .catch(()=>setLoading(false))
    load()
    const iv = setInterval(load, 5000)
    return () => clearInterval(iv)
  }, [])

  const allEvents = useMemo(() => sessions.flatMap(s=>s.events||[]), [sessions])

  const metricValues = useMemo(() => {
    const m = {}
    allEvents.forEach(e => {
      if (!m[e.name]) m[e.name] = []
      m[e.name].push(e.value)
    })
    return m
  }, [allEvents])

  const cwv = [
    { name:'LCP',  budget:2000 },
    { name:'INP',  budget:200 },
    { name:'CLS',  budget:0.05, unit:'' },
    { name:'TTFB', budget:null },
    { name:'FCP',  budget:null },
  ]
  const custom = [
    { name:'time_to_first_event', budget:400, label:'Time to first event' },
    { name:'live_tail_dropped',   budget:null, label:'Live tail dropped' },
    { name:'live_tail_coalesced', budget:null, label:'Live tail coalesced' },
  ]

  return (
    <div style={{ minHeight:'100vh', background:'#030712',
      fontFamily:'JetBrains Mono, monospace', color:'#cbd5e1' }}>
      <div style={{ padding:'12px 20px', borderBottom:'1px solid #0f1a2e', background:'#080d16',
        display:'flex', alignItems:'center', gap:12 }}>
        <Link href="/" style={{ fontSize:10,color:'#475569',textDecoration:'none' }}>← Home</Link>
        <span style={{ color:'#1e293b' }}>/</span>
        <span style={{ fontSize:12, color:'#f1f5f9', fontWeight:700 }}>Debug: Metrics</span>
        <span style={{ fontSize:9,color:'#334155',marginInlineStart:'auto' }}>
          Live · updates every 5s
        </span>
      </div>

      <div style={{ padding:20 }}>
        <div style={{ fontSize:11,color:'#475569',marginBottom:16 }}>
          {loading ? 'Loading...' : `${sessions.length} sessions · ${allEvents.length} events`}
        </div>

        {/* Tabs */}
        <div role="tablist" style={{ display:'flex',gap:4,marginBottom:16 }}>
          {[['vitals','Web Vitals'],['custom','Custom Metrics'],['errors','Errors & Slow APIs'],['sessions','Session Log']].map(([key,label])=>(
            <button key={key} role="tab" aria-selected={tab===key}
              onClick={()=>setTab(key)}
              style={{ background:tab===key?'#0f172a':'none',
                border:`1px solid ${tab===key?'#1e293b':'transparent'}`,
                color:tab===key?'#38bdf8':'#334155',
                borderRadius:4,padding:'4px 12px',fontSize:10,fontWeight:700,fontFamily:'inherit' }}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'vitals' && (
          <div style={{ background:'#080d16',border:'1px solid #0f172a',borderRadius:8,padding:16 }}>
            <h2 style={{ fontSize:10,color:'#1e3a5f',fontWeight:700,letterSpacing:'.1em',marginBottom:12 }}>
              CORE WEB VITALS — REAL BROWSER MEASUREMENTS
            </h2>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  {['Metric','p50','p75','p95','Status'].map(h=>(
                    <th key={h} style={{ fontSize:9,color:'#334155',fontWeight:700,
                      textAlign:h==='Metric'?'left':'right',padding:'0 8px 8px',
                      ...(h==='Status'?{textAlign:'center'}:{}) }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cwv.map(m => (
                  <MetricRow key={m.name} name={m.name}
                    values={metricValues[m.name]||[]}
                    unit={m.unit??'ms'} budget={m.budget} />
                ))}
              </tbody>
            </table>
            {!allEvents.length && (
              <div style={{ fontSize:11,color:'#334155',marginTop:12 }}>
                No data yet. Use the app for ~10 seconds to generate measurements. Web vitals fire on
                page interaction and navigation, not on load alone.
              </div>
            )}
          </div>
        )}

        {tab === 'custom' && (
          <div style={{ background:'#080d16',border:'1px solid #0f172a',borderRadius:8,padding:16 }}>
            <h2 style={{ fontSize:10,color:'#1e3a5f',fontWeight:700,letterSpacing:'.1em',marginBottom:12 }}>
              CUSTOM TIMING METRICS
            </h2>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  {['Metric','p50','p75','p95','Status'].map(h=>(
                    <th key={h} style={{ fontSize:9,color:'#334155',fontWeight:700,
                      textAlign:h==='Metric'?'left':'right',padding:'0 8px 8px',
                      ...(h==='Status'?{textAlign:'center'}:{}) }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {custom.map(m => (
                  <MetricRow key={m.name} name={m.label||m.name}
                    values={metricValues[m.name]||[]} budget={m.budget} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'errors' && (
          <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
            <div style={{ background:'#080d16',border:'1px solid #0f172a',borderRadius:8,padding:16 }}>
              <h2 style={{ fontSize:10,color:'#1e3a5f',fontWeight:700,letterSpacing:'.1em',marginBottom:10 }}>
                JS ERRORS
              </h2>
              {(metricValues['js_error'] ? allEvents.filter(e=>e.type==='js_error') : []).slice(0,10).map((e,i)=>(
                <div key={i} style={{ padding:'5px 8px',background:'#160000',
                  border:'1px solid #3d0000',borderRadius:4,fontSize:10,color:'#f87171',marginBottom:4 }}>
                  {e.name}
                </div>
              ))}
              {!allEvents.filter(e=>e.type==='js_error').length && (
                <div style={{ fontSize:11,color:'#334155' }}>No JS errors recorded.</div>
              )}
            </div>
            <div style={{ background:'#080d16',border:'1px solid #0f172a',borderRadius:8,padding:16 }}>
              <h2 style={{ fontSize:10,color:'#1e3a5f',fontWeight:700,letterSpacing:'.1em',marginBottom:10 }}>
                SLOW API CALLS (&gt;1s)
              </h2>
              {allEvents.filter(e=>e.type==='slow_api').slice(0,10).map((e,i)=>(
                <div key={i} style={{ display:'flex',gap:10,padding:'5px 0',
                  borderTop:'1px solid #0a0f1a',fontSize:10 }}>
                  <span style={{ color:'#64748b',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
                    {e.method} {e.name}
                  </span>
                  <span style={{ color:e.value>2000?'#f87171':'#fbbf24',fontFamily:'monospace' }}>
                    {e.value}ms
                  </span>
                  <span style={{ color:'#334155' }}>{e.status}</span>
                </div>
              ))}
              {!allEvents.filter(e=>e.type==='slow_api').length && (
                <div style={{ fontSize:11,color:'#334155' }}>
                  No slow API calls yet. The /api/services/:id/summary endpoint has an 800ms delay
                  (intentional) but is below the 1s threshold.
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'sessions' && (
          <div style={{ background:'#080d16',border:'1px solid #0f172a',borderRadius:8,padding:16 }}>
            <h2 style={{ fontSize:10,color:'#1e3a5f',fontWeight:700,letterSpacing:'.1em',marginBottom:10 }}>
              LAST {Math.min(sessions.length,50)} SESSIONS
            </h2>
            {sessions.length === 0 ? (
              <div style={{ fontSize:11,color:'#334155' }}>
                Batches appear after ~10s. The telemetry layer flushes every 10s,
                on page hide, and when 50 events accumulate.
              </div>
            ) : sessions.slice().reverse().slice(0,50).map((s,i)=>(
              <div key={i} style={{ display:'flex',gap:12,padding:'6px 0',
                borderTop:'1px solid #0a0f1a',fontSize:10,flexWrap:'wrap' }}>
                <span style={{ color:'#334155',width:140,flexShrink:0,fontFamily:'monospace' }}>
                  {s.receivedAt?.slice(0,19)}
                </span>
                <span style={{ color:'#475569' }}>{s.events?.length} events</span>
                <span style={{ color:'#334155' }}>{s.route}</span>
                <span style={{ color:'#1e3a5f' }}>{s.connection}</span>
                <span style={{ color:'#1e3a5f' }}>{s.viewport?.width}×{s.viewport?.height}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
