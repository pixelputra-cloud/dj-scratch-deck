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

/** thumb tip(4) <-> index tip(8), raw distance (compare against ×handScale). */
export function pinchDistance(lm: Point[]): number {
  return dist2(lm[4], lm[8])
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

export type PoseName =
  | 'SCRATCH'
  | 'PINCH'
  | 'PALM'
  | 'TWO-FINGER'
  | 'OPEN'
  | 'FIST'
  | '—'

/** Human-readable label for the HUD. `pinching` is passed in because a pinch
 *  is a distance test, not a pure pose-code match. */
export function poseName(code: number, pinching: boolean): PoseName {
  if (pinching) return 'PINCH'
  const four = code & FOUR_FINGERS
  if (four === FOUR_FINGERS) return 'PALM'
  if (four === (FINGER.INDEX | FINGER.MIDDLE)) return 'TWO-FINGER'
  if (four === FINGER.INDEX) return 'SCRATCH'
  if (four === 0) return 'FIST'
  if (code === (FOUR_FINGERS | FINGER.THUMB)) return 'OPEN'
  return '—'
}

// --- pose predicates the state machine keys off -----------------------------

/** Index extended, ring & pinky NOT — middle is optional (PRD §6.3 SCRATCH). */
export function isScratchPose(code: number): boolean {
  return (
    (code & FINGER.INDEX) !== 0 &&
    (code & FINGER.RING) === 0 &&
    (code & FINGER.PINKY) === 0
  )
}

/**
 * The non-thumb context for a pinch: the index (the pinching finger) is
 * extended and middle/ring/pinky are curled. Requiring the index rules out a
 * closed fist, whose curled index tip sits close enough to the thumb to
 * otherwise read as a pinch.
 */
export function isPinchContext(code: number): boolean {
  return (
    (code & FINGER.INDEX) !== 0 &&
    (code & (FINGER.MIDDLE | FINGER.RING | FINGER.PINKY)) === 0
  )
}

/** All four fingers extended (thumb ignored). */
export function isPalmPose(code: number): boolean {
  return (code & FOUR_FINGERS) === FOUR_FINGERS
}

/** Exactly index + middle among the four fingers. */
export function isTwoFingerPose(code: number): boolean {
  return (code & FOUR_FINGERS) === (FINGER.INDEX | FINGER.MIDDLE)
}
