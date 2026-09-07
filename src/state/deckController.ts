/*
 * deckController — the imperative glue between the engine, the discrete store
 * and the per-frame runtime. One animation loop lives here; it is the only
 * caller of stepPlatter and engine.setRate.
 */

import { platterRate, stepPlatter, type PlatterInput } from '../audio/platterPhysics'
import { TurntableEngine } from '../audio/TurntableEngine'
import { PLATTER_INNER_R } from '../lib/constants'
import {
  GestureMachine,
  type GestureResult,
  type HandSample,
} from '../gesture/gestureMachine'
import type { RawHand } from '../gesture/HandTracker'
import { inAnnulus, ScratchTracker } from '../gesture/platterMapping'
import type { Track } from '../tracks/types'
import { deckRuntime, resetDeckRuntime } from './deckRuntime'
import { useDeckStore } from './useDeckStore'

let engine: TurntableEngine | null = null
let rafId = 0
let lastFrameTime = 0

/** platter geometry in viewport px, published by <Platter> on layout */
const geometry = { cx: 0, cy: 0, radius: 1 }

/** latest pointer/fingertip while scratching, in viewport px */
let scratchPointer: { x: number; y: number } | null = null
const tracker = new ScratchTracker()

/** per-frame view callbacks — the platter/strobe/tonearm DOM updates hang off
 *  this so there is exactly one rAF in the app, driven by the physics step. */
const frameListeners = new Set<(dt: number) => void>()
export function onFrame(cb: (dt: number) => void): () => void {
  frameListeners.add(cb)
  return () => frameListeners.delete(cb)
}

export function getEngine(): TurntableEngine {
  if (!engine) engine = new TurntableEngine()
  return engine
}

export function setPlatterGeometry(cx: number, cy: number, radius: number): void {
  geometry.cx = cx
  geometry.cy = cy
  geometry.radius = radius
}

export function isInScratchAnnulus(x: number, y: number): boolean {
  return inAnnulus(x, y, geometry.cx, geometry.cy, geometry.radius, PLATTER_INNER_R)
}

// ---- power / transport -------------------------------------------------

export async function powerOnDeck(): Promise<void> {
  const eng = getEngine()
  await eng.powerOn()
  deckRuntime.sampleRate = eng.sampleRate

  eng.onPosition((r) => {
    deckRuntime.positionSamples = r.position
    deckRuntime.lengthSamples = r.length
    deckRuntime.playing = r.playing
  })

  const { setPowered, loop } = useDeckStore.getState()
  eng.setLoop(loop)
  setPowered(true)
  startLoop()
}

export async function loadTrackIntoDeck(track: Track): Promise<void> {
  const store = useDeckStore.getState()
  store.beginLoad(track.id)
  try {
    const { meta } = await getEngine().loadTrack(track)
    deckRuntime.sampleRate = meta.sampleRate
    deckRuntime.lengthSamples = meta.channels[0]?.length ?? 0
    deckRuntime.positionSamples = 0
    getEngine().seek(0)

    // downsample peaks a little more for the card and stash as a plain array
    store.setWaveform(track.id, Array.from(meta.waveformPeaks))
    store.finishLoad(track)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not decode this file.'
    store.failLoad(msg)
  }
}

export function setDeckLoop(v: boolean): void {
  useDeckStore.getState().setLoop(v)
  getEngine().setLoop(v)
}

// ---- scratching (mouse now, fingertip in Phase 3) ------------------

export function beginScratch(x: number, y: number): void {
  scratchPointer = { x, y }
  deckRuntime.scratching = true
  tracker.begin()
}

export function moveScratch(x: number, y: number): void {
  if (deckRuntime.scratching) scratchPointer = { x, y }
}

export function endScratch(): void {
  scratchPointer = null
  deckRuntime.scratching = false
  deckRuntime.handVelocity = null // physics eases back to motor speed
  tracker.end()
}

// ---- gesture control (Phase 3) --------------------------------------

const machine = new GestureMachine()

/** Feed one frame of raw (un-mirrored) MediaPipe hands. Mirrors x to match the
 *  selfie preview, runs the state machine, applies its output to the deck, and
 *  returns the result so the camera overlay can draw from the same data. */
export function processGestureResult(
  rawHands: RawHand[],
  timestampMs: number,
): GestureResult {
  const samples: HandSample[] = rawHands.map((h) => ({
    handedness: h.handedness,
    landmarks: h.landmarks.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })),
  }))

  const { pitchPercent, pitchRange, setPitchPercent, toggleMotor, toggleRpm } =
    useDeckStore.getState()

  const out = machine.update(samples, timestampMs, {
    platter: { cx: geometry.cx, cy: geometry.cy, radius: geometry.radius },
    pitchPercent,
    pitchRange,
  })

  // SCRATCH — a gesture holding the record. Releases cleanly (§6.3.8 handled
  // inside the machine); when it lets go the physics eases back to motor speed.
  if (out.scratchRate != null) {
    deckRuntime.handVelocity = out.scratchRate
    deckRuntime.scratching = true
    deckRuntime.gestureScratching = true
  } else if (deckRuntime.gestureScratching) {
    deckRuntime.gestureScratching = false
    deckRuntime.scratching = false
    deckRuntime.handVelocity = null
  }

  if (out.pitchValue != null) setPitchPercent(out.pitchValue)
  if (out.motorToggle) toggleMotor()
  if (out.rpmToggle) toggleRpm()

  useDeckStore.getState().setHands(
    out.hands.map((h) => ({
      handedness: h.handedness,
      pose: h.pose,
      owns: h.owns,
      dwellProgress: h.dwellProgress,
    })),
  )
  useDeckStore.getState().setActiveGestures({
    scratch: out.scratchRate != null,
    pinch: out.pitchValue != null,
    dwell: out.activeDwell,
  })

  return out
}

/** Camera stopped / no permission — drop any gesture-held state. */
export function resetGestureControl(): void {
  machine.reset()
  if (deckRuntime.gestureScratching) {
    deckRuntime.gestureScratching = false
    deckRuntime.scratching = false
    deckRuntime.handVelocity = null
  }
  const s = useDeckStore.getState()
  s.setHands([])
  s.setActiveGestures({ scratch: false, pinch: false, dwell: null })
}

// ---- the one animation loop -------------------------------------

export function startLoop(): void {
  if (rafId) return
  lastFrameTime = performance.now()
  const tick = (now: number) => {
    const dt = Math.min(0.05, Math.max(0.0001, (now - lastFrameTime) / 1000))
    lastFrameTime = now
    step(dt, now / 1000)
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
}

export function stopLoop(): void {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
}

function step(dt: number, nowSeconds: number): void {
  const { motorOn, rpm, pitchPercent } = useDeckStore.getState()

  // While a scratch pointer is down, re-evaluate angular velocity every frame
  // so a still finger on a spinning record actually holds it still.
  if (deckRuntime.scratching && scratchPointer) {
    const { rate } = tracker.update(
      scratchPointer.x,
      scratchPointer.y,
      geometry.cx,
      geometry.cy,
      nowSeconds,
    )
    deckRuntime.handVelocity = rate
  }

  const input: PlatterInput = {
    motorOn,
    targetRpm: rpm,
    pitchPercent,
    handVelocity: deckRuntime.handVelocity,
  }
  deckRuntime.platter = stepPlatter(deckRuntime.platter, input, dt)
  deckRuntime.rate = platterRate(deckRuntime.platter)

  if (engine) engine.setRate(deckRuntime.rate)

  for (const l of frameListeners) l(dt)
}

export async function disposeDeck(): Promise<void> {
  stopLoop()
  resetDeckRuntime()
  if (engine) {
    await engine.dispose()
    engine = null
  }
}
