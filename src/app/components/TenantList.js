import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000'

async function fetchTenants() {
  try {
    const res = await fetch(`${API}/api/tenants`, { next: { tags: ['tenants'] } })
    if (!res.ok) return []
    const data = await res.json()
    return data.items || []
  } catch { return [] }
}

export default async function TenantList() {
  const tenants = await fetchTenants()

  if (!tenants.length) {
    return <p style={{ color:'#475569', fontSize:13 }}>No tenants found.</p>
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12 }}
         role="list" aria-label="Tenant list">
      {tenants.map(t => (
        <Link key={t.id} href={`/t/${t.slug}/projects`}
              role="listitem" aria-label={`Go to ${t.name}`}
              style={{
                background:'#080d16', border:'1px solid #0f172a', borderRadius:8,
                padding:20, textDecoration:'none', display:'block',
                transition:'border-color .15s',
              }}
              onFocus={e => e.currentTarget.style.borderColor='#0284c7'}
              onBlur={e => e.currentTarget.style.borderColor='#0f172a'}>
          <div style={{ fontWeight:700, color:'#f1f5f9', marginBottom:6, fontSize:14 }}>{t.name}</div>
          <div style={{ fontSize:11, color:'#475569', marginBottom:4 }}>Plan: {t.plan}</div>
          <div style={{ fontSize:11, color:'#0284c7' }}>/{t.slug}</div>
        </Link>
      ))}
    </div>
  )
}
