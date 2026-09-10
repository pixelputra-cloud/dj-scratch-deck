import { useCallback, useEffect, useRef, useState } from 'react'
import { PITCH_DETENT_WIDTH } from '../lib/constants'
import { clamp } from '../lib/math'
import { useDeckStore } from '../state/useDeckStore'

/**
 * Horizontal pitch fader (PRD §5.6), in the analog transport stack left of the
 * disc. Right = faster (+range), matching PINCH-PITCH. A strong centre detent
 * (enforced in the store) makes 0% easy to find; printed − / + mark the ends.
 * Tap near an end to jump straight to that extreme. Works the same at ±8 / ±16.
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
    (clientX: number, snapEnds = false) => {
      const el = trackRef.current
      if (!el) return 0
      const r = el.getBoundingClientRect()
      const pad = r.width * 0.09 // ~half the cap width
      const usable = r.width - pad * 2
      const frac = clamp((clientX - r.left - pad) / usable, 0, 1) // 0 left .. 1 right
      const v = (frac - 0.5) * 2 * range // left -> -range, right -> +range
      // a press within ~10% of an end jumps to that extreme
      if (snapEnds && Math.abs(v) > range * 0.8) return Math.sign(v) * range
      return v
    },
    [range],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    if (!powered) return
    dragging.current = true
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    setPitchPercent(pointerToPitch(e.clientX, true))
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    setPitchPercent(pointerToPitch(e.clientX))
  }
  const endDrag = (e: React.PointerEvent) => {
    dragging.current = false
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!powered) return
    const step = e.shiftKey ? 1 : 0.1
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      setPitchPercent(pitch + step)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      setPitchPercent(pitch - step)
    } else if (e.key === 'Home' || e.key === '0') {
      setPitchPercent(0)
    }
  }

  const frac = 0.5 + pitch / (2 * range) // 0 = left (−range), 1 = right (+range)
  const inDetent = Math.abs(pitch) < PITCH_DETENT_WIDTH
  const readout = `${pitch >= 0 ? '+' : ''}${(pitch === 0 ? 0 : pitch).toFixed(1)}%`

  return (
    <div className="tt-pitch">
      <div className="tt-pitch__head">
        <span className="tt-pitch__readout" data-detent={inDetent}>
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
        aria-orientation="horizontal"
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
        <span className="tt-pitch__end" data-side="minus" aria-hidden>
          –
        </span>
        <span className="tt-pitch__end" data-side="plus" aria-hidden>
          +
        </span>
        <span
          className="tt-pitch__cap"
          aria-hidden
          style={{ left: `${frac * 100}%` }}
        >
          <span className="tt-pitch__cap-line" />
        </span>
      </div>
    </div>
  )
}
