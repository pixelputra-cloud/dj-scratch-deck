import { useEffect, useRef } from 'react'
import { loadTrackIntoDeck } from '../state/deckController'
import { useDeckStore } from '../state/useDeckStore'
import type { Track } from '../tracks/types'

interface Props {
  track: Track
}

/** One sleeve-style crate card (PRD §8.3). Click or drag onto the platter to
 *  load. The loaded card is visibly lifted out of the crate. */
export function TrackCard({ track }: Props) {
  const loadedId = useDeckStore((s) => s.loadedTrack?.id ?? null)
  const loadingId = useDeckStore((s) => s.loadingTrackId)
  const progress = useDeckStore((s) => s.loadProgress)
  const peaks = useDeckStore((s) => s.waveforms[track.id])
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const isLoaded = loadedId === track.id
  const isLoading = loadingId === track.id

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = c.clientWidth
    const h = c.clientHeight
    c.width = w * dpr
    c.height = h * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = getComputedStyle(c).getPropertyValue('--waveform') || '#6f727a'

    if (!peaks || peaks.length === 0) {
      ctx.globalAlpha = 0.25
      ctx.fillRect(0, h / 2 - 0.5, w, 1)
      return
    }
    const n = peaks.length
    const bw = w / n
    let max = 0
    for (const p of peaks) if (p > max) max = p
    const norm = max > 0 ? 1 / max : 1
    for (let i = 0; i < n; i++) {
      const barH = Math.max(1, peaks[i] * norm * (h * 0.9))
      ctx.fillRect(i * bw, (h - barH) / 2, Math.max(0.6, bw - 0.4), barH)
    }
  }, [peaks])

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-deck-track', track.id)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <button
      type="button"
      className="tt-card"
      data-loaded={isLoaded}
      data-loading={isLoading}
      draggable
      onDragStart={onDragStart}
      onClick={() => loadTrackIntoDeck(track)}
      style={{ ['--card-accent' as string]: track.labelColor }}
      aria-label={`Load ${track.title} by ${track.artist}`}
    >
      <span className="tt-card__sleeve" aria-hidden>
        <span className="tt-card__disc" />
      </span>
      <span className="tt-card__meta">
        <span className="tt-card__title">{track.title}</span>
        <span className="tt-card__artist">{track.artist}</span>
        <span className="tt-card__tags">
          {track.bpm ? <span>{track.bpm} BPM</span> : <span>—</span>}
          {track.source === 'local' ? (
            <span className="tt-card__local">LOCAL</span>
          ) : null}
        </span>
      </span>
      <canvas ref={canvasRef} className="tt-card__wave" />
      {isLoading ? (
        <span className="tt-card__loadbar" aria-hidden>
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      ) : null}
    </button>
  )
}
