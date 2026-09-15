/*
 * poseCodes.ts — MediaPipe hand landmarks -> a 5-bit finger pose code, plus
 * the scale/geometry helpers every threshold is expressed against (PRD §6.2).
 * Pure. Unit-tested.
 *
 * Landmark indices: 0 wrist · 4/8/12/16/20 finger tips ·
 * 3/6/10/14/18 the joints used for the "extended" test · 5/9/13/17 MCPs.
 */

export interface Point {
  x: number
  y: number
  z?: number
}

/** bit per finger, thumb = bit 0 */
export const FINGER = {
  THUMB: 1 << 0,
  INDEX: 1 << 1,
  MIDDLE: 1 << 2,
  RING: 1 << 3,
  PINKY: 1 << 4,
} as const

/** the four non-thumb fingers, for pose matching that ignores the thumb */
export const FOUR_FINGERS =
  FINGER.INDEX | FINGER.MIDDLE | FINGER.RING | FINGER.PINKY // 0b11110

const TIPS = [4, 8, 12, 16, 20]
const EXT_JOINTS = [3, 6, 10, 14, 18] // thumb IP, then the PIPs

export function dist2(a: Point, b: Point): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

/**
 * Hand scale = wrist(0) -> middle-MCP(9). Every distance threshold in the
 * gesture spec is a multiple of this, which makes them resolution- and
 * distance-independent.
 */
export function handScale(lm: Point[]): number {
  return dist2(lm[0], lm[9]) || 1e-6
}

/** dist(tip, wrist) > dist(joint, wrist) × 1.15  (PRD §6.2) */
export function fingerExtended(lm: Point[], finger: 0 | 1 | 2 | 3 | 4): boolean {
  const wrist = lm[0]
  const tip = lm[TIPS[finger]]
  const joint = lm[EXT_JOINTS[finger]]
  return dist2(tip, wrist) > dist2(joint, wrist) * 1.15
}

/** 5-bit pose code, thumb = bit 0 … pinky = bit 4. */
export function poseCode(lm: Point[]): number {
  let code = 0
  for (let f = 0; f < 5; f++) {
    if (fingerExtended(lm, f as 0 | 1 | 2 | 3 | 4)) code |= 1 << f
  }
  return code
}

/** Hand centroid — mean of wrist + the four finger MCPs. Stable under finger
 *  articulation, which is what the stillness test wants. */
export function handCentroid(lm: Point[]): Point {
  const idx = [0, 5, 9, 13, 17]
  let x = 0
  let y = 0
  for (const i of idx) {
    x += lm[i].x
    y += lm[i].y
  }
  return { x: x / idx.length, y: y / idx.length }
}

/** Mean of the four finger tips (index/middle/ring/pinky). The scratch pivot
 *  input — averaging four points cuts per-landmark jitter well below a single
 *  fingertip, so the angular velocity can be filtered less and lag less. */
export function fingertipsCentroid(lm: Point[]): Point {
  const idx = [8, 12, 16, 20]
  let x = 0
  let y = 0
  for (const i of idx) {
    x += lm[i].x
    y += lm[i].y
  }
  return { x: x / idx.length, y: y / idx.length }
}

export type PoseName =
  | 'SCRATCH'
  | 'POINT'
  | 'TWO-FINGER'
  | 'FIST'
  | '—'

const OPEN_HAND = FINGER.INDEX | FINGER.MIDDLE | FINGER.RING

/** Human-readable label for the HUD. Purely a pose-code match — unlike the
 *  old pinch gesture, POINT has no separate distance/contact test, so the
 *  code alone is enough to name it. */
export function poseName(code: number): PoseName {
  const four = code & FOUR_FINGERS
  if (four === 0) return 'FIST'
  if (isPointPose(code)) return 'POINT'
  if (four === (FINGER.INDEX | FINGER.MIDDLE)) return 'TWO-FINGER'
  if ((code & OPEN_HAND) === OPEN_HAND) return 'SCRATCH'
  return '—'
}

// --- pose predicates the state machine keys off -----------------------------

/** Open hand — index, middle and ring all extended (thumb & pinky don't
 *  matter). The pose you scratch a real record with, and the most robust for
 *  MediaPipe to read while the hand is moving fast. */
export function isScratchPose(code: number): boolean {
  return (code & OPEN_HAND) === OPEN_HAND
}

/** Closed fist — none of the four fingers extended. Held still, off the
 *  platter, this toggles the motor. */
export function isFistPose(code: number): boolean {
  return (code & FOUR_FINGERS) === 0
}

/**
 * A lone pointing index finger — extended, with middle/ring/pinky curled.
 * Drives the pitch fader (POINT-PITCH): no pinch or thumb contact needed,
 * just this pose. Requiring the other three curled rules out a fist and the
 * open/two-finger poses, so it can't be confused with them.
 */
export function isPointPose(code: number): boolean {
  return (
    (code & FINGER.INDEX) !== 0 &&
    (code & (FINGER.MIDDLE | FINGER.RING | FINGER.PINKY)) === 0
  )
}

/** Exactly index + middle among the four fingers. */
export function isTwoFingerPose(code: number): boolean {
  return (code & FOUR_FINGERS) === (FINGER.INDEX | FINGER.MIDDLE)
}
