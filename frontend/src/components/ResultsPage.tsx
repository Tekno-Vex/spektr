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

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

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
      <div style={{ maxWidth: 640, margin: '80px auto', textAlign: 'center', fontFamily: 'var(--font)', padding: '0 24px' }}>
        <p style={{ color: 'var(--red)', fontSize: 15, marginBottom: 16 }}>{error}</p>
        <Link to="/" style={{ color: 'var(--accent-2)', fontSize: 13 }}>← Back to upload</Link>
      </div>
    )
  }

  if (!results) {
    return (
      <div style={{ maxWidth: 640, margin: '80px auto', textAlign: 'center', fontFamily: 'var(--font)' }}>
        <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Loading results…</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', fontFamily: 'var(--font)', minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>

      <style>{`
        @media (max-width: 640px) {
          .results-sidebar { display: none !important; }
          .results-main { padding: 16px !important; }
          .spectrogram-scroll { overflow-x: auto; }
        }
      `}</style>

      <nav className="results-sidebar" style={{
        position: 'sticky', top: 0, height: '100vh', width: 172, flexShrink: 0,
        padding: '28px 16px', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 2,
        background: 'var(--bg-2)',
      }}>
        <Link to="/" style={{ color: 'var(--text-3)', fontSize: 12, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 5 }}>
          ← Upload
        </Link>
        <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Sections
        </p>
        {NAV_SECTIONS.map(s => (
          <button key={s.id} onClick={() => scrollTo(s.id)} aria-label={`Jump to ${s.label} section`} style={{
            background: activeSection === s.id ? 'var(--accent-glow)' : 'none',
            border: 'none', textAlign: 'left',
            color: activeSection === s.id ? 'var(--accent-2)' : 'var(--text-3)',
            fontWeight: activeSection === s.id ? 600 : 400,
            fontSize: 13, cursor: 'pointer', padding: '7px 10px',
            borderRadius: 6, transition: 'all 0.15s',
          }}>
            {s.label}
          </button>
        ))}

        <div style={{ marginTop: 'auto', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button onClick={handleShare} aria-label="Share this analysis" style={actionBtnStyle}>
            {shareMsg ?? '↗ Share'}
          </button>
          <button onClick={handleExport} disabled={exporting} aria-label="Export as PNG" style={{ ...actionBtnStyle, opacity: exporting ? 0.5 : 1 }}>
            {exporting ? 'Exporting…' : '↓ Export PNG'}
          </button>
        </div>
      </nav>

      <main ref={mainRef} className="results-main" style={{ flex: 1, padding: '36px 44px', maxWidth: 920 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 5 }}>Analysis #{analysisId}</h1>
            <p style={{ color: 'var(--text-3)', fontSize: 13, margin: 0 }}>
              {results.length} file{results.length !== 1 ? 's' : ''} compared
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleShare} style={actionBtnStyle} aria-label="Share">{shareMsg ?? 'Share'}</button>
            <button onClick={handleExport} disabled={exporting} style={actionBtnStyle} aria-label="Export PNG">{exporting ? '…' : 'PNG'}</button>
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
  background: 'var(--bg-3)',
  border: '1px solid var(--border)',
  color: 'var(--text-2)',
  fontSize: 11,
  padding: '7px 11px',
  borderRadius: 6,
  cursor: 'pointer',
  textAlign: 'center',
  fontFamily: 'var(--font)',
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
      // eslint-disable-next-line react-hooks/immutability
      ref={el => { refMap.current[id] = el }}
      style={{ marginBottom: 60 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </h2>
        <button
          onClick={() => setShowHelp(v => !v)}
          aria-label={`What does the ${label} chart mean?`}
          style={{
            background: 'none', border: '1px solid var(--border)',
            color: 'var(--text-3)', fontSize: 10, width: 18, height: 18,
            borderRadius: '50%', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font)',
          }}
        >
          ?
        </button>
      </div>
      {showHelp && (
        <div style={{
          background: 'var(--bg-2)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '12px 16px', fontSize: 12,
          color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 16,
          borderLeft: '3px solid var(--accent)',
        }}>
          {help}
        </div>
      )}
      {children}
    </div>
  )
}
