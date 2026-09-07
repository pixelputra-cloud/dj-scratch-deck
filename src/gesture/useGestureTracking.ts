import { useCallback, useEffect, useRef } from 'react'
import {
  processGestureResult,
  resetGestureControl,
} from '../state/deckController'
import { useDeckStore } from '../state/useDeckStore'
import { HandTracker, type RawHand } from './HandTracker'

/** MediaPipe 21-point skeleton. */
const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]
const CAM_SPAN = 1.15 // keep in sync with gestureMachine

/**
 * Owns the HandTracker lifecycle for the camera panel: starts/stops the
 * webcam + worker, feeds every result into the gesture machine, and paints
 * the mirrored landmark overlay so a user can see *why* tracking isn't working
 * (PRD §4.3, §6.5).
 */
export function useGestureTracking(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
) {
  const trackerRef = useRef<HandTracker | null>(null)
  const setCameraState = useDeckStore((s) => s.setCameraState)
  const setCameraError = useDeckStore((s) => s.setCameraError)
  const sawResult = useRef(false)

  const draw = useCallback(
    (raw: RawHand[]) => {
      const canvas = canvasRef.current
      const video = videoRef.current
      if (!canvas || !video) return
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, w, h)

      // scratch-zone guide: the camera frame maps to a square 2·CAM_SPAN
      // platter-radii wide, so the platter fills the middle 1/CAM_SPAN.
      const zoneR = w / (2 * CAM_SPAN)
      ctx.strokeStyle = 'rgba(255,158,61,0.28)'
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.arc(w / 2, h / 2, Math.min(zoneR, h / 2 - 2), 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(w / 2, h / 2, Math.min(zoneR, h / 2 - 2) * 0.18, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])

      // x is mirrored to match the CSS-mirrored selfie video
      const px = (nx: number) => (1 - nx) * w
      const py = (ny: number) => ny * h

      for (const hand of raw) {
        const lm = hand.landmarks
        ctx.strokeStyle = 'rgba(255,158,61,0.5)'
        ctx.lineWidth = 2
        for (const [a, b] of CONNECTIONS) {
          ctx.beginPath()
          ctx.moveTo(px(lm[a].x), py(lm[a].y))
          ctx.lineTo(px(lm[b].x), py(lm[b].y))
          ctx.stroke()
        }
        ctx.fillStyle = '#ff9e3d'
        for (const p of lm) {
          ctx.beginPath()
          ctx.arc(px(p.x), py(p.y), 2.6, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.restore()
    },
    [canvasRef, videoRef],
  )

  const drawDwell = useCallback(
    (hands: { centroid: { x: number; y: number }; dwellProgress: number }[]) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const dpr = window.devicePixelRatio || 1
      ctx.save()
      ctx.scale(dpr, dpr)
      for (const hnd of hands) {
        if (hnd.dwellProgress <= 0) continue
        const cx = (1 - hnd.centroid.x) * w
        const cy = hnd.centroid.y * h
        ctx.beginPath()
        ctx.arc(cx, cy, 22, -Math.PI / 2, -Math.PI / 2 + hnd.dwellProgress * Math.PI * 2)
        ctx.strokeStyle = '#ffd08a'
        ctx.lineWidth = 4
        ctx.lineCap = 'round'
        ctx.stroke()
      }
      ctx.restore()
    },
    [canvasRef],
  )

  const enable = useCallback(() => {
    if (trackerRef.current) return
    const video = videoRef.current
    if (!video) return
    sawResult.current = false
    const tracker = new HandTracker(video, {
      onState: setCameraState,
      onError: setCameraError,
      onResult: (hands, ts) => {
        if (!sawResult.current) {
          sawResult.current = true
          console.info('[gesture] first landmark frame received')
        }
        const result = processGestureResult(hands, ts)
        draw(hands)
        drawDwell(result.hands)
      },
    })
    trackerRef.current = tracker
    void tracker.start()
  }, [videoRef, setCameraState, setCameraError, draw, drawDwell])

  const disable = useCallback(() => {
    trackerRef.current?.stop()
    trackerRef.current = null
    resetGestureControl()
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height)
  }, [canvasRef])

  useEffect(() => {
    return () => {
      trackerRef.current?.stop()
      trackerRef.current = null
      resetGestureControl()
    }
  }, [])

  return { enable, disable }
}
