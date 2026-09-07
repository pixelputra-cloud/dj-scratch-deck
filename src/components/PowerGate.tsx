import { useState } from 'react'
import { powerOnDeck } from '../state/deckController'
import { useDeckStore } from '../state/useDeckStore'

/**
 * "Tap to power on" click gate (PRD §4.3). A hand gesture is not a user-input
 * event, so the AudioContext can only be resumed from a real click. Framed as
 * a power switch on the plinth, not a browser-compliance apology.
 */
export function PowerGate() {
  const powered = useDeckStore((s) => s.powered)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (powered) return null

  const onPower = async () => {
    setBusy(true)
    setErr(null)
    try {
      await powerOnDeck()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start audio.')
      setBusy(false)
    }
  }

  return (
    <div className="tt-powergate" role="dialog" aria-label="Power on the turntable">
      <div className="tt-powergate__panel">
        <p className="tt-powergate__kicker">GESTURE-CONTROLLED TURNTABLE</p>
        <h1 className="tt-powergate__title">Power on the deck</h1>
        <p className="tt-powergate__body">
          Expressive, responsive gestural control of a record — play the platter
          with your hands in front of the webcam. Every control also works with
          the mouse. Nothing is uploaded; audio and camera stay on your machine.
        </p>
        <button
          type="button"
          className="tt-powergate__switch"
          data-busy={busy}
          onClick={onPower}
          disabled={busy}
        >
          <span className="tt-powergate__switch-dot" aria-hidden />
          {busy ? 'Starting…' : 'POWER'}
        </button>
        {err ? <p className="tt-powergate__err">{err}</p> : null}
      </div>
    </div>
  )
}
