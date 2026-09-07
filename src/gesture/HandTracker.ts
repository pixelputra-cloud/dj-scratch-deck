/*
 * HandTracker — webcam -> MediaPipe HandLandmarker -> onResult(hands, ts).
 *
 * Runs on the MAIN THREAD. The PRD (§4.2) prefers a Web Worker to keep
 * inference off the render thread, but @mediapipe/tasks-vision's WASM loader
 * does not reliably initialise inside a { type: 'module' } worker, and a
 * working tracker beats a theoretically-lower-latency broken one. The worker
 * version is kept in handTracker.worker.ts for a later pass once the feel is
 * proven; detectForVideo here is ~10-25 ms and can hitch a frame.
 *
 * Every failure path reports a camera state + a human-readable reason and the
 * deck stays fully mouse-operable (PRD §6.6).
 */

import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision'
import { CAMERA_FPS_IDEAL, CAMERA_HEIGHT, CAMERA_WIDTH } from '../lib/constants'
import type { CameraState } from '../state/useDeckStore'
import type { Handedness } from './gestureMachine'
import type { Point } from './poseCodes'

const MODEL_PATH = '/models/hand_landmarker.task'
const WASM_BASE = '/wasm'

export interface RawHand {
  handedness: Handedness
  landmarks: Point[] // normalised, NOT yet mirrored
}

export interface HandTrackerCallbacks {
  onState: (s: CameraState) => void
  onError: (message: string | null) => void
  onResult: (hands: RawHand[], timestamp: number) => void
}

function describe(err: unknown): string {
  if (err instanceof DOMException) return `${err.name}: ${err.message}`
  if (err instanceof Error) return err.message || err.name
  return String(err)
}

export class HandTracker {
  private video: HTMLVideoElement
  private cb: HandTrackerCallbacks
  private landmarker: HandLandmarker | null = null
  private stream: MediaStream | null = null
  private running = false
  private rafId = 0
  private disposed = false
  private lastTs = 0

  constructor(video: HTMLVideoElement, cb: HandTrackerCallbacks) {
    this.video = video
    this.cb = cb
  }

  async start(): Promise<void> {
    if (this.disposed) return
    this.cb.onError(null)
    this.cb.onState('requesting')

    // 1) camera --------------------------------------------------------
    if (!navigator.mediaDevices?.getUserMedia) {
      this.cb.onError(
        'navigator.mediaDevices is unavailable — this needs a secure context ' +
          '(https:// or http://localhost).',
      )
      this.cb.onState('error')
      return
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: CAMERA_WIDTH },
          height: { ideal: CAMERA_HEIGHT },
          frameRate: { ideal: CAMERA_FPS_IDEAL },
          facingMode: 'user',
        },
        audio: false,
      })
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      console.error('[HandTracker] getUserMedia failed:', err)
      this.cb.onError(describe(err))
      this.cb.onState(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'denied'
          : 'error',
      )
      return
    }
    if (this.disposed) return this.stopStream()

    this.video.srcObject = this.stream
    this.video.muted = true
    this.video.playsInline = true
    try {
      await this.video.play()
    } catch {
      /* a muted local stream is allowed to autoplay; ignore races */
    }
    await this.waitForVideo()
    if (this.disposed) return this.stopStream()
    console.info(
      `[HandTracker] camera ${this.video.videoWidth}x${this.video.videoHeight}`,
    )

    // 2) model -------------------------------------------------------
    const origin = location.origin
    const wasmBase = new URL(WASM_BASE, origin).href
    const modelPath = new URL(MODEL_PATH, origin).href
    let fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>
    try {
      fileset = await FilesetResolver.forVisionTasks(wasmBase)
    } catch (err) {
      console.error('[HandTracker] WASM fileset failed:', err)
      this.cb.onError(`hand model runtime failed to load (${wasmBase}): ${describe(err)}`)
      this.cb.onState('error')
      return
    }

    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        this.landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: modelPath, delegate },
          numHands: 2,
          runningMode: 'VIDEO',
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })
        console.info(`[HandTracker] landmarker ready (${delegate})`)
        break
      } catch (err) {
        console.warn(`[HandTracker] ${delegate} delegate failed:`, err)
        if (delegate === 'CPU') {
          this.cb.onError(`hand model failed to load: ${describe(err)}`)
          this.cb.onState('error')
          return
        }
      }
    }
    if (this.disposed || !this.landmarker) {
      this.landmarker?.close()
      this.landmarker = null
      return this.stopStream()
    }

    this.running = true
    this.cb.onError(null)
    this.cb.onState('on')
    this.loop()
  }

  private waitForVideo(): Promise<void> {
    return new Promise((resolve) => {
      const v = this.video
      if (v.readyState >= 2 && v.videoWidth > 0) return resolve()
      const done = () => {
        v.removeEventListener('loadeddata', done)
        resolve()
      }
      v.addEventListener('loadeddata', done)
      // safety net if the event was missed
      setTimeout(done, 2500)
    })
  }

  private loop = (): void => {
    if (!this.running || this.disposed) return
    this.rafId = requestAnimationFrame(this.loop)

    const v = this.video
    if (!this.landmarker || v.readyState < 2 || v.videoWidth === 0) return

    let ts = performance.now()
    if (ts <= this.lastTs) ts = this.lastTs + 1
    this.lastTs = ts

    let res: HandLandmarkerResult | undefined
    try {
      res = this.landmarker.detectForVideo(v, ts)
    } catch (err) {
      console.warn('[HandTracker] detectForVideo threw:', err)
      return
    }

    const hands: RawHand[] = (res?.landmarks ?? []).map((lm, i) => ({
      handedness:
        res?.handednesses?.[i]?.[0]?.categoryName === 'Left' ? 'Left' : 'Right',
      landmarks: lm.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    }))
    this.cb.onResult(hands, ts)
  }

  private stopStream(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
  }

  stop(): void {
    this.disposed = true
    this.running = false
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
    this.landmarker?.close()
    this.landmarker = null
    this.stopStream()
    if (this.video.srcObject) this.video.srcObject = null
    this.cb.onState('off')
  }
}
