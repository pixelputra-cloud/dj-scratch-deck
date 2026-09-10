import { asset } from '../lib/asset'
import { useDeckStore } from '../state/useDeckStore'

/**
 * Start/stop toggle (PRD §5.4). Click, or the FIST-HOLD gesture, flips
 * motorOn — the spin-up torque / power-down pitch drop is platterPhysics' job.
 *
 * The face is a pre-rendered PNG (assets/ → public/controls/) that shows the
 * deck's current state: "START" + lit lamp while the motor runs, "STOP" +
 * dark lamp while it's stopped.
 */
export function StartButton() {
  const motorOn = useDeckStore((s) => s.motorOn)
  const powered = useDeckStore((s) => s.powered)
  const toggleMotor = useDeckStore((s) => s.toggleMotor)

  return (
    <button
      type="button"
      className="tt-start"
      data-on={motorOn}
      disabled={!powered}
      aria-pressed={motorOn}
      aria-label={motorOn ? 'Stop motor' : 'Start motor'}
      onClick={toggleMotor}
    >
      <img
        src={asset(
          motorOn
            ? 'controls/start-stop-on.png'
            : 'controls/start-stop-off.png',
        )}
        alt=""
        draggable={false}
      />
    </button>
  )
}
