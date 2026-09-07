/*
 * One Euro filter (Casiez, Roussel & Vogel, 2012).
 *
 * Purpose-built for noisy interactive pointer signals: low jitter when the
 * hand is still, low lag when it moves fast. A plain EMA forces you to pick
 * one; scratching needs both (PRD stack table + §6.3).
 *
 * ~40 lines, no dependency, pure. Unit-tested.
 */

export interface OneEuroOptions {
  /** Hz. Baseline smoothing when the signal is quiet. Higher = less lag,
   *  more jitter. */
  minCutoff?: number
  /** Speed coefficient. Higher = cutoff rises faster with velocity, so fast
   *  motion passes through nearly unfiltered. */
  beta?: number
  /** Hz. Cutoff for the derivative's own low-pass. */
  dCutoff?: number
  /** Seconds. Used when filter() is called without an explicit timestamp. */
  dt?: number
}

function smoothingAlpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}

export class OneEuroFilter {
  private minCutoff: number
  private beta: number
  private dCutoff: number
  private defaultDt: number

  private xPrev: number | null = null
  private dxPrev = 0
  private tPrev: number | null = null

  constructor(opts: OneEuroOptions = {}) {
    this.minCutoff = opts.minCutoff ?? 1.0
    this.beta = opts.beta ?? 0.0
    this.dCutoff = opts.dCutoff ?? 1.0
    this.defaultDt = opts.dt ?? 1 / 60
  }

  reset(): void {
    this.xPrev = null
    this.dxPrev = 0
    this.tPrev = null
  }

  /**
   * @param x         raw sample
   * @param timestamp seconds; optional. If given, dt is derived from it.
   */
  filter(x: number, timestamp?: number): number {
    if (this.xPrev == null) {
      this.xPrev = x
      this.tPrev = timestamp ?? null
      return x
    }

    let dt = this.defaultDt
    if (timestamp != null && this.tPrev != null) {
      const d = timestamp - this.tPrev
      if (d > 0) dt = d
    }
    this.tPrev = timestamp ?? null

    // derivative, low-passed at dCutoff
    const dx = (x - this.xPrev) / dt
    const aD = smoothingAlpha(this.dCutoff, dt)
    const edx = aD * dx + (1 - aD) * this.dxPrev
    this.dxPrev = edx

    // velocity-dependent cutoff
    const cutoff = this.minCutoff + this.beta * Math.abs(edx)
    const aX = smoothingAlpha(cutoff, dt)
    const ex = aX * x + (1 - aX) * this.xPrev
    this.xPrev = ex
    return ex
  }
}
