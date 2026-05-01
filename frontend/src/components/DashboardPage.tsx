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

const STATUS_COLORS: Record<string, string> = {
  completed: 'var(--green)',
  done:      'var(--green)',
  failed:    'var(--red)',
  pending:   'var(--amber)',
  processing:'var(--accent-2)',
}

export function DashboardPage() {
  const { user, accessToken, logout } = useAuth()
  const navigate = useNavigate()
  const [analyses, setAnalyses] = useState<AnalysisItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken) { navigate('/login'); return }
    axios
      .get(`${API}/analyses`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(res => setAnalyses(res.data.items))
      .catch(() => setError('Could not load your analyses.'))
      .finally(() => setLoading(false))
  }, [accessToken, navigate])

  const handleLogout = async () => { await logout(); navigate('/') }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font)', color: 'var(--text)' }}>

      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', height: 56, borderBottom: '1px solid var(--border)',
        background: 'rgba(8,11,15,0.8)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <Link to="/" style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em', color: 'var(--text)' }}>
          <span style={{ color: 'var(--accent-2)' }}>S</span>pektr
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{user?.email}</span>
          <button onClick={handleLogout} style={navBtnStyle}>Sign out</button>
        </div>
      </header>

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '48px 24px' }}>

        {/* Page title row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>My Analyses</h1>
            <p style={{ color: 'var(--text-3)', fontSize: 13, margin: 0 }}>
              {analyses.length > 0 ? `${analyses.length} comparison${analyses.length !== 1 ? 's' : ''}` : 'No analyses yet'}
            </p>
          </div>
          <Link to="/" style={newBtnStyle}>+ New analysis</Link>
        </div>

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ height: 64, background: 'var(--bg-2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', opacity: 0.5 }} />
            ))}
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius)', padding: '14px 18px' }}>
            <p style={{ color: 'var(--red)', fontSize: 13, margin: 0 }}>{error}</p>
          </div>
        )}

        {!loading && !error && analyses.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '80px 24px',
            background: 'var(--bg-2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
          }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>♪</div>
            <p style={{ fontSize: 15, color: 'var(--text-2)', marginBottom: 6 }}>No analyses yet</p>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 24 }}>Upload your first audio files to start comparing.</p>
            <Link to="/" style={newBtnStyle}>Upload files →</Link>
          </div>
        )}

        {analyses.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {analyses.map(a => {
              const statusColor = STATUS_COLORS[a.status] ?? 'var(--text-3)'
              const isReady = a.status === 'completed' || a.status === 'done'
              return (
                <div key={a.id} style={{
                  background: 'var(--bg-2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', padding: '16px 20px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'border-color var(--transition)',
                }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-2)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: 'var(--bg-3)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, color: 'var(--text-3)',
                    }}>
                      #{a.id}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3 }}>
                        {a.title || `Analysis #${a.id}`}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          {a.created_at ? new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 500, padding: '2px 7px',
                          borderRadius: 10, background: `${statusColor}18`,
                          color: statusColor, textTransform: 'capitalize',
                        }}>
                          {a.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  {isReady ? (
                    <Link to={`/results/${a.id}`} style={{
                      fontSize: 12, color: 'var(--accent-2)', fontWeight: 500,
                      padding: '7px 14px', background: 'var(--accent-glow)',
                      borderRadius: 6, border: '1px solid rgba(99,102,241,0.2)',
                    }}>
                      View →
                    </Link>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Processing…</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const navBtnStyle: React.CSSProperties = {
  background: 'var(--bg-3)', border: '1px solid var(--border)',
  color: 'var(--text-2)', fontSize: 12, padding: '6px 12px',
  borderRadius: 6, cursor: 'pointer',
}
const newBtnStyle: React.CSSProperties = {
  background: 'var(--accent)', color: '#fff', border: 'none',
  fontSize: 13, fontWeight: 500, padding: '8px 16px',
  borderRadius: 8, cursor: 'pointer', display: 'inline-block',
}
