import type { StereoData } from '../types'

interface Props {
  data: StereoData
  label: string
}

export function StereoCard({ data, label }: Props) {
  const widthPct = Math.round(data.stereo_width * 100)
  const corrPct = Math.round(((data.correlation + 1) / 2) * 100)  // map -1..1 → 0..100

  return (
    <div style={{
      background: '#1a1a1a',
      borderRadius: 8,
      padding: '16px 20px',
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: '#aaa' }}>{label}</span>
        <span style={{
          background: data.is_mono ? '#555' : '#4f8ef7',
          color: '#fff',
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: 12,
        }}>
          {data.is_mono ? 'Mono' : 'Stereo'}
        </span>
      </div>

      {!data.is_mono && (
        <>
          <Gauge label="Stereo Width" pct={widthPct} color="#4f8ef7" />
          <Gauge label="Phase Correlation" pct={corrPct} color="#a78bfa" />
          <div style={{ fontSize: 11, color: '#555', marginTop: 8 }}>
            Correlation: {data.correlation.toFixed(3)} · Width: {data.stereo_width.toFixed(3)}
          </div>
        </>
      )}
    </div>
  )
}

function Gauge({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#888' }}>{label}</span>
        <span style={{ fontSize: 11, color: '#aaa' }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: '#333', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
    </div>
  )
}