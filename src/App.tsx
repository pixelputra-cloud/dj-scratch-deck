import { useEffect, useRef } from 'react'
import './index.css'
import { CameraControl } from './components/CameraControl'
import { Deck } from './components/Deck'
import { GestureBackdrop } from './components/GestureBackdrop'
import { OnboardingOverlay } from './components/OnboardingOverlay'
import { PowerGate } from './components/PowerGate'
import { SidePanel } from './components/SidePanel'
import { useGestureTracking } from './gesture/useGestureTracking'
import { setDeckLoop } from './state/deckController'
import { useDeckStore } from './state/useDeckStore'
import { bundledCrate } from './tracks/loadManifest'

export default function App() {
  const setCrate = useDeckStore((s) => s.setCrate)
  const loop = useDeckStore((s) => s.loop)
  const powered = useDeckStore((s) => s.powered)
  const loadedTrack = useDeckStore((s) => s.loadedTrack)
  const cameraState = useDeckStore((s) => s.cameraState)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { enable, disable } = useGestureTracking(videoRef, canvasRef)

  useEffect(() => {
    setCrate(bundledCrate())
  }, [setCrate])

  return (
    <div className="tt-app" data-camera={cameraState}>
      <GestureBackdrop videoRef={videoRef} />

      <header className="tt-app__header">
        <div className="tt-app__brand">
          <span className="tt-app__logo" aria-hidden />
          <span>
            SCRATCH <b>DECK</b>
          </span>
        </div>
        <div className="tt-app__status">
          <span data-live={powered}>{powered ? 'POWERED' : 'STANDBY'}</span>
          <span className="tt-app__track">
            {loadedTrack ? `▶ ${loadedTrack.title}` : 'no disc'}
          </span>
          <label className="tt-app__loop">
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => setDeckLoop(e.target.checked)}
            />
            loop
          </label>
          <CameraControl onEnable={enable} onDisable={disable} />
        </div>
      </header>

      <main className="tt-app__stage">
        <Deck />
      </main>

      {/* landmark overlay — sits ABOVE the deck so hands read on top of the disc */}
      <canvas ref={canvasRef} className="tt-gesture-overlay" aria-hidden />

      <SidePanel />

      <PowerGate />
      <OnboardingOverlay onEnableCamera={enable} />
    </div>
  )
}
