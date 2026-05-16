'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@store/auth'

// Localization: en (default) and ja supported via URL prefix /ja/login
// Messages defined in messages/en.json and messages/ja.json
// Full next-intl integration requires i18n.js config (see i18n.js)
const MSGS = {
  en: { title:'Sign in', email:'Email', password:'Password', submit:'Sign in',
    submitting:'Signing in...', demo:'Demo accounts (password: "password")' },
  ja: { title:'サインイン', email:'メールアドレス', password:'パスワード',
    submit:'サインイン', submitting:'サインイン中...', demo:'デモアカウント（パスワード: "password"）' },
}

export default function LoginPage() {
  const { login, error } = useAuth()
  const router = useRouter()
  const [email, setEmail]       = useState('admin@acme.com')
  const [password, setPassword] = useState('password')
  const [busy, setBusy]         = useState(false)
  const [lang, setLang]         = useState('en')
  const m = MSGS[lang]

  async function handleSubmit(e) {
    e.preventDefault(); setBusy(true)
    const ok = await login(email, password)
    if (ok) router.push('/'); else setBusy(false)
  }

  const inp = { width:'100%', background:'#0a0f1a', border:'1px solid #1e293b', borderRadius:6,
    color:'#f1f5f9', padding:'9px 12px', fontSize:13, fontFamily:'inherit', outline:'none' }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#030712' }}>
      <div style={{ width:360, background:'#080d16', border:'1px solid #1e293b', borderRadius:12, padding:32 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:28 }}>
          <div style={{ width:28,height:28,borderRadius:6,background:'linear-gradient(135deg,#0ea5e9,#6366f1)',
            display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,color:'#fff',fontSize:14 }}>O</div>
          <span style={{ fontWeight:700, color:'#f1f5f9', fontSize:16 }}>ObsConsole</span>
          {/* Language switcher — i18n scaffold */}
          <div style={{ marginInlineStart:'auto', display:'flex', gap:4 }}>
            {['en','ja'].map(l => (
              <button key={l} onClick={() => setLang(l)} aria-label={`Switch to ${l}`}
                aria-pressed={lang===l}
                style={{ background:lang===l?'#0c4a6e':'none',border:'1px solid #1e293b',
                  color:lang===l?'#38bdf8':'#334155',borderRadius:3,
                  padding:'1px 6px',fontSize:9,fontFamily:'inherit' }}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <h1 style={{ fontSize:18, fontWeight:600, color:'#f1f5f9', marginBottom:24 }}>{m.title}</h1>

        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label htmlFor="email" style={{ fontSize:11,color:'#64748b',fontWeight:600,display:'block',marginBottom:5 }}>
              {m.email}
            </label>
            <input id="email" type="email" value={email} onChange={e=>setEmail(e.target.value)}
              required autoComplete="email" aria-required="true" style={inp} />
          </div>
          <div>
            <label htmlFor="password" style={{ fontSize:11,color:'#64748b',fontWeight:600,display:'block',marginBottom:5 }}>
              {m.password}
            </label>
            <input id="password" type="password" value={password} onChange={e=>setPassword(e.target.value)}
              required autoComplete="current-password" aria-required="true" style={inp} />
          </div>
          {error && (
            <p role="alert" aria-live="assertive"
               style={{ fontSize:12,color:'#f87171',background:'#160000',border:'1px solid #b91c1c',borderRadius:4,padding:'8px 12px' }}>
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} aria-busy={busy}
            style={{ background:'#0284c7',border:'none',borderRadius:6,color:'#fff',padding:10,
              fontSize:13,fontWeight:700,fontFamily:'inherit' }}>
            {busy ? m.submitting : m.submit}
          </button>
        </form>

        <div style={{ marginTop:20, padding:12, background:'#040810', borderRadius:6, fontSize:11 }}>
          <div style={{ fontWeight:700, color:'#475569', marginBottom:4 }}>{m.demo}</div>
          {[['admin@acme.com','owner'],['editor@acme.com','editor'],['viewer@acme.com','viewer']].map(([e,r])=>(
            <div key={e} style={{ display:'flex', justifyContent:'space-between', padding:'2px 0' }}>
              <span style={{ color:'#475569' }}>{e}</span>
              <span style={{ color:'#0284c7' }}>{r}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
