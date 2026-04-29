import { useRef, useEffect } from 'react'
import type { StereoData } from '../types'

interface Props {
  data: StereoData
  label: string
}

export function StereoCard({ data, label }: Props) {
  const widthPct = Math.round(data.stereo_width * 100)
  const corrPct = Math.round(((data.correlation + 1) / 2) * 100)

  function stereoDescription(): string {
    if (data.is_mono) return 'This file is mono — both channels are identical.'
    const c = data.correlation
    if (c > 0.95) return 'Near-mono: channels are almost identical. Very narrow stereo field.'
    if (c > 0.7)  return 'Moderate stereo width. Sounds centered with some spread.'
    if (c > 0.3)  return 'Wide stereo image. Good left/right separation.'
    if (c > 0)    return 'Very wide stereo. May feel spacious or slightly unnatural.'
    return 'Out-of-phase content detected. Could cause cancellation on mono playback.'
  }

  return (
    <div style={{
      background: '#1a1a1a',
      borderRadius: 8,
      padding: '16px 20px',
      marginBottom: 8,
    }}>
      {/* Header */}
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

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Lissajous goniometer */}
        <LissajousCanvas data={data} />

        {/* Gauges + description */}
        <div style={{ flex: 1 }}>
          {!data.is_mono && (
            <>
              <Gauge label="Stereo Width" pct={widthPct} color="#4f8ef7" />
              <Gauge label="Phase Correlation" pct={corrPct} color="#a78bfa" />
              <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                Correlation: {data.correlation.toFixed(3)} · Width: {data.stereo_width.toFixed(3)}
              </div>
            </>
          )}
          {/* Plain-English interpretation */}
          <div style={{
            marginTop: 10,
            fontSize: 11,
            color: '#888',
            lineHeight: 1.5,
            background: '#111',
            borderRadius: 6,
            padding: '8px 10px',
          }}>
            {stereoDescription()}
          </div>
        </div>
      </div>
    </div>
  )
}

function LissajousCanvas({ data }: { data: StereoData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const SIZE = 100

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#0d0d0d'
    ctx.fillRect(0, 0, SIZE, SIZE)

    // Draw axes
    ctx.strokeStyle = '#2a2a2a'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(SIZE / 2, 0)
    ctx.lineTo(SIZE / 2, SIZE)
    ctx.moveTo(0, SIZE / 2)
    ctx.lineTo(SIZE, SIZE / 2)
    ctx.stroke()

    // Axis labels
    ctx.fillStyle = '#444'
    ctx.font = '8px sans-serif'
    ctx.fillText('M', SIZE / 2 - 3, 8)
    ctx.fillText('S', SIZE - 8, SIZE / 2 + 3)
    ctx.fillText('-S', 1, SIZE / 2 + 3)

    if (data.is_mono || !data.mid_rms || !data.side_rms) {
      // Mono: draw a vertical line
      ctx.strokeStyle = 'rgba(79,142,247,0.8)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(SIZE / 2, SIZE - 5)
      ctx.lineTo(SIZE / 2, 5)
      ctx.stroke()
      return
    }

    const mid = data.mid_rms
    const side = data.side_rms
    const n = Math.min(mid.length, side.length)
    if (n === 0) return

    // Normalize to canvas space
    const maxVal = Math.max(...mid, ...side, 0.001)

    ctx.strokeStyle = 'rgba(79,142,247,0.5)'
    ctx.lineWidth = 0.5
    ctx.beginPath()

    for (let i = 0; i < n; i++) {
      // Lissajous: X = side (left-right), Y = mid (up-down, inverted)
      const x = SIZE / 2 + (side[i] / maxVal) * (SIZE / 2 - 4)
      const y = SIZE / 2 - (mid[i] / maxVal) * (SIZE / 2 - 4)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }, [data])

  return (
    <div>
      <div style={{ fontSize: 9, color: '#444', marginBottom: 3, textAlign: 'center' }}>Goniometer</div>
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        style={{ borderRadius: 6, display: 'block' }}
      />
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
