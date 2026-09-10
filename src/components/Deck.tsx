import { useEffect, useRef } from 'react'
import { NOMINAL_RPM_33 } from '../lib/constants'
import { deckRuntime } from '../state/deckRuntime'
import { onFrame } from '../state/deckController'
import { Platter } from './Platter'
import { PitchFader } from './PitchFader'
import { SpeedSelector } from './SpeedSelector'
import { StartButton } from './StartButton'

/**
 * Composes the deck: one large centred platter with the transport controls
 * floating around it — no chassis. Owns the single view frame loop, which
 * writes the disc rotation straight to the DOM from deckRuntime — no React
 * re-render per frame (PRD §10).
 */
export function Deck() {
  const vinylRef = useRef<SVGGElement>(null)
  const strobeRef = useRef<SVGGElement>(null)

  useEffect(() => {
    return onFrame(() => {
      const { positionSamples, sampleRate } = deckRuntime

      // Rotation from the audio playhead. SAMPLES_PER_REV is constant; because
      // position already advances at the pitched/rpm rate, a constant divisor
      // gives the right visual speed everywhere and audio can never drift (§5.2).
      const samplesPerRev = (sampleRate * 60) / NOMINAL_RPM_33
      const angle = (positionSamples / samplesPerRev) * 360

      // The vinyl AND the outer strobe/index ring rotate together, locked to
      // the disc — so the rim marker always lines up with the record's own
      // reference mark, and stops when the disc stops.
      const t = `rotate(${angle} 50 50)`
      vinylRef.current?.setAttribute('transform', t)
      strobeRef.current?.setAttribute('transform', t)
    })
  }, [])

  return (
    <div className="tt-deck">
      {/* analog transport stack — sits immediately left of the disc */}
      <div className="tt-deck__controls">
        <SpeedSelector />
        <StartButton />
        <PitchFader />
      </div>

      <Platter vinylRef={vinylRef} strobeRef={strobeRef} />
    </div>
  )
}
