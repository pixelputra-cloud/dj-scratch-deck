import { useDeckStore } from '../state/useDeckStore'

/**
 * Start/stop toggle (PRD §5.4). Click, or the FIST-HOLD gesture, flips
 * motorOn — the spin-up torque / power-down pitch drop is platterPhysics' job.
 *
 * The pill face is a pre-rendered PNG (assets/ → public/controls/). Its baked
 * "START" wordmark is covered by the live label so the button can still read
 * "STOP", and the label lights amber while the motor runs.
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
      <span className="tt-start__label">{motorOn ? 'STOP' : 'START'}</span>
    </button>
  )
}
