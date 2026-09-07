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

/** Build a synthetic HandSample. `indexTipN` places landmark 8 exactly. */
function mkHand(
  handedness: Handedness,
  opts: {
    fingers?: Fingers
    indexTipN?: Point
    pinch?: boolean
    wristShift?: number // add to every x — used to fake centroid motion
  } = {},
): HandSample {
  const f = opts.fingers ?? { index: true }
  const tip = opts.indexTipN ?? nAt(0, 0)
  const sx = opts.wristShift ?? 0
  const wrist = { x: tip.x + sx, y: tip.y + 0.42 }
  const lm: Point[] = Array.from({ length: 21 }, () => ({ ...wrist }))
  lm[0] = { ...wrist }
  lm[5] = { x: wrist.x - 0.05, y: wrist.y - 0.2 }
  lm[9] = { x: wrist.x, y: wrist.y - 0.22 } // handScale = 0.22
  lm[13] = { x: wrist.x + 0.05, y: wrist.y - 0.2 }
  lm[17] = { x: wrist.x + 0.09, y: wrist.y - 0.18 }
  lm[1] = { x: wrist.x - 0.1, y: wrist.y - 0.08 }
  lm[2] = { x: wrist.x - 0.14, y: wrist.y - 0.14 }

  const chain = (
    mcp: number,
    j1: number,
    j2: number,
    tipI: number,
    extended: boolean,
    forced?: Point,
  ) => {
    const m = lm[mcp]
    if (extended) {
      lm[j1] = { x: m.x, y: m.y - 0.08 }
      lm[j2] = { x: m.x, y: m.y - 0.16 }
      lm[tipI] = forced ? { x: forced.x + sx, y: forced.y } : { x: m.x, y: m.y - 0.24 }
    } else {
      lm[j1] = { x: m.x, y: m.y - 0.03 }
      lm[j2] = { x: m.x, y: m.y + 0.03 }
      lm[tipI] = { x: m.x, y: m.y + 0.09 }
    }
  }
  chain(5, 6, 7, 8, f.index ?? false, f.index ? tip : undefined)
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
  if (opts.pinch) lm[4] = { x: tip.x + sx + 0.005, y: tip.y + 0.005 }

  return { handedness, landmarks: lm }
}

const INDEX_ONLY: Fingers = { index: true }
const PALM: Fingers = { index: true, middle: true, ring: true, pinky: true }
const TWO: Fingers = { index: true, middle: true }
const FIST: Fingers = {}

let m: GestureMachine
beforeEach(() => {
  m = new GestureMachine()
})

describe('SCRATCH hysteresis', () => {
  const inAnn = nAt(90) // 90 px from centre — inside the annulus

  it('needs 2 qualifying frames to engage', () => {
    const h = () => [mkHand('Right', { fingers: INDEX_ONLY, indexTipN: inAnn })]
    const r1 = m.update(h(), 0, CTX)
    expect(r1.scratchRate).toBeNull() // 1 frame — not yet
    const r2 = m.update(h(), 16, CTX)
    expect(r2.scratchRate).not.toBeNull() // engaged (rate may be 0 on first sample)
  })

  it('a single dropped detection mid-scratch does NOT release the record', () => {
    const good = [mkHand('Right', { fingers: INDEX_ONLY, indexTipN: inAnn })]
    const dropped = [mkHand('Right', { fingers: FIST, indexTipN: inAnn })] // pose lost
    m.update(good, 0, CTX)
    m.update(good, 16, CTX) // engaged
    const a = m.update(dropped, 32, CTX)
    expect(a.scratchRate).not.toBeNull() // 1 bad frame — still held
    const b = m.update(dropped, 48, CTX)
    expect(b.scratchRate).not.toBeNull() // 2 bad frames — still held
    const c = m.update(dropped, 64, CTX)
    expect(c.scratchRate).toBeNull() // 3 bad frames — released (SCRATCH_EXIT_FRAMES)
  })

  it('a steady rotation produces a signed, bounded rate', () => {
    let last = 0
    for (let i = 0; i <= 10; i++) {
      const th = (i / 10) * (Math.PI / 2)
      const tipN = {
        x: 0.5 + (90 * Math.cos(th)) / SPAN,
        y: 0.5 + (90 * Math.sin(th)) / SPAN,
      }
      const r = m.update(
        [mkHand('Right', { fingers: INDEX_ONLY, indexTipN: tipN })],
        i * 16,
        CTX,
      )
      if (r.scratchRate != null) last = r.scratchRate
    }
    expect(Math.abs(last)).toBeGreaterThan(0)
    expect(Math.abs(last)).toBeLessThanOrEqual(4)
  })
})

describe('PINCH-PITCH', () => {
  const far = nAt(230) // well outside the annulus so SCRATCH can't claim it

  it('captures a baseline and tracks vertical hand movement', () => {
    const down = m.update(
      [mkHand('Right', { fingers: INDEX_ONLY, indexTipN: far, pinch: true })],
      0,
      CTX,
    )
    expect(down.pitchValue).toBeCloseTo(0, 3) // p0 = 0, y = y0

    // move the whole hand up by 0.1 normalised -> pitch rises by ~0.1*45 = 4.5%
    const upTip = { x: far.x, y: far.y - 0.1 }
    const up = m.update(
      [mkHand('Right', { fingers: INDEX_ONLY, indexTipN: upTip, pinch: true })],
      16,
      CTX,
    )
    expect(up.pitchValue).toBeGreaterThan(3)
    expect(up.pitchValue).toBeLessThan(6)
  })

  it('clamps to the active range', () => {
    m.update(
      [mkHand('Right', { fingers: INDEX_ONLY, indexTipN: far, pinch: true })],
      0,
      CTX,
    )
    const wayUp = { x: far.x, y: far.y - 0.5 }
    const r = m.update(
      [mkHand('Right', { fingers: INDEX_ONLY, indexTipN: wayUp, pinch: true })],
      16,
      CTX,
    )
    expect(r.pitchValue).toBe(8) // clamped to +range
  })

  it('releases when the pinch opens past the exit threshold', () => {
    m.update(
      [mkHand('Right', { fingers: INDEX_ONLY, indexTipN: far, pinch: true })],
      0,
      CTX,
    )
    const open = m.update(
      [mkHand('Right', { fingers: INDEX_ONLY, indexTipN: far, pinch: false })],
      16,
      CTX,
    )
    expect(open.pitchValue).toBeNull()
  })

  it('is suppressed while a fingertip is inside the platter annulus (priority)', () => {
    const inAnn = nAt(80)
    const r = m.update(
      [mkHand('Right', { fingers: INDEX_ONLY, indexTipN: inAnn, pinch: true })],
      0,
      CTX,
    )
    m.update(
      [mkHand('Right', { fingers: INDEX_ONLY, indexTipN: inAnn, pinch: true })],
      16,
      CTX,
    )
    const r2 = m.update(
      [mkHand('Right', { fingers: INDEX_ONLY, indexTipN: inAnn, pinch: true })],
      32,
      CTX,
    )
    expect(r.pitchValue).toBeNull()
    expect(r2.scratchRate).not.toBeNull() // SCRATCH claimed it instead
  })
})

describe('dwell gestures', () => {
  const far = nAt(240)

  it('PALM-HOLD toggles the motor after ~700 ms, exactly once', () => {
    // 700 ms / 50 ms = 14 frames to reach threshold; fire on the frame that crosses
    let fired = 0
    let r
    for (let i = 0; i < 20; i++) {
      r = m.update(
        [mkHand('Right', { fingers: PALM, indexTipN: far })],
        i * 50,
        CTX,
      )
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
          [mkHand('Right', { fingers, indexTipN: far })],
          from + i * 50,
          CTX,
        )
        if (r.motorToggle) fired++
      }
    }
    run(PALM, 0, 20) // fires once
    run(FIST, 1000, 4) // break the pose (also clears cooldown window)
    run(PALM, 1300, 20) // fires again
    expect(fired).toBe(2)
  })

  it('motion resets the dwell timer — a moving hand never triggers it', () => {
    let fired = 0
    for (let i = 0; i < 30; i++) {
      // shift the whole hand 0.05 / frame -> centroid velocity above stillness
      const r = m.update(
        [mkHand('Right', { fingers: PALM, indexTipN: far, wristShift: 0.05 * i })],
        i * 50,
        CTX,
      )
      if (r.motorToggle) fired++
    }
    expect(fired).toBe(0)
  })

  it('global cooldown blocks a second latched gesture for 500 ms', () => {
    // PALM fires around t=700; immediately switch to TWO-FINGER
    for (let i = 0; i < 16; i++) {
      m.update([mkHand('Right', { fingers: PALM, indexTipN: far })], i * 50, CTX)
    }
    // now hold TWO-FINGER starting right after; if cooldown works it can't
    // complete a 700 ms dwell until >=500 ms have passed first
    let firstRpmAt = -1
    for (let i = 0; i < 40; i++) {
      const t = 800 + i * 50
      const r = m.update(
        [mkHand('Right', { fingers: TWO, indexTipN: far })],
        t,
        CTX,
      )
      if (r.rpmToggle && firstRpmAt < 0) firstRpmAt = t
    }
    // PALM fires at t=700 -> cooldown to 1200 -> TWO-FINGER can't begin its
    // 700 ms dwell until t=1200, completing at exactly t=1900. Without the
    // cooldown a naive dwell would have completed near t=1500.
    expect(firstRpmAt).toBe(1900)
  })
})

describe('two-hand assignment (PRD §6.4.4)', () => {
  it('the hand nearer the platter centre scratches; the other pitches', () => {
    const near = nAt(70) // in annulus
    const far = nAt(235) // outside

    // frame 1
    m.update(
      [
        mkHand('Right', { fingers: INDEX_ONLY, indexTipN: near }),
        mkHand('Left', { fingers: INDEX_ONLY, indexTipN: far, pinch: true }),
      ],
      0,
      CTX,
    )
    // frame 2 — scratch engaged, move the near hand a touch to make rate != 0
    const r = m.update(
      [
        mkHand('Right', { fingers: INDEX_ONLY, indexTipN: nAt(70, 20) }),
        mkHand('Left', { fingers: INDEX_ONLY, indexTipN: { x: far.x, y: far.y - 0.05 }, pinch: true }),
      ],
      16,
      CTX,
    )

    expect(r.scratchRate).not.toBeNull()
    expect(r.pitchValue).not.toBeNull()
    const right = r.hands.find((h) => h.handedness === 'Right')!
    const left = r.hands.find((h) => h.handedness === 'Left')!
    expect(right.owns).toBe('scratch')
    expect(left.owns).toBe('pitch')
  })
})

describe('no hands', () => {
  it('releases held controls and leaves the fader alone', () => {
    const inAnn = nAt(90)
    m.update([mkHand('Right', { fingers: INDEX_ONLY, indexTipN: inAnn })], 0, CTX)
    m.update([mkHand('Right', { fingers: INDEX_ONLY, indexTipN: inAnn })], 16, CTX)
    const gone = m.update([], 32, CTX)
    expect(gone.scratchRate).toBeNull()
    expect(gone.pitchValue).toBeNull()
    expect(gone.hands).toEqual([])
  })
})
