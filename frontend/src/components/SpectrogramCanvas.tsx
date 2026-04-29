import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'
import type { SpectrogramData } from '../types'

interface Props {
  data: SpectrogramData
  label: string
}

export function SpectrogramCanvas({ data, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; freq: string; time: string } | null>(null)

  const W = 512
  const H = 256

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data?.data) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rows = data.data       // rows = freq bins, cols = time frames
    const numRows = rows.length
    const numCols = rows[0]?.length ?? 0
    if (numRows === 0 || numCols === 0) return

    // dB range: clip between -80 and 0
    const minDb = -80
    const maxDb = 0

    const imageData = ctx.createImageData(W, H)

    for (let py = 0; py < H; py++) {
      // Spectrogram rows are low-freq at index 0; we want low-freq at bottom
      const rowIdx = Math.floor((1 - py / H) * (numRows - 1))
      for (let px = 0; px < W; px++) {
        const colIdx = Math.floor((px / W) * (numCols - 1))
        const db = rows[rowIdx]?.[colIdx] ?? minDb
        // Map dB to 0-255 — use a blue→cyan→yellow→red colormap
        const t = Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)))
        const [r, g, b] = dbToColor(t)
        const i = (py * W + px) * 4
        imageData.data[i] = r
        imageData.data[i + 1] = g
        imageData.data[i + 2] = b
        imageData.data[i + 3] = 255
      }
    }
    ctx.putImageData(imageData, 0, 0)
  }, [data])

  // D3 crosshair on mousemove
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top

    // Map pixel position to frequency and time
    const nyquist = 22050
    const freqHz = Math.round(((H - py) / H) * nyquist)
    const timeSec = ((px / W) * 30).toFixed(1)   // rough — depends on file length

    setTooltip({ x: px, y: py, freq: `${freqHz} Hz`, time: `${timeSec}s` })

    const svg = d3.select(svgRef.current)
    svg.selectAll('.crosshair').remove()
    svg.append('line').attr('class', 'crosshair')
      .attr('x1', px).attr('y1', 0).attr('x2', px).attr('y2', H)
      .attr('stroke', 'rgba(255,255,255,0.5)').attr('stroke-width', 1)
    svg.append('line').attr('class', 'crosshair')
      .attr('x1', 0).attr('y1', py).attr('x2', W).attr('y2', py)
      .attr('stroke', 'rgba(255,255,255,0.5)').attr('stroke-width', 1)
  }

  const handleMouseLeave = () => {
    setTooltip(null)
    d3.select(svgRef.current).selectAll('.crosshair').remove()
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ position: 'relative', width: W, height: H }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{ display: 'block', borderRadius: 6 }}
        />
        {/* Transparent SVG overlay for D3 crosshair */}
        <svg
          ref={svgRef}
          width={W}
          height={H}
          style={{ position: 'absolute', top: 0, left: 0, cursor: 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
        {tooltip && (
          <div style={{
            position: 'absolute',
            top: tooltip.y - 36,
            left: tooltip.x + 8,
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            fontSize: 11,
            padding: '3px 7px',
            borderRadius: 4,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}>
            {tooltip.freq} · {tooltip.time}
          </div>
        )}
        {/* HF rolloff marker */}
        {data.hf_rolloff_hz && (
          <div style={{
            position: 'absolute',
            bottom: 4,
            right: 6,
            fontSize: 10,
            color: '#facc15',
            background: 'rgba(0,0,0,0.5)',
            padding: '2px 5px',
            borderRadius: 3,
          }}>
            HF rolloff: {Math.round(data.hf_rolloff_hz / 1000)}kHz
          </div>
        )}
      </div>
    </div>
  )
}

// Simple blue→cyan→yellow→red colormap
function dbToColor(t: number): [number, number, number] {
  if (t < 0.25) {
    const s = t / 0.25
    return [0, Math.round(s * 255), 255]
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25
    return [0, 255, Math.round((1 - s) * 255)]
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25
    return [Math.round(s * 255), 255, 0]
  } else {
    const s = (t - 0.75) / 0.25
    return [255, Math.round((1 - s) * 255), 0]
  }
}