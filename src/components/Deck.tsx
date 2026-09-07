import { useEffect, useRef } from 'react'
import { NOMINAL_RPM_33 } from '../lib/constants'
import { mod } from '../lib/math'
import { deckRuntime } from '../state/deckRuntime'
import { onFrame } from '../state/deckController'
import { Platter } from './Platter'
import { PitchFader } from './PitchFader'
import { SpeedSelector } from './SpeedSelector'
import { StartButton } from './StartButton'

/**
 * Composes the deck: one large centred platter with the transport controls
 * floating around it — no chassis. Owns the single view frame loop, which
 * writes the vinyl rotation and strobe drift straight to the DOM from
 * deckRuntime — no React re-render per frame (PRD §10).
 */
export function Deck() {
  const vinylRef = useRef<SVGGElement>(null)
  const strobeRef = useRef<SVGGElement>(null)
  const strobeAngle = useRef(0)

  useEffect(() => {
    return onFrame((dt) => {
      const { positionSamples, sampleRate, platter } = deckRuntime

      // Rotation from the audio playhead. SAMPLES_PER_REV is constant; because
      // position already advances at the pitched/rpm rate, a constant divisor
      // gives the right visual speed everywhere and audio can never drift (§5.2).
      const samplesPerRev = (sampleRate * 60) / NOMINAL_RPM_33
      const angle = (positionSamples / samplesPerRev) * 360
      vinylRef.current?.setAttribute('transform', `rotate(${angle} 50 50)`)

      // Strobe: stationary when velocity == nominalRate (0% pitch, locked),
      // drifts proportionally otherwise.
      strobeAngle.current = mod(
        strobeAngle.current + (platter.velocity - platter.nominalRate) * 360 * dt,
        360,
      )
      strobeRef.current?.setAttribute(
        'transform',
        `rotate(${strobeAngle.current} 50 50)`,
      )
    })
  }, [])

  return (
    <div className="tt-deck">
      <Platter vinylRef={vinylRef} strobeRef={strobeRef} />

      {/* one floating control bar — no chassis */}
      <div className="tt-deck__controls">
        <SpeedSelector />
        <StartButton />
        <PitchFader />
      </div>
    </div>
  )
}
