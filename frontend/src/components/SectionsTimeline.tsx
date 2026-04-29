import type { Section } from '../types'

interface Props {
  sections: Section[]
  label: string
}

const COLORS: Record<string, string> = {
  quiet: '#4f8ef7',
  loud: '#facc15',
  peak: '#f87171',
}

export function SectionsTimeline({ sections, label }: Props) {
  if (sections.length === 0) return null
  const totalSec = sections[sections.length - 1].end_sec

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', gap: 1 }}>
        {sections.map((s, i) => {
          const widthPct = ((s.end_sec - s.start_sec) / totalSec) * 100
          return (
            <div
              key={i}
              title={`${s.label} · ${s.start_sec}s–${s.end_sec}s · RMS ${s.rms.toFixed(4)}`}
              style={{
                width: `${widthPct}%`,
                background: COLORS[s.label],
                opacity: 0.75,
                cursor: 'default',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0.75')}
            />
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
        {(['quiet', 'loud', 'peak'] as const).map(l => (
          <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#666' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[l], display: 'inline-block' }} />
            {l}
          </span>
        ))}
      </div>
    </div>
  )
}