import { useRef } from 'react'
import { useGestureTracking } from '../gesture/useGestureTracking'
import { useDeckStore } from '../state/useDeckStore'

/**
 * Camera feed + landmark overlay (PRD §6.5 / §6.6). The turntable is never
 * blocked on the camera — if it's denied or unavailable the deck stays fully
 * mouse-operable and this panel just says so, with a retry.
 */
export function CameraPanel() {
  const cameraState = useDeckStore((s) => s.cameraState)
  const cameraError = useDeckStore((s) => s.cameraError)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { enable, disable } = useGestureTracking(videoRef, canvasRef)

  const live = cameraState === 'on'

  return (
    <div className="tt-camera" data-state={cameraState}>
      <div className="tt-camera__frame">
        {/* video is always mounted so the ref exists before enable() */}
        <video ref={videoRef} className="tt-camera__video" data-live={live} muted playsInline />
        <canvas ref={canvasRef} className="tt-camera__overlay" data-live={live} />

        {!live ? (
          <div className="tt-camera__placeholder">
            {cameraState === 'requesting' ? (
              <>
                <span className="tt-camera__dot" data-pulse aria-hidden />
                <p className="tt-camera__msg">requesting camera…</p>
              </>
            ) : cameraState === 'denied' ? (
              <>
                <span className="tt-camera__dot" aria-hidden />
                <p className="tt-camera__msg">camera permission denied</p>
                <p className="tt-camera__sub">
                  Allow camera access in your browser, then retry. The deck
                  works fine without it.
                </p>
                {cameraError ? (
                  <p className="tt-camera__diag" title={cameraError}>
                    {cameraError}
                  </p>
                ) : null}
                <button type="button" onClick={enable}>
                  Try again
                </button>
              </>
            ) : cameraState === 'error' ? (
              <>
                <span className="tt-camera__dot" aria-hidden />
                <p className="tt-camera__msg">gesture control off — camera not available</p>
                <p className="tt-camera__sub">
                  No camera, or the hand model failed to load. Mouse &amp; touch
                  control is fully live.
                </p>
                {cameraError ? (
                  <p className="tt-camera__diag" title={cameraError}>
                    {cameraError}
                  </p>
                ) : null}
                <button type="button" onClick={enable}>
                  Try again
                </button>
              </>
            ) : (
              <>
                <span className="tt-camera__dot" aria-hidden />
                <p className="tt-camera__msg">gesture control is off</p>
                <p className="tt-camera__sub">
                  Play the record with your hands. Nothing is uploaded — the
                  camera stays on your machine.
                </p>
                <button type="button" onClick={enable}>
                  Enable camera
                </button>
              </>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="tt-camera__stop"
            onClick={disable}
            aria-label="Turn camera off"
          >
            ■ camera
          </button>
        )}
      </div>
      {live ? (
        <p className="tt-camera__tip">
          One hand on the record, one on the fader. Good, even light helps.
        </p>
      ) : null}
    </div>
  )
}
