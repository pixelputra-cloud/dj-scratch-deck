import { describe, expect, it } from 'vitest'
import {
  initialPlatterState,
  stepPlatter,
  type PlatterInput,
} from './platterPhysics'
import { NOMINAL_RPM_45 } from '../lib/constants'

const base: PlatterInput = {
  motorOn: false,
  targetRpm: 33.333,
  pitchPercent: 0,
  handVelocity: null,
}

/** Run the model forward `seconds` at a fixed frame time. */
function run(
  input: Partial<PlatterInput>,
  seconds: number,
  dt = 1 / 60,
  start = initialPlatterState(),
) {
  let s = start
  const steps = Math.round(seconds / dt)
  for (let i = 0; i < steps; i++) s = stepPlatter(s, { ...base, ...input }, dt)
  return s
}

describe('stepPlatter', () => {
  it('starts stopped', () => {
    expect(initialPlatterState().velocity).toBe(0)
    expect(initialPlatterState().nominalRate).toBeCloseTo(1, 6)
  })

  it('spins up toward nominal 1.0 when the motor is on', () => {
    // one spin-up tau (0.35s) gets ~63% of the way there
    const atTau = run({ motorOn: true }, 0.35)
    expect(atTau.velocity).toBeGreaterThan(0.55)
    expect(atTau.velocity).toBeLessThan(0.7)

    const settled = run({ motorOn: true }, 3)
    expect(settled.velocity).toBeCloseTo(1, 2)
  })

  it('spins DOWN slower than it spins up (power-off pitch drop)', () => {
    const running = run({ motorOn: true }, 3)
    // motor off, coast for one spin-up-tau worth of time
    const after035 = run({ motorOn: false }, 0.35, 1 / 60, running)
    // with the 1.2s spin-down tau it should still be well above half speed
    expect(after035.velocity).toBeGreaterThan(0.7)

    // ~2.5 spin-down taus in: still audibly coasting, well under a tenth speed
    const after3 = run({ motorOn: false }, 3, 1 / 60, running)
    expect(after3.velocity).toBeLessThan(0.1)
    expect(after3.velocity).toBeGreaterThan(0.05)
    // long tail: effectively stopped
    const after8 = run({ motorOn: false }, 8, 1 / 60, running)
    expect(after8.velocity).toBeLessThan(0.005)
  })

  it('45 rpm settles at 1.35x', () => {
    const s = run({ motorOn: true, targetRpm: NOMINAL_RPM_45 }, 3)
    expect(s.velocity).toBeCloseTo(1.35, 2)
  })

  it('ramps the nominal rate on a 33->45 switch rather than jumping', () => {
    const running = run({ motorOn: true }, 3)
    const oneFrame = stepPlatter(
      running,
      { ...base, motorOn: true, targetRpm: NOMINAL_RPM_45 },
      1 / 60,
    )
    // after a single frame it has barely moved off 1.0, nowhere near 1.35
    expect(oneFrame.nominalRate).toBeGreaterThan(1.0)
    expect(oneFrame.nominalRate).toBeLessThan(1.05)
  })

  it('pitch scales the target velocity', () => {
    const plus8 = run({ motorOn: true, pitchPercent: 8 }, 3)
    expect(plus8.velocity).toBeCloseTo(1.08, 2)
    const minus8 = run({ motorOn: true, pitchPercent: -8 }, 3)
    expect(minus8.velocity).toBeCloseTo(0.92, 2)
  })

  it('hand velocity overrides the motor completely, including reverse', () => {
    const s = run({ motorOn: true, handVelocity: -1.5 }, 1)
    expect(s.velocity).toBe(-1.5)
  })

  it('eases back to motor speed after the hand releases', () => {
    // hand held the record still, motor running
    const held = run({ motorOn: true, handVelocity: 0 }, 1)
    expect(held.velocity).toBe(0)
    // release: hand null, should climb back toward 1.0 on the 0.35s tau
    const released = run({ motorOn: true }, 0.35, 1 / 60, held)
    expect(released.velocity).toBeGreaterThan(0.55)
    expect(released.velocity).toBeLessThan(0.7)
  })
})
