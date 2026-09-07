/*
 * HandTracker — main-thread side of gesture tracking.
 *
 *   getUserMedia (640×480, 60fps ideal)  -> hidden <video>
 *     -> per frame: createImageBitmap(video) -> Worker (transfer)
 *     -> Worker runs HandLandmarker.detectForVideo
 *     -> onResult(hands, timestamp)   [consumer mirrors x, runs the machine]
 *
 * The turntable is never blocked on this — every failure path just reports a
 * camera state and the deck stays fully mouse-operable (PRD §6.6).
 */

import { CAMERA_HEIGHT, CAMERA_WIDTH, CAMERA_FPS_IDEAL } from '../lib/constants'
import type { CameraState } from '../state/useDeckStore'
import type { Handedness } from './gestureMachine'
import type { Point } from './poseCodes'

const MODEL_PATH = '/models/hand_landmarker.task'
const WASM_BASE = '/wasm'

export interface RawHand {
  handedness: Handedness
  landmarks: Point[] // normalised, NOT yet mirrored
}

interface WorkerResult {
  type: 'result'
  hands: RawHand[]
  timestamp: number
}
type WorkerMsg = { type: 'ready' } | { type: 'error'; message: string } | WorkerResult

export interface HandTrackerCallbacks {
  onState: (s: CameraState) => void
  onResult: (hands: RawHand[], timestamp: number) => void
}

export class HandTracker {
  private video: HTMLVideoElement
  private cb: HandTrackerCallbacks
  private worker: Worker | null = null
  private stream: MediaStream | null = null
  private running = false
  private busy = false
  private rafId = 0
  private disposed = false

  constructor(video: HTMLVideoElement, cb: HandTrackerCallbacks) {
    this.video = video
    this.cb = cb
  }

  async start(): Promise<void> {
    if (this.disposed) return
    this.cb.onState('requesting')

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
      this.cb.onState(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'denied'
          : 'error',
      )
      return
    }
    if (this.disposed) {
      this.stopStream()
      return
    }

    this.video.srcObject = this.stream
    this.video.muted = true
    this.video.playsInline = true
    try {
      await this.video.play()
    } catch {
      /* autoplay of a muted local stream is allowed; ignore races */
    }

    this.worker = new Worker(
      new URL('./handTracker.worker.ts', import.meta.url),
      { type: 'module' },
    )
    this.worker.onmessage = (e: MessageEvent<WorkerMsg>) => this.onWorker(e.data)
    this.worker.onerror = () => this.cb.onState('error')

    const origin = location.origin
    this.worker.postMessage({
      type: 'init',
      wasmBase: new URL(WASM_BASE, origin).href,
      modelPath: new URL(MODEL_PATH, origin).href,
    })
  }

  private onWorker(msg: WorkerMsg): void {
    if (this.disposed) return
    if (msg.type === 'ready') {
      this.running = true
      this.cb.onState('on')
      this.pump()
    } else if (msg.type === 'error') {
      this.cb.onState('error')
    } else if (msg.type === 'result') {
      this.busy = false
      this.cb.onResult(msg.hands, msg.timestamp)
    }
  }

  private pump = (): void => {
    if (!this.running || this.disposed) return
    this.rafId = requestAnimationFrame(this.pump)
    if (this.busy || !this.worker) return
    if (this.video.readyState < 2 || this.video.videoWidth === 0) return

    this.busy = true
    createImageBitmap(this.video)
      .then((bitmap) => {
        if (!this.worker || this.disposed) {
          bitmap.close()
          this.busy = false
          return
        }
        this.worker.postMessage(
          { type: 'frame', bitmap, timestamp: performance.now() },
          [bitmap],
        )
      })
      .catch(() => {
        this.busy = false
      })
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
    this.worker?.terminate()
    this.worker = null
    this.stopStream()
    if (this.video.srcObject) this.video.srcObject = null
    this.cb.onState('off')
  }
}
