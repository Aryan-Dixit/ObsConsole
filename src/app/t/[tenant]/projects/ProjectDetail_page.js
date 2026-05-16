'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@store/auth'

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000'

export default function ProjectDetailPage({ params }) {
  const { accessToken } = useAuth()
  const [services, setServices] = useState(null)
  const [error, setError]       = useState(null)

  useEffect(() => {
    if (!accessToken) return
    fetch(`${API}/api/projects/${params.id}/services`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(d => setServices(d.items || []))
      .catch(e => setError(String(e)))
  }, [accessToken, params.id])

  return (
    <div style={{ minHeight:'100vh', background:'#030712', color:'#cbd5e1',
      fontFamily:'JetBrains Mono, monospace' }}>

      {/* Breadcrumb */}
      <div style={{ padding:'12px 24px', borderBottom:'1px solid #0f1a2e',
        background:'#080d16', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <Link href="/" style={{ fontSize:10, color:'#475569', textDecoration:'none' }}>← Tenants</Link>
        <span style={{ color:'#1e293b' }}>/</span>
        <Link href={`/t/${params.tenant}/projects`}
          style={{ fontSize:10, color:'#475569', textDecoration:'none' }}>Projects</Link>
        <span style={{ color:'#1e293b' }}>/</span>
        <span style={{ fontSize:11, color:'#f1f5f9', fontWeight:700 }}>{params.id}</span>
      </div>

      <div style={{ padding:24 }}>
        <h1 style={{ color:'#f1f5f9', fontSize:18, fontWeight:600, marginBottom:6 }}>
          Project: {params.id}
        </h1>
        <p style={{ color:'#475569', fontSize:12, marginBottom:24 }}>
          Select a service to open its live event stream, or manage dashboards below.
        </p>

        {error && (
          <div role="alert" style={{ color:'#f87171', fontSize:12, background:'#160000',
            border:'1px solid #b91c1c', borderRadius:6, padding:'10px 14px', marginBottom:16 }}>
            {error}
          </div>
        )}

        {/* Services */}
        <h2 style={{ color:'#94a3b8', fontSize:12, fontWeight:700,
          letterSpacing:'.08em', marginBottom:10 }}>SERVICES</h2>

        {services === null && !error && (
          <div style={{ color:'#334155', fontSize:13, marginBottom:20 }}>Loading…</div>
        )}

        {services !== null && services.length === 0 && !error && (
          <p style={{ color:'#475569', fontSize:13, marginBottom:20 }}>No services found.</p>
        )}

        {services !== null && services.length > 0 && (
          <div style={{ display:'grid', gap:8, marginBottom:28 }}
            role="list" aria-label="Services">
            {services.map(s => (
              <Link key={s.id} href={`/t/${params.tenant}/s/${s.id}`}
                role="listitem"
                style={{ background:'#080d16', border:'1px solid #0f172a', borderRadius:7,
                  padding:'14px 16px', textDecoration:'none',
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  transition:'border-color .15s' }}>
                <div>
                  <div style={{ color:'#f1f5f9', fontWeight:700, marginBottom:3 }}>{s.name}</div>
                  <div style={{ color:'#334155', fontSize:10 }}>~{s.rate} msg/s</div>
                </div>
                <span style={{ color:'#0284c7', fontSize:11 }}>Open live tail →</span>
              </Link>
            ))}
          </div>
        )}

        {/* Dashboard link — navigates to /t/[tenant]/dashboards/[id] */}
        <h2 style={{ color:'#94a3b8', fontSize:12, fontWeight:700,
          letterSpacing:'.08em', marginBottom:10 }}>DASHBOARDS</h2>
        <div style={{ display:'grid', gap:8 }}>
          <Link href={`/t/${params.tenant}/dashboards/dash1`}
            style={{ background:'#080d16', border:'1px solid #0f172a', borderRadius:7,
              padding:'14px 16px', textDecoration:'none',
              display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ color:'#f1f5f9', fontWeight:700, marginBottom:3 }}>
                Platform Overview
              </div>
              <div style={{ color:'#334155', fontSize:10 }}>Custom dashboard · drag-resize · undo/redo</div>
            </div>
            <span style={{ color:'#0284c7', fontSize:11 }}>Edit dashboard →</span>
          </Link>
          <Link href="/debug/metrics"
            style={{ background:'#080d16', border:'1px solid #0f172a', borderRadius:7,
              padding:'14px 16px', textDecoration:'none',
              display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ color:'#f1f5f9', fontWeight:700, marginBottom:3 }}>
                Telemetry & Performance Metrics
              </div>
              <div style={{ color:'#334155', fontSize:10 }}>
                Live CWV · p50/p75/p95 · last 50 sessions
              </div>
            </div>
            <span style={{ color:'#0284c7', fontSize:11 }}>View metrics →</span>
          </Link>
          <Link href="/share/demo-token"
            style={{ background:'#080d16', border:'1px solid #0f172a', borderRadius:7,
              padding:'14px 16px', textDecoration:'none',
              display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ color:'#f1f5f9', fontWeight:700, marginBottom:3 }}>
                Public Share Page (ISR)
              </div>
              <div style={{ color:'#334155', fontSize:10 }}>
                Static snapshot · SEO · Lighthouse ≥95
              </div>
            </div>
            <span style={{ color:'#0284c7', fontSize:11 }}>View →</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
