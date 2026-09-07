import { useEffect, useRef, type RefObject } from 'react'
import {
  beginScratch,
  endScratch,
  isInScratchAnnulus,
  moveScratch,
  setPlatterGeometry,
} from '../state/deckController'
import { useDeckStore } from '../state/useDeckStore'
import { Spindle } from './Spindle'
import { StrobeRing } from './StrobeRing'
import { Vinyl } from './Vinyl'

interface Props {
  vinylRef: RefObject<SVGGElement | null>
  strobeRef: RefObject<SVGGElement | null>
}

/**
 * Platter + vinyl (PRD §5.2). A true circle in screen space — depth is
 * lighting and layering, never a rotateX. Owns:
 *   - geometry publishing (centre + radius in viewport px) for the scratch maths
 *   - pointer scratching over the annulus (mouse now, same maths as gestures)
 * Rotation itself is written by <Deck>'s frame loop into vinylRef.
 */
export function Platter({ vinylRef, strobeRef }: Props) {
  const powered = useDeckStore((s) => s.powered)
  const cameraOn = useDeckStore((s) => s.cameraState === 'on')
  const scratchingRef = useRef(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const measure = () => {
      const el = wrapRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setPlatterGeometry(r.left + r.width / 2, r.top + r.height / 2, r.width / 2)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (wrapRef.current) ro.observe(wrapRef.current)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (!powered) return
    if (!isInScratchAnnulus(e.clientX, e.clientY)) return
    scratchingRef.current = true
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    beginScratch(e.clientX, e.clientY)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!scratchingRef.current) return
    moveScratch(e.clientX, e.clientY)
  }
  const stop = (e: React.PointerEvent) => {
    if (!scratchingRef.current) return
    scratchingRef.current = false
    ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
    endScratch()
  }

  return (
    <div
      ref={wrapRef}
      className="tt-platter"
      data-powered={powered}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
    >
      <div className="tt-platter__metal" aria-hidden />
      <div className="tt-platter__rings" aria-hidden />
      <StrobeRing ref={strobeRef} />
      <Vinyl ref={vinylRef} />
      <div className="tt-platter__sheen" aria-hidden />
      <div className="tt-platter__rim" aria-hidden />
      <Spindle />

      {/* scratch hit-region guide — the camera frame maps straight onto this
          disc, so these dashed rings show exactly where a fingertip catches. */}
      {cameraOn ? (
        <svg className="tt-platter__zone" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="49" className="tt-platter__zone-outer" />
          <circle cx="50" cy="50" r="9" className="tt-platter__zone-inner" />
          <line x1="46" y1="50" x2="54" y2="50" className="tt-platter__zone-cross" />
          <line x1="50" y1="46" x2="50" y2="54" className="tt-platter__zone-cross" />
        </svg>
      ) : null}
    </div>
  )
}
