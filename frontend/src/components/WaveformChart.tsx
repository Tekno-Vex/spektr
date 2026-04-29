import { BarChart, Bar, ResponsiveContainer, YAxis, Tooltip } from 'recharts'

interface Props {
  points: number[]
  label: string
  color: string
}

export function WaveformChart({ points, label, color }: Props) {
  // Recharts needs an array of objects
  const data = points.map((v, i) => ({ i, v }))

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{label}</div>
      <ResponsiveContainer width="100%" height={80}>
        <BarChart data={data} barCategoryGap={0} barGap={0}>
          <YAxis domain={[0, 1]} hide />
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.[0]
                ? <div style={{ background: '#111', padding: '4px 8px', fontSize: 11, color: '#ccc', borderRadius: 4 }}>
                    {Number(payload[0].value).toFixed(3)}
                  </div>
                : null
            }
          />
          <Bar dataKey="v" fill={color} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}