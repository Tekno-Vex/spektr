import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={pageStyle}>
      {/* Background grid */}
      <div style={bgGridStyle} />

      <div style={wrapStyle}>
        {/* Logo */}
        <div style={{ marginBottom: 40, textAlign: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 22, letterSpacing: '-0.03em', color: 'var(--text)' }}>
            <span style={{ color: 'var(--accent-2)' }}>S</span>pektr
          </span>
        </div>

        <div style={cardStyle}>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6, color: 'var(--text)' }}>
              Welcome back
            </h1>
            <p style={{ color: 'var(--text-3)', fontSize: 13 }}>
              Don't have an account?{' '}
              <Link to="/register" style={{ color: 'var(--accent-2)', fontWeight: 500 }}>Create one</Link>
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={labelStyle}>Email</label>
              <input
                type="email" placeholder="you@example.com"
                value={email} onChange={e => setEmail(e.target.value)}
                required style={inputStyle}
                onFocus={e => Object.assign(e.target.style, inputFocusStyle)}
                onBlur={e => Object.assign(e.target.style, inputBlurStyle)}
              />
            </div>
            <div>
              <label style={labelStyle}>Password</label>
              <input
                type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)}
                required style={inputStyle}
                onFocus={e => Object.assign(e.target.style, inputFocusStyle)}
                onBlur={e => Object.assign(e.target.style, inputBlurStyle)}
              />
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '9px 13px' }}>
                <p style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{error}</p>
              </div>
            )}

            <button type="submit" disabled={loading} style={{ ...btnStyle, opacity: loading ? 0.65 : 1 }}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--text-3)' }}>
          <Link to="/" style={{ color: 'var(--text-3)' }}>← Continue without signing in</Link>
        </p>
      </div>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh', background: 'var(--bg)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'var(--font)', position: 'relative', overflow: 'hidden',
}
const bgGridStyle: React.CSSProperties = {
  position: 'absolute', inset: 0, pointerEvents: 'none',
  backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
  backgroundSize: '48px 48px', opacity: 0.4,
}
const wrapStyle: React.CSSProperties = {
  width: '100%', maxWidth: 400, padding: '0 24px', position: 'relative', zIndex: 1,
}
const cardStyle: React.CSSProperties = {
  background: 'var(--bg-2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', padding: '32px 28px',
  boxShadow: 'var(--shadow-lg)',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 500,
  color: 'var(--text-2)', marginBottom: 6,
}
const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-3)',
  border: '1px solid var(--border-2)', borderRadius: 8,
  padding: '10px 13px', color: 'var(--text)', fontSize: 13,
  outline: 'none', transition: 'border-color 0.15s',
}
const inputFocusStyle = { borderColor: 'var(--accent)' }
const inputBlurStyle  = { borderColor: 'var(--border-2)' }
const btnStyle: React.CSSProperties = {
  background: 'var(--accent)', color: '#fff', border: 'none',
  borderRadius: 8, padding: '11px', fontSize: 14,
  fontWeight: 600, cursor: 'pointer', marginTop: 4,
  transition: 'opacity 0.15s',
}
