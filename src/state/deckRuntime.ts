/*
 * deckRuntime — the continuous, per-frame values that must NOT go through
 * React state (PRD §10). One mutable object, written by the animation loop
 * in deckController, read directly by the platter/strobe render via rAF.
 */

import { initialPlatterState, type PlatterState } from '../audio/platterPhysics'

export interface DeckRuntime {
  /** authoritative playhead, samples, from the worklet */
  positionSamples: number
  lengthSamples: number
  sampleRate: number
  /** last rate handed to the audio param (playback-rate units) */
  rate: number
  /** physics integrator state */
  platter: PlatterState
  /** set by the gesture/mouse layer; null = free-running */
  handVelocity: number | null
  /** true while any pointer/gesture is actively scratching */
  scratching: boolean
  playing: boolean
}

export const deckRuntime: DeckRuntime = {
  positionSamples: 0,
  lengthSamples: 0,
  sampleRate: 44100,
  rate: 0,
  platter: initialPlatterState(),
  handVelocity: null,
  scratching: false,
  playing: false,
}

export function resetDeckRuntime(): void {
  deckRuntime.positionSamples = 0
  deckRuntime.lengthSamples = 0
  deckRuntime.rate = 0
  deckRuntime.platter = initialPlatterState()
  deckRuntime.handVelocity = null
  deckRuntime.scratching = false
  deckRuntime.playing = false
}
