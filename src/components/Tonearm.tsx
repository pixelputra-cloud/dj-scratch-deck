import { forwardRef } from 'react'

/**
 * Tonearm (PRD §9.3). SVG, pivots from rest through the record as playback
 * progresses. Cosmetic — <Platter>'s frame loop writes the pivot rotation
 * from position / length. It's the detail that reads as "turntable".
 */
export const REST_DEG = -20
export const END_DEG = 8

export const Tonearm = forwardRef<SVGGElement>(function Tonearm(_p, ref) {
  return (
    <svg viewBox="0 0 100 100" className="tt-tonearm" aria-hidden>
      <defs>
        <linearGradient id="armMetal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--spindle-a)" />
          <stop offset="100%" stopColor="var(--spindle-b)" />
        </linearGradient>
      </defs>

      {/* pivot base, fixed */}
      <circle cx="88" cy="20" r="6.4" fill="var(--control-face)" stroke="var(--control-edge)" strokeWidth="0.8" />
      <circle cx="88" cy="20" r="2.4" fill="var(--spindle-b)" />

      {/* the arm swings about the pivot */}
      <g ref={ref}>
        {/* counterweight */}
        <rect x="88" y="16.5" width="9" height="7" rx="2" fill="var(--spindle-b)" />
        {/* main tube */}
        <rect x="46" y="18.4" width="42" height="3.2" rx="1.6" fill="url(#armMetal)" />
        {/* headshell */}
        <g>
          <rect x="41.5" y="17" width="7.5" height="6.5" rx="1.2" fill="var(--control-face)" stroke="var(--control-edge)" strokeWidth="0.5" />
          <rect x="43" y="23" width="2" height="2.6" fill="var(--spindle-b)" />
          <circle cx="44" cy="26" r="0.9" fill="var(--backlight)" />
        </g>
      </g>
    </svg>
  )
})
