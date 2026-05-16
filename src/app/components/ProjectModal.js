'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@store/auth'

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000'

export default function ProjectModal({ projectId, tenantSlug }) {
  const router = useRouter()
  const { accessToken } = useAuth()
  const closeRef = useRef(null)
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)

  // Trap focus on mount
  useEffect(() => { closeRef.current?.focus() }, [])

  // Fetch services with auth token
  useEffect(() => {
    if (!accessToken) return
    setLoading(true)
    fetch(`${API}/api/projects/${projectId}/services`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(d => { setServices(d.items || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [accessToken, projectId])

  // Keyboard: Escape closes modal
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') router.back() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [router])

  function goToFullPage() {
    // Use window.location to bypass the intercepting route
    // (router.push would re-trigger the modal slot)
    window.location.href = `/t/${tenantSlug}/projects/${projectId}`
  }

  function goToService(serviceId) {
    window.location.href = `/t/${tenantSlug}/s/${serviceId}`
  }

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Project services"
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(2px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) router.back() }}
    >
      <div style={{
        background: '#080d16', border: '1px solid #1e293b', borderRadius: 12,
        padding: 24, width: 480, maxWidth: '92vw', maxHeight: '80vh', overflow: 'auto',
      }}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 16 }}>
          <h2 style={{ color:'#f1f5f9', fontSize:15, fontWeight:700 }}>
            Project: {projectId}
          </h2>
          <button
            ref={closeRef}
            onClick={() => router.back()}
            aria-label="Close modal"
            style={{ background:'none', border:'none', color:'#64748b', fontSize:20,
              lineHeight:1, fontFamily:'inherit', cursor:'pointer', padding:'0 4px' }}
          >×</button>
        </div>

        {/* Services label */}
        <div style={{ fontSize:9, color:'#1e3a5f', fontWeight:700,
          letterSpacing:'.1em', marginBottom:10 }}>SERVICES</div>

        {/* Loading */}
        {loading && (
          <div style={{ color:'#334155', fontSize:12, padding:'10px 0' }}>
            Loading services…
          </div>
        )}

        {/* Empty */}
        {!loading && services.length === 0 && (
          <div style={{ color:'#475569', fontSize:12, padding:'10px 0' }}>
            No services found for this project.
          </div>
        )}

        {/* Service rows */}
        {services.map(s => (
          <button
            key={s.id}
            onClick={() => goToService(s.id)}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              width: '100%', padding: '11px 0', borderTop: '1px solid #0f172a',
              background: 'none', border: 'none', borderTop: '1px solid #0f172a',
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <div>
              <div style={{ color:'#f1f5f9', fontWeight:600, fontSize:13 }}>{s.name}</div>
              <div style={{ color:'#334155', fontSize:10, marginTop:2 }}>~{s.rate} msg/s</div>
            </div>
            <span style={{ color:'#0284c7', fontSize:11, flexShrink:0, marginLeft:12 }}>
              Open live tail →
            </span>
          </button>
        ))}

        {/* View full page button */}
        <button
          onClick={goToFullPage}
          style={{
            display: 'block', width: '100%', textAlign: 'center',
            padding: '9px', background: '#0c4a6e', color: '#38bdf8',
            borderRadius: 6, fontSize: 12, fontWeight: 700,
            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            marginTop: 16,
          }}
        >
          View full project page
        </button>
      </div>
    </div>
  )
}
