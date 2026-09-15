import { useCallback, useEffect, useRef, useState } from 'react'
import { asset } from '../lib/asset'
import { PITCH_DETENT_WIDTH } from '../lib/constants'
import { clamp } from '../lib/math'
import { useDeckStore } from '../state/useDeckStore'

/**
 * Horizontal pitch fader (PRD §5.6), in the transport stack left of the disc.
 * Right = faster (+range), matching POINT-PITCH. A strong centre detent
 * (enforced in the store) makes 0% easy to find. Tap near an end to jump
 * straight to that extreme. Works the same at ±8 / ±16.
 *
 * The base rail, LCD window and range key are pre-rendered PNGs (assets/ →
 * public/controls/); only the slider position and the readout text are live.
 * TRAVEL keeps the slider clear of the printed − / + ends baked into the rail.
 */
const TRAVEL = 0.12 // fraction of rail width reserved at each end

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
      const pad = r.width * TRAVEL
      const usable = r.width - pad * 2
      const frac = clamp((clientX - r.left - pad) / usable, 0, 1) // 0 left .. 1 right
      const v = (frac - 0.5) * 2 * range // left -> -range, right -> +range
      // a press within ~20% of an end jumps to that extreme
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
  const sliderPct = (TRAVEL + frac * (1 - 2 * TRAVEL)) * 100
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
        <span className="tt-pitch__detent" aria-hidden />
        <img
          className="tt-pitch__slider"
          src={asset('controls/pitch-fader-slider.png')}
          alt=""
          draggable={false}
          style={{ left: `${sliderPct}%` }}
        />
      </div>

      <button
        type="button"
        className="tt-pitch__range"
        onClick={togglePitchRange}
        aria-label={`Pitch range, currently plus or minus ${range} percent`}
      >
        <img
          src={asset(
            range >= 16
              ? 'controls/pitch-fader-range-toggle-16.png'
              : 'controls/pitch-fader-range-toggle-8.png',
          )}
          alt=""
          draggable={false}
        />
      </button>
    </div>
  )
}
