import { useEffect } from 'react'
import './index.css'
import { CameraPanel } from './components/CameraPanel'
import { Crate } from './components/Crate'
import { Deck } from './components/Deck'
import { GestureHUD } from './components/GestureHUD'
import { PowerGate } from './components/PowerGate'
import { setDeckLoop } from './state/deckController'
import { useDeckStore } from './state/useDeckStore'
import { bundledCrate } from './tracks/loadManifest'

export default function App() {
  const setCrate = useDeckStore((s) => s.setCrate)
  const loop = useDeckStore((s) => s.loop)
  const powered = useDeckStore((s) => s.powered)
  const loadedTrack = useDeckStore((s) => s.loadedTrack)

  useEffect(() => {
    setCrate(bundledCrate())
  }, [setCrate])

  return (
    <div className="tt-app">
      <header className="tt-app__header">
        <div className="tt-app__brand">
          <span className="tt-app__logo" aria-hidden />
          <span>
            GESTURE <b>TURNTABLE</b>
          </span>
        </div>
        <div className="tt-app__status">
          <span data-live={powered}>{powered ? 'POWERED' : 'STANDBY'}</span>
          <span>{loadedTrack ? `▶ ${loadedTrack.title}` : 'no disc'}</span>
          <label className="tt-app__loop">
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => setDeckLoop(e.target.checked)}
            />
            loop
          </label>
        </div>
      </header>

      <main className="tt-app__main">
        <div className="tt-app__deckcol">
          <Deck />
        </div>
        <aside className="tt-app__side">
          <CameraPanel />
          <GestureHUD />
        </aside>
      </main>

      <Crate />

      <PowerGate />
    </div>
  )
}
