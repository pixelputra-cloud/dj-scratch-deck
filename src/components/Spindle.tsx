/**
 * Centre post (PRD §5.3). Purely visual — a short metallic cylinder drawn
 * above the vinyl to sell the layering. Never rotates.
 */
export function Spindle() {
  return (
    <svg viewBox="0 0 100 100" className="tt-spindle" aria-hidden>
      <defs>
        <radialGradient id="spindleTop" cx="38%" cy="34%" r="70%">
          <stop offset="0%" stopColor="var(--spindle-a)" />
          <stop offset="60%" stopColor="var(--spindle-b)" />
          <stop offset="100%" stopColor="color-mix(in srgb, var(--spindle-b) 55%, #000)" />
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="52.2" rx="2.7" ry="2.9" fill="var(--spindle-shadow)" />
      <rect x="47.4" y="46.5" width="5.2" height="5" rx="1.1" fill="var(--spindle-b)" />
      <circle cx="50" cy="47" r="2.85" fill="url(#spindleTop)" />
      <circle cx="49.1" cy="46" r="0.9" fill="#fff" fillOpacity="0.7" />
    </svg>
  )
}
