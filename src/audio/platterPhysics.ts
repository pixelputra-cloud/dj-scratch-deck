/*
 * platterPhysics.ts — one pure, unit-testable velocity model (PRD §7.2).
 *
 * Stepped once per animation frame. There is exactly ONE place that computes
 * the platter's final rate; pitch, rpm and the hand all feed in here and the
 * result goes straight to the worklet's `rate` AudioParam.
 *
 *   velocity is in playback-rate units: 1.0 == a 33⅓ record at nominal speed.
 *   45 rpm  -> targetNominal 1.35        (plays 1.35× faster and higher)
 *   pitch   -> multiplies the nominal target, never applied downstream
 */

import {
  NOMINAL_RPM_33,
  RPM_CHANGE_RAMP,
  SPINDOWN_TAU,
  SPINUP_TAU,
} from '../lib/constants'
import { expApproach } from '../lib/math'

export interface PlatterState {
  /** current platter velocity, playback-rate units */
  velocity: number
  /** current (eased) nominal rate; ramps on a 33<->45 change */
  nominalRate: number
}

export interface PlatterInput {
  motorOn: boolean
  /** 33.333 or 45 */
  targetRpm: number
  /** fader position, percent, e.g. +3.2 */
  pitchPercent: number
  /** hand angular velocity in playback-rate units while a hand is on the
   *  record, or null when the record is free-running (motor / inertia only) */
  handVelocity: number | null
}

export function initialPlatterState(rpm = NOMINAL_RPM_33): PlatterState {
  return { velocity: 0, nominalRate: rpm / NOMINAL_RPM_33 }
}

/** The whole model. Deterministic given (state, input, dt). */
export function stepPlatter(
  state: PlatterState,
  input: PlatterInput,
  dt: number,
): PlatterState {
  const { motorOn, targetRpm, pitchPercent, handVelocity } = input

  // 33 <-> 45 ramps rather than jumps — an instant change sounds broken (§5.5).
  const targetNominal = targetRpm / NOMINAL_RPM_33
  const nominalRate = expApproach(
    state.nominalRate,
    targetNominal,
    dt,
    RPM_CHANGE_RAMP,
  )

  const targetVelocity = motorOn ? nominalRate * (1 + pitchPercent / 100) : 0

  let velocity: number
  if (handVelocity != null) {
    // Hand is on the record: it drives the platter directly.
    velocity = handVelocity
  } else {
    // Free-running: two time constants from three lines — a short spin-up
    // torque and a long spin-down that is the classic power-off pitch drop.
    const tau = motorOn ? SPINUP_TAU : SPINDOWN_TAU
    velocity = expApproach(state.velocity, targetVelocity, dt, tau)
  }

  return { velocity, nominalRate }
}

/** The value handed to the worklet each frame. */
export function platterRate(state: PlatterState): number {
  return state.velocity
}
