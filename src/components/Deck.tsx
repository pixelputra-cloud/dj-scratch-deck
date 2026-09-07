import { useEffect, useRef } from 'react'
import { NOMINAL_RPM_33 } from '../lib/constants'
import { clamp, lerp, mod } from '../lib/math'
import { deckRuntime } from '../state/deckRuntime'
import { onFrame } from '../state/deckController'
import { Plinth } from './Plinth'
import { Platter } from './Platter'
import { PitchFader } from './PitchFader'
import { SpeedSelector } from './SpeedSelector'
import { StartButton } from './StartButton'
import { END_DEG, REST_DEG, Tonearm } from './Tonearm'

/**
 * Composes the physical deck and owns the single view frame loop: it writes
 * the vinyl rotation, strobe drift and tonearm angle straight to the DOM from
 * deckRuntime — no React re-render per frame (PRD §10).
 */
export function Deck() {
  const vinylRef = useRef<SVGGElement>(null)
  const strobeRef = useRef<SVGGElement>(null)
  const armRef = useRef<SVGGElement>(null)
  const strobeAngle = useRef(0)

  useEffect(() => {
    return onFrame((dt) => {
      const { positionSamples, sampleRate, lengthSamples, platter } = deckRuntime

      // Rotation from the audio playhead. SAMPLES_PER_REV is constant; because
      // position already advances at the pitched/rpm rate, a constant divisor
      // gives the right visual speed everywhere and audio can never drift (§5.2).
      // SVG transform attribute takes rotate(angle cx cy) — the pivot is built
      // in, so no transform-box/origin juggling.
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

      // Tonearm tracks playback progress, pivoting about its base (88, 20).
      const progress = lengthSamples
        ? clamp(positionSamples / lengthSamples, 0, 1)
        : 0
      armRef.current?.setAttribute(
        'transform',
        `rotate(${lerp(REST_DEG, END_DEG, progress)} 88 20)`,
      )
    })
  }, [])

  return (
    <div className="tt-deck">
      <Plinth>
        <div className="tt-deck__platterbay">
          <Platter vinylRef={vinylRef} strobeRef={strobeRef} />
          <Tonearm ref={armRef} />
        </div>

        <div className="tt-deck__controls">
          <div className="tt-deck__control-row">
            <SpeedSelector />
            <StartButton />
          </div>
          <PitchFader />
        </div>
      </Plinth>
    </div>
  )
}
