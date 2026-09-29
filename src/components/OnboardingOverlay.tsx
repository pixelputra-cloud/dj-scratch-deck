import { useEffect, useState } from 'react'
import { asset } from '../lib/asset'
import { GESTURE_VOCAB } from '../lib/gestureVocab'
import { useDeckStore } from '../state/useDeckStore'

const STORAGE_KEY = 'scratch-deck:onboarding-seen'

function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false // private-browsing / storage disabled — just show it every time
  }
}
function markOnboardingSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // ignore
  }
}

/** Illustrated hand art (assets/*.svg -> public/gestures/, via asset()) —
 *  one per gesture name in GESTURE_VOCAB. Each already draws the pose (open
 *  hand, two fingers, fist, one finger) plus its tracked joints, so the card
 *  copy no longer has to describe hand/finger mechanics in words. */
const ICON_BY_GESTURE: Record<string, string> = {
  SCRATCH: 'gestures/scratch.svg',
  'TWO-FINGER-PITCH': 'gestures/two-finger-pitch.svg',
  'FIST-HOLD': 'gestures/fist-hold.svg',
  'ONE-FINGER-HOLD': 'gestures/one-finger-hold.svg',
}

/** One short line per gesture — the *result*, not the hand shape (the icon
 *  is the hand shape now). Deliberately separate from GESTURE_VOCAB's own
 *  description, which stays literal/technical for the in-session Gestures
 *  panel reference. */
const RESULT_BY_GESTURE: Record<string, string> = {
  SCRATCH: 'Drives the record',
  'TWO-FINGER-PITCH': 'Rides the pitch fader',
  'FIST-HOLD': 'Starts and stops the motor',
  'ONE-FINGER-HOLD': 'Switches 33 ⁄ 45',
}

/**
 * One-time "how to play" card, shown right after POWER — the deck's own
 * gesture vocabulary (SCRATCH / TWO-FINGER-PITCH / FIST-HOLD / ONE-FINGER-
 * HOLD, straight from GESTURE_VOCAB so the names can't drift), each
 * illustrated with the hand art the card actually teaches from, plus a
 * prominent camera call-to-action.
 *
 * Same frosted-glass nameplate language as <PowerGate>, without the full-
 * bleed photo — the deck should still read, dimmed, behind it. Dismissal is
 * tracked in localStorage only (a one-shot "have I shown this" flag — not
 * store state, nothing else in the app needs it), so it never shows again on
 * this browser once closed, whichever way it's closed.
 */
export function OnboardingOverlay({ onEnableCamera }: { onEnableCamera: () => void }) {
  const powered = useDeckStore((s) => s.powered)
  const cameraState = useDeckStore((s) => s.cameraState)
  const [dismissed, setDismissed] = useState(() => hasSeenOnboarding())

  const visible = powered && !dismissed

  const close = () => {
    markOnboardingSeen()
    setDismissed(true)
  }

  // enabling the camera from elsewhere (e.g. the header) while this is open
  // means the visitor didn't need the card's own CTA — get out of the way
  useEffect(() => {
    if (visible && cameraState === 'on') close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraState])

  if (!visible) return null

  const onCameraCta = () => {
    onEnableCamera()
    close()
  }

  return (
    <div className="tt-onboarding" role="dialog" aria-label="How to play">
      <div className="tt-onboarding__panel">
        <button
          type="button"
          className="tt-onboarding__close"
          onClick={close}
          aria-label="Close"
        >
          ×
        </button>

        <p className="tt-onboarding__eyebrow">How to play</p>
        <h2 className="tt-onboarding__title">Scratch it with your hands</h2>
        <p className="tt-onboarding__lede">Everything below also works with a mouse.</p>

        <div className="tt-onboarding__gestures">
          {GESTURE_VOCAB.map(([name]) => (
            <div className="tt-onboarding__gesture" key={name}>
              <span className="tt-onboarding__icon-stage">
                <img
                  className="tt-onboarding__icon"
                  src={asset(ICON_BY_GESTURE[name])}
                  alt=""
                  draggable={false}
                />
              </span>
              <span className="tt-onboarding__gesture-name">{name}</span>
              <span className="tt-onboarding__gesture-result">
                {RESULT_BY_GESTURE[name]}
              </span>
            </div>
          ))}
        </div>

        <button type="button" className="tt-onboarding__cta" onClick={onCameraCta}>
          <span className="tt-onboarding__cta-dot" aria-hidden />
          Enable camera &amp; play with your hands
        </button>
        <button type="button" className="tt-onboarding__skip" onClick={close}>
          Skip — use the mouse instead
        </button>
        <p className="tt-onboarding__footnote">
          You can always switch the camera on later from the top-right corner.
        </p>
      </div>
    </div>
  )
}
