import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import html2canvas from 'html2canvas'
import type { ResultsResponse, FileResult } from '../types'
import { SpectrogramCanvas } from './SpectrogramCanvas'
import { WaveformChart } from './WaveformChart'
import { FrequencyChart } from './FrequencyChart'
import { LoudnessCard } from './LoudnessCard'
import { StereoCard } from './StereoCard'
import { SectionsTimeline } from './SectionsTimeline'
import { AiVerdictCard } from './AiVerdictCard'

const API = 'http://localhost:8000'

const FILE_COLORS = ['#4f8ef7', '#f97316', '#a78bfa', '#34d399', '#f87171']

const NAV_SECTIONS = [
  { id: 'waveform',    label: 'Waveform' },
  { id: 'spectrogram', label: 'Spectrogram' },
  { id: 'loudness',    label: 'Loudness' },
  { id: 'frequency',   label: 'Frequency' },
  { id: 'stereo',      label: 'Stereo' },
  { id: 'sections',    label: 'Sections' },
  { id: 'ai',          label: 'AI Verdict' },
]

const SECTION_HELP: Record<string, string> = {
  waveform: 'Shows how loud the audio is over time. Taller bars = louder moments. A flat line at max height means the track is heavily "brick-wall" limited.',
  spectrogram: 'A heat map of frequency content over time. Blue = quiet, red = loud. Hover to see the exact frequency and time. A hard cutoff in the high frequencies can reveal lossy encoding (e.g. MP3 at 128kbps).',
  loudness: 'DR14 measures dynamic range — how much the quiet and loud parts differ. Higher = more dynamic. Streaming services like Spotify normalize to around −14 LUFS, so anything louder will be turned down.',
  frequency: 'Shows how much energy is in each frequency range, normalized to 0 dB at 1 kHz. A dip or peak compared to another version reveals EQ differences between masters.',
  stereo: 'The goniometer (circle) shows how wide the stereo image is. A thin vertical line = mono. A wide diagonal cloud = wide stereo. Negative correlation (tilting left) can cause problems on mono speakers.',
  sections: 'Divides the track into quiet, loud, and peak regions based on RMS energy. Useful for spotting dynamic compression — if everything is "peak", the mix has no breathing room.',
  ai: 'Google Gemini 2.5 Flash analyses the computed metrics and identifies the best version in plain English, citing specific numbers. It is a starting point — always compare with the charts above.',
}

export function ResultsPage() {
  const { analysisId } = useParams<{ analysisId: string }>()
  const [results, setResults] = useState<FileResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState('waveform')
  const [shareMsg, setShareMsg] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const mainRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!analysisId) return
    axios
      .get<ResultsResponse>(`${API}/api/v1/analyses/${analysisId}/results`)
      .then(res => setResults(res.data.results))
      .catch(() => setError('Could not load results. Make sure the analysis has completed.'))
  }, [analysisId])

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) setActiveSection(e.target.id)
        })
      },
      { threshold: 0.3 },
    )
    Object.values(sectionRefs.current).forEach(el => el && observer.observe(el))
    return () => observer.disconnect()
  }, [results])

  const scrollTo = (id: string) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleShare = () => {
    const url = window.location.href
    navigator.clipboard.writeText(url).then(() => {
      setShareMsg('Link copied!')
      setTimeout(() => setShareMsg(null), 2500)
    }).catch(() => {
      setShareMsg(url)
    })
  }

  const handleExport = async () => {
    if (!mainRef.current) return
    setExporting(true)
    try {
      const canvas = await html2canvas(mainRef.current, {
        backgroundColor: '#0d0d0d',
        scale: 1.5,
        useCORS: true,
      })
      const link = document.createElement('a')
      link.download = `spektr-analysis-${analysisId}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } finally {
      setExporting(false)
    }
  }

  // Determine winner: file with highest DR14
  const winnerIdx = results
    ? results.reduce((best, r, i) =>
        r.loudness.dr14 > results[best].loudness.dr14 ? i : best, 0)
    : -1

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

      {/* ── Sticky sidebar (hidden on mobile via inline media trick) ── */}
      <style>{`
        @media (max-width: 640px) {
          .results-sidebar { display: none !important; }
          .results-main { padding: 16px !important; }
          .spectrogram-scroll { overflow-x: auto; }
        }
      `}</style>

      <nav className="results-sidebar" style={{
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
        {NAV_SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => scrollTo(s.id)}
            aria-label={`Jump to ${s.label} section`}
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

        {/* Share + Export in sidebar */}
        <div style={{ marginTop: 'auto', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={handleShare}
            aria-label="Share this analysis"
            style={actionBtnStyle}
          >
            {shareMsg ?? 'Share link'}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            aria-label="Export as PNG"
            style={{ ...actionBtnStyle, opacity: exporting ? 0.5 : 1 }}
          >
            {exporting ? 'Exporting…' : 'Export PNG'}
          </button>
        </div>
      </nav>

      {/* ── Main content ── */}
      <main ref={mainRef} className="results-main" style={{ flex: 1, padding: '32px 40px', maxWidth: 900 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 36 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Analysis #{analysisId}</h1>
            <p style={{ color: '#555', fontSize: 13, margin: 0 }}>
              {results.length} file{results.length !== 1 ? 's' : ''} compared
            </p>
          </div>
          {/* Mobile action buttons (shown when sidebar hidden) */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleShare} style={actionBtnStyle} aria-label="Share">
              {shareMsg ?? 'Share'}
            </button>
            <button onClick={handleExport} disabled={exporting} style={actionBtnStyle} aria-label="Export PNG">
              {exporting ? '…' : 'PNG'}
            </button>
          </div>
        </div>

        {/* ── Waveform ── */}
        <Section id="waveform" label="Waveform" help={SECTION_HELP.waveform} refMap={sectionRefs}>
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
        <Section id="spectrogram" label="Spectrogram" help={SECTION_HELP.spectrogram} refMap={sectionRefs}>
          <div className="spectrogram-scroll">
            {results.map((r, i) => (
              <SpectrogramCanvas
                key={r.audio_file_id}
                data={r.spectrogram}
                label={`File ${i + 1}`}
              />
            ))}
          </div>
        </Section>

        {/* ── Loudness ── */}
        <Section id="loudness" label="Loudness" help={SECTION_HELP.loudness} refMap={sectionRefs}>
          {results.map((r, i) => (
            <LoudnessCard
              key={r.audio_file_id}
              data={r.loudness}
              rms_curve={r.rms_curve}
              label={`File ${i + 1}`}
              isWinner={results.length > 1 && i === winnerIdx}
            />
          ))}
        </Section>

        {/* ── Frequency ── */}
        <Section id="frequency" label="Frequency Response" help={SECTION_HELP.frequency} refMap={sectionRefs}>
          {results.map((r, i) => (
            <FrequencyChart
              key={r.audio_file_id}
              data={r.frequency}
              label={`File ${i + 1}`}
              color={FILE_COLORS[i % FILE_COLORS.length]}
              hfRolloffHz={r.spectrogram.hf_rolloff_hz}
            />
          ))}
        </Section>

        {/* ── Stereo ── */}
        <Section id="stereo" label="Stereo Analysis" help={SECTION_HELP.stereo} refMap={sectionRefs}>
          {results.map((r, i) => (
            <StereoCard
              key={r.audio_file_id}
              data={r.stereo}
              label={`File ${i + 1}`}
            />
          ))}
        </Section>

        {/* ── Sections ── */}
        <Section id="sections" label="Dynamic Sections" help={SECTION_HELP.sections} refMap={sectionRefs}>
          {results.map((r, i) => (
            <SectionsTimeline
              key={r.audio_file_id}
              sections={r.sections}
              label={`File ${i + 1}`}
            />
          ))}
        </Section>

        {/* ── AI Verdict ── */}
        <Section id="ai" label="AI Verdict" help={SECTION_HELP.ai} refMap={sectionRefs}>
          <AiVerdictCard analysisId={analysisId ?? ''} />
        </Section>
      </main>
    </div>
  )
}

const actionBtnStyle: React.CSSProperties = {
  background: '#1e1e1e',
  border: '1px solid #333',
  color: '#aaa',
  fontSize: 11,
  padding: '6px 10px',
  borderRadius: 6,
  cursor: 'pointer',
  textAlign: 'center',
}

function Section({
  id,
  label,
  help,
  children,
  refMap,
}: {
  id: string
  label: string
  help: string
  children: React.ReactNode
  refMap: React.MutableRefObject<Record<string, HTMLDivElement | null>>
}) {
  const [showHelp, setShowHelp] = useState(false)

  return (
    <div
      id={id}
      ref={el => { refMap.current[id] = el }}
      style={{ marginBottom: 56 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, borderBottom: '1px solid #222', paddingBottom: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#aaa', margin: 0 }}>
          {label}
        </h2>
        {/* "What does this mean?" toggle */}
        <button
          onClick={() => setShowHelp(v => !v)}
          aria-label={`What does the ${label} chart mean?`}
          style={{
            background: 'none',
            border: '1px solid #333',
            color: '#555',
            fontSize: 10,
            padding: '2px 7px',
            borderRadius: 10,
            cursor: 'pointer',
          }}
        >
          ?
        </button>
      </div>
      {showHelp && (
        <div style={{
          background: '#111',
          border: '1px solid #2a2a2a',
          borderRadius: 6,
          padding: '10px 14px',
          fontSize: 12,
          color: '#888',
          lineHeight: 1.6,
          marginBottom: 12,
        }}>
          {help}
        </div>
      )}
      {children}
    </div>
  )
}
