import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import type { ResultsResponse, FileResult } from '../types'
import { SpectrogramCanvas } from './SpectrogramCanvas'
import { WaveformChart } from './WaveformChart'
import { FrequencyChart } from './FrequencyChart'
import { LoudnessCard } from './LoudnessCard'
import { StereoCard } from './StereoCard'
import { SectionsTimeline } from './SectionsTimeline'

const API = 'http://localhost:8000'

const FILE_COLORS = ['#4f8ef7', '#f97316', '#a78bfa', '#34d399', '#f87171']

const SECTIONS = [
  { id: 'waveform',     label: 'Waveform' },
  { id: 'spectrogram',  label: 'Spectrogram' },
  { id: 'loudness',     label: 'Loudness' },
  { id: 'frequency',    label: 'Frequency' },
  { id: 'stereo',       label: 'Stereo' },
  { id: 'sections',     label: 'Sections' },
]

export function ResultsPage() {
  const { analysisId } = useParams<{ analysisId: string }>()
  const [results, setResults] = useState<FileResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState('waveform')
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    if (!analysisId) return
    axios
      .get<ResultsResponse>(`${API}/api/v1/analyses/${analysisId}/results`)
      .then(res => setResults(res.data.results))
      .catch(() => setError('Could not load results. Make sure the analysis has completed.'))
  }, [analysisId])

  // Intersection observer to update the active sidebar link as the user scrolls
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) setActiveSection(e.target.id)
        })
      },
      { threshold: 0.4 },
    )
    Object.values(sectionRefs.current).forEach(el => el && observer.observe(el))
    return () => observer.disconnect()
  }, [results])

  const scrollTo = (id: string) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (error) {
    return (
      <div style={{ maxWidth: 640, margin: '80px auto', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <p style={{ color: '#f87171', fontSize: 16 }}>{error}</p>
        <Link to="/" style={{ color: '#4f8ef7', fontSize: 14 }}>← Back to upload</Link>
      </div>
    )
  }

  if (!results) {
    return (
      <div style={{ maxWidth: 640, margin: '80px auto', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <p style={{ color: '#888' }}>Loading results…</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', fontFamily: 'sans-serif', minHeight: '100vh', background: '#0d0d0d', color: '#e5e5e5' }}>

      {/* ── Sticky sidebar ── */}
      <nav style={{
        position: 'sticky',
        top: 0,
        height: '100vh',
        width: 160,
        flexShrink: 0,
        padding: '32px 16px',
        borderRight: '1px solid #222',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}>
        <Link to="/" style={{ color: '#555', fontSize: 12, marginBottom: 20, textDecoration: 'none' }}>← Upload</Link>
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => scrollTo(s.id)}
            style={{
              background: 'none',
              border: 'none',
              textAlign: 'left',
              color: activeSection === s.id ? '#4f8ef7' : '#666',
              fontWeight: activeSection === s.id ? 600 : 400,
              fontSize: 13,
              cursor: 'pointer',
              padding: '6px 0',
              transition: 'color 0.2s',
            }}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* ── Main content ── */}
      <main style={{ flex: 1, padding: '32px 40px', maxWidth: 900 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Analysis #{analysisId}</h1>
        <p style={{ color: '#555', fontSize: 13, marginBottom: 36 }}>
          {results.length} file{results.length !== 1 ? 's' : ''} compared
        </p>

        {/* ── Waveform ── */}
        <Section id="waveform" label="Waveform" refMap={sectionRefs}>
          {results.map((r, i) => (
            <WaveformChart
              key={r.audio_file_id}
              points={r.waveform}
              label={`File ${i + 1}`}
              color={FILE_COLORS[i % FILE_COLORS.length]}
            />
          ))}
        </Section>

        {/* ── Spectrogram ── */}
        <Section id="spectrogram" label="Spectrogram" refMap={sectionRefs}>
          {results.map((r, i) => (
            <SpectrogramCanvas
              key={r.audio_file_id}
              data={r.spectrogram}
              label={`File ${i + 1}`}
            />
          ))}
        </Section>

        {/* ── Loudness ── */}
        <Section id="loudness" label="Loudness" refMap={sectionRefs}>
          {results.map((r, i) => (
            <LoudnessCard
              key={r.audio_file_id}
              data={r.loudness}
              label={`File ${i + 1}`}
            />
          ))}
        </Section>

        {/* ── Frequency ── */}
        <Section id="frequency" label="Frequency Response" refMap={sectionRefs}>
          {results.map((r, i) => (
            <FrequencyChart
              key={r.audio_file_id}
              data={r.frequency}
              label={`File ${i + 1}`}
              color={FILE_COLORS[i % FILE_COLORS.length]}
            />
          ))}
        </Section>

        {/* ── Stereo ── */}
        <Section id="stereo" label="Stereo Analysis" refMap={sectionRefs}>
          {results.map((r, i) => (
            <StereoCard
              key={r.audio_file_id}
              data={r.stereo}
              label={`File ${i + 1}`}
            />
          ))}
        </Section>

        {/* ── Sections ── */}
        <Section id="sections" label="Dynamic Sections" refMap={sectionRefs}>
          {results.map((r, i) => (
            <SectionsTimeline
              key={r.audio_file_id}
              sections={r.sections}
              label={`File ${i + 1}`}
            />
          ))}
        </Section>
      </main>
    </div>
  )
}

// Reusable section wrapper
function Section({
  id,
  label,
  children,
  refMap,
}: {
  id: string
  label: string
  children: React.ReactNode
  refMap: React.MutableRefObject<Record<string, HTMLDivElement | null>>
}) {
  return (
    <div
      id={id}
      ref={el => { refMap.current[id] = el }}
      style={{ marginBottom: 56 }}
    >
      <h2 style={{ fontSize: 16, fontWeight: 600, color: '#aaa', marginBottom: 16, borderBottom: '1px solid #222', paddingBottom: 8 }}>
        {label}
      </h2>
      {children}
    </div>
  )
}