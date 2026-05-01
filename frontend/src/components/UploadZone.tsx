import { useNavigate, Link } from 'react-router-dom'
import { useCallback, useState, useRef, useEffect } from 'react'
import type { FileRejection } from 'react-dropzone'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const WS_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace('https://', 'wss://').replace('http://', 'ws://')

const ACCEPTED_TYPES = {
  'audio/mpeg': ['.mp3'],
  'audio/flac': ['.flac'],
  'audio/x-flac': ['.flac'],
  'audio/wav': ['.wav'],
  'audio/x-wav': ['.wav'],
  'audio/ogg': ['.ogg'],
  'audio/mp4': ['.m4a'],
}

const MAX_SIZE = 200 * 1024 * 1024
const MAX_FILES = 5
const STAGES = ['Loading', 'Waveform', 'Spectrogram', 'Loudness', 'Frequency', 'AI', 'Done']

interface FileEntry {
  file: File
  label: string
  progress: number
  status: 'idle' | 'uploading' | 'done' | 'error'
  error?: string
}

interface WsEvent { stage: string; pct: number }

export function UploadZone() {
  const { user, accessToken, logout } = useAuth()
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [rejections, setRejections] = useState<string[]>([])
  const [analysisId, setAnalysisId] = useState<number | null>(null)
  const [wsEvent, setWsEvent] = useState<WsEvent | null>(null)
  const [phase, setPhase] = useState<'pick' | 'uploading' | 'processing' | 'done'>('pick')
  const wsConnected = useRef(false)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (phase !== 'processing' || analysisId === null) return
    const startPollTimer = setTimeout(() => {
      if (wsConnected.current) return
      pollIntervalRef.current = setInterval(async () => {
        try {
          const { data } = await axios.get(`${API}/api/v1/analyses/${analysisId}/status`)
          if (data.status === 'completed' || data.status === 'done') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
            navigate(`/results/${analysisId}`)
          }
        } catch { /* keep polling */ }
      }, 3000)
    }, 8000)
    return () => {
      clearTimeout(startPollTimer)
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [phase, analysisId, navigate])

  const updateEntry = (idx: number, patch: Partial<FileEntry>) =>
    setEntries(prev => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)))

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      setRejections(rejected.map(r => `${r.file.name}: ${r.errors[0]?.message}`))
      const next = accepted.slice(0, MAX_FILES - entries.length).map(f => ({
        file: f, label: f.name.replace(/\.[^.]+$/, ''), progress: 0, status: 'idle' as const,
      }))
      setEntries(prev => [...prev, ...next])
    },
    [entries.length],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: ACCEPTED_TYPES, maxSize: MAX_SIZE, maxFiles: MAX_FILES, disabled: phase !== 'pick',
  })

  const removeEntry = (idx: number) => setEntries(prev => prev.filter((_, i) => i !== idx))

  const connectWs = (id: number, retry = 0) => {
    const ws = new WebSocket(`${WS_BASE}/ws/analyses/${id}`)
    ws.onmessage = e => {
      wsConnected.current = true
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
      const data: WsEvent = JSON.parse(e.data)
      setWsEvent(data)
      if (data.stage === 'Done') { setPhase('done'); ws.close(); navigate(`/results/${id}`) }
    }
    ws.onerror = () => { if (retry < 5) setTimeout(() => connectWs(id, retry + 1), Math.min(1000 * 2 ** retry, 30_000)) }
    ws.onclose = e => { if (!e.wasClean && retry < 5) setTimeout(() => connectWs(id, retry + 1), Math.min(1000 * 2 ** retry, 30_000)) }
  }

  const handleUpload = async () => {
    if (entries.length === 0) return
    setPhase('uploading')
    const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
    const { data: analysis } = await axios.post(
      `${API}/api/v1/analyses`,
      new URLSearchParams({ title: 'New Analysis' }),
      { headers },
    )
    const id: number = analysis.id
    setAnalysisId(id)
    for (let i = 0; i < entries.length; i++) {
      updateEntry(i, { status: 'uploading' })
      const form = new FormData()
      form.append('file', entries[i].file)
      if (entries[i].label) form.append('label', entries[i].label)
      try {
        await axios.post(`${API}/api/v1/analyses/${id}/files`, form, {
          headers,
          onUploadProgress: e => { const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 0; updateEntry(i, { progress: pct }) },
        })
        updateEntry(i, { status: 'done', progress: 100 })
      } catch (err: unknown) {
        const msg = axios.isAxiosError(err) ? err.response?.data?.detail ?? 'Upload failed' : 'Upload failed'
        updateEntry(i, { status: 'error', error: msg })
      }
    }
    await axios.post(`${API}/api/v1/analyses/${id}/process`, {}, { headers })
    setPhase('processing')
    connectWs(id)
  }

  const reset = () => {
    setEntries([]); setRejections([]); setAnalysisId(null); setWsEvent(null); setPhase('pick')
    wsConnected.current = false
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
  }

  const handleLogout = async () => { await logout(); navigate('/') }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font)', display: 'flex', flexDirection: 'column' }}>

      {/* ── Top nav ── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', height: 56, borderBottom: '1px solid var(--border)',
        background: 'rgba(8,11,15,0.8)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em', color: 'var(--text)' }}>
          <span style={{ color: 'var(--accent-2)' }}>S</span>pektr
        </span>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {user ? (
            <>
              <Link to="/dashboard" style={navLinkStyle}>
                <span style={{ color: 'var(--text-3)', fontSize: 11 }}>▤</span> My analyses
              </Link>
              <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{user.email}</span>
              <button onClick={handleLogout} style={navBtnStyle}>Sign out</button>
            </>
          ) : (
            <>
              <Link to="/dashboard" style={navLinkStyle}>My analyses</Link>
              <Link to="/login" style={navBtnAccentStyle}>Sign in</Link>
            </>
          )}
        </nav>
      </header>

      {/* ── Hero ── */}
      {phase === 'pick' && (
        <div style={{ textAlign: 'center', padding: '64px 24px 40px' }}>
          <div style={{
            display: 'inline-block', padding: '4px 12px', borderRadius: 20,
            background: 'var(--accent-glow)', color: 'var(--accent-2)',
            fontSize: 11, fontWeight: 500, letterSpacing: '0.06em',
            textTransform: 'uppercase', marginBottom: 20,
          }}>
            Audio Version Comparison
          </div>
          <h1 style={{
            fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 700,
            letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 16,
            background: 'linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Compare masters.<br />Hear the difference.
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 15, maxWidth: 480, margin: '0 auto' }}>
            Upload up to 5 audio files — Spektr computes waveforms, spectrograms, loudness metrics, and an AI verdict side by side.
          </p>
        </div>
      )}

      {/* ── Upload card ── */}
      <div style={{ maxWidth: 620, width: '100%', margin: '0 auto', padding: '0 24px 80px', flex: 1 }}>

        {/* Drop zone */}
        {phase === 'pick' && (
          <div
            {...getRootProps()}
            style={{
              border: `1.5px dashed ${isDragActive ? 'var(--accent)' : 'var(--border-2)'}`,
              borderRadius: 'var(--radius-lg)',
              padding: '48px 32px',
              textAlign: 'center',
              cursor: 'pointer',
              background: isDragActive ? 'var(--accent-glow)' : 'var(--bg-2)',
              transition: 'all var(--transition)',
              marginBottom: 16,
            }}
          >
            <input {...getInputProps()} />
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'var(--bg-3)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 16px', fontSize: 22,
            }}>
              ♪
            </div>
            <p style={{ color: isDragActive ? 'var(--accent-2)' : 'var(--text-2)', fontSize: 14, marginBottom: 8 }}>
              {isDragActive ? 'Release to add files' : 'Drop audio files here, or click to browse'}
            </p>
            <p style={{ color: 'var(--text-3)', fontSize: 12 }}>
              MP3 · FLAC · WAV · OGG · M4A &nbsp;·&nbsp; max 200 MB · up to 5 files
            </p>
          </div>
        )}

        {/* Rejection errors */}
        {rejections.length > 0 && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 12 }}>
            {rejections.map((r, i) => <p key={i} style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{r}</p>)}
          </div>
        )}

        {/* File list */}
        {entries.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {entries.map((e, i) => (
              <div key={i} style={{
                background: 'var(--bg-2)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, background: 'var(--bg-3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, color: 'var(--text-3)', flexShrink: 0,
                  }}>
                    {e.file.name.split('.').pop()?.toUpperCase()}
                  </div>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.file.name}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>
                    {(e.file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                  {phase === 'pick' && (
                    <button onClick={() => removeEntry(i)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 2, flexShrink: 0 }}>
                      ×
                    </button>
                  )}
                </div>

                {phase === 'pick' && (
                  <input
                    value={e.label}
                    onChange={ev => updateEntry(i, { label: ev.target.value })}
                    placeholder="Label (e.g. Original, 2024 Remaster)"
                    style={{
                      marginTop: 10, width: '100%',
                      background: 'var(--bg-3)', border: '1px solid var(--border)',
                      borderRadius: 6, padding: '7px 11px',
                      color: 'var(--text)', fontSize: 12,
                    }}
                  />
                )}

                {(phase === 'uploading' || e.status === 'done' || e.status === 'error') && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ height: 3, background: 'var(--bg-4)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${e.progress}%`,
                        background: e.status === 'error' ? 'var(--red)' : 'var(--accent)',
                        transition: 'width 0.2s',
                      }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, display: 'block' }}>
                      {e.status === 'error' ? e.error : e.status === 'done' ? '✓ Uploaded' : `${e.progress}%`}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Upload button */}
        {phase === 'pick' && entries.length > 0 && (
          <button onClick={handleUpload} style={{
            width: '100%', padding: '13px 0',
            background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 'var(--radius)',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            transition: 'opacity var(--transition)',
          }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            Analyse {entries.length} file{entries.length > 1 ? 's' : ''}
          </button>
        )}

        {/* Processing */}
        {phase === 'processing' && (
          <div style={{ marginTop: 8 }}>
            <div style={{
              background: 'var(--bg-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', padding: '32px 28px', textAlign: 'center',
            }}>
              <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>Analysing…</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 28 }}>
                This takes 2–4 minutes on the free tier. You can stay on this page.
              </p>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 24 }}>
                {STAGES.map((stage, idx) => {
                  const currentIdx = wsEvent ? STAGES.indexOf(wsEvent.stage) : -1
                  const isDone = idx < currentIdx || (wsEvent?.stage === stage)
                  const isActive = wsEvent?.stage === stage
                  return (
                    <span key={stage} style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                      background: isDone ? 'var(--accent-glow)' : 'var(--bg-3)',
                      color: isDone ? 'var(--accent-2)' : 'var(--text-3)',
                      border: isActive ? '1px solid var(--accent)' : '1px solid transparent',
                      transition: 'all 0.3s',
                    }}>
                      {stage}
                    </span>
                  )
                })}
              </div>

              {wsEvent && (
                <>
                  <div style={{ height: 4, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{
                      height: '100%', width: `${wsEvent.pct}%`,
                      background: 'linear-gradient(90deg, var(--accent), var(--accent-2))',
                      transition: 'width 0.4s',
                    }} />
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{wsEvent.stage} — {wsEvent.pct}%</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Done */}
        {phase === 'done' && (
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '32px 28px' }}>
              <p style={{ color: 'var(--green)', fontSize: 18, fontWeight: 600, marginBottom: 8 }}>✓ Analysis complete</p>
              <button onClick={reset} style={{
                padding: '10px 24px', background: 'var(--bg-3)',
                border: '1px solid var(--border-2)', color: 'var(--text-2)',
                borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}>
                Upload another
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const navLinkStyle: React.CSSProperties = {
  color: 'var(--text-2)', fontSize: 13, padding: '6px 10px',
  borderRadius: 6, transition: 'color 0.15s', display: 'flex', alignItems: 'center', gap: 5,
}
const navBtnStyle: React.CSSProperties = {
  background: 'var(--bg-3)', border: '1px solid var(--border)',
  color: 'var(--text-2)', fontSize: 12, padding: '6px 12px',
  borderRadius: 6, cursor: 'pointer',
}
const navBtnAccentStyle: React.CSSProperties = {
  background: 'var(--accent)', border: 'none',
  color: '#fff', fontSize: 12, padding: '6px 14px',
  borderRadius: 6, fontWeight: 500, display: 'inline-block',
}
