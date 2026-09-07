/*
 * handTracker.worker.ts — MediaPipe HandLandmarker off the main thread
 * (PRD §4.2 mitigation #2). Main-thread React rendering never delays
 * inference; a main-thread stall stutters the gestures, not the audio.
 *
 * Protocol:
 *   in : { type:'init', wasmBase, modelPath }
 *        { type:'frame', bitmap: ImageBitmap, timestamp: number }   [transfer bitmap]
 *   out: { type:'ready' } | { type:'error', message }
 *        { type:'result', hands: {handedness, landmarks}[], timestamp }
 */

import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision'

let landmarker: HandLandmarker | null = null
let lastTs = 0

type InitMsg = { type: 'init'; wasmBase: string; modelPath: string }
type FrameMsg = { type: 'frame'; bitmap: ImageBitmap; timestamp: number }
type InMsg = InitMsg | FrameMsg

async function createLandmarker(
  wasmBase: string,
  modelPath: string,
  delegate: 'GPU' | 'CPU',
): Promise<HandLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(wasmBase)
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelPath, delegate },
    numHands: 2,
    runningMode: 'VIDEO',
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data

  if (msg.type === 'init') {
    try {
      landmarker = await createLandmarker(msg.wasmBase, msg.modelPath, 'GPU')
    } catch {
      try {
        landmarker = await createLandmarker(msg.wasmBase, msg.modelPath, 'CPU')
      } catch (err2) {
        ;(self as unknown as Worker).postMessage({
          type: 'error',
          message: err2 instanceof Error ? err2.message : String(err2),
        })
        return
      }
    }
    ;(self as unknown as Worker).postMessage({ type: 'ready' })
    return
  }

  if (msg.type === 'frame') {
    if (!landmarker) {
      msg.bitmap.close()
      return
    }
    // detectForVideo demands strictly increasing timestamps.
    let ts = msg.timestamp
    if (ts <= lastTs) ts = lastTs + 1
    lastTs = ts

    let res: HandLandmarkerResult | undefined
    try {
      res = landmarker.detectForVideo(msg.bitmap, ts)
    } catch (err) {
      ;(self as unknown as Worker).postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
      return
    } finally {
      msg.bitmap.close()
    }

    const hands = (res?.landmarks ?? []).map((lm, i) => ({
      handedness:
        res?.handednesses?.[i]?.[0]?.categoryName === 'Left' ? 'Left' : 'Right',
      landmarks: lm.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    }))
    ;(self as unknown as Worker).postMessage({
      type: 'result',
      hands,
      timestamp: ts,
    })
  }
}
