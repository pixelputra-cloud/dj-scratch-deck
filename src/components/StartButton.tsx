import { useDeckStore } from '../state/useDeckStore'

/**
 * Start/stop toggle (PRD §5.4). Click now; palm-hold gesture in Phase 3.
 * The spin-up torque and power-down pitch drop are the physics model's job
 * (platterPhysics) — this button only flips motorOn.
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
      <span className="tt-start__ring" aria-hidden />
      <span className="tt-start__label">{motorOn ? 'STOP' : 'START'}</span>
    </button>
  )
}
