/*
 * useDeckStore — the deck's DISCRETE state (PRD §10).
 *
 * Continuous per-frame values (velocity, playhead position) deliberately do
 * NOT live here — 60 store writes/second through React's reconciler drops
 * frames. Those ride in deckRuntime.ts and are read via a ref/rAF.
 */

import { create } from 'zustand'
import {
  NOMINAL_RPM_33,
  PITCH_DETENT_WIDTH,
  PITCH_RANGE_DEFAULT,
  PITCH_RANGE_WIDE,
} from '../lib/constants'
import { clamp } from '../lib/math'
import type { Track } from '../tracks/types'

export type CameraState = 'off' | 'requesting' | 'on' | 'denied' | 'error'
export type Rpm = typeof NOMINAL_RPM_33 | 45
export type PitchRange = typeof PITCH_RANGE_DEFAULT | typeof PITCH_RANGE_WIDE

/** Phase 3 fills this in; shells kept so the store shape is stable. */
export interface HandState {
  handedness: 'Left' | 'Right'
  pose: string
  owns: 'scratch' | 'pitch' | 'dwell' | null
  dwellProgress: number
}

export interface ActiveGestures {
  scratch: boolean
  point: boolean
  dwell: string | null
}

interface DeckState {
  powered: boolean
  motorOn: boolean
  rpm: Rpm
  pitchPercent: number
  pitchRange: PitchRange
  loop: boolean

  loadedTrack: Track | null
  loadingTrackId: string | null
  loadProgress: number // 0..1, determinate where possible
  loadError: string | null
  crate: Track[]

  cameraState: CameraState
  /** last camera/model failure, surfaced in the panel for diagnosis */
  cameraError: string | null
  hands: HandState[]
  activeGestures: ActiveGestures

  // ---- actions ----
  setPowered: (v: boolean) => void
  setMotor: (v: boolean) => void
  toggleMotor: () => void
  setRpm: (v: Rpm) => void
  toggleRpm: () => void
  setPitchPercent: (v: number) => void
  nudgePitch: (delta: number) => void
  setPitchRange: (v: PitchRange) => void
  togglePitchRange: () => void
  setLoop: (v: boolean) => void

  setCrate: (tracks: Track[]) => void
  addUserTracks: (tracks: Track[]) => void
  beginLoad: (trackId: string) => void
  setLoadProgress: (p: number) => void
  finishLoad: (track: Track) => void
  failLoad: (message: string) => void

  setCameraState: (s: CameraState) => void
  setCameraError: (msg: string | null) => void
  setHands: (h: HandState[]) => void
  setActiveGestures: (g: Partial<ActiveGestures>) => void
}

/** Detent at exact 0% — the fader snaps to it within ±0.4% (PRD §5.6). */
function applyDetent(v: number): number {
  return Math.abs(v) < PITCH_DETENT_WIDTH ? 0 : v
}

export const useDeckStore = create<DeckState>((set, get) => ({
  powered: false,
  motorOn: false,
  rpm: NOMINAL_RPM_33,
  pitchPercent: 0,
  pitchRange: PITCH_RANGE_DEFAULT,
  loop: true,

  loadedTrack: null,
  loadingTrackId: null,
  loadProgress: 0,
  loadError: null,
  crate: [],

  cameraState: 'off',
  cameraError: null,
  hands: [],
  activeGestures: { scratch: false, point: false, dwell: null },

  setPowered: (v) => set({ powered: v }),
  setMotor: (v) => set({ motorOn: v }),
  toggleMotor: () => set({ motorOn: !get().motorOn }),
  setRpm: (v) => set({ rpm: v }),
  toggleRpm: () => set({ rpm: get().rpm === 45 ? NOMINAL_RPM_33 : 45 }),

  setPitchPercent: (v) => {
    const range = get().pitchRange
    set({ pitchPercent: applyDetent(clamp(v, -range, range)) })
  },
  nudgePitch: (delta) => {
    const range = get().pitchRange
    set({
      pitchPercent: applyDetent(
        clamp(get().pitchPercent + delta, -range, range),
      ),
    })
  },
  setPitchRange: (v) =>
    set({
      pitchRange: v,
      pitchPercent: clamp(get().pitchPercent, -v, v),
    }),
  togglePitchRange: () => {
    const next: PitchRange =
      get().pitchRange === PITCH_RANGE_DEFAULT
        ? PITCH_RANGE_WIDE
        : PITCH_RANGE_DEFAULT
    set({ pitchRange: next, pitchPercent: clamp(get().pitchPercent, -next, next) })
  },
  setLoop: (v) => set({ loop: v }),

  setCrate: (tracks) => set({ crate: tracks }),
  addUserTracks: (tracks) => set({ crate: [...get().crate, ...tracks] }),

  beginLoad: (trackId) =>
    set({ loadingTrackId: trackId, loadProgress: 0, loadError: null }),
  setLoadProgress: (p) => set({ loadProgress: p }),
  finishLoad: (track) =>
    set({
      loadedTrack: track,
      loadingTrackId: null,
      loadProgress: 1,
      loadError: null,
    }),
  failLoad: (message) =>
    set({ loadingTrackId: null, loadProgress: 0, loadError: message }),

  setCameraState: (s) => set({ cameraState: s }),
  setCameraError: (msg) => set({ cameraError: msg }),
  setHands: (h) => set({ hands: h }),
  setActiveGestures: (g) =>
    set({ activeGestures: { ...get().activeGestures, ...g } }),
}))
