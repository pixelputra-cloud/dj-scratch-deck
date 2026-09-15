import { useDeckStore } from '../state/useDeckStore'

/**
 * Gesture info — the "Gestures" tab of <SidePanel>. Per-hand pose / owned
 * control / dwell progress when the camera is live (PRD §6.5), plus the
 * gesture vocabulary.
 */
const VOCAB = [
  ['SCRATCH', 'open hand over the platter — drives the record'],
  ['POINT-PITCH', 'point with one finger, move up/down — rides the pitch fader'],
  ['FIST-HOLD', 'make a fist off the platter, held still — start / stop'],
  ['TWO-FINGER-HOLD', 'index + middle, held still — 33 / 45'],
] as const

export function GesturePanel() {
  const hands = useDeckStore((s) => s.hands)
  const active = useDeckStore((s) => s.activeGestures)
  const cameraState = useDeckStore((s) => s.cameraState)

  return (
    <div className="tt-hud">
      {cameraState !== 'on' ? (
        <p className="tt-hud__none">camera off — mouse control active</p>
      ) : hands.length === 0 ? (
        <p className="tt-hud__none">no hands detected — move into frame</p>
      ) : (
        <div className="tt-hud__hands">
          {hands.map((h, i) => (
            <div key={i} className="tt-hud__hand" data-owns={h.owns ?? ''}>
              <span className="tt-hud__hand-name">{h.handedness}</span>
              <span className="tt-hud__pose">{h.pose}</span>
              <span className="tt-hud__owns">{h.owns ?? 'idle'}</span>
              {h.dwellProgress > 0 ? (
                <span className="tt-hud__dwell" aria-hidden>
                  <span style={{ width: `${Math.round(h.dwellProgress * 100)}%` }} />
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {cameraState === 'on' ? (
        <div className="tt-hud__active">
          <span data-on={active.scratch}>SCRATCH</span>
          <span data-on={active.point}>PITCH</span>
          <span data-on={!!active.dwell}>{active.dwell ?? 'DWELL'}</span>
        </div>
      ) : null}

      <ul className="tt-hud__vocab">
        {VOCAB.map(([name, desc]) => (
          <li key={name}>
            <b>{name}</b>
            <span>{desc}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
