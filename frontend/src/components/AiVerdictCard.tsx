import { useEffect, useState, useRef, useCallback } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

interface VersionVerdict {
  label: string
  score: number
  strengths: string[]
  weaknesses: string[]
  best_for: string
}

interface Verdict {
  winner_label: string
  confidence: string
  summary: string
  per_version: VersionVerdict[]
  metric_interpretations: {
    dynamic_range: string
    loudness: string
    frequency: string
    stereo: string
  }
}

interface Props {
  analysisId: string
}

export function AiVerdictCard({ analysisId }: Props) {
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [rawStream, setRawStream] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const abortRef = useRef<AbortController | null>(null)

  const streamVerdict = useCallback(async () => {
    setStreaming(true)
    setRawStream('')
    abortRef.current = new AbortController()

    try {
      const response = await fetch(
        `${API}/api/v1/analyses/${analysisId}/verdict/stream`,
        { signal: abortRef.current.signal },
      )
      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        accumulated += chunk
        setRawStream(accumulated)
      }

      // Try to parse the full accumulated JSON
      try {
        const parsed: Verdict = JSON.parse(accumulated)
        setVerdict(parsed)
      } catch {
        setError('AI returned an unexpected response. Please try again.')
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') {
        setError('Could not reach the AI service.')
      }
    } finally {
      setStreaming(false)
    }
  }, [analysisId])

  useEffect(() => {
    // Try to load already-stored verdict first
    axios
      .get<Verdict>(`${API}/api/v1/analyses/${analysisId}/verdict`)
      .then(res => setVerdict(res.data))
      .catch(() => {
        // Not ready yet — stream it
        streamVerdict()
      })

    return () => abortRef.current?.abort()
  }, [analysisId, streamVerdict])

  const confidenceColor = (c: string) => {
    if (c === 'high') return '#4ade80'
    if (c === 'medium') return '#facc15'
    return '#888'
  }

  if (error) {
    return (
      <div style={{
        background: '#1a1a1a', borderRadius: 8, padding: '20px',
        color: '#f87171', fontSize: 13,
      }}>
        {error}
      </div>
    )
  }

  if (streaming && !verdict) {
    return (
      <div style={{ background: '#1a1a1a', borderRadius: 8, padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: '#888' }}>AI is thinking…</span>
          <Spinner />
        </div>
        {rawStream && (
          <pre style={{
            fontSize: 11, color: '#555', fontFamily: 'monospace',
            whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'hidden',
          }}>
            {rawStream}
          </pre>
        )}
      </div>
    )
  }

  if (!verdict) {
    return (
      <div style={{ background: '#1a1a1a', borderRadius: 8, padding: '20px' }}>
        <p style={{ color: '#888', fontSize: 13 }}>Loading AI analysis…</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Winner card */}
      <div style={{
        background: '#1a1a1a',
        borderRadius: 8,
        padding: '20px',
        border: '1px solid #2a2a2a',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: '#555', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
              AI Verdict
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#facc15' }}>
              ★ {verdict.winner_label}
            </div>
          </div>
          <span style={{
            background: confidenceColor(verdict.confidence),
            color: '#000',
            fontSize: 10,
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: 12,
            textTransform: 'uppercase',
          }}>
            {verdict.confidence} confidence
          </span>
        </div>
        <p style={{ fontSize: 13, color: '#aaa', lineHeight: 1.6, marginBottom: 12 }}>
          {verdict.summary}
        </p>
        {/* Metric interpretations */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {Object.entries(verdict.metric_interpretations).map(([key, val]) => (
            <div key={key} style={{ background: '#111', borderRadius: 6, padding: '8px 10px' }}>
              <div style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>
                {key.replace('_', ' ')}
              </div>
              <div style={{ fontSize: 11, color: '#888', lineHeight: 1.4 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-version cards */}
      {verdict.per_version.map((v, i) => (
        <div key={i} style={{
          background: '#1a1a1a',
          borderRadius: 8,
          padding: '16px 20px',
          border: v.label === verdict.winner_label ? '1px solid #facc1540' : '1px solid #2a2a2a',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#e5e5e5', fontWeight: 600 }}>{v.label}</span>
              {v.label === verdict.winner_label && (
                <span style={{ fontSize: 10, color: '#facc15' }}>★ Best</span>
              )}
            </div>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#aaa' }}>{v.score}</span>
          </div>

          {/* Score bar */}
          <div style={{ height: 4, background: '#2a2a2a', borderRadius: 2, marginBottom: 10, overflow: 'hidden' }}>
            <div style={{ width: `${v.score}%`, height: '100%', background: '#4f8ef7', borderRadius: 2 }} />
          </div>

          {/* Best for */}
          <div style={{ fontSize: 11, color: '#4f8ef7', marginBottom: 10 }}>
            Best for: {v.best_for}
          </div>

          {/* Strengths / weaknesses toggle */}
          <button
            onClick={() => setExpanded(prev => ({ ...prev, [v.label]: !prev[v.label] }))}
            style={{
              background: 'none', border: '1px solid #333', color: '#666',
              fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
            }}
          >
            {expanded[v.label] ? 'Hide details' : 'Show strengths & weaknesses'}
          </button>

          {expanded[v.label] && (
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                {v.strengths.map((s, j) => (
                  <div key={j} style={{ fontSize: 11, color: '#4ade80', marginBottom: 4 }}>✓ {s}</div>
                ))}
              </div>
              <div>
                {v.weaknesses.map((w, j) => (
                  <div key={j} style={{ fontSize: 11, color: '#f87171', marginBottom: 4 }}>✗ {w}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Disclaimer */}
      <p style={{ fontSize: 10, color: '#444', textAlign: 'center', margin: '4px 0' }}>
        AI analysis is a starting point — see the charts for the full data.
      </p>
    </div>
  )
}

function Spinner() {
  return (
    <div style={{
      width: 14, height: 14,
      border: '2px solid #333',
      borderTop: '2px solid #888',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}