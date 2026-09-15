/*
 * gestureMachine.ts — hysteresis, dwell, latch, priority and two-hand
 * assignment (PRD §6.3 / §6.4). Pure and deterministic given
 * (samples, now, ctx); all timing is driven by the `now` argument so it is
 * fully unit-testable. No DOM, no MediaPipe.
 *
 * Vocabulary:
 *   SCRATCH           index in the platter annulus  -> platter velocity
 *   TWO-FINGER-PITCH  index+middle, moved left/right -> pitch fader
 *   FIST-HOLD         closed fist, held still, 700 ms -> start/stop (latched)
 *   ONE-FINGER-HOLD   index only, still, 700 ms       -> 33/45 (latched)
 */

import {
  DWELL_MS,
  GESTURE_COOLDOWN_MS,
  PITCH_DRAG_EXIT_FRAMES,
  PITCH_GESTURE_GAIN,
  PITCH_ONE_EURO_BETA,
  PITCH_ONE_EURO_D_CUTOFF,
  PITCH_ONE_EURO_MIN_CUTOFF,
  PLATTER_INNER_R,
  SCRATCH_ENTER_FRAMES,
  SCRATCH_EXIT_FRAMES,
  STILLNESS_THRESHOLD,
} from '../lib/constants'
import { clamp } from '../lib/math'
import { OneEuroFilter } from './oneEuroFilter'
import { inAnnulus, ScratchTracker } from './platterMapping'
import {
  FINGER,
  fingertipsCentroid,
  handCentroid,
  handScale,
  isFistPose,
  isPointPose,
  isScratchPose,
  isTwoFingerPose,
  poseCode,
  poseName,
  twoFingerCentroid,
  type PoseName,
  type Point,
} from './poseCodes'

/** dwell-gesture identity tokens (compared with ===, never real pose codes) */
const FIST_CODE = -1
const ONE_CODE = FINGER.INDEX

export type Handedness = 'Left' | 'Right'

export interface HandSample {
  handedness: Handedness
  /** 21 landmarks, normalised, x ALREADY mirrored (x' = 1 − x). */
  landmarks: Point[]
}

export interface PlatterGeom {
  cx: number
  cy: number
  radius: number
}

export interface GestureContext {
  platter: PlatterGeom
  /** maps a mirrored, normalised camera point (0..1) to viewport px, matching
   *  exactly how the full-page camera feed is laid out on screen. The fingertip
   *  is then measured against the on-screen platter directly — what you see the
   *  hand over is what it scratches. */
  mapPoint: (n: Point) => Point
  pitchPercent: number
  pitchRange: number
}

export interface HandView {
  handedness: Handedness
  pose: PoseName
  owns: 'scratch' | 'pitch' | 'dwell' | null
  dwellProgress: number
  /** normalised, mirrored — where the overlay draws the dwell ring */
  centroid: Point
}

export interface GestureResult {
  hands: HandView[]
  /** playback-rate units while a gesture scratch is active, else null */
  scratchRate: number | null
  /** absolute pitch % while a two-finger-pitch drag is active, else null */
  pitchValue: number | null
  /** fired exactly on the frame the dwell completes */
  motorToggle: boolean
  rpmToggle: boolean
  activeDwell: PoseName | null
}

interface HandFSM {
  qualify: number
  disqualify: number
  scratching: boolean
  tracker: ScratchTracker
  pitchDragging: boolean
  pitchX0: number
  pitchP0: number
  /** consecutive frames the TWO-FINGER pose has failed to match while still
   *  `pitchDragging` — mirrors SCRATCH_EXIT_FRAMES so one dropped frame
   *  doesn't drop the drag. */
  pitchDisqualify: number
  pitchFilter: OneEuroFilter
  dwellCandidate: number | null
  dwellStart: number
  latchedPose: number | null
  prevCentroid: Point | null
  centroidVel: number
}

function newFSM(): HandFSM {
  return {
    qualify: 0,
    disqualify: 0,
    scratching: false,
    tracker: new ScratchTracker(),
    pitchDragging: false,
    pitchX0: 0,
    pitchP0: 0,
    pitchDisqualify: 0,
    pitchFilter: new OneEuroFilter({
      minCutoff: PITCH_ONE_EURO_MIN_CUTOFF,
      beta: PITCH_ONE_EURO_BETA,
      dCutoff: PITCH_ONE_EURO_D_CUTOFF,
    }),
    dwellCandidate: null,
    dwellStart: 0,
    latchedPose: null,
    prevCentroid: null,
    centroidVel: 0,
  }
}

function releaseHeld(f: HandFSM): void {
  if (f.scratching) f.tracker.end()
  f.scratching = false
  f.qualify = 0
  f.disqualify = 0
  f.pitchDragging = false
  f.pitchDisqualify = 0
  f.pitchFilter.reset()
  f.dwellCandidate = null
  f.prevCentroid = null
  f.centroidVel = 0
}

export class GestureMachine {
  private fsms = new Map<Handedness, HandFSM>()
  private cooldownUntil = 0

  private fsm(h: Handedness): HandFSM {
    let f = this.fsms.get(h)
    if (!f) {
      f = newFSM()
      this.fsms.set(h, f)
    }
    return f
  }

  reset(): void {
    this.fsms.clear()
    this.cooldownUntil = 0
  }

  update(
    samples: HandSample[],
    now: number,
    ctx: GestureContext,
  ): GestureResult {
    const result: GestureResult = {
      hands: [],
      scratchRate: null,
      pitchValue: null,
      motorToggle: false,
      rpmToggle: false,
      activeDwell: null,
    }

    // No hands: every held control releases cleanly (PRD §6.4.5). The fader
    // simply stays where it was left (pitchValue null -> caller doesn't touch it).
    if (samples.length === 0) {
      for (const f of this.fsms.values()) releaseHeld(f)
      return result
    }

    const { cx, cy, radius } = ctx.platter

    // precompute per sample
    const feats = samples.map((s) => {
      const code = poseCode(s.landmarks)
      const hs = handScale(s.landmarks)
      const centroid = handCentroid(s.landmarks)
      return {
        s,
        code,
        hs,
        centroid,
        // index+middle tip mean X — TWO-FINGER-PITCH's horizontal drag reference
        twoFingerX: twoFingerCentroid(s.landmarks).x,
        // 4-fingertip mean, projected to px — the scratch pivot + annulus test
        anchorPx: ctx.mapPoint(fingertipsCentroid(s.landmarks)),
      }
    })

    // update centroid velocity for every visible hand
    for (const ft of feats) {
      const f = this.fsm(ft.s.handedness)
      f.centroidVel = f.prevCentroid
        ? Math.hypot(
            ft.centroid.x - f.prevCentroid.x,
            ft.centroid.y - f.prevCentroid.y,
          )
        : 0
      f.prevCentroid = ft.centroid
    }

    // release FSMs whose hand vanished this frame
    for (const [h, f] of this.fsms) {
      if (!feats.some((ft) => ft.s.handedness === h)) releaseHeld(f)
    }

    // ---- role assignment (PRD §6.4.4) ----
    // the hand whose fingertips are nearer the platter centre owns SCRATCH.
    let scratchIdx = 0
    if (feats.length >= 2) {
      const d = feats.map((ft) =>
        Math.hypot(ft.anchorPx.x - cx, ft.anchorPx.y - cy),
      )
      scratchIdx = d[0] <= d[1] ? 0 : 1
    }
    const scratchFt = feats[scratchIdx]
    const auxFt = feats.length >= 2 ? feats[1 - scratchIdx] : feats[0]
    const oneHand = feats.length < 2

    // ---- SCRATCH ----
    const sF = this.fsm(scratchFt.s.handedness)
    const inAnn = inAnnulus(
      scratchFt.anchorPx.x,
      scratchFt.anchorPx.y,
      cx,
      cy,
      radius,
      PLATTER_INNER_R,
    )
    const scratchQualifies = isScratchPose(scratchFt.code) && inAnn
    if (scratchQualifies) {
      sF.qualify += 1
      sF.disqualify = 0
      if (!sF.scratching && sF.qualify >= SCRATCH_ENTER_FRAMES) {
        sF.scratching = true
        sF.tracker.begin()
      }
    } else {
      sF.disqualify += 1
      if (sF.scratching) {
        // a single dropped detection must NOT release the record (§6.3.8)
        if (sF.disqualify >= SCRATCH_EXIT_FRAMES) {
          sF.scratching = false
          sF.tracker.end()
          sF.qualify = 0
        }
      } else {
        sF.qualify = 0
      }
    }
    if (sF.scratching) {
      const { rate } = sF.tracker.update(
        scratchFt.anchorPx.x,
        scratchFt.anchorPx.y,
        cx,
        cy,
        now / 1000,
      )
      result.scratchRate = rate
    }

    // ---- AUX hand: TWO-FINGER-PITCH then DWELL ----
    const aF = this.fsm(auxFt.s.handedness)
    const auxBusyWithScratch = oneHand && sF.scratching
    const auxFingerInAnnulus = inAnnulus(
      auxFt.anchorPx.x,
      auxFt.anchorPx.y,
      cx,
      cy,
      radius,
      PLATTER_INNER_R,
    )
    // §6.4.1: if a fingertip is inside the annulus, only SCRATCH may fire.
    const auxAllowed = !auxBusyWithScratch && !auxFingerInAnnulus

    if (auxAllowed) {
      // TWO-FINGER-PITCH — index+middle extended together, no pinch/contact
      // test. Engages the instant the pose matches; a short exit debounce
      // (PITCH_DRAG_EXIT_FRAMES) rides through one dropped-pose frame
      // without dropping the drag, same idea as SCRATCH's exit hysteresis.
      const pitchPoseNow = isTwoFingerPose(auxFt.code)
      let justEngaged = false
      if (pitchPoseNow) {
        aF.pitchDisqualify = 0
        if (!aF.pitchDragging) {
          aF.pitchDragging = true
          aF.pitchFilter.reset()
          justEngaged = true
        }
      } else if (aF.pitchDragging) {
        aF.pitchDisqualify += 1
        if (aF.pitchDisqualify >= PITCH_DRAG_EXIT_FRAMES) {
          aF.pitchDragging = false
          aF.pitchFilter.reset()
        }
      }
      if (aF.pitchDragging) {
        // One Euro-filtered X — the raw landmark is noisy enough on its own
        // to read as unwanted hand movement.
        const x = aF.pitchFilter.filter(auxFt.twoFingerX, now / 1000)
        if (justEngaged) {
          aF.pitchX0 = x
          aF.pitchP0 = ctx.pitchPercent
        }
        // gain scales with the active range so the same comfortable hand
        // travel always sweeps the whole fader, at ±8 or ±16 alike. Right
        // (increasing x, already mirrored) = faster, matching the on-screen
        // fader and the mouse drag.
        const gain = ctx.pitchRange * PITCH_GESTURE_GAIN
        const raw = aF.pitchP0 + (x - aF.pitchX0) * gain
        result.pitchValue = clamp(raw, -ctx.pitchRange, ctx.pitchRange)
      }

      // DWELL (only when not dragging the pitch)
      if (!aF.pitchDragging) {
        const candidate = isFistPose(auxFt.code)
          ? FIST_CODE
          : isPointPose(auxFt.code)
            ? ONE_CODE
            : null
        const still = aF.centroidVel < STILLNESS_THRESHOLD * auxFt.hs
        const armable =
          candidate != null &&
          still &&
          now >= this.cooldownUntil &&
          aF.latchedPose !== candidate

        if (armable) {
          if (aF.dwellCandidate !== candidate) {
            aF.dwellCandidate = candidate
            aF.dwellStart = now
          }
          const progress = (now - aF.dwellStart) / DWELL_MS
          result.activeDwell = candidate === FIST_CODE ? 'FIST' : 'POINT'
          if (progress >= 1) {
            if (candidate === FIST_CODE) result.motorToggle = true
            else result.rpmToggle = true
            aF.latchedPose = candidate
            aF.dwellCandidate = null
            this.cooldownUntil = now + GESTURE_COOLDOWN_MS
          }
        } else {
          aF.dwellCandidate = null
        }

        // re-arm only once the latched pose has broken
        if (aF.latchedPose != null && candidate !== aF.latchedPose) {
          aF.latchedPose = null
        }
      }
    } else {
      aF.pitchDragging = false
      aF.pitchFilter.reset()
      aF.dwellCandidate = null
    }

    // ---- HUD views ----
    for (let i = 0; i < feats.length; i++) {
      const ft = feats[i]
      const f = this.fsm(ft.s.handedness)
      const isScratchHand = ft === scratchFt
      let owns: HandView['owns'] = null
      if (isScratchHand && sF.scratching) owns = 'scratch'
      else if (ft === auxFt && aF.pitchDragging) owns = 'pitch'
      else if (ft === auxFt && aF.dwellCandidate != null) owns = 'dwell'

      result.hands.push({
        handedness: ft.s.handedness,
        pose: poseName(ft.code),
        owns,
        dwellProgress:
          f.dwellCandidate != null
            ? clamp((now - f.dwellStart) / DWELL_MS, 0, 1)
            : 0,
        centroid: ft.centroid,
      })
    }

    return result
  }
}
