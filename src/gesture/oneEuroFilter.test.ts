import { describe, expect, it } from 'vitest'
import { OneEuroFilter } from './oneEuroFilter'

describe('OneEuroFilter', () => {
  it('passes the first sample through untouched', () => {
    const f = new OneEuroFilter({ minCutoff: 1, beta: 0.5 })
    expect(f.filter(4.2)).toBe(4.2)
  })

  it('attenuates small jitter around a constant signal', () => {
    const f = new OneEuroFilter({ minCutoff: 1, beta: 0.0, dt: 1 / 60 })
    f.filter(0)
    let last = 0
    const noisy = [0.1, -0.1, 0.12, -0.08, 0.09, -0.11, 0.1, -0.1]
    for (const n of noisy) last = f.filter(n)
    // output stays far tighter than the ±0.1 input swing
    expect(Math.abs(last)).toBeLessThan(0.05)
  })

  it('tracks a fast ramp with low lag when beta is high', () => {
    const slow = new OneEuroFilter({ minCutoff: 1, beta: 0.0, dt: 1 / 60 })
    const fast = new OneEuroFilter({ minCutoff: 1, beta: 1.5, dt: 1 / 60 })
    let s = 0
    let g = 0
    for (let i = 0; i < 20; i++) {
      const x = i // steep ramp
      s = slow.filter(x)
      g = fast.filter(x)
    }
    const target = 19
    // high beta should end up closer to the true value than low beta
    expect(target - g).toBeLessThan(target - s)
  })

  it('derives dt from timestamps when provided', () => {
    const f = new OneEuroFilter({ minCutoff: 1, beta: 0 })
    f.filter(0, 0)
    const a = f.filter(10, 0.5)
    f.reset()
    f.filter(0, 0)
    const b = f.filter(10, 0.016)
    // a larger real dt -> larger smoothing alpha -> closer to the raw 10
    expect(a).toBeGreaterThan(b)
  })

  it('reset() clears state', () => {
    const f = new OneEuroFilter({ minCutoff: 1, beta: 0 })
    f.filter(100)
    f.filter(100)
    f.reset()
    expect(f.filter(-7)).toBe(-7)
  })
})
