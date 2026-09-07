import { describe, expect, it } from 'vitest'
import {
  FINGER,
  FOUR_FINGERS,
  fingerExtended,
  handCentroid,
  handScale,
  isPalmPose,
  isPinchContext,
  isScratchPose,
  isTwoFingerPose,
  pinchDistance,
  poseCode,
  poseName,
  type Point,
} from './poseCodes'

/**
 * Build a synthetic 21-landmark hand. The hand points "up" (−y). Each finger
 * is a straight chain from its MCP; `fingers` says which are extended (long)
 * vs curled (short, and folded back toward the wrist so tip is closer than
 * the joint).
 */
function hand(
  fingers: { thumb?: boolean; index?: boolean; middle?: boolean; ring?: boolean; pinky?: boolean } = {},
): Point[] {
  const lm: Point[] = new Array(21).fill(null).map(() => ({ x: 0, y: 0 }))
  lm[0] = { x: 0.5, y: 0.9 } // wrist, near bottom

  // MCP row across the palm, a little above the wrist
  const mcp: Record<number, Point> = {
    5: { x: 0.44, y: 0.66 },
    9: { x: 0.5, y: 0.64 },
    13: { x: 0.56, y: 0.66 },
    17: { x: 0.62, y: 0.68 },
  }
  lm[5] = mcp[5]
  lm[9] = mcp[9]
  lm[13] = mcp[13]
  lm[17] = mcp[17]
  lm[1] = { x: 0.4, y: 0.8 } // thumb CMC
  lm[2] = { x: 0.36, y: 0.74 } // thumb MCP

  const chain = (
    mcpIdx: number,
    j1: number,
    j2: number,
    tip: number,
    extended: boolean,
  ) => {
    const m = lm[mcpIdx]
    if (extended) {
      lm[j1] = { x: m.x, y: m.y - 0.09 }
      lm[j2] = { x: m.x, y: m.y - 0.16 }
      lm[tip] = { x: m.x, y: m.y - 0.22 }
    } else {
      // curled: joints just above mcp, tip folded back down toward wrist
      lm[j1] = { x: m.x, y: m.y - 0.04 }
      lm[j2] = { x: m.x, y: m.y + 0.02 }
      lm[tip] = { x: m.x, y: m.y + 0.08 }
    }
  }

  chain(5, 6, 7, 8, !!fingers.index)
  chain(9, 10, 11, 12, !!fingers.middle)
  chain(13, 14, 15, 16, !!fingers.ring)
  chain(17, 18, 19, 20, !!fingers.pinky)

  // thumb (finger 0 uses joints 3 -> tip 4)
  if (fingers.thumb) {
    lm[3] = { x: 0.3, y: 0.68 }
    lm[4] = { x: 0.24, y: 0.62 }
  } else {
    lm[3] = { x: 0.38, y: 0.72 }
    lm[4] = { x: 0.44, y: 0.74 } // tucked in, closer to wrist than joint
  }

  return lm
}

describe('handScale', () => {
  it('is the wrist -> middle-MCP distance and never zero', () => {
    const lm = hand()
    expect(handScale(lm)).toBeCloseTo(Math.hypot(0, 0.26), 6)
    const degenerate = new Array(21).fill(null).map(() => ({ x: 0.5, y: 0.5 }))
    expect(handScale(degenerate)).toBeGreaterThan(0)
  })
})

describe('fingerExtended / poseCode', () => {
  it('detects an index-only point', () => {
    const lm = hand({ index: true })
    expect(fingerExtended(lm, 1)).toBe(true)
    expect(fingerExtended(lm, 2)).toBe(false)
    expect(poseCode(lm) & FOUR_FINGERS).toBe(FINGER.INDEX)
  })

  it('detects an open palm (all four fingers)', () => {
    const lm = hand({ index: true, middle: true, ring: true, pinky: true })
    expect(poseCode(lm) & FOUR_FINGERS).toBe(FOUR_FINGERS)
  })

  it('detects index + middle', () => {
    const lm = hand({ index: true, middle: true })
    expect(poseCode(lm) & FOUR_FINGERS).toBe(FINGER.INDEX | FINGER.MIDDLE)
  })

  it('a fist extends nothing', () => {
    expect(poseCode(hand()) & FOUR_FINGERS).toBe(0)
  })
})

describe('pose predicates', () => {
  it('isScratchPose: index yes, ring/pinky no, middle optional', () => {
    expect(isScratchPose(poseCode(hand({ index: true })))).toBe(true)
    expect(isScratchPose(poseCode(hand({ index: true, middle: true })))).toBe(true)
    expect(
      isScratchPose(poseCode(hand({ index: true, ring: true, pinky: true }))),
    ).toBe(false)
    expect(isScratchPose(poseCode(hand({ middle: true })))).toBe(false)
  })

  it('isPalmPose / isTwoFingerPose are mutually exclusive', () => {
    const palm = poseCode(hand({ index: true, middle: true, ring: true, pinky: true }))
    const two = poseCode(hand({ index: true, middle: true }))
    expect(isPalmPose(palm)).toBe(true)
    expect(isTwoFingerPose(palm)).toBe(false)
    expect(isTwoFingerPose(two)).toBe(true)
    expect(isPalmPose(two)).toBe(false)
  })

  it('isPinchContext wants the other three fingers curled', () => {
    expect(isPinchContext(poseCode(hand({ index: true })))).toBe(true)
    expect(isPinchContext(poseCode(hand({ index: true, middle: true })))).toBe(false)
  })
})

describe('pinchDistance', () => {
  it('is small when thumb meets index, large when the hand is open', () => {
    const open = hand({ index: true, middle: true, ring: true, pinky: true, thumb: true })
    const openD = pinchDistance(open)

    // pinch: move thumb tip onto the index tip
    const pinch = hand({ index: true, thumb: true })
    pinch[4] = { ...pinch[8] }
    expect(pinchDistance(pinch)).toBeLessThan(openD)
    expect(pinchDistance(pinch)).toBeLessThan(0.35 * handScale(pinch))
  })
})

describe('poseName', () => {
  it('labels the vocabulary', () => {
    expect(poseName(poseCode(hand({ index: true })), false)).toBe('SCRATCH')
    expect(poseName(poseCode(hand({ index: true, middle: true })), false)).toBe(
      'TWO-FINGER',
    )
    expect(
      poseName(
        poseCode(hand({ index: true, middle: true, ring: true, pinky: true })),
        false,
      ),
    ).toBe('PALM')
    expect(poseName(0, true)).toBe('PINCH')
    expect(poseName(poseCode(hand()), false)).toBe('FIST')
  })
})

describe('handCentroid', () => {
  it('sits inside the palm', () => {
    const c = handCentroid(hand({ index: true }))
    expect(c.x).toBeGreaterThan(0.4)
    expect(c.x).toBeLessThan(0.6)
    expect(c.y).toBeGreaterThan(0.6)
    expect(c.y).toBeLessThan(0.8)
  })
})
