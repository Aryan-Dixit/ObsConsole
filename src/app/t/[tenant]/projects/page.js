'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@store/auth'

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000'

function CardSkeleton({ count = 3 }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} aria-hidden="true" style={{
          background:'#080d16', border:'1px solid #0f172a', borderRadius:8,
          padding:18, height:90, animation:'pulse 1.5s ease-in-out infinite',
        }}>
          <div style={{ height:12, background:'#1e293b', borderRadius:3, marginBottom:8, width:'55%' }} />
          <div style={{ height:10, background:'#1e293b', borderRadius:3, width:'35%' }} />
        </div>
      ))}
    </div>
  )
}

export default function ProjectsPage({ params }) {
  const { accessToken } = useAuth()
  const [projects, setProjects] = useState(null)
  const [tenantName, setTenantName] = useState(params.tenant)
  const [tenantId, setTenantId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!accessToken) return
    const headers = { Authorization: `Bearer ${accessToken}` }

    // First resolve tenant slug → id
    fetch(`${API}/api/tenants`, { headers, credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(d => {
        const tenant = (d.items || []).find(t => t.slug === params.tenant) || d.items?.[0]
        if (!tenant) { setProjects([]); return }
        setTenantName(tenant.name)
        setTenantId(tenant.id)
        return fetch(`${API}/api/tenants/${tenant.id}/projects`, { headers, credentials: 'include' })
      })
      .then(r => r ? (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)) : null)
      .then(d => d && setProjects(d.items || []))
      .catch(e => setError(String(e)))
  }, [accessToken, params.tenant])

  return (
    <div style={{ minHeight:'100vh', background:'#030712', fontFamily:'JetBrains Mono, monospace' }}>
      {/* Breadcrumb nav */}
      <div style={{ padding:'12px 24px', borderBottom:'1px solid #0f1a2e', background:'#080d16',
        display:'flex', alignItems:'center', gap:10 }}>
        <Link href="/" style={{ fontSize:10, color:'#475569', textDecoration:'none' }}>← Tenants</Link>
        <span style={{ color:'#1e293b' }}>/</span>
        <span style={{ fontSize:12, color:'#f1f5f9', fontWeight:700 }}>{tenantName}</span>
        <span style={{ color:'#1e293b' }}>/</span>
        <span style={{ fontSize:11, color:'#475569' }}>Projects</span>
      </div>

      <div style={{ padding:24 }}>
        <h1 style={{ fontSize:18, fontWeight:600, color:'#f1f5f9', marginBottom:20 }}>Projects</h1>

        {error && (
          <div role="alert" style={{ color:'#f87171', fontSize:12, background:'#160000',
            border:'1px solid #b91c1c', borderRadius:6, padding:'10px 14px', marginBottom:16 }}>
            Failed to load projects: {error}
          </div>
        )}

        {projects === null && !error && <CardSkeleton />}

        {projects !== null && projects.length === 0 && !error && (
          <p style={{ color:'#475569', fontSize:13 }}>No projects found for this tenant.</p>
        )}

        {projects !== null && projects.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:12 }}
            role="list" aria-label="Projects">
            {projects.map(p => (
              <Link key={p.id} href={`/t/${params.tenant}/projects/${p.id}`}
                role="listitem"
                style={{ background:'#080d16', border:'1px solid #0f172a', borderRadius:8,
                  padding:18, textDecoration:'none', display:'block',
                  transition:'border-color .15s' }}>
                <div style={{ fontWeight:700, color:'#f1f5f9', marginBottom:4, fontSize:13 }}>{p.name}</div>
                <div style={{ fontSize:11, color:'#475569', marginBottom:6 }}>env: {p.env}</div>
                <div style={{ fontSize:11, color:'#0284c7' }}>View services →</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
