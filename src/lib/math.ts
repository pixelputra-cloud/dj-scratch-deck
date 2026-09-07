export const TAU = Math.PI * 2

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Frame-rate-independent exponential approach of `current` toward `target`.
 *  `tau` is the time constant in seconds (~63% of the way there per `tau`). */
export function expApproach(
  current: number,
  target: number,
  dt: number,
  tau: number,
): number {
  if (tau <= 0) return target
  return current + (target - current) * (1 - Math.exp(-dt / tau))
}

/** Wrap an angle (radians) into (-PI, PI]. */
export function wrapPi(a: number): number {
  a = ((a + Math.PI) % TAU + TAU) % TAU
  return a - Math.PI
}

/** Positive modulo — result always in [0, n). */
export function mod(a: number, n: number): number {
  return ((a % n) + n) % n
}
