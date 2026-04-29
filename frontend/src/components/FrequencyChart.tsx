import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts'
import type { FrequencyData } from '../types'

interface Props {
  data: FrequencyData
  label: string
  color: string
  hfRolloffHz?: number
}

function fmtHz(hz: number): string {
  if (hz >= 1000) return `${Math.round(hz / 1000)}k`
  return String(Math.round(hz))
}

const BANDS = [
  { freq: 20,    label: 'Sub',  color: '#555' },
  { freq: 80,    label: 'Bass', color: '#555' },
  { freq: 250,   label: 'Low-mid', color: '#555' },
  { freq: 2000,  label: 'Mid', color: '#555' },
  { freq: 8000,  label: 'High', color: '#555' },
  { freq: 16000, label: 'Air', color: '#555' },
]

export function FrequencyChart({ data, label, color, hfRolloffHz }: Props) {
  const chartData = data.freqs_hz.map((f, i) => ({
    freq: f,
    db: data.psd_db[i],
  }))

  const visible = chartData.filter(d => d.freq >= 20 && d.freq <= 20000)

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{label}</div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={visible} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
          <XAxis
            dataKey="freq"
            scale="log"
            domain={[20, 20000]}
            type="number"
            tickFormatter={fmtHz}
            ticks={[20, 80, 250, 1000, 2000, 8000, 16000, 20000]}
            tick={{ fill: '#555', fontSize: 9 }}
          />
          <YAxis
            domain={[-40, 20]}
            tickFormatter={v => `${v}dB`}
            tick={{ fill: '#555', fontSize: 9 }}
            width={36}
          />
          <Tooltip
            formatter={(v) => [`${Number(v).toFixed(1)} dB`, 'Level']}
            labelFormatter={(f) => fmtHz(Number(f))}
            contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 11 }}
          />

          {/* 0 dB reference */}
          <ReferenceLine y={0} stroke="#444" strokeDasharray="4 4" />

          {/* Frequency band dividers */}
          {BANDS.map(b => (
            <ReferenceLine
              key={b.freq}
              x={b.freq}
              stroke="#2a2a2a"
              strokeWidth={1}
              label={{ value: b.label, position: 'top', fill: '#444', fontSize: 8 }}
            />
          ))}

          {/* HF rolloff marker */}
          {hfRolloffHz && hfRolloffHz < 20000 && (
            <ReferenceLine
              x={hfRolloffHz}
              stroke="#facc15"
              strokeDasharray="5 3"
              strokeWidth={1.5}
              label={{ value: `HF ${fmtHz(hfRolloffHz)}`, position: 'top', fill: '#facc15', fontSize: 9 }}
            />
          )}

          <Line
            type="monotone"
            dataKey="db"
            stroke={color}
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
