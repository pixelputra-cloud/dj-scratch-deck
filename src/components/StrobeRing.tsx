import { forwardRef, useMemo } from 'react'

/**
 * Marker ring around the platter edge. It is locked to the disc rotation by
 * <Deck>'s frame loop (same transform as the vinyl), so the bold index mark
 * always tracks the record's own reference mark and the ring stops when the
 * disc stops. Sparse on purpose — a dense band shimmers when it spins.
 */
const COUNT = 60
const MAJOR_EVERY = 5

export const StrobeRing = forwardRef<SVGGElement>(function StrobeRing(_p, ref) {
  const marks = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => {
        const major = i % MAJOR_EVERY === 0
        const h = major ? 3 : 1.7
        const w = major ? 0.55 : 0.36
        return (
          <rect
            key={i}
            x={50 - w / 2}
            y={50 - 47.2 - h / 2}
            width={w}
            height={h}
            fill={major ? 'var(--strobe)' : 'var(--strobe-dim)'}
            transform={`rotate(${(i / COUNT) * 360} 50 50)`}
          />
        )
      }),
    [],
  )

  return (
    <svg viewBox="0 0 100 100" className="tt-strobe" aria-hidden>
      <g ref={ref}>
        {marks}
        {/* bold reference index mark — aligns with the disc's top reference */}
        <rect x="49.5" y="1.4" width="1" height="7" rx="0.4" fill="var(--strobe)" />
      </g>
    </svg>
  )
})
