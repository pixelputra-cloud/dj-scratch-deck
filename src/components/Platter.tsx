import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  beginScratch,
  endScratch,
  isInScratchAnnulus,
  loadTrackIntoDeck,
  moveScratch,
  setPlatterGeometry,
} from '../state/deckController'
import { useDeckStore } from '../state/useDeckStore'
import { isAudioFile, trackFromFile } from '../tracks/userTrack'
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
 *   - drop target: drag a crate card (or an audio file) onto the disc to load
 * Rotation itself is written by <Deck>'s frame loop into vinylRef.
 */
export function Platter({ vinylRef, strobeRef }: Props) {
  const powered = useDeckStore((s) => s.powered)
  const cameraOn = useDeckStore((s) => s.cameraState === 'on')
  const crate = useDeckStore((s) => s.crate)
  const addUserTracks = useDeckStore((s) => s.addUserTracks)
  const scratchingRef = useRef(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [dropActive, setDropActive] = useState(false)

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

  const dragHasTrack = (e: React.DragEvent) =>
    e.dataTransfer.types.includes('application/x-deck-track') ||
    e.dataTransfer.types.includes('Files')

  const onDragOver = (e: React.DragEvent) => {
    if (!dragHasTrack(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (!dropActive) setDropActive(true)
  }
  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDropActive(false)
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDropActive(false)

    const trackId = e.dataTransfer.getData('application/x-deck-track')
    if (trackId) {
      const t = crate.find((x) => x.id === trackId)
      if (t) void loadTrackIntoDeck(t)
      return
    }
    const audio = Array.from(e.dataTransfer.files).filter(isAudioFile)
    if (audio.length) {
      const tracks = audio.map(trackFromFile)
      addUserTracks(tracks)
      void loadTrackIntoDeck(tracks[0])
    }
  }

  return (
    <div
      ref={wrapRef}
      className="tt-platter"
      data-powered={powered}
      data-drop={dropActive}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="tt-platter__metal" aria-hidden />
      <div className="tt-platter__rings" aria-hidden />
      <StrobeRing ref={strobeRef} />
      <Vinyl ref={vinylRef} />
      <div className="tt-platter__sheen" aria-hidden />
      <div className="tt-platter__rim" aria-hidden />

      {/* scratch hit-region guide — the camera frame maps straight onto this
          disc, so these dashed rings show exactly where a fingertip catches. */}
      {cameraOn ? (
        <svg className="tt-platter__zone" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="48.5" className="tt-platter__zone-outer" />
          <circle cx="50" cy="50" r="9" className="tt-platter__zone-inner" />
          <line x1="45" y1="50" x2="55" y2="50" className="tt-platter__zone-cross" />
          <line x1="50" y1="45" x2="50" y2="55" className="tt-platter__zone-cross" />
        </svg>
      ) : null}

      <div className="tt-platter__drop" aria-hidden>
        <span>drop to load</span>
      </div>
    </div>
  )
}
