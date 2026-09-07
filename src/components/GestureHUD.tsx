import { useState } from 'react'
import { useDeckStore } from '../state/useDeckStore'

/**
 * Persistent per-hand gesture HUD (PRD §6.5). Collapsible, not removable.
 * Doubles as the build-time debugging tool and the thing that makes gestures
 * comprehensible to a first-time user.
 */
const VOCAB = [
  ['SCRATCH', 'index in the platter — drives the record'],
  ['PINCH-PITCH', 'thumb + index — rides the pitch fader'],
  ['PALM-HOLD', 'open hand, held still — start / stop'],
  ['TWO-FINGER-HOLD', 'index + middle, held still — 33 / 45'],
] as const

export function GestureHUD() {
  const hands = useDeckStore((s) => s.hands)
  const active = useDeckStore((s) => s.activeGestures)
  const cameraState = useDeckStore((s) => s.cameraState)
  const [open, setOpen] = useState(true)

  return (
    <div className="tt-hud" data-open={open}>
      <button
        type="button"
        className="tt-hud__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        GESTURE HUD {open ? '▾' : '▸'}
      </button>
      {open ? (
        <div className="tt-hud__body">
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
              <span data-on={active.pinch}>PITCH</span>
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
      ) : null}
    </div>
  )
}
