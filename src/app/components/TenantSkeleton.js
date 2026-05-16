export default function TenantSkeleton({ count = 3 }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} aria-hidden="true" style={{
          background:'#080d16', border:'1px solid #0f172a', borderRadius:8,
          padding:20, height:120,
          animation:'pulse 1.5s ease-in-out infinite',
        }}>
          <div style={{ height:14, background:'#1e293b', borderRadius:4, marginBottom:10, width:'60%' }} />
          <div style={{ height:10, background:'#1e293b', borderRadius:4, marginBottom:8, width:'40%' }} />
          <div style={{ height:10, background:'#1e293b', borderRadius:4, width:'50%' }} />
        </div>
      ))}
      <span className="sr-only">Loading tenants...</span>
    </div>
  )
}
