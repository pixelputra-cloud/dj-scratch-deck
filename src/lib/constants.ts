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
/** shorter constant used while a hand/pointer is on the record — the gesture
 *  signal is already filtered upstream, so tighten the audio-side ramp for a
 *  snappier scratch. */
export const RATE_SMOOTHING_TAU_SCRATCH = 0.008

export const MAX_SCRATCH_RATE = 4.0
/** overall scratch responsiveness: rate = sign(g)·|g|^EXPO · GAIN, clamped.
 *  EXPO < 1 lifts small hand motions; GAIN scales the whole response. */
export const SCRATCH_GAIN = 1.7
export const SCRATCH_EXPO = 0.7
/** below this |rate| the record is treated as held still — kills the creep a
 *  higher filter cut-off would otherwise let through from an idle hand. */
export const SCRATCH_DEADBAND = 0.015

/** Platter gesture hit region is an annulus; inside this fraction of the
 *  radius a fingertip is excluded (tiny radius -> wild angular velocity). */
export const PLATTER_INNER_R = 0.18

export const DWELL_MS = 700
export const GESTURE_COOLDOWN_MS = 500
/** engage scratch on the first qualifying frame (the open-hand pose is robust);
 *  the 3-frame exit still guards against a dropped detection mid-scratch. */
export const SCRATCH_ENTER_FRAMES = 1
export const SCRATCH_EXIT_FRAMES = 3
/** TWO-FINGER-PITCH engages the instant the pose (index + middle extended,
 *  ring/pinky curled) is seen, and, like SCRATCH_EXIT_FRAMES, rides through
 *  this many consecutive dropped-pose frames before releasing, so a single
 *  misread finger doesn't drop the drag mid-move. */
export const PITCH_DRAG_EXIT_FRAMES = 3
/** pitch-% per unit of horizontal hand travel, per % of the active pitch
 *  range — i.e. gain = pitchRange × this. Scaling by range means the same
 *  comfortable hand movement always sweeps the *whole* fader, at ±8 or ±16
 *  alike (a flat gain made ±16 need twice the travel of ±8). */
export const PITCH_GESTURE_GAIN = 8
/** One Euro filter on the tracked two-finger-centroid X. `beta` is what
 *  lets the cutoff rise with hand velocity so real motion passes through
 *  with little lag while a still hand stays smooth — a first pass with beta
 *  too low read as sluggish (see PROJECT_STATUS.md). Still gentler than the
 *  scratch filter — pitch wants a steady hold at rest, scratch never does —
 *  just not sluggish-gentle. */
export const PITCH_ONE_EURO_MIN_CUTOFF = 2.5 // Hz
export const PITCH_ONE_EURO_BETA = 0.9
export const PITCH_ONE_EURO_D_CUTOFF = 1.5 // Hz
export const STILLNESS_THRESHOLD = 0.15 // x handScale per frame

/** One Euro filter for the scratch angular velocity. Raised from the PRD's
 *  1.5 / 0.6 so fast motion passes through with much less lag; the 4-fingertip
 *  averaging upstream keeps it from getting jittery. */
export const ONE_EURO_MIN_CUTOFF = 3.5 // Hz
export const ONE_EURO_BETA = 1.2

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
