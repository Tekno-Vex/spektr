import { useCallback, useState } from 'react'
import type { FileRejection } from 'react-dropzone'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'

const API = 'http://localhost:8000'
const WS_BASE = 'ws://localhost:8000'

const ACCEPTED_TYPES = {
  'audio/mpeg': ['.mp3'],
  'audio/flac': ['.flac'],
  'audio/x-flac': ['.flac'],
  'audio/wav': ['.wav'],
  'audio/x-wav': ['.wav'],
  'audio/ogg': ['.ogg'],
  'audio/mp4': ['.m4a'],
}

const MAX_SIZE = 200 * 1024 * 1024 // 200 MB
const MAX_FILES = 5

interface FileEntry {
  file: File
  label: string
  progress: number
  status: 'idle' | 'uploading' | 'done' | 'error'
  error?: string
}

interface WsEvent {
  stage: string
  pct: number
}

const STAGES = ['Loading', 'Waveform', 'Spectrogram', 'Loudness', 'Frequency', 'AI', 'Done']

export function UploadZone() {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [rejections, setRejections] = useState<string[]>([])
  const [analysisId, setAnalysisId] = useState<number | null>(null)
  const [wsEvent, setWsEvent] = useState<WsEvent | null>(null)
  const [phase, setPhase] = useState<'pick' | 'uploading' | 'processing' | 'done'>('pick')

  const updateEntry = (idx: number, patch: Partial<FileEntry>) =>
    setEntries(prev => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)))

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      setRejections(rejected.map(r => `${r.file.name}: ${r.errors[0]?.message}`))
      const next = accepted.slice(0, MAX_FILES - entries.length).map(f => ({
        file: f,
        label: f.name.replace(/\.[^.]+$/, ''),
        progress: 0,
        status: 'idle' as const,
      }))
      setEntries(prev => [...prev, ...next])
    },
    [entries.length],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE,
    maxFiles: MAX_FILES,
    disabled: phase !== 'pick',
  })

  const removeEntry = (idx: number) =>
    setEntries(prev => prev.filter((_, i) => i !== idx))

  const connectWs = (id: number, retry = 0) => {
    const ws = new WebSocket(`${WS_BASE}/ws/analyses/${id}`)
    ws.onmessage = e => {
      const data: WsEvent = JSON.parse(e.data)
      setWsEvent(data)
      if (data.stage === 'Done') {
        setPhase('done')
        ws.close()
      }
    }
    ws.onerror = () => {
      if (retry < 5) {
        const delay = Math.min(1000 * 2 ** retry, 30_000)
        setTimeout(() => connectWs(id, retry + 1), delay)
      }
    }
    ws.onclose = e => {
      if (!e.wasClean && retry < 5) {
        const delay = Math.min(1000 * 2 ** retry, 30_000)
        setTimeout(() => connectWs(id, retry + 1), delay)
      }
    }
  }

  const handleUpload = async () => {
    if (entries.length === 0) return
    setPhase('uploading')

    // 1. Create analysis
    const { data: analysis } = await axios.post(
      `${API}/api/v1/analyses`,
      new URLSearchParams({ title: 'New Analysis' }),
    )
    const id: number = analysis.id
    setAnalysisId(id)

    // 2. Upload each file sequentially with progress tracking
    for (let i = 0; i < entries.length; i++) {
      updateEntry(i, { status: 'uploading' })
      const form = new FormData()
      form.append('file', entries[i].file)
      if (entries[i].label) form.append('label', entries[i].label)

      try {
        await axios.post(`${API}/api/v1/analyses/${id}/files`, form, {
          onUploadProgress: e => {
            const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 0
            updateEntry(i, { progress: pct })
          },
        })
        updateEntry(i, { status: 'done', progress: 100 })
      } catch (err: unknown) {
        const msg =
          axios.isAxiosError(err) ? err.response?.data?.detail ?? 'Upload failed' : 'Upload failed'
        updateEntry(i, { status: 'error', error: msg })
      }
    }

    // 3. Enqueue processing
    await axios.post(`${API}/api/v1/analyses/${id}/process`)
    setPhase('processing')

    // 4. Open WebSocket for live progress
    connectWs(id)
  }

  const reset = () => {
    setEntries([])
    setRejections([])
    setAnalysisId(null)
    setWsEvent(null)
    setPhase('pick')
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', fontFamily: 'sans-serif', padding: 24 }}>
      <h1 style={{ marginBottom: 8 }}>Spektr — Upload Audio</h1>
      <p style={{ color: '#888', marginBottom: 24 }}>
        Upload up to 5 audio files (.mp3 .flac .wav .ogg .m4a) · max 200 MB each
      </p>

      {/* Drop zone */}
      {phase === 'pick' && (
        <div
          {...getRootProps()}
          style={{
            border: `2px dashed ${isDragActive ? '#4f8ef7' : '#555'}`,
            borderRadius: 12,
            padding: '40px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: isDragActive ? '#1a2a44' : '#111',
            transition: 'all 0.2s',
            marginBottom: 16,
          }}
        >
          <input {...getInputProps()} />
          <p style={{ color: isDragActive ? '#4f8ef7' : '#aaa', margin: 0 }}>
            {isDragActive ? 'Drop files here…' : 'Drag & drop audio files, or click to browse'}
          </p>
        </div>
      )}

      {/* Rejection errors */}
      {rejections.length > 0 && (
        <ul style={{ color: '#f87171', paddingLeft: 20, marginBottom: 16 }}>
          {rejections.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}

      {/* File list */}
      {entries.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, marginBottom: 16 }}>
          {entries.map((e, i) => (
            <li
              key={i}
              style={{
                background: '#1a1a1a',
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 13, color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {e.file.name}
                </span>
                <span style={{ fontSize: 11, color: '#666' }}>
                  {(e.file.size / 1024 / 1024).toFixed(1)} MB
                </span>
                {phase === 'pick' && (
                  <button
                    onClick={() => removeEntry(i)}
                    style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 16 }}
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Label input */}
              {phase === 'pick' && (
                <input
                  value={e.label}
                  onChange={ev => updateEntry(i, { label: ev.target.value })}
                  placeholder="Label (e.g. Original 1968, Remaster 2002)"
                  style={{
                    marginTop: 8,
                    width: '100%',
                    background: '#2a2a2a',
                    border: '1px solid #444',
                    borderRadius: 6,
                    padding: '6px 10px',
                    color: '#fff',
                    fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                />
              )}

              {/* Upload progress bar */}
              {(phase === 'uploading' || e.status === 'done') && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ height: 6, background: '#333', borderRadius: 3, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${e.progress}%`,
                        background: e.status === 'error' ? '#f87171' : '#4f8ef7',
                        transition: 'width 0.2s',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 11, color: '#888', marginTop: 2, display: 'block' }}>
                    {e.status === 'error' ? e.error : e.status === 'done' ? 'Uploaded' : `${e.progress}%`}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Upload button */}
      {phase === 'pick' && entries.length > 0 && (
        <button
          onClick={handleUpload}
          style={{
            width: '100%',
            padding: '12px 0',
            background: '#4f8ef7',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Upload {entries.length} file{entries.length > 1 ? 's' : ''}
        </button>
      )}

      {/* WebSocket progress */}
      {phase === 'processing' && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ color: '#ccc', marginBottom: 12 }}>Analysing…</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STAGES.map(stage => {
              const done = wsEvent
                ? STAGES.indexOf(stage) < STAGES.indexOf(wsEvent.stage) ||
                  stage === wsEvent.stage
                : false
              const active = wsEvent?.stage === stage
              return (
                <span
                  key={stage}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 20,
                    fontSize: 12,
                    background: done ? '#4f8ef7' : '#222',
                    color: done ? '#fff' : '#555',
                    fontWeight: active ? 700 : 400,
                    transition: 'all 0.3s',
                  }}
                >
                  {stage}
                </span>
              )
            })}
          </div>
          {wsEvent && (
            <div style={{ marginTop: 16 }}>
              <div style={{ height: 8, background: '#222', borderRadius: 4, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${wsEvent.pct}%`,
                    background: '#4f8ef7',
                    transition: 'width 0.4s',
                  }}
                />
              </div>
              <span style={{ fontSize: 12, color: '#888', marginTop: 4, display: 'block' }}>
                {wsEvent.stage} — {wsEvent.pct}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Done */}
      {phase === 'done' && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <p style={{ color: '#4ade80', fontSize: 18, fontWeight: 600 }}>Analysis complete!</p>
          {analysisId && (
            <p style={{ color: '#888', fontSize: 13 }}>Analysis ID: {analysisId}</p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 12,
              padding: '10px 24px',
              background: '#4f8ef7',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Upload another
          </button>
        </div>
      )}
    </div>
  )
}
