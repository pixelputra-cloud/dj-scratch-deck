/*
 * PRD Appendix A. "Every one of these is a starting value to be tuned by
 * feel during its phase, not a fixed requirement."
 */

export const NOMINAL_RPM_33 = 33.333
export const NOMINAL_RPM_45 = 45

/** Physics time constants (seconds). Two of them: a short spin-up torque
 *  and a long spin-down that produces the power-off pitch drop. */
export const SPINUP_TAU = 0.35
export const SPINDOWN_TAU = 1.2
/** 33 <-> 45 changes ramp rather than jump. */
export const RPM_CHANGE_RAMP = 0.4
/** setTargetAtTime smoothing constant handed to the rate AudioParam. */
export const RATE_SMOOTHING_TAU = 0.015

export const MAX_SCRATCH_RATE = 4.0

/** Platter gesture hit region is an annulus; inside this fraction of the
 *  radius a fingertip is excluded (tiny radius -> wild angular velocity). */
export const PLATTER_INNER_R = 0.18

export const DWELL_MS = 700
export const GESTURE_COOLDOWN_MS = 500
export const SCRATCH_ENTER_FRAMES = 2
export const SCRATCH_EXIT_FRAMES = 3
export const PINCH_ENTER_DIST = 0.35 // x handScale
export const PINCH_EXIT_DIST = 0.55 // x handScale
export const STILLNESS_THRESHOLD = 0.15 // x handScale per frame

export const ONE_EURO_MIN_CUTOFF = 1.5 // Hz
export const ONE_EURO_BETA = 0.6

export const PITCH_RANGE_DEFAULT = 8 // %
export const PITCH_RANGE_WIDE = 16 // %
export const PITCH_DETENT_WIDTH = 0.4 // %

export const MAX_TRACK_MINUTES = 15
export const CAMERA_WIDTH = 640
export const CAMERA_HEIGHT = 480
export const CAMERA_FPS_IDEAL = 60

/** rad/s of a 33⅓ record at nominal speed — the scratch-rate reference
 *  (PRD §6.3: ω_nominal = 2π × 33.333/60). */
export const OMEGA_NOMINAL_33 = (Math.PI * 2 * NOMINAL_RPM_33) / 60
