'use client'
import { useState, useEffect, useReducer, useCallback } from 'react'
import Link from 'next/link'
import { useAuth } from '@store/auth'
import { trackSlowApi } from '@lib/telemetry'

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000'

// ── Authenticated fetch helper ────────────────────────────────────────────────
function authFetch(url, token, opts = {}) {
  const t0 = performance.now()
  const full = url.startsWith('http') ? url : `${API}${url}`
  return fetch(full, {
    credentials: 'include',
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      ...opts.headers,
    },
  }).then(res => {
    trackSlowApi(url, opts.method || 'GET', res.status, performance.now() - t0)
    return res
  })
}

function getCsrf() {
  return document.cookie.match(/csrf=([^;]+)/)?.[1] || ''
}

// ── Undo/redo — ≥50 steps per assignment ─────────────────────────────────────
const MAX_HISTORY = 50

function historyReducer(state, action) {
  switch (action.type) {
    case 'INIT':
      return { past: [], present: action.widgets, future: [] }
    case 'SET': {
      const past = [...state.past, state.present].slice(-MAX_HISTORY)
      return { past, present: action.widgets, future: [] }
    }
    case 'UNDO': {
      if (!state.past.length) return state
      const past = [...state.past]
      const present = past.pop()
      return { past, present, future: [state.present, ...state.future] }
    }
    case 'REDO': {
      if (!state.future.length) return state
      const [present, ...future] = state.future
      return { past: [...state.past, state.present], present, future }
    }
    default: return state
  }
}

// ── Conflict resolution dialog (assignment §2.2) ──────────────────────────────
function ConflictDialog({ serverState, localWidgets, onAcceptServer, onAcceptLocal, onDismiss }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="conflict-title"
      style={{ position:'fixed', inset:0, zIndex:100, display:'flex',
        alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.75)' }}>
      <div style={{ background:'#080d16', border:'1px solid #dc2626', borderRadius:10,
        padding:24, width:520, maxWidth:'92vw', fontFamily:'JetBrains Mono, monospace' }}>
        <h2 id="conflict-title" style={{ color:'#f87171', fontSize:15, fontWeight:700, marginBottom:8 }}>
          ⚠ Save conflict — HTTP 409
        </h2>
        <p style={{ color:'#64748b', fontSize:12, marginBottom:16, lineHeight:1.6 }}>
          The server rejected your save because another client updated this dashboard.
          Choose which version to keep. This dialog is non-blocking — dismiss to keep editing.
        </p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
          <div style={{ background:'#040810', border:'1px solid #1e293b', borderRadius:6, padding:12 }}>
            <div style={{ fontSize:9, color:'#64748b', fontWeight:700, marginBottom:8,
              letterSpacing:'.08em' }}>SERVER VERSION (v{serverState?.version})</div>
            {(serverState?.widgets || []).map(w => (
              <div key={w.id} style={{ fontSize:11, color:'#94a3b8', padding:'3px 0',
                borderTop:'1px solid #0a0f1a' }}>{w.title}</div>
            ))}
          </div>
          <div style={{ background:'#040810', border:'1px solid #0284c7', borderRadius:6, padding:12 }}>
            <div style={{ fontSize:9, color:'#0284c7', fontWeight:700, marginBottom:8,
              letterSpacing:'.08em' }}>YOUR VERSION</div>
            {(localWidgets || []).map(w => (
              <div key={w.id} style={{ fontSize:11, color:'#94a3b8', padding:'3px 0',
                borderTop:'1px solid #0a0f1a' }}>{w.title}</div>
            ))}
          </div>
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onDismiss}
            style={{ background:'none', border:'1px solid #334155', color:'#64748b',
              borderRadius:5, padding:'6px 14px', fontSize:12, fontFamily:'inherit', cursor:'pointer' }}>
            Dismiss
          </button>
          <button onClick={onAcceptServer}
            style={{ background:'#0f172a', border:'1px solid #475569', color:'#94a3b8',
              borderRadius:5, padding:'6px 14px', fontSize:12, fontFamily:'inherit', cursor:'pointer' }}>
            Use server version
          </button>
          <button onClick={onAcceptLocal}
            style={{ background:'#0c4a6e', border:'1px solid #0284c7', color:'#38bdf8',
              borderRadius:5, padding:'6px 14px', fontSize:12, fontFamily:'inherit', cursor:'pointer' }}>
            Keep my changes
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main editor ───────────────────────────────────────────────────────────────
export default function DashboardEditor({ tenantSlug, dashboardId }) {
  const { accessToken } = useAuth()
  const [histState, histDispatch] = useReducer(historyReducer, { past:[], present:[], future:[] })
  const [loading, setLoading]   = useState(true)
  const [saving,  setSaving]    = useState(false)
  const [saveMsg, setSaveMsg]   = useState('')
  const [conflict, setConflict] = useState(null)
  const [version,  setVersion]  = useState(1)
  const [isOnline, setIsOnline] = useState(true)
  const [offlineQueueLen, setOfflineQueueLen] = useState(0)
  const [dragIdx,  setDragIdx]  = useState(null)
  const [error,    setError]    = useState(null)

  const widgets = histState.present

  // Load dashboard
  useEffect(() => {
    if (!accessToken) return
    authFetch(`/api/dashboards/${dashboardId}`, accessToken)
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(d => {
        histDispatch({ type:'INIT', widgets: d.widgets || [] })
        setVersion(d.version || 1)
        setLoading(false)
      })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [accessToken, dashboardId])

  // Online/offline
  useEffect(() => {
    const onOnline  = () => { setIsOnline(true);  replayOfflineQueue() }
    const onOffline = () =>   setIsOnline(false)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    setIsOnline(navigator.onLine)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  async function queueOffline(widgetsToSave) {
    try {
      const { set, get } = await import('idb-keyval')
      const q = await get('dashboard_edit_queue') || []
      q.push({ id: Date.now(), widgets: widgetsToSave, dashboardId, version })
      await set('dashboard_edit_queue', q)
      setOfflineQueueLen(q.length)
    } catch {}
  }

  async function replayOfflineQueue() {
    if (!accessToken) return
    try {
      const { get, del } = await import('idb-keyval')
      const queue = await get('dashboard_edit_queue') || []
      if (!queue.length) return
      for (const edit of queue) {
        const res = await authFetch(`/api/dashboards/${dashboardId}`, accessToken, {
          method: 'PATCH',
          headers: { 'Content-Type':'application/json', 'X-CSRF-Token': getCsrf() },
          body: JSON.stringify({ widgets: edit.widgets, version }),
        })
        if (res.status === 409) {
          const data = await res.json()
          setConflict({ serverState: data.serverState, localWidgets: edit.widgets })
          break
        }
      }
      await del('dashboard_edit_queue')
      setOfflineQueueLen(0)
      setSaveMsg('✓ Offline edits synced')
    } catch {}
  }

  async function save(widgetsToSave) {
    if (!accessToken) return
    setSaving(true); setSaveMsg('')

    if (!navigator.onLine) {
      await queueOffline(widgetsToSave)
      setSaveMsg('Saved offline — will sync when reconnected')
      setSaving(false)
      return
    }

    try {
      const res = await authFetch(`/api/dashboards/${dashboardId}`, accessToken, {
        method: 'PATCH',
        headers: { 'Content-Type':'application/json', 'X-CSRF-Token': getCsrf() },
        body: JSON.stringify({ widgets: widgetsToSave, version }),
      })

      if (res.status === 409) {
        const data = await res.json()
        // Optimistic rollback — assignment §2.2
        histDispatch({ type:'INIT', widgets: data.serverState?.widgets || widgets })
        setConflict({ serverState: data.serverState, localWidgets: widgetsToSave })
        setSaving(false)
        return
      }
      if (res.ok) {
        const data = await res.json()
        setVersion(data.version)
        setSaveMsg('✓ Saved')
        setTimeout(() => setSaveMsg(''), 2500)
      } else {
        setSaveMsg(`Save failed: HTTP ${res.status}`)
      }
    } catch (e) { setSaveMsg('Save failed — ' + e.message) }
    setSaving(false)
  }

  function addWidget() {
    const w = { id:`w${Date.now()}`, type:'counter',
      title:`Widget ${widgets.length + 1}`, serviceId:'svc1' }
    histDispatch({ type:'SET', widgets: [...widgets, w] })
  }

  function removeWidget(id) {
    histDispatch({ type:'SET', widgets: widgets.filter(w => w.id !== id) })
  }

  function renameWidget(id, title) {
    histDispatch({ type:'SET', widgets: widgets.map(w => w.id===id ? {...w, title} : w) })
  }

  function onDragStart(i) { setDragIdx(i) }
  function onDragOver(e, i) {
    e.preventDefault()
    if (dragIdx === null || dragIdx === i) return
    const next = [...widgets]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(i, 0, moved)
    histDispatch({ type:'SET', widgets: next })
    setDragIdx(i)
  }
  function onDragEnd() { setDragIdx(null) }

  if (!accessToken) return (
    <div style={{ minHeight:'100vh', background:'#030712', display:'flex',
      alignItems:'center', justifyContent:'center', color:'#475569',
      fontFamily:'JetBrains Mono, monospace', fontSize:13 }}>
      Loading session…
    </div>
  )

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#030712', display:'flex',
      alignItems:'center', justifyContent:'center', color:'#475569',
      fontFamily:'JetBrains Mono, monospace', fontSize:13 }}>
      Loading dashboard…
    </div>
  )

  if (error) return (
    <div style={{ minHeight:'100vh', background:'#030712', padding:24,
      fontFamily:'JetBrains Mono, monospace' }}>
      <Link href={`/t/${tenantSlug}/projects`}
        style={{ color:'#0284c7', fontSize:11, textDecoration:'none' }}>← Projects</Link>
      <div style={{ color:'#f87171', marginTop:20, fontSize:13 }}>Error: {error}</div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#030712',
      fontFamily:'JetBrains Mono, monospace', display:'flex', flexDirection:'column' }}>

      {/* Top bar */}
      <div style={{ height:44, background:'#080d16', borderBottom:'1px solid #0f1a2e',
        display:'flex', alignItems:'center', padding:'0 14px', gap:10, flexShrink:0 }}>
        <Link href={`/t/${tenantSlug}/projects`}
          style={{ fontSize:10, color:'#475569', textDecoration:'none' }}>← Projects</Link>
        <span style={{ color:'#1e293b' }}>/</span>
        <span style={{ fontSize:11, color:'#f1f5f9', fontWeight:700 }}>
          Dashboard: {dashboardId}
        </span>
        <span style={{ fontSize:9, color:'#334155' }}>v{version}</span>
        <div style={{ flex:1 }} />

        {!isOnline && (
          <span role="status" style={{ fontSize:10, color:'#fbbf24',
            background:'#3d1f00', padding:'2px 8px', borderRadius:4 }}>
            ● Offline {offlineQueueLen > 0 ? `(${offlineQueueLen} queued)` : ''}
          </span>
        )}

        <button onClick={() => histDispatch({ type:'UNDO' })}
          disabled={!histState.past.length}
          aria-label={`Undo (${histState.past.length} available)`}
          style={{ background:'none', border:'1px solid #1e293b',
            color:histState.past.length ? '#94a3b8' : '#1e293b',
            borderRadius:4, padding:'3px 10px', fontSize:11,
            fontFamily:'inherit', cursor:histState.past.length ? 'pointer' : 'default' }}>
          ↩ Undo
        </button>
        <button onClick={() => histDispatch({ type:'REDO' })}
          disabled={!histState.future.length}
          aria-label={`Redo (${histState.future.length} available)`}
          style={{ background:'none', border:'1px solid #1e293b',
            color:histState.future.length ? '#94a3b8' : '#1e293b',
            borderRadius:4, padding:'3px 10px', fontSize:11,
            fontFamily:'inherit', cursor:histState.future.length ? 'pointer' : 'default' }}>
          ↪ Redo
        </button>
        <button onClick={addWidget}
          style={{ background:'#0c4a6e', border:'1px solid #0284c7', color:'#38bdf8',
            borderRadius:4, padding:'3px 10px', fontSize:11, fontFamily:'inherit', cursor:'pointer' }}>
          + Widget
        </button>
        <button onClick={() => save(widgets)} disabled={saving} aria-busy={saving}
          style={{ background:'#052e16', border:'1px solid #16a34a', color:'#4ade80',
            borderRadius:4, padding:'3px 10px', fontSize:11, fontFamily:'inherit', cursor:'pointer' }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saveMsg && (
          <span role="status" aria-live="polite"
            style={{ fontSize:10, color:saveMsg.includes('✓') ? '#4ade80' : '#fbbf24' }}>
            {saveMsg}
          </span>
        )}
      </div>

      {/* History info bar */}
      <div style={{ padding:'4px 14px', background:'#060b12',
        borderBottom:'1px solid #0a1220', fontSize:9, color:'#334155',
        display:'flex', gap:16 }}>
        <span>Undo history: {histState.past.length}/{MAX_HISTORY} steps</span>
        <span>Undo: {histState.past.length} · Redo: {histState.future.length}</span>
        <span style={{ flex:1 }} />
        <span>Drag rows to reorder · Click × to remove · Edit title inline</span>
      </div>

      {/* Widget grid */}
      <div style={{ flex:1, padding:20, overflowY:'auto' }}>
        {widgets.length === 0 ? (
          <div style={{ color:'#334155', textAlign:'center', marginTop:60, fontSize:13 }}>
            No widgets yet — click <strong style={{ color:'#38bdf8' }}>+ Widget</strong> to add one.
          </div>
        ) : (
          <div style={{ display:'grid',
            gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:12 }}
            role="list" aria-label="Dashboard widgets">
            {widgets.map((w, i) => (
              <div key={w.id}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragOver={e => onDragOver(e, i)}
                onDragEnd={onDragEnd}
                role="listitem"
                aria-label={`Widget: ${w.title}. Drag to reorder.`}
                style={{ background:'#080d16',
                  border:`1px solid ${dragIdx===i ? '#0284c7' : '#0f172a'}`,
                  borderRadius:8, padding:16, cursor:'grab' }}>
                <div style={{ display:'flex', justifyContent:'space-between',
                  alignItems:'center', marginBottom:10 }}>
                  <div style={{ fontSize:9, color:'#475569', fontWeight:700,
                    textTransform:'uppercase', letterSpacing:'.08em' }}>{w.type}</div>
                  <button onClick={() => removeWidget(w.id)}
                    aria-label={`Remove ${w.title}`}
                    style={{ background:'none', border:'none', color:'#334155',
                      fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>×</button>
                </div>
                <input value={w.title}
                  onChange={e => renameWidget(w.id, e.target.value)}
                  aria-label={`Widget title: ${w.title}`}
                  style={{ width:'100%', background:'#0a0f1a', border:'1px solid #1e293b',
                    borderRadius:4, color:'#f1f5f9', padding:'5px 8px',
                    fontSize:12, fontFamily:'inherit', outline:'none', marginBottom:8 }} />
                <div style={{ fontSize:11, color:'#334155' }}>Service: {w.serviceId}</div>
                <div style={{ height:40, background:'#040810', borderRadius:4, marginTop:8,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:11, color:'#1e293b' }}>
                  {w.type === 'counter' ? '— metric —' : '∿ chart preview'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Conflict dialog */}
      {conflict && (
        <ConflictDialog
          serverState={conflict.serverState}
          localWidgets={conflict.localWidgets}
          onAcceptServer={() => {
            histDispatch({ type:'INIT', widgets: conflict.serverState?.widgets || [] })
            setVersion(conflict.serverState?.version || version)
            setConflict(null)
            setSaveMsg('Using server version')
          }}
          onAcceptLocal={() => {
            save(conflict.localWidgets)
            setConflict(null)
          }}
          onDismiss={() => setConflict(null)}
        />
      )}
    </div>
  )
}
