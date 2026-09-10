import { NOMINAL_RPM_33 } from '../lib/constants'
import { useDeckStore } from '../state/useDeckStore'

/**
 * 33⅓ / 45 selector (PRD §5.5). Switching mid-playback ramps the nominal
 * rate over ~0.4s — that ramp lives in platterPhysics, not here.
 *
 * The faces are pre-rendered PNGs (assets/, vendored into public/controls/);
 * each button just swaps its lit/unlit image.
 */
const IMG = {
  33: {
    on: '/controls/speed-selector-33-on.png',
    off: '/controls/speed-selector-33-off.png',
  },
  45: {
    on: '/controls/speed-selector-45-on.png',
    off: '/controls/speed-selector-45-off.png',
  },
} as const

export function SpeedSelector() {
  const rpm = useDeckStore((s) => s.rpm)
  const powered = useDeckStore((s) => s.powered)
  const setRpm = useDeckStore((s) => s.setRpm)
  const is33 = rpm === NOMINAL_RPM_33

  return (
    <div className="tt-speed" role="group" aria-label="Playback speed">
      <button
        type="button"
        className="tt-speed__btn"
        data-on={is33}
        disabled={!powered}
        aria-pressed={is33}
        aria-label="33⅓ RPM"
        onClick={() => setRpm(NOMINAL_RPM_33)}
      >
        <img src={is33 ? IMG[33].on : IMG[33].off} alt="" draggable={false} />
      </button>
      <button
        type="button"
        className="tt-speed__btn"
        data-on={!is33}
        disabled={!powered}
        aria-pressed={!is33}
        aria-label="45 RPM"
        onClick={() => setRpm(45)}
      >
        <img src={!is33 ? IMG[45].on : IMG[45].off} alt="" draggable={false} />
      </button>
    </div>
  )
}
