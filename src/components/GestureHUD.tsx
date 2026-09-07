import { useState } from 'react'
import { useDeckStore } from '../state/useDeckStore'

/**
 * Persistent per-hand gesture HUD (PRD §6.5). Collapsible, not removable.
 * Phase 3 fills it with pose name / owned control / dwell progress per hand;
 * for now it reflects the (empty) hands array and the vocabulary.
 */
const VOCAB = [
  ['SCRATCH', 'index in the platter — drives the record'],
  ['PINCH-PITCH', 'thumb + index — rides the pitch fader'],
  ['PALM-HOLD', 'open hand, held still — start / stop'],
  ['TWO-FINGER-HOLD', 'index + middle, held still — 33 / 45'],
] as const

export function GestureHUD() {
  const hands = useDeckStore((s) => s.hands)
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
          {hands.length === 0 ? (
            <p className="tt-hud__none">no hands detected</p>
          ) : (
            hands.map((h, i) => (
              <div key={i} className="tt-hud__hand">
                <strong>{h.handedness}</strong>
                <span>{h.pose}</span>
                <span>{h.owns ?? '—'}</span>
              </div>
            ))
          )}
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
