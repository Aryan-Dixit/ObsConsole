export default function AlertBanner({ message, type = 'info' }) {
  const colors = { info:'#0284c7', warning:'#d97706', error:'#dc2626' }
  return (
    <div role="alert" aria-live="polite" style={{
      background:`${colors[type]}15`, border:`1px solid ${colors[type]}`,
      borderRadius:6, padding:'8px 12px', marginBottom:12, fontSize:12,
      color: colors[type],
    }}>
      {message}
    </div>
  )
}
