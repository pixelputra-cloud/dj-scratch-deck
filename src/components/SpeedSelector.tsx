import { NOMINAL_RPM_33 } from '../lib/constants'
import { useDeckStore } from '../state/useDeckStore'

/**
 * 33⅓ / 45 selector (PRD §5.5). Switching mid-playback ramps the nominal
 * rate over ~0.4s — that ramp lives in platterPhysics, not here.
 */
export function SpeedSelector() {
  const rpm = useDeckStore((s) => s.rpm)
  const powered = useDeckStore((s) => s.powered)
  const setRpm = useDeckStore((s) => s.setRpm)

  return (
    <div className="tt-speed" role="group" aria-label="Playback speed">
      <button
        type="button"
        className="tt-speed__btn"
        data-on={rpm === NOMINAL_RPM_33}
        disabled={!powered}
        onClick={() => setRpm(NOMINAL_RPM_33)}
      >
        33<span className="tt-speed__frac">⅓</span>
      </button>
      <button
        type="button"
        className="tt-speed__btn"
        data-on={rpm === 45}
        disabled={!powered}
        onClick={() => setRpm(45)}
      >
        45
      </button>
    </div>
  )
}
