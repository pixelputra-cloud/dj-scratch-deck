import { useEffect, useRef, useState } from 'react'
import { useDeckStore } from '../state/useDeckStore'
import { CratePanel } from './Crate'
import { GesturePanel } from './GestureHUD'

type Tab = 'crate' | 'gestures'

/** Matches the deck.css mobile breakpoint (`@media (max-width: 700px)`). */
const isNarrowViewport = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(max-width: 700px)').matches

/**
 * One right-edge drawer holding both the crate and the gesture info as tabs.
 * Collapsed, it's a single thin handle — nothing sits idle on screen.
 * Turning the camera on brings the Gestures tab forward once.
 *
 * Starts OPEN on desktop (the crate invites a click) but CLOSED on a narrow
 * viewport — there, its ~80vw body would otherwise cover most of the disc
 * the instant the deck loads.
 */
export function SidePanel() {
  const [open, setOpen] = useState(() => !isNarrowViewport())
  const [tab, setTab] = useState<Tab>('crate')
  const cameraOn = useDeckStore((s) => s.cameraState === 'on')
  const wasCameraOn = useRef(cameraOn)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (cameraOn && !wasCameraOn.current) {
      setTab('gestures')
      setOpen(true)
    }
    wasCameraOn.current = cameraOn
  }, [cameraOn])

  // Collapse when the pointer goes down anywhere outside the drawer.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  return (
    <aside ref={panelRef} className="tt-panel" data-open={open}>
      <button
        type="button"
        className="tt-panel__handle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Collapse panel' : 'Open panel'}
      >
        <span className="tt-panel__handle-label">CRATE / GESTURES</span>
        <span className="tt-panel__handle-chev">{open ? '▸' : '◂'}</span>
      </button>

      <div className="tt-panel__body">
        <div className="tt-panel__tabs" role="tablist" aria-label="Panel">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'crate'}
            data-active={tab === 'crate'}
            onClick={() => setTab('crate')}
          >
            Crate
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'gestures'}
            data-active={tab === 'gestures'}
            onClick={() => setTab('gestures')}
          >
            Gestures
          </button>
        </div>

        <div className="tt-panel__content">
          {tab === 'crate' ? <CratePanel /> : <GesturePanel />}
        </div>
      </div>
    </aside>
  )
}
