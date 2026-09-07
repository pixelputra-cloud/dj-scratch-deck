/*
 * platterMapping.ts — screen position -> platter angle -> scratch rate.
 *
 * PRD §12 flags the ±π unwrap here as the single most bug-prone line in the
 * project: "unit-test the boundary crossing in both directions before it is
 * ever wired to audio." Done — see platterMapping.test.ts.
 *
 * Same maths serves the mouse (Phase 2) and the fingertip (Phase 3); there is
 * one angular-velocity path, not two.
 */

import { MAX_SCRATCH_RATE, OMEGA_NOMINAL_33 } from '../lib/constants'
import { clamp, TAU } from '../lib/math'
import { OneEuroFilter } from './oneEuroFilter'

/** atan2 angle of (x,y) about centre (cx,cy). Range (-π, π]. */
export function angleAt(x: number, y: number, cx: number, cy: number): number {
  return Math.atan2(y - cy, x - cx)
}

/**
 * Return `curr` shifted by whole turns so it is within π of `prev` — the
 * continuous-angle unwrap. Branch-free generalisation of the PRD's
 * "if Δθ > π subtract 2π; if Δθ < −π add 2π": Math.round handles any number
 * of wraps in one step and is exact at the ±π boundary.
 */
export function unwrapAngle(prev: number, curr: number): number {
  const d = curr - prev
  return curr - TAU * Math.round(d / TAU)
}

/** Is (x,y) inside the scratch annulus? inner exclusion kills the huge Δθ you
 *  get from a fingertip sitting next to the spindle (PRD §5.2, §6.3). */
export function inAnnulus(
  x: number,
  y: number,
  cx: number,
  cy: number,
  outerRadius: number,
  innerFraction: number,
): boolean {
  const r = Math.hypot(x - cx, y - cy)
  return r >= outerRadius * innerFraction && r <= outerRadius
}

/** ω (rad/s) -> playback-rate units, clamped. Beyond the clamp it is tracking
 *  noise, not intent (PRD §6.3 step 6). */
export function angularVelocityToRate(omega: number): number {
  return clamp(omega / OMEGA_NOMINAL_33, -MAX_SCRATCH_RATE, MAX_SCRATCH_RATE)
}

/**
 * Stateful accumulator: feed it (x, y, timestamp) each frame while a pointer
 * or fingertip is on the platter; it returns the current scratch rate.
 *
 * Call begin() on contact and end() on release so the next contact starts a
 * fresh continuous angle instead of spiking across the gap.
 */
export class ScratchTracker {
  private lastAngleUnwrapped: number | null = null
  private lastTimestamp: number | null = null
  private omegaFilter: OneEuroFilter

  constructor(minCutoff = 1.5, beta = 0.6) {
    this.omegaFilter = new OneEuroFilter({ minCutoff, beta, dCutoff: 1.0 })
  }

  begin(): void {
    this.lastAngleUnwrapped = null
    this.lastTimestamp = null
    this.omegaFilter.reset()
  }

  end(): void {
    this.begin()
  }

  /**
   * @returns { rate, omega, angle } — rate is clamped playback-rate units,
   * angle is the raw wrapped atan2 (useful for a debug readout). Returns
   * rate 0 on the very first sample of a contact (no previous angle yet).
   */
  update(
    x: number,
    y: number,
    cx: number,
    cy: number,
    timestamp: number,
  ): { rate: number; omega: number; angle: number } {
    const angle = angleAt(x, y, cx, cy)

    if (this.lastAngleUnwrapped == null || this.lastTimestamp == null) {
      this.lastAngleUnwrapped = angle
      this.lastTimestamp = timestamp
      return { rate: 0, omega: 0, angle }
    }

    const unwrapped = unwrapAngle(this.lastAngleUnwrapped, angle)
    const dt = Math.max(1e-4, timestamp - this.lastTimestamp)
    const rawOmega = (unwrapped - this.lastAngleUnwrapped) / dt

    this.lastAngleUnwrapped = unwrapped
    this.lastTimestamp = timestamp

    const omega = this.omegaFilter.filter(rawOmega, timestamp)
    return { rate: angularVelocityToRate(omega), omega, angle }
  }
}
