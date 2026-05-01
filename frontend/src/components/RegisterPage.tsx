import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setError(null)
    setLoading(true)
    try {
      await register(email, password)
      navigate('/dashboard')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Create account</h1>
        <p style={{ color: '#666', fontSize: 13, marginBottom: 24 }}>
          Already have an account? <Link to="/login" style={{ color: '#4f8ef7' }}>Sign in</Link>
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input type="email" placeholder="Email" value={email}
            onChange={e => setEmail(e.target.value)} required style={inputStyle} />
          <input type="password" placeholder="Password (min 8 characters)" value={password}
            onChange={e => setPassword(e.target.value)} required style={inputStyle} />
          {error && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{error}</p>}
          <button type="submit" disabled={loading} style={btnStyle}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p style={{ marginTop: 20, fontSize: 12, color: '#555', textAlign: 'center' }}>
          <Link to="/" style={{ color: '#555' }}>← Continue without signing in</Link>
        </p>
      </div>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh', background: '#0d0d0d', display: 'flex',
  alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif',
}
const cardStyle: React.CSSProperties = {
  background: '#1a1a1a', borderRadius: 12, padding: '40px 36px',
  width: '100%', maxWidth: 380, color: '#e5e5e5',
}
const inputStyle: React.CSSProperties = {
  background: '#111', border: '1px solid #333', borderRadius: 6,
  padding: '10px 14px', color: '#e5e5e5', fontSize: 14, width: '100%',
}
const btnStyle: React.CSSProperties = {
  background: '#4f8ef7', color: '#fff', border: 'none', borderRadius: 6,
  padding: '11px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
}