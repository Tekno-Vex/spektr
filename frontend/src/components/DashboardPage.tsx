import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'

const API = `${import.meta.env.VITE_API_URL ?? 'http://localhost:8000'}/api/v1`

interface AnalysisItem {
  id: number
  title: string | null
  status: string
  is_public: string
  created_at: string | null
}

export function DashboardPage() {
  const { user, accessToken, logout } = useAuth()
  const navigate = useNavigate()
  const [analyses, setAnalyses] = useState<AnalysisItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken) {
      navigate('/login')
      return
    }
    axios
      .get(`${API}/analyses`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      .then(res => setAnalyses(res.data.items))
      .catch(() => setError('Could not load your analyses.'))
      .finally(() => setLoading(false))
  }, [accessToken, navigate])

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d0d', color: '#e5e5e5', fontFamily: 'sans-serif', padding: '40px 32px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>My Analyses</h1>
            <p style={{ color: '#555', fontSize: 13, margin: 0 }}>{user?.email}</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link to="/" style={btnOutlineStyle}>+ New Analysis</Link>
            <button onClick={handleLogout} style={btnOutlineStyle}>Sign out</button>
          </div>
        </div>

        {/* Content */}
        {loading && <p style={{ color: '#666' }}>Loading…</p>}
        {error && <p style={{ color: '#f87171' }}>{error}</p>}
        {!loading && !error && analyses.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#555' }}>
            <p style={{ fontSize: 15, marginBottom: 16 }}>No analyses yet.</p>
            <Link to="/" style={{ color: '#4f8ef7', fontSize: 14 }}>Upload your first files →</Link>
          </div>
        )}

        {analyses.map(a => (
          <div key={a.id} style={{
            background: '#1a1a1a', borderRadius: 8, padding: '16px 20px',
            marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                {a.title || `Analysis #${a.id}`}
              </div>
              <div style={{ fontSize: 11, color: '#555' }}>
                {a.created_at ? new Date(a.created_at).toLocaleDateString() : ''}
                {' · '}
                <span style={{ color: a.status === 'completed' ? '#4ade80' : '#facc15' }}>{a.status}</span>
              </div>
            </div>
            <Link
              to={`/results/${a.id}`}
              style={{ color: '#4f8ef7', fontSize: 13, textDecoration: 'none' }}
            >
              View →
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}

const btnOutlineStyle: React.CSSProperties = {
  background: '#1e1e1e', border: '1px solid #333', color: '#aaa',
  fontSize: 12, padding: '8px 14px', borderRadius: 6, cursor: 'pointer',
  textDecoration: 'none', display: 'inline-block',
}