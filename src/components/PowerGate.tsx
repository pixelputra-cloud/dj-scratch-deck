import { useState } from 'react'
import { powerOnDeck } from '../state/deckController'
import { useDeckStore } from '../state/useDeckStore'

/**
 * "Tap to power on" click gate (PRD §4.3). A hand gesture is not a user-input
 * event, so the AudioContext can only be resumed from a real click. Staged as
 * a darkened booth — one record turning in the blur behind a lit nameplate.
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
    <div className="tt-powergate" role="dialog" aria-label="Power on the deck">
      <div className="tt-powergate__disc" aria-hidden>
        <span className="tt-powergate__disc-label" />
        <span className="tt-powergate__disc-sheen" />
      </div>
      <div className="tt-powergate__grain" aria-hidden />
      <div className="tt-powergate__vignette" aria-hidden />

      <div className="tt-powergate__panel">
        <p className="tt-powergate__eyebrow">Gesture-controlled turntable</p>

        <h1 className="tt-powergate__brand">
          <span className="tt-powergate__brand-main">SCRATCH</span>
          <span className="tt-powergate__brand-pro">DECK</span>
        </h1>

        <p className="tt-powergate__sub">Power on the deck</p>

        <p className="tt-powergate__body">
          Hey&nbsp;DJ — scratch your favourite tracks with hand gestures in
          front of the webcam. Upload your own or pick one from the library.
        </p>
        <p className="tt-powergate__note">
          Nothing is uploaded — your audio and camera feed stay on your machine.
        </p>

        <button
          type="button"
          className="tt-powergate__switch"
          data-busy={busy}
          onClick={onPower}
          disabled={busy}
        >
          <span className="tt-powergate__switch-dot" aria-hidden />
          {busy ? 'Starting…' : 'Power'}
        </button>

        {err ? <p className="tt-powergate__err">{err}</p> : null}
      </div>
    </div>
  )
}
