import { forwardRef, useMemo } from 'react'
import { useDeckStore } from '../state/useDeckStore'

/**
 * The record (PRD §5.2). Plain evenly-spaced concentric grooves, and a proper
 * centre label: cream paper stock, a per-track accent rim, a printed bezel of
 * ticks, curved title / artist type. No spindle post.
 *
 * The inner <g> is rotated by <Deck>'s frame loop via a direct
 * setAttribute('transform', 'rotate(deg 50 50)') — never a CSS animation.
 */

const LABEL_R = 18
const BEZEL_TICKS = 72
const GROOVE_INNER = 19.5
const GROOVE_OUTER = 48
const GROOVE_STEP = 0.82

export const Vinyl = forwardRef<SVGGElement>(function Vinyl(_props, ref) {
  const track = useDeckStore((s) => s.loadedTrack)
  const accent = track?.labelColor ?? 'var(--label-accent)'
  const title = (track?.title ?? 'NO DISC').toUpperCase().slice(0, 18)
  const artist = (track?.artist ?? 'load a track').slice(0, 22)

  /** evenly-spaced concentric grooves; every 8th sits in a slightly wider
   *  "band gap" so the surface reads like a record without any noise. */
  const grooves = useMemo(() => {
    const out: { r: number; band: boolean }[] = []
    let i = 0
    for (let r = GROOVE_INNER; r <= GROOVE_OUTER; r += GROOVE_STEP, i++) {
      out.push({ r, band: i % 8 === 0 })
    }
    return out
  }, [])

  const ticks = useMemo(() => {
    return Array.from({ length: BEZEL_TICKS }, (_, i) => {
      const major = i % 6 === 0
      const a = (i / BEZEL_TICKS) * 360
      return { a, r1: major ? 14.4 : 15.1, r2: 16.2, w: major ? 0.5 : 0.3 }
    })
  }, [])

  return (
    <svg viewBox="0 0 100 100" className="tt-vinyl" aria-hidden>
      <defs>
        <radialGradient id="vinylBody" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--vinyl-base)" />
          <stop offset="70%" stopColor="var(--vinyl-base)" />
          <stop offset="100%" stopColor="#000" />
        </radialGradient>
        <radialGradient id="labelPaper" cx="40%" cy="34%" r="78%">
          <stop offset="0%" stopColor="#f6efdd" />
          <stop offset="52%" stopColor="#e7d6b0" />
          <stop offset="100%" stopColor="#c3a978" />
        </radialGradient>
        {/* left->right arcs; title bulges up, artist bulges down */}
        <path id="vinylTitleArc" d="M 38.6 50 A 11.4 11.4 0 0 1 61.4 50" fill="none" />
        <path id="vinylArtistArc" d="M 39 51.6 A 11 11 0 0 0 61 51.6" fill="none" />
      </defs>

      <g ref={ref}>
        {/* disc body + plain concentric groove field */}
        <circle cx="50" cy="50" r="49" fill="url(#vinylBody)" className="tt-vinyl__body" />
        <g fill="none">
          {grooves.map((g, i) => (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={g.r}
              stroke={g.band ? 'var(--vinyl-groove-strong)' : 'var(--vinyl-groove)'}
              strokeWidth={g.band ? 0.28 : 0.16}
            />
          ))}
        </g>
        {/* lead-in ring next to the label */}
        <circle cx="50" cy="50" r="18.7" fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="0.7" />

        {/* ---- centre label ---- */}
        <circle cx="50" cy="50" r={LABEL_R} fill="url(#labelPaper)" />
        {/* soft drop of the label onto the vinyl */}
        <circle cx="50" cy="50" r={LABEL_R} fill="none" stroke="rgba(0,0,0,0.28)" strokeWidth="0.35" />
        {/* per-track accent rim */}
        <circle cx="50" cy="50" r={LABEL_R - 0.9} fill="none" stroke={accent} strokeWidth="1.7" />
        <circle cx="50" cy="50" r={LABEL_R - 2.1} fill="none" stroke="rgba(0,0,0,0.22)" strokeWidth="0.3" />

        {/* printed bezel ticks — also the rotation tell */}
        <g stroke="rgba(60,40,18,0.55)" strokeLinecap="butt">
          {ticks.map((t, i) => (
            <line
              key={i}
              x1={50 + t.r1 * Math.cos((t.a * Math.PI) / 180)}
              y1={50 + t.r1 * Math.sin((t.a * Math.PI) / 180)}
              x2={50 + t.r2 * Math.cos((t.a * Math.PI) / 180)}
              y2={50 + t.r2 * Math.sin((t.a * Math.PI) / 180)}
              strokeWidth={t.w}
            />
          ))}
        </g>
        {/* bold index tick in the accent colour */}
        <line x1="50" y1="31.8" x2="50" y2="34.4" stroke={accent} strokeWidth="1.1" strokeLinecap="round" />

        {/* curved title / artist */}
        <text className="tt-vinyl__title" fill="#2a1b09">
          <textPath href="#vinylTitleArc" startOffset="50%" textAnchor="middle">
            {title}
          </textPath>
        </text>
        <text className="tt-vinyl__artist" fill="#5a4327">
          <textPath href="#vinylArtistArc" startOffset="50%" textAnchor="middle">
            {artist}
          </textPath>
        </text>

        {/* BPM — small caption between the title and the hole */}
        {track?.bpm ? (
          <text
            x="50"
            y="44.6"
            textAnchor="middle"
            className="tt-vinyl__bpm"
            fill={accent}
          >
            {track.bpm} BPM
          </text>
        ) : null}

        {/* reinforced centre hole — no spindle post */}
        <circle cx="50" cy="50" r="2.7" fill="#efe6cf" stroke="rgba(0,0,0,0.3)" strokeWidth="0.4" />
        <circle cx="50" cy="50" r="1.3" fill="#0b0b0b" />
        <circle cx="50" cy="50" r="1.3" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.3" />
      </g>
    </svg>
  )
})
