'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '../store/auth'

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000'

function TenantSkeleton() {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12 }}>
      {[0,1,2].map(i => (
        <div key={i} aria-hidden="true" style={{
          background:'#080d16', border:'1px solid #0f172a', borderRadius:8,
          padding:20, height:110, animation:'pulse 1.5s ease-in-out infinite'
        }}>
          <div style={{ height:14, background:'#1e293b', borderRadius:4, marginBottom:10, width:'60%' }} />
          <div style={{ height:10, background:'#1e293b', borderRadius:4, marginBottom:8, width:'40%' }} />
          <div style={{ height:10, background:'#1e293b', borderRadius:4, width:'50%' }} />
        </div>
      ))}
    </div>
  )
}

export default function LandingClient() {
  const { accessToken, refresh } = useAuth()
  const [tenants, setTenants] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!accessToken) {
      refresh().catch(() => {})
      return
    }
    fetch(`${API}/api/tenants`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} — is the mock server running? (npm run dev:mock)`)
        return r.json()
      })
      .then(d => setTenants(d.items || []))
      .catch(e => setError(e.message))
  }, [accessToken, refresh])

  return (
    <div style={{ minHeight:'100vh', background:'#030712', color:'#cbd5e1',
      fontFamily:'JetBrains Mono, monospace' }}>

      {/* Nav bar */}
      <div style={{ padding:'12px 24px', borderBottom:'1px solid #0f1a2e',
        background:'#080d16', display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ width:22, height:22, borderRadius:5,
          background:'linear-gradient(135deg,#0ea5e9,#6366f1)',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontWeight:900, color:'#fff', fontSize:12 }}>O</div>
        <span style={{ fontWeight:700, color:'#f1f5f9' }}>ObsConsole</span>
        <span style={{ fontSize:10, color:'#334155', marginInlineStart:'auto' }}>
          Multi-tenant Observability
        </span>
      </div>

      <div style={{ padding:24 }}>
        <h1 style={{ fontSize:18, fontWeight:600, color:'#f1f5f9', marginBottom:8 }}>
          Tenants
        </h1>
        <p style={{ fontSize:12, color:'#475569', marginBottom:20 }}>
          Select a tenant to view projects and live service streams.
        </p>

        {/* Error state — actionable message */}
        {error && (
          <div role="alert" aria-live="assertive" style={{
            color:'#f87171', fontSize:12, background:'#160000',
            border:'1px solid #b91c1c', borderRadius:6,
            padding:'10px 14px', marginBottom:16, lineHeight:1.6
          }}>
            <strong>Could not load tenants.</strong><br />
            {error}<br />
            <span style={{ color:'#fbbf24' }}>
              Make sure the mock server is running: <code>npm run dev:mock</code>
            </span>
          </div>
        )}

        {/* Loading skeleton */}
        {tenants === null && !error && <TenantSkeleton />}

        {/* Empty state */}
        {tenants !== null && tenants.length === 0 && !error && (
          <p style={{ color:'#475569', fontSize:13 }}>
            No tenants returned by the API.
          </p>
        )}

        {/* Tenant cards */}
        {tenants !== null && tenants.length > 0 && (
          <div role="list" aria-label="Tenant list"
            style={{ display:'grid',
              gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12 }}>
            {tenants.map(t => (
              <Link key={t.id} href={`/t/${t.slug}/projects`}
                role="listitem" aria-label={`Open ${t.name}`}
                style={{ background:'#080d16', border:'1px solid #0f172a',
                  borderRadius:8, padding:20, textDecoration:'none',
                  display:'block', transition:'border-color .15s' }}>
                <div style={{ fontWeight:700, color:'#f1f5f9', marginBottom:6, fontSize:14 }}>
                  {t.name}
                </div>
                <div style={{ fontSize:11, color:'#475569', marginBottom:4 }}>
                  Plan: {t.plan}
                </div>
                <div style={{ fontSize:11, color:'#0284c7' }}>/{t.slug}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
