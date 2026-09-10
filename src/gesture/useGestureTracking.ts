import { useCallback, useEffect, useRef } from 'react'
import {
  processGestureResult,
  resetGestureControl,
} from '../state/deckController'
import { useDeckStore } from '../state/useDeckStore'
import { HandTracker, type RawHand } from './HandTracker'
import type { Point } from './poseCodes'

/** MediaPipe 21-point skeleton. */
const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

/* electric cyan — high contrast against the amber deck + warm camera feed */
const BONE = 'rgba(60, 232, 250, 0.8)'
const JOINT = '#3ce8fa'
const GLOW = 'rgba(60, 232, 250, 0.9)'
const DWELL = '#9af3ff'

/**
 * `object-fit: cover` projection: the full-page <video> is mirrored and cover-
 * fitted to the viewport, so a normalised camera point maps to viewport px
 * through the same scale+crop. Returns a fn taking a MIRRORED normalised point.
 */
function makeProjector(video: HTMLVideoElement | null): (n: Point) => Point {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const iw = video?.videoWidth || 640
  const ih = video?.videoHeight || 480
  const scale = Math.max(vw / iw, vh / ih)
  const dw = iw * scale
  const dh = ih * scale
  const ox = (vw - dw) / 2
  const oy = (vh - dh) / 2
  return (n: Point) => ({ x: ox + n.x * dw, y: oy + n.y * dh })
}

/**
 * Owns the HandTracker lifecycle for the full-page gesture backdrop: starts /
 * stops the webcam, feeds every result into the gesture machine, and paints
 * the mirrored landmark skeleton across the whole viewport so a user can see
 * exactly where their hands are relative to the deck (PRD §4.3, §6.5).
 */
export function useGestureTracking(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
) {
  const trackerRef = useRef<HandTracker | null>(null)
  const setCameraState = useDeckStore((s) => s.setCameraState)
  const setCameraError = useDeckStore((s) => s.setCameraError)
  const sawResult = useRef(false)

  const sizeCanvas = useCallback(
    (canvas: HTMLCanvasElement) => {
      const dpr = window.devicePixelRatio || 1
      const w = window.innerWidth
      const h = window.innerHeight
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
        canvas.style.width = `${w}px`
        canvas.style.height = `${h}px`
      }
      return { dpr, w, h }
    },
    [],
  )

  const paint = useCallback(
    (
      raw: RawHand[],
      dwell: { centroid: Point; dwellProgress: number }[],
    ) => {
      const canvas = canvasRef.current
      const video = videoRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const { dpr } = sizeCanvas(canvas)
      const project = makeProjector(video)

      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.shadowColor = GLOW
      ctx.shadowBlur = 6

      for (const hand of raw) {
        const pts = hand.landmarks.map((p) => project({ x: 1 - p.x, y: p.y }))
        ctx.strokeStyle = BONE
        ctx.lineWidth = 3
        for (const [a, b] of CONNECTIONS) {
          ctx.beginPath()
          ctx.moveTo(pts[a].x, pts[a].y)
          ctx.lineTo(pts[b].x, pts[b].y)
          ctx.stroke()
        }
        ctx.fillStyle = JOINT
        for (const p of pts) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      for (const d of dwell) {
        if (d.dwellProgress <= 0) continue
        const c = project(d.centroid) // centroid is already mirrored
        ctx.beginPath()
        ctx.arc(c.x, c.y, 30, -Math.PI / 2, -Math.PI / 2 + d.dwellProgress * Math.PI * 2)
        ctx.strokeStyle = DWELL
        ctx.lineWidth = 5
        ctx.stroke()
      }
      ctx.restore()
    },
    [canvasRef, videoRef, sizeCanvas],
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
        const project = makeProjector(videoRef.current)
        const result = processGestureResult(hands, ts, project)
        paint(hands, result.hands)
      },
    })
    trackerRef.current = tracker
    void tracker.start()
  }, [videoRef, setCameraState, setCameraError, paint])

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
