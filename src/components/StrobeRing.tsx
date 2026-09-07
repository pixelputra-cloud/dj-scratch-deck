import { forwardRef, useMemo } from 'react'

/**
 * Strobe band around the platter edge (PRD §5.2 / §5.4) — modelled on a
 * Technics SL-1200: dense rows of fine marks on the rim, with one brighter
 * index mark. <Deck>'s frame loop rotates this group only while the motor is
 * driving the platter; it appears stationary at 0% pitch and crawls with the
 * pitch offset, and freezes when the platter is stopped.
 */
const OUTER = { count: 168, r: 47.3, w: 0.34, h: 1.5 }
const INNER = { count: 112, r: 44.1, w: 0.42, h: 1.9 }

function row({ count, r, w, h }: typeof OUTER, fill: string) {
  return Array.from({ length: count }, (_, i) => {
    const deg = (i / count) * 360
    return (
      <rect
        key={`${r}-${i}`}
        x={50 - w / 2}
        y={50 - r - h / 2}
        width={w}
        height={h}
        fill={fill}
        transform={`rotate(${deg} 50 50)`}
      />
    )
  })
}

export const StrobeRing = forwardRef<SVGGElement>(function StrobeRing(_p, ref) {
  const marks = useMemo(
    () => [
      ...row(OUTER, 'var(--strobe-dim)'),
      ...row(INNER, 'var(--strobe-dim)'),
    ],
    [],
  )

  return (
    <svg viewBox="0 0 100 100" className="tt-strobe" aria-hidden>
      <g ref={ref}>
        {marks}
        {/* single reference index mark */}
        <rect x="49.6" y="1.6" width="0.8" height="6.4" rx="0.3" fill="var(--strobe)" />
      </g>
    </svg>
  )
})
