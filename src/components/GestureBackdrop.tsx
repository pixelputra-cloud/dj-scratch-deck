import type { RefObject } from 'react'
import { useDeckStore } from '../state/useDeckStore'

/**
 * Full-page camera feed (PRD §6.5, reworked). The mirrored webcam fills the
 * viewport behind everything; the landmark skeleton is painted across the same
 * space so your hands line up with the deck. A soft scrim keeps the deck
 * readable over a busy room.
 *
 * The <video>/<canvas> refs and the tracking lifecycle are owned by <App> so a
 * camera toggle in the header can drive them; this component is just the layer.
 */
export function GestureBackdrop({
  videoRef,
  canvasRef,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
}) {
  const live = useDeckStore((s) => s.cameraState === 'on')

  return (
    <div className="tt-backdrop" data-live={live} aria-hidden>
      <video ref={videoRef} className="tt-backdrop__video" muted playsInline />
      <div className="tt-backdrop__scrim" />
      <canvas ref={canvasRef} className="tt-backdrop__overlay" />
    </div>
  )
}
