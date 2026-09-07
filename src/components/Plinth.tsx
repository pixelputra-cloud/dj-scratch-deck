import type { ReactNode } from 'react'

/**
 * The chassis (PRD §5.1). Layered CSS: base fill, brushed-metal sweep, noise
 * texture, inner bevel highlight, deep drop shadow. Rounded rectangle, ~4:3,
 * platter offset left, controls in the right column.
 */
export function Plinth({ children }: { children: ReactNode }) {
  return (
    <div className="tt-plinth">
      <div className="tt-plinth__metal" aria-hidden />
      <div className="tt-plinth__noise" aria-hidden />
      <div className="tt-plinth__bevel" aria-hidden />
      <div className="tt-plinth__inner">{children}</div>
    </div>
  )
}
