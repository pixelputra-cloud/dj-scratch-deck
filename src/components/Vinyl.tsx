import { forwardRef, useMemo } from 'react'
import { useDeckStore } from '../state/useDeckStore'

/**
 * The record itself (PRD §5.2). SVG concentric groove strokes with
 * pseudo-random opacity for surface texture, plus a centre label carrying the
 * loaded track's title/artist and per-track accent colour.
 *
 * The inner <g> is rotated by <Deck>'s frame loop via a direct
 * setAttribute('transform', 'rotate(deg 50 50)') — never a CSS animation, so
 * what you see is what you hear.
 */

// deterministic pseudo-random so grooves don't reshuffle every render
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface GrooveDef {
  r: number
  opacity: number
  strong: boolean
}

export const Vinyl = forwardRef<SVGGElement>(function Vinyl(_props, ref) {
  const track = useDeckStore((s) => s.loadedTrack)

  const grooves = useMemo<GrooveDef[]>(() => {
    const rand = mulberry32(0x5eed)
    const out: GrooveDef[] = []
    for (let r = 19.5; r <= 48; r += 0.62 + rand() * 0.22) {
      out.push({ r, opacity: 0.25 + rand() * 0.75, strong: rand() > 0.86 })
    }
    return out
  }, [])

  const accent = track?.labelColor ?? 'var(--label-accent)'

  return (
    <svg viewBox="0 0 100 100" className="tt-vinyl" aria-hidden>
      <defs>
        <radialGradient id="vinylBody" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--vinyl-base)" />
          <stop offset="72%" stopColor="var(--vinyl-base)" />
          <stop offset="100%" stopColor="#000" />
        </radialGradient>
        <radialGradient id="vinylLabel" cx="42%" cy="38%" r="70%">
          <stop offset="0%" stopColor="var(--label-base)" />
          <stop
            offset="100%"
            stopColor="color-mix(in srgb, var(--label-base) 78%, #000)"
          />
        </radialGradient>
      </defs>

      <g ref={ref}>
        {/* disc body */}
        <circle cx="50" cy="50" r="49" fill="url(#vinylBody)" />

        {/* machined groove field */}
        <g fill="none" strokeLinecap="round">
          {grooves.map((g, i) => (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={g.r}
              stroke={
                g.strong ? 'var(--vinyl-groove-strong)' : 'var(--vinyl-groove)'
              }
              strokeWidth={g.strong ? 0.35 : 0.2}
              strokeOpacity={g.opacity}
            />
          ))}
        </g>

        {/* lead-in / lead-out lands */}
        <circle cx="50" cy="50" r="18.4" stroke="rgba(0,0,0,0.55)" strokeWidth="0.8" fill="none" />
        <circle cx="50" cy="50" r="48.6" stroke="rgba(0,0,0,0.6)" strokeWidth="0.7" fill="none" />

        {/* centre label */}
        <circle cx="50" cy="50" r="17.8" fill="url(#vinylLabel)" />
        <circle cx="50" cy="50" r="17.8" fill="none" stroke={accent} strokeWidth="0.9" strokeOpacity="0.9" />
        <circle cx="50" cy="50" r="10.6" fill="none" stroke={accent} strokeWidth="0.5" strokeOpacity="0.5" />
        {/* accent arc so rotation is legible on the label too */}
        <path
          d="M 50 33 A 17 17 0 0 1 66.5 46"
          fill="none"
          stroke={accent}
          strokeWidth="2.2"
          strokeLinecap="round"
        />

        <text x="50" y="46.5" textAnchor="middle" className="tt-vinyl__title" fill="var(--label-ink)">
          {(track?.title ?? 'NO DISC').slice(0, 16).toUpperCase()}
        </text>
        <text x="50" y="52.4" textAnchor="middle" className="tt-vinyl__artist" fill="var(--label-ink)">
          {(track?.artist ?? '— load a track —').slice(0, 20)}
        </text>
        {track?.bpm ? (
          <text x="50" y="58.5" textAnchor="middle" className="tt-vinyl__bpm" fill="var(--label-ink)">
            {track.bpm} BPM
          </text>
        ) : null}

        {/* spindle hole */}
        <circle cx="50" cy="50" r="1.15" fill="#000" />
      </g>
    </svg>
  )
})
