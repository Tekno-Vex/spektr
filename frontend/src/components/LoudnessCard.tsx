import type { LoudnessData } from '../types'

interface Props {
  data: LoudnessData
  label: string
}

// DR14 is typically 4–20 for music. <8 = heavily compressed ("brick wall")
function drBadgeColor(dr: number): string {
  if (dr >= 14) return '#4ade80'   // green — dynamic
  if (dr >= 9)  return '#facc15'   // yellow — moderate
  return '#f87171'                  // red — compressed
}

export function LoudnessCard({ data, label }: Props) {
  return (
    <div style={{
      background: '#1a1a1a',
      borderRadius: 8,
      padding: '16px 20px',
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: '#aaa' }}>{label}</span>
        {/* DR14 badge */}
        <span style={{
          background: drBadgeColor(data.dr14),
          color: '#000',
          fontWeight: 700,
          fontSize: 13,
          padding: '3px 10px',
          borderRadius: 20,
        }}>
          DR{Math.round(data.dr14)}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Metric label="Integrated LUFS" value={`${data.lufs} LUFS`} />
        <Metric label="True Peak" value={`${data.true_peak_dbtp} dBTP`} />
        <Metric label="Crest Factor" value={data.crest_factor.toFixed(2)} />
        <Metric label="Dynamic Range" value={`DR${data.dr14.toFixed(1)}`} />
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#555', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, color: '#e5e5e5', fontWeight: 600 }}>{value}</div>
    </div>
  )
}