import { useDeckStore } from '../state/useDeckStore'

/**
 * Camera feed + landmark overlay (PRD §6.5 / §6.6).
 *
 * Phase 3 shell: the turntable must never be blocked on the camera, so for
 * now this just shows the "gesture control off" state with a retry affordance.
 * MediaPipe wiring, the mirrored feed and the landmark skeleton land in Phase 3.
 */
export function CameraPanel() {
  const cameraState = useDeckStore((s) => s.cameraState)

  return (
    <div className="tt-camera" data-state={cameraState}>
      <div className="tt-camera__frame">
        <div className="tt-camera__placeholder">
          <span className="tt-camera__dot" aria-hidden />
          <p className="tt-camera__msg">gesture control off — camera not wired yet</p>
          <p className="tt-camera__sub">Phase 3. Full mouse &amp; touch control is live now.</p>
          <button type="button" disabled title="Available in Phase 3">
            Enable camera
          </button>
        </div>
      </div>
    </div>
  )
}
