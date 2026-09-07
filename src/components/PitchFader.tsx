import { useCallback, useEffect, useRef, useState } from 'react'
import { PITCH_DETENT_WIDTH } from '../lib/constants'
import { clamp } from '../lib/math'
import { useDeckStore } from '../state/useDeckStore'

/**
 * Vertical pitch fader (PRD §5.6), in the floating left control stack. Up =
 * faster (+range), matching PINCH-PITCH. The 0% detent is enforced in the
 * store; here it just gets a visual click. Drag with the mouse; the PINCH
 * gesture sets the value directly.
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
      const pad = r.height * 0.08 // matches the cap half-height
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
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault()
      setPitchPercent(pitch + step)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault()
      setPitchPercent(pitch - step)
    } else if (e.key === 'Home' || e.key === '0') {
      setPitchPercent(0)
    }
  }

  const frac = 0.5 - pitch / (2 * range) // 0 = top (+range), 1 = bottom (−range)
  const inDetent = Math.abs(pitch) < PITCH_DETENT_WIDTH
  const readout = `${pitch >= 0 ? '+' : ''}${(pitch === 0 ? 0 : pitch).toFixed(1)}%`

  return (
    <div className="tt-pitch">
      <span className="tt-pitch__readout" data-detent={inDetent}>
        {readout}
      </span>

      <div
        ref={trackRef}
        className="tt-pitch__track"
        data-detent-flash={detentFlash}
        role="slider"
        tabIndex={powered ? 0 : -1}
        aria-orientation="vertical"
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
        <span className="tt-pitch__cap" aria-hidden style={{ top: `${frac * 100}%` }}>
          <span className="tt-pitch__cap-line" />
        </span>
      </div>

      <button
        type="button"
        className="tt-pitch__range"
        onClick={togglePitchRange}
        aria-label={`Pitch range, currently plus or minus ${range} percent`}
      >
        ±{range}
      </button>
    </div>
  )
}
