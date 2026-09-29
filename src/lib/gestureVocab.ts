/**
 * The four gestures, in one place, so the Gestures panel and the onboarding
 * card can't drift apart. Pure data — no React import — kept in its own
 * file rather than exported alongside a component (fast refresh only works
 * cleanly when a file exports components only).
 */
export const GESTURE_VOCAB = [
  ['SCRATCH', 'open hand over the platter — drives the record'],
  ['TWO-FINGER-PITCH', 'index + middle, move left/right — rides the pitch fader'],
  ['FIST-HOLD', 'make a fist off the platter, held still — start / stop'],
  ['ONE-FINGER-HOLD', 'point with one finger, held still — 33 / 45'],
] as const
