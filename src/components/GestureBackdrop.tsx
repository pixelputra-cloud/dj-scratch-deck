import type { RefObject } from 'react'
import { useDeckStore } from '../state/useDeckStore'

/**
 * Full-page camera feed (PRD §6.5, reworked). The mirrored webcam fills the
 * viewport behind everything; a soft scrim keeps the deck readable over a busy
 * room. The landmark overlay is a separate layer in <App> that sits ABOVE the
 * deck, so hands read on top of the platter.
 *
 * The <video> ref and the tracking lifecycle are owned by <App> so the camera
 * toggle in the header can drive them; this component is just the layer.
 */
export function GestureBackdrop({
  videoRef,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
}) {
  const live = useDeckStore((s) => s.cameraState === 'on')

  return (
    <div className="tt-backdrop" data-live={live} aria-hidden>
      <video ref={videoRef} className="tt-backdrop__video" muted playsInline />
      <div className="tt-backdrop__scrim" />
    </div>
  )
}
