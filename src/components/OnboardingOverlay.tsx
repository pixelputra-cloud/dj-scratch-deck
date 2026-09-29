import { useEffect, useState } from 'react'
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

type Pose = 'scratch' | 'two-finger' | 'fist' | 'point'

/** Which finger name in VOCAB maps to which hand icon. */
const ICON_BY_GESTURE: Record<string, Pose> = {
  SCRATCH: 'scratch',
  'TWO-FINGER-PITCH': 'two-finger',
  'FIST-HOLD': 'fist',
  'ONE-FINGER-HOLD': 'point',
}
const MOTION_BY_GESTURE: Record<string, string> = {
  SCRATCH: '↻ spins the record',
  'TWO-FINGER-PITCH': '⇄ slides the fader',
  'FIST-HOLD': '⏱ hold to latch',
  'ONE-FINGER-HOLD': '⏱ hold to latch',
}

/** index/middle/ring extended per pose — same three bits gestureMachine's
 *  isScratchPose / isTwoFingerPose / isFistPose / isPointPose test against
 *  (thumb and pinky never matter, so they're always drawn curled). */
const EXTENDED: Record<Pose, { index: boolean; middle: boolean; ring: boolean }> = {
  scratch: { index: true, middle: true, ring: true },
  'two-finger': { index: true, middle: true, ring: false },
  fist: { index: false, middle: false, ring: false },
  point: { index: true, middle: false, ring: false },
}

const PALM = '16,40 22,33 30,31 38,33 45,36 46,50 18,50'
const WRIST: [number, number] = [32, 54]
const FINGER_GEOM: Record<
  'thumb' | 'index' | 'middle' | 'ring' | 'pinky',
  { base: [number, number]; tip: [number, number] }
> = {
  thumb: { base: [16, 40], tip: [7, 31] },
  index: { base: [22, 33], tip: [18, 11] },
  middle: { base: [30, 31], tip: [30, 7] },
  ring: { base: [38, 33], tip: [42, 11] },
  pinky: { base: [45, 36], tip: [51, 19] },
}

/** A small schematic hand — same visual vocabulary (dots for joints, thin
 *  bones) as the live cyan landmark skeleton drawn over the camera feed, so
 *  the "how to play" card reads as the same hand-tracking system, not a
 *  separate illustration style. */
function HandIcon({ pose }: { pose: Pose }) {
  const ext = EXTENDED[pose]
  const fingers: Array<{ name: keyof typeof FINGER_GEOM; on: boolean }> = [
    { name: 'thumb', on: false },
    { name: 'index', on: ext.index },
    { name: 'middle', on: ext.middle },
    { name: 'ring', on: ext.ring },
    { name: 'pinky', on: false },
  ]
  return (
    <svg className="tt-onboarding__icon" viewBox="0 0 64 64" aria-hidden focusable="false">
      <polygon className="tt-onboarding__palm" points={PALM} />
      <line
        className="tt-onboarding__bone"
        x1={WRIST[0]}
        y1={WRIST[1]}
        x2={32}
        y2={42}
      />
      {fingers.map(({ name, on }) => {
        const { base, tip } = FINGER_GEOM[name]
        return on ? (
          <g key={name}>
            <line
              className="tt-onboarding__bone"
              x1={base[0]}
              y1={base[1]}
              x2={tip[0]}
              y2={tip[1]}
            />
            <circle className="tt-onboarding__joint" cx={tip[0]} cy={tip[1]} r={3.2} />
          </g>
        ) : (
          <circle
            key={name}
            className="tt-onboarding__joint tt-onboarding__joint--curled"
            cx={base[0]}
            cy={base[1]}
            r={2.4}
          />
        )
      })}
    </svg>
  )
}

/**
 * One-time "how to play" card, shown right after POWER — the deck's own
 * gesture vocabulary (SCRATCH / TWO-FINGER-PITCH / FIST-HOLD / ONE-FINGER-
 * HOLD, straight from GestureHUD's VOCAB so the copy can't drift) illustrated
 * with small schematic hands in the same cyan landmark styling as the live
 * tracker overlay, plus a prominent camera call-to-action.
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
        <p className="tt-onboarding__lede">
          Every control also works with a mouse — but the whole point is
          playing it in front of the webcam. Here's the vocabulary:
        </p>

        <div className="tt-onboarding__gestures">
          {GESTURE_VOCAB.map(([name, desc]) => (
            <div className="tt-onboarding__gesture" key={name}>
              <HandIcon pose={ICON_BY_GESTURE[name] ?? 'point'} />
              <span className="tt-onboarding__gesture-name">{name}</span>
              <span className="tt-onboarding__gesture-desc">{desc}</span>
              <span className="tt-onboarding__gesture-motion">
                {MOTION_BY_GESTURE[name]}
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
