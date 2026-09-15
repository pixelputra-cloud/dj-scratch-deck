import { beforeEach, describe, expect, it } from 'vitest'
import {
  GestureMachine,
  type GestureContext,
  type HandSample,
  type Handedness,
} from './gestureMachine'
import type { Point } from './poseCodes'

const GEOM = { cx: 500, cy: 500, radius: 200 }
const SPAN = GEOM.radius * 2 * 1.15 // 460 — a stand-in camera-frame -> px scale

/** stand-in for the real on-screen projector: centres the camera frame on the
 *  platter and spans SPAN px across it. */
const mapPoint = (n: Point): Point => ({
  x: GEOM.cx + (n.x - 0.5) * SPAN,
  y: GEOM.cy + (n.y - 0.5) * SPAN,
})

const CTX: GestureContext = {
  platter: GEOM,
  mapPoint,
  pitchPercent: 0,
  pitchRange: 8,
}

/** normalised point that maps `pxRight`,`pxDown` from the platter centre */
function nAt(pxRight: number, pxDown = 0): Point {
  return { x: 0.5 + pxRight / SPAN, y: 0.5 + pxDown / SPAN }
}

interface Fingers {
  thumb?: boolean
  index?: boolean
  middle?: boolean
  ring?: boolean
  pinky?: boolean
}

/**
 * Build a synthetic HandSample. Every *extended* fingertip is placed at
 * `anchorN`, so `fingertipsCentroid` (the scratch pivot) lands exactly there.
 */
function mkHand(
  handedness: Handedness,
  opts: {
    fingers?: Fingers
    anchorN?: Point
    wristShift?: number // add to every x — used to fake centroid motion
  } = {},
): HandSample {
  const f = opts.fingers ?? {}
  const a = opts.anchorN ?? nAt(0, 0)
  const sx = opts.wristShift ?? 0
  const wrist = { x: a.x + sx, y: a.y + 0.42 }
  const lm: Point[] = Array.from({ length: 21 }, () => ({ ...wrist }))
  lm[0] = { ...wrist }
  lm[5] = { x: wrist.x - 0.05, y: wrist.y - 0.2 }
  lm[9] = { x: wrist.x, y: wrist.y - 0.22 } // handScale = 0.22
  lm[13] = { x: wrist.x + 0.05, y: wrist.y - 0.2 }
  lm[17] = { x: wrist.x + 0.09, y: wrist.y - 0.18 }
  lm[1] = { x: wrist.x - 0.1, y: wrist.y - 0.08 }
  lm[2] = { x: wrist.x - 0.14, y: wrist.y - 0.14 }

  const chain = (mcp: number, j1: number, j2: number, tipI: number, extended: boolean) => {
    const m = lm[mcp]
    if (extended) {
      lm[j1] = { x: m.x, y: m.y - 0.08 }
      lm[j2] = { x: m.x, y: m.y - 0.16 }
      lm[tipI] = { x: a.x + sx, y: a.y } // all extended tips share the anchor
    } else {
      lm[j1] = { x: m.x, y: m.y - 0.03 }
      lm[j2] = { x: m.x, y: m.y + 0.03 }
      lm[tipI] = { x: m.x, y: m.y + 0.09 }
    }
  }
  chain(5, 6, 7, 8, f.index ?? false)
  chain(9, 10, 11, 12, f.middle ?? false)
  chain(13, 14, 15, 16, f.ring ?? false)
  chain(17, 18, 19, 20, f.pinky ?? false)

  if (f.thumb) {
    lm[3] = { x: wrist.x - 0.16, y: wrist.y - 0.18 }
    lm[4] = { x: wrist.x - 0.2, y: wrist.y - 0.22 }
  } else {
    lm[3] = { x: wrist.x - 0.12, y: wrist.y - 0.1 }
    lm[4] = { x: wrist.x - 0.06, y: wrist.y - 0.04 }
  }

  return { handedness, landmarks: lm }
}

const OPEN: Fingers = { index: true, middle: true, ring: true, pinky: true }
const INDEX_ONLY: Fingers = { index: true }
const TWO: Fingers = { index: true, middle: true }
const FIST: Fingers = {}

let m: GestureMachine
beforeEach(() => {
  m = new GestureMachine()
})

describe('SCRATCH hysteresis', () => {
  const inAnn = nAt(90) // 90 px from centre — inside the annulus

  it('engages on the first qualifying frame (open hand over the annulus)', () => {
    const r1 = m.update([mkHand('Right', { fingers: OPEN, anchorN: inAnn })], 0, CTX)
    expect(r1.scratchRate).not.toBeNull() // engaged; rate may be 0 on first sample
  })

  it('a single dropped detection mid-scratch does NOT release the record', () => {
    const good = [mkHand('Right', { fingers: OPEN, anchorN: inAnn })]
    const dropped = [mkHand('Right', { fingers: FIST, anchorN: inAnn })] // pose lost
    m.update(good, 0, CTX) // engaged
    const a = m.update(dropped, 16, CTX)
    expect(a.scratchRate).not.toBeNull() // 1 bad frame — still held
    const b = m.update(dropped, 32, CTX)
    expect(b.scratchRate).not.toBeNull() // 2 bad frames — still held
    const c = m.update(dropped, 48, CTX)
    expect(c.scratchRate).toBeNull() // 3 bad frames — released (SCRATCH_EXIT_FRAMES)
  })

  it('a steady rotation produces a signed, bounded rate', () => {
    let last = 0
    for (let i = 0; i <= 10; i++) {
      const th = (i / 10) * (Math.PI / 3)
      const anchorN = {
        x: 0.5 + (90 * Math.cos(th)) / SPAN,
        y: 0.5 + (90 * Math.sin(th)) / SPAN,
      }
      const r = m.update([mkHand('Right', { fingers: OPEN, anchorN })], i * 20, CTX)
      if (r.scratchRate != null) last = r.scratchRate
    }
    expect(Math.abs(last)).toBeGreaterThan(0)
    expect(Math.abs(last)).toBeLessThanOrEqual(4)
  })
})

describe('POINT-PITCH', () => {
  const far = nAt(280) // well outside the annulus

  /** Ramp the hand's Y from `far` to `far.y + dyTotal` over ~320 ms, then
   *  hold for another ~160 ms so the One Euro filter settles — a single
   *  before/after jump doesn't exercise it the way real motion does. */
  function ramp(dyTotal: number, rangeCtx: GestureContext = CTX) {
    let last: number | null = null
    for (let i = 1; i <= 30; i++) {
      const frac = Math.min(1, i / 20)
      const y = far.y + dyTotal * frac
      const r = m.update(
        [mkHand('Right', { fingers: INDEX_ONLY, anchorN: { x: far.x, y } })],
        i * 16,
        rangeCtx,
      )
      if (r.pitchValue != null) last = r.pitchValue
    }
    return last
  }

  it('captures a baseline and tracks vertical hand movement', () => {
    const down = m.update(
      [mkHand('Right', { fingers: INDEX_ONLY, anchorN: far })],
      0,
      CTX,
    )
    expect(down.pitchValue).toBeCloseTo(0, 3) // p0 = 0, y = y0

    const last = ramp(-0.1) // hand moves up 0.1 -> positive (faster)
    expect(last).toBeGreaterThan(3)
    expect(last).toBeLessThan(6)
  })

  it('clamps to the active range', () => {
    m.update(
      [mkHand('Right', { fingers: INDEX_ONLY, anchorN: far })],
      0,
      CTX,
    )
    const last = ramp(-0.5)
    expect(last).toBe(8) // clamped to +range
  })

  it('the gain scales with the active range — ±16 needs the same travel as ±8', () => {
    const wideCtx: GestureContext = { ...CTX, pitchRange: 16 }
    m.update(
      [mkHand('Right', { fingers: INDEX_ONLY, anchorN: far })],
      0,
      wideCtx,
    )
    const last = ramp(-0.1, wideCtx)
    // same 0.1 hand travel that swings ~4-5% of ±8 should swing ~8-10% of ±16
    expect(last).toBeGreaterThan(6)
    expect(last).toBeLessThan(12)
  })

  it('rides through a single dropped-pose frame without releasing', () => {
    m.update(
      [mkHand('Right', { fingers: INDEX_ONLY, anchorN: far })],
      0,
      CTX,
    )
    const dropped = [mkHand('Right', { fingers: OPEN, anchorN: far })] // pose lost
    const a = m.update(dropped, 16, CTX)
    expect(a.pitchValue).not.toBeNull() // 1 bad frame — still held
    const b = m.update(dropped, 32, CTX)
    expect(b.pitchValue).not.toBeNull() // 2 bad frames — still held
    const c = m.update(dropped, 48, CTX)
    expect(c.pitchValue).toBeNull() // 3 bad frames — released (PITCH_POINT_EXIT_FRAMES)
  })
})

describe('disambiguation', () => {
  it('an open hand in the annulus scratches; a lone pointing finger cannot claim it', () => {
    const inAnn = nAt(80)
    const r = m.update(
      [mkHand('Right', { fingers: OPEN, anchorN: inAnn })],
      0,
      CTX,
    )
    const r2 = m.update(
      [mkHand('Right', { fingers: OPEN, anchorN: nAt(80, 18) })],
      16,
      CTX,
    )
    expect(r.scratchRate).not.toBeNull()
    expect(r2.pitchValue).toBeNull()
  })

  it('a fingertip in the annulus blocks the aux-hand gestures entirely', () => {
    // index-only, held in the annulus: not an open hand -> not SCRATCH, and
    // the annulus priority rule suppresses POINT-PITCH -> nothing fires
    const inAnn = nAt(80)
    const r = m.update(
      [mkHand('Right', { fingers: INDEX_ONLY, anchorN: inAnn })],
      0,
      CTX,
    )
    const r2 = m.update(
      [mkHand('Right', { fingers: INDEX_ONLY, anchorN: inAnn })],
      16,
      CTX,
    )
    expect(r.pitchValue).toBeNull()
    expect(r.scratchRate).toBeNull()
    expect(r2.pitchValue).toBeNull()
    expect(r2.scratchRate).toBeNull()
  })
})

describe('dwell gestures', () => {
  const far = nAt(260)

  it('FIST-HOLD toggles the motor after ~700 ms, exactly once', () => {
    let fired = 0
    let r
    for (let i = 0; i < 20; i++) {
      r = m.update([mkHand('Right', { fingers: FIST, anchorN: far })], i * 50, CTX)
      if (r.motorToggle) fired++
    }
    expect(fired).toBe(1) // latched — not 30 times
    expect(r!.rpmToggle).toBe(false)
  })

  it('re-arms only after the pose breaks', () => {
    let fired = 0
    const run = (fingers: Fingers, from: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const r = m.update(
          [mkHand('Right', { fingers, anchorN: far })],
          from + i * 50,
          CTX,
        )
        if (r.motorToggle) fired++
      }
    }
    run(FIST, 0, 20) // fires once
    run(OPEN, 1000, 4) // break the pose
    run(FIST, 1300, 20) // fires again
    expect(fired).toBe(2)
  })

  it('motion resets the dwell timer — a moving hand never triggers it', () => {
    let fired = 0
    for (let i = 0; i < 30; i++) {
      const r = m.update(
        [mkHand('Right', { fingers: FIST, anchorN: far, wristShift: 0.05 * i })],
        i * 50,
        CTX,
      )
      if (r.motorToggle) fired++
    }
    expect(fired).toBe(0)
  })

  it('global cooldown blocks a second latched gesture for 500 ms', () => {
    // FIST fires at t=700; immediately switch to TWO-FINGER
    for (let i = 0; i < 16; i++) {
      m.update([mkHand('Right', { fingers: FIST, anchorN: far })], i * 50, CTX)
    }
    let firstRpmAt = -1
    for (let i = 0; i < 40; i++) {
      const t = 800 + i * 50
      const r = m.update([mkHand('Right', { fingers: TWO, anchorN: far })], t, CTX)
      if (r.rpmToggle && firstRpmAt < 0) firstRpmAt = t
    }
    // fire at t=700 -> cooldown to 1200 -> TWO-FINGER's 700 ms dwell can't start
    // arming until t=1200, completing at exactly t=1900.
    expect(firstRpmAt).toBe(1900)
  })
})

describe('two-hand assignment (PRD §6.4.4)', () => {
  it('the hand nearer the platter centre scratches; the other pitches', () => {
    const near = nAt(70) // in annulus
    const far = nAt(280) // outside

    m.update(
      [
        mkHand('Right', { fingers: OPEN, anchorN: near }),
        mkHand('Left', { fingers: INDEX_ONLY, anchorN: far }),
      ],
      0,
      CTX,
    )
    const r = m.update(
      [
        mkHand('Right', { fingers: OPEN, anchorN: nAt(70, 20) }),
        mkHand('Left', {
          fingers: INDEX_ONLY,
          anchorN: { x: far.x, y: far.y - 0.05 },
        }),
      ],
      16,
      CTX,
    )

    expect(r.scratchRate).not.toBeNull()
    expect(r.pitchValue).not.toBeNull()
    expect(r.hands.find((h) => h.handedness === 'Right')!.owns).toBe('scratch')
    expect(r.hands.find((h) => h.handedness === 'Left')!.owns).toBe('pitch')
  })
})

describe('no hands', () => {
  it('releases held controls and leaves the fader alone', () => {
    const inAnn = nAt(90)
    m.update([mkHand('Right', { fingers: OPEN, anchorN: inAnn })], 0, CTX)
    m.update([mkHand('Right', { fingers: OPEN, anchorN: nAt(90, 15) })], 16, CTX)
    const gone = m.update([], 32, CTX)
    expect(gone.scratchRate).toBeNull()
    expect(gone.pitchValue).toBeNull()
    expect(gone.hands).toEqual([])
  })
})
