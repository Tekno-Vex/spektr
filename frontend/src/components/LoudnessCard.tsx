import { LineChart, Line, ReferenceLine, ResponsiveContainer, YAxis, Tooltip } from 'recharts'
import type { LoudnessData } from '../types'

interface Props {
  data: LoudnessData
  rms_curve: number[]
  label: string
  /** If true, shows a "Winner" badge (highest DR among siblings) */
  isWinner?: boolean
}

const DR_BENCHMARKS = [
  { value: 14, label: 'DR14', color: '#4ade80' },
  { value: 8,  label: 'DR8',  color: '#f87171' },
]

function drColor(dr: number): string {
  if (dr >= 14) return '#4ade80'
  if (dr >= 9)  return '#facc15'
  return '#f87171'
}

function drDescription(dr: number): string {
  if (dr >= 14) return 'Excellent — very dynamic'
  if (dr >= 9)  return 'Moderate — some compression'
  return 'Heavily compressed'
}

export function LoudnessCard({ data, rms_curve, label, isWinner }: Props) {
  const drMax = 20
  const barWidth = Math.min(100, Math.max(0, (data.dr14 / drMax) * 100))

  const rmsCurveData = rms_curve.map((v, i) => ({ i, v }))

  return (
    <div style={{
      background: '#1a1a1a',
      borderRadius: 8,
      padding: '16px 20px',
      marginBottom: 8,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: '#aaa' }}>{label}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {isWinner && (
            <span style={{
              background: '#facc15',
              color: '#000',
              fontWeight: 700,
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 20,
            }}>
              ★ Most Dynamic
            </span>
          )}
          <span style={{
            background: drColor(data.dr14),
            color: '#000',
            fontWeight: 700,
            fontSize: 13,
            padding: '3px 10px',
            borderRadius: 20,
          }}>
            DR{Math.round(data.dr14)}
          </span>
        </div>
      </div>

      {/* Horizontal DR bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: '#555' }}>Dynamic Range (DR14)</span>
          <span style={{ fontSize: 10, color: '#888' }}>{drDescription(data.dr14)}</span>
        </div>
        <div style={{ position: 'relative', height: 10, background: '#2a2a2a', borderRadius: 5, overflow: 'visible' }}>
          <div style={{
            width: `${barWidth}%`,
            height: '100%',
            background: drColor(data.dr14),
            borderRadius: 5,
            transition: 'width 0.6s ease',
          }} />
          {/* Benchmark tick marks */}
          {DR_BENCHMARKS.map(b => (
            <div key={b.value} style={{
              position: 'absolute',
              left: `${(b.value / drMax) * 100}%`,
              top: -4,
              bottom: -4,
              width: 1,
              background: b.color,
              opacity: 0.6,
            }}>
              <span style={{
                position: 'absolute',
                top: -14,
                left: 2,
                fontSize: 9,
                color: b.color,
                whiteSpace: 'nowrap',
              }}>{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <Metric label="Integrated LUFS" value={`${data.lufs} LUFS`} />
        <Metric label="True Peak" value={`${data.true_peak_dbtp} dBTP`} />
        <Metric label="Crest Factor" value={data.crest_factor.toFixed(2)} />
        <Metric label="Dynamic Range" value={`DR${data.dr14.toFixed(1)}`} />
      </div>

      {/* RMS loudness curve */}
      {rmsCurveData.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>RMS loudness over time</div>
          <ResponsiveContainer width="100%" height={56}>
            <LineChart data={rmsCurveData}>
              <YAxis domain={[-60, 0]} hide />
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.[0]
                    ? <div style={{ background: '#111', padding: '3px 7px', fontSize: 10, color: '#ccc', borderRadius: 3 }}>
                        {Number(payload[0].value).toFixed(1)} dB
                      </div>
                    : null
                }
              />
              {/* -23 LUFS reference */}
              <ReferenceLine y={-23} stroke="#4f8ef7" strokeDasharray="3 3" strokeWidth={1} />
              {/* -14 LUFS reference */}
              <ReferenceLine y={-14} stroke="#a78bfa" strokeDasharray="3 3" strokeWidth={1} />
              <Line
                type="monotone"
                dataKey="v"
                stroke={drColor(data.dr14)}
                dot={false}
                strokeWidth={1}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
            <LegendDot color="#4f8ef7" label="-23 LUFS (streaming)" />
            <LegendDot color="#a78bfa" label="-14 LUFS (YouTube)" />
          </div>
        </div>
      )}
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

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#555' }}>
      <span style={{ width: 16, height: 1, background: color, display: 'inline-block', borderTop: `1px dashed ${color}` }} />
      {label}
    </span>
  )
}
