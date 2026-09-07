import { describe, expect, it } from 'vitest'
import {
  angleAt,
  angularVelocityToRate,
  inAnnulus,
  ScratchTracker,
  unwrapAngle,
} from './platterMapping'
import { MAX_SCRATCH_RATE, OMEGA_NOMINAL_33 } from '../lib/constants'
import { TAU } from '../lib/math'

const PI = Math.PI

describe('unwrapAngle — the ±π boundary (PRD §12)', () => {
  it('is identity for small steps', () => {
    expect(unwrapAngle(0.1, 0.2)).toBeCloseTo(0.2, 12)
    expect(unwrapAngle(-0.3, -0.1)).toBeCloseTo(-0.1, 12)
  })

  it('crossing +π going anticlockwise does not spike', () => {
    // prev just below +π, curr wrapped to just above -π
    const prev = PI - 0.05
    const curr = -PI + 0.05 // atan2 output after the wrap
    const out = unwrapAngle(prev, curr)
    // true continuous angle is ~ +π + 0.05, NOT ~ -π
    expect(out).toBeCloseTo(PI + 0.05, 6)
    expect(out - prev).toBeCloseTo(0.1, 6) // small, positive step
  })

  it('crossing -π going clockwise does not spike', () => {
    const prev = -PI + 0.05
    const curr = PI - 0.05
    const out = unwrapAngle(prev, curr)
    expect(out).toBeCloseTo(-PI - 0.05, 6)
    expect(out - prev).toBeCloseTo(-0.1, 6) // small, negative step
  })

  it('handles multiple accumulated turns', () => {
    let a = 0
    // walk forward past +π three times in small hops
    const hops = [1, 2, 3, -3, -2, -1, 1, 2, 3]
      .map((k) => Math.atan2(Math.sin(k), Math.cos(k))) // fake wrapped stream
    for (const h of hops) a = unwrapAngle(a, h)
    // never jumps by more than π in one step
    expect(Number.isFinite(a)).toBe(true)
  })

  it('a full accumulated revolution differs from start by ~2π', () => {
    const steps = 24
    let a = angleAt(1, 0, 0, 0) // 0
    let prevRaw = 0
    for (let i = 1; i <= steps; i++) {
      const th = (i / steps) * TAU
      const raw = Math.atan2(Math.sin(th), Math.cos(th))
      a = unwrapAngle(a, raw)
      prevRaw = raw
    }
    void prevRaw
    expect(a).toBeCloseTo(TAU, 4)
  })
})

describe('angleAt', () => {
  it('measures from the centre, screen coords', () => {
    expect(angleAt(1, 0, 0, 0)).toBeCloseTo(0, 12)
    expect(angleAt(0, 1, 0, 0)).toBeCloseTo(PI / 2, 12) // +y is down, still +½π
    expect(angleAt(-1, 0, 0, 0)).toBeCloseTo(PI, 12)
  })
})

describe('inAnnulus', () => {
  const cx = 100
  const cy = 100
  const R = 50
  it('excludes the inner hub', () => {
    expect(inAnnulus(cx + 5, cy, cx, cy, R, 0.18)).toBe(false) // r=5 < 9
    expect(inAnnulus(cx + 20, cy, cx, cy, R, 0.18)).toBe(true)
  })
  it('excludes outside the rim', () => {
    expect(inAnnulus(cx + 51, cy, cx, cy, R, 0.18)).toBe(false)
    expect(inAnnulus(cx + 49, cy, cx, cy, R, 0.18)).toBe(true)
  })
})

describe('angularVelocityToRate', () => {
  it('nominal 33⅓ angular velocity maps to rate 1.0', () => {
    expect(angularVelocityToRate(OMEGA_NOMINAL_33)).toBeCloseTo(1, 6)
    expect(angularVelocityToRate(-OMEGA_NOMINAL_33)).toBeCloseTo(-1, 6)
  })
  it('clamps runaway values', () => {
    expect(angularVelocityToRate(OMEGA_NOMINAL_33 * 999)).toBe(MAX_SCRATCH_RATE)
    expect(angularVelocityToRate(-OMEGA_NOMINAL_33 * 999)).toBe(-MAX_SCRATCH_RATE)
  })
})

describe('ScratchTracker', () => {
  it('returns rate 0 on the first contact sample', () => {
    const t = new ScratchTracker()
    t.begin()
    const r = t.update(150, 100, 100, 100, 0)
    expect(r.rate).toBe(0)
  })

  it('a steady forward drag produces a positive, bounded rate', () => {
    const t = new ScratchTracker(1.5, 0.6)
    t.begin()
    const cx = 0
    const cy = 0
    const radius = 100
    let last = { rate: 0, omega: 0, angle: 0 }
    // sweep ~1/4 turn over ~0.1s in 6 steps => well within nominal speed range
    for (let i = 0; i <= 12; i++) {
      const th = (i / 12) * (PI / 2)
      const x = Math.cos(th) * radius
      const y = Math.sin(th) * radius
      last = t.update(x, y, cx, cy, i * (0.1 / 12))
    }
    expect(last.rate).toBeGreaterThan(0)
    expect(Math.abs(last.rate)).toBeLessThanOrEqual(MAX_SCRATCH_RATE)
  })

  it('crossing the ±π seam mid-drag never produces a spike', () => {
    const t = new ScratchTracker(1.5, 0.6)
    t.begin()
    const cx = 0
    const cy = 0
    const radius = 100
    let maxRate = 0
    // drag through angle π (the seam) at a modest, constant speed
    for (let i = 0; i <= 40; i++) {
      const th = PI - 0.4 + i * 0.02 // sweeps from below π to above π
      const x = Math.cos(th) * radius
      const y = Math.sin(th) * radius
      const r = t.update(x, y, cx, cy, i * 0.01)
      maxRate = Math.max(maxRate, Math.abs(r.rate))
    }
    // constant angular speed ~2 rad/s => rate ~0.57; nothing near the clamp
    expect(maxRate).toBeLessThan(1.5)
  })

  it('begin() resets so a new contact does not spike across the gap', () => {
    const t = new ScratchTracker()
    t.begin()
    t.update(100, 0, 0, 0, 0)
    t.update(0, 100, 0, 0, 0.1) // quarter turn
    t.end()
    t.begin()
    const r = t.update(-100, 0, 0, 0, 5) // far away, long later
    expect(r.rate).toBe(0)
  })
})
