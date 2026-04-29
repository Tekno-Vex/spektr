import {
    LineChart, Line, XAxis, YAxis, Tooltip,
    ResponsiveContainer, ReferenceLine, CartesianGrid,
  } from 'recharts'
  import type { FrequencyData } from '../types'
  
  interface Props {
    data: FrequencyData
    label: string
    color: string
  }
  
  // Format Hz on the X axis: show as "1k", "10k", etc.
  function fmtHz(hz: number): string {
    if (hz >= 1000) return `${Math.round(hz / 1000)}k`
    return String(Math.round(hz))
  }
  
  export function FrequencyChart({ data, label, color }: Props) {
    const chartData = data.freqs_hz.map((f, i) => ({
      freq: f,
      db: data.psd_db[i],
    }))
  
    // Only keep up to 20kHz (Nyquist for 22050 SR)
    const visible = chartData.filter(d => d.freq <= 20000)
  
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{label}</div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={visible}>
            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
            <XAxis
              dataKey="freq"
              scale="log"
              domain={['dataMin', 'dataMax']}
              type="number"
              tickFormatter={fmtHz}
              ticks={[20, 100, 500, 1000, 2000, 5000, 10000, 20000]}
              tick={{ fill: '#666', fontSize: 10 }}
            />
            <YAxis
              domain={[-40, 20]}
              tickFormatter={v => `${v}dB`}
              tick={{ fill: '#666', fontSize: 10 }}
            />
          <Tooltip
            formatter={(v) => [`${Number(v).toFixed(1)} dB`, 'Level']}
            labelFormatter={(f) => fmtHz(Number(f))}
            contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 11 }}
          />
            <ReferenceLine y={0} stroke="#555" strokeDasharray="4 4" />
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