import { useCallback, useEffect, useRef, useState } from 'react'
import { PITCH_DETENT_WIDTH, PITCH_RANGE_DEFAULT } from '../lib/constants'
import { clamp } from '../lib/math'
import { useDeckStore } from '../state/useDeckStore'

/**
 * Vertical pitch fader (PRD §5.6). Drag now; pinch gesture in Phase 3.
 * Top = faster (+range) to match PINCH-PITCH's "hand up = faster".
 * Detent at 0% is enforced in the store; here it just gets a visual click.
 */
export function PitchFader() {
  const pitch = useDeckStore((s) => s.pitchPercent)
  const range = useDeckStore((s) => s.pitchRange)
  const powered = useDeckStore((s) => s.powered)
  const setPitchPercent = useDeckStore((s) => s.setPitchPercent)
  const togglePitchRange = useDeckStore((s) => s.togglePitchRange)

  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [detentFlash, setDetentFlash] = useState(false)
  const wasInDetent = useRef(true)

  useEffect(() => {
    const inDetent = Math.abs(pitch) < PITCH_DETENT_WIDTH
    if (inDetent && !wasInDetent.current) {
      setDetentFlash(true)
      const t = setTimeout(() => setDetentFlash(false), 140)
      return () => clearTimeout(t)
    }
    wasInDetent.current = inDetent
  }, [pitch])

  const pointerToPitch = useCallback(
    (clientY: number) => {
      const el = trackRef.current
      if (!el) return 0
      const r = el.getBoundingClientRect()
      const pad = r.height * 0.08 // matches cap half-height in CSS
      const usable = r.height - pad * 2
      const frac = clamp((clientY - r.top - pad) / usable, 0, 1) // 0 top .. 1 bottom
      return (0.5 - frac) * 2 * range // top -> +range, bottom -> -range
    },
    [range],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    if (!powered) return
    dragging.current = true
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    setPitchPercent(pointerToPitch(e.clientY))
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    setPitchPercent(pointerToPitch(e.clientY))
  }
  const endDrag = (e: React.PointerEvent) => {
    dragging.current = false
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!powered) return
    const step = e.shiftKey ? 1 : 0.1
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setPitchPercent(pitch + step)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setPitchPercent(pitch - step)
    } else if (e.key === 'Home' || e.key === '0') {
      setPitchPercent(0)
    }
  }

  // cap position 0 (top) .. 1 (bottom)
  const frac = 0.5 - pitch / (2 * range)
  const readout = `${pitch >= 0 ? '+' : ''}${(pitch === 0 ? 0 : pitch).toFixed(1)}%`

  return (
    <div className="tt-pitch">
      <div className="tt-pitch__head">
        <span className="tt-pitch__readout" data-detent={Math.abs(pitch) < PITCH_DETENT_WIDTH}>
          {readout}
        </span>
        <button
          type="button"
          className="tt-pitch__range"
          onClick={togglePitchRange}
          aria-label={`Pitch range, currently plus or minus ${range} percent`}
        >
          ±{range}
        </button>
      </div>

      <div
        ref={trackRef}
        className="tt-pitch__track"
        data-detent-flash={detentFlash}
        role="slider"
        tabIndex={powered ? 0 : -1}
        aria-valuemin={-range}
        aria-valuemax={range}
        aria-valuenow={Number(pitch.toFixed(1))}
        aria-valuetext={readout}
        aria-label="Pitch"
        aria-disabled={!powered}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <span className="tt-pitch__scale" aria-hidden />
        <span className="tt-pitch__zero" aria-hidden />
        <span
          className="tt-pitch__cap"
          aria-hidden
          style={{ top: `calc(${frac * 100}% )` }}
        >
          <span className="tt-pitch__cap-line" />
        </span>
      </div>

      <span className="tt-pitch__caption">
        {range === PITCH_RANGE_DEFAULT ? 'PITCH ADJ' : 'PITCH ADJ ·WIDE'}
      </span>
    </div>
  )
}
