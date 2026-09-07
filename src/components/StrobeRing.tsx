import { forwardRef, useMemo } from 'react'

/**
 * Strobe dot markers around the platter rim (PRD §5.2 / §5.4). Rendered so
 * they appear stationary at 0% pitch and drift proportionally otherwise —
 * <Platter>'s frame loop integrates (velocity − nominalRate) and writes this
 * group's rotation directly.
 */
const DOTS = 90

export const StrobeRing = forwardRef<SVGGElement>(function StrobeRing(_p, ref) {
  const dots = useMemo(() => {
    return Array.from({ length: DOTS }, (_, i) => {
      const a = (i / DOTS) * Math.PI * 2
      return {
        x: 50 + Math.cos(a) * 47.6,
        y: 50 + Math.sin(a) * 47.6,
        big: i % 5 === 0,
      }
    })
  }, [])

  return (
    <svg viewBox="0 0 100 100" className="tt-strobe" aria-hidden>
      <g ref={ref}>
        {dots.map((d, i) => (
          <rect
            key={i}
            x={d.x - (d.big ? 0.55 : 0.4)}
            y={d.y - (d.big ? 1.1 : 0.8)}
            width={d.big ? 1.1 : 0.8}
            height={d.big ? 2.2 : 1.6}
            rx="0.2"
            fill={d.big ? 'var(--strobe)' : 'var(--strobe-dim)'}
            transform={`rotate(${(i / DOTS) * 360} 50 50)`}
          />
        ))}
      </g>
    </svg>
  )
})
