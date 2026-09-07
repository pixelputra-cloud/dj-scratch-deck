# Gesture-Controlled DJ Turntable

One photogenic turntable you play with your hands in front of a webcam —
scratching the platter, riding the pitch fader, stopping and starting the
motor. Every gesture control is also a normal clickable control.

Built from [`PRD.md`](PRD.md). This tree currently covers **Phases 0–2**:
scaffold, the audio engine, and the visual deck with full mouse/touch control.
Gesture control (Phase 3), the curated crate (Phase 4) and art direction
(Phase 5) are not built yet — see [Status](#status).

## Run it

```bash
npm install
npm run dev
```

Then open the printed `localhost` URL. `getUserMedia` (Phase 3) needs a secure
context, so camera features will require **HTTPS or `localhost`** when they land.

```bash
npm run build     # static bundle in dist/, deployable to any static host
npm run test      # Vitest — the maths (physics, filters, angle unwrap)
npm run test -- --watch
```

## How it works

- **Audio** — a custom `AudioWorkletProcessor`
  ([`public/worklets/turntable-processor.js`](public/worklets/turntable-processor.js))
  owns the decoded sample data and a floating-point virtual read head. `rate`
  is an a-rate `AudioParam`, so `setTargetAtTime` from the frame loop gives a
  per-sample smoothed ramp — no zipper noise — and the rate may go **negative**
  for real reverse playback. 4-tap cubic Hermite interpolation. The worklet
  posts its playhead back at ~30 Hz.
- **Rotation is never a CSS animation.** The vinyl angle is written each frame
  from the worklet's reported playhead position
  ([`src/components/Deck.tsx`](src/components/Deck.tsx)), so what you see is
  what you hear and they cannot drift.
- **One physics model** ([`src/audio/platterPhysics.ts`](src/audio/platterPhysics.ts))
  — a pure function combining motor, pitch, rpm and the hand into a single
  velocity. Two time constants give the spin-up torque and the power-off pitch
  drop. Unit-tested.
- **Scratch maths** ([`src/gesture/platterMapping.ts`](src/gesture/platterMapping.ts))
  — screen position → platter angle → `atan2` → ±π unwrap → angular velocity →
  One Euro filter → clamped playback rate. The ±π unwrap is the highest-risk
  line in the project and is unit-tested crossing the seam in both directions.
  The mouse and (later) the fingertip share this one path.
- **State** — [`useDeckStore`](src/state/useDeckStore.ts) (Zustand) holds
  discrete state; continuous per-frame values ride in
  [`deckRuntime`](src/state/deckRuntime.ts), read via ref, never through React.
- **Theme** — every themeable value is a CSS custom property in
  [`src/styles/tokens.css`](src/styles/tokens.css). Phase 5 restyling should be
  a change to that one file plus texture assets.

## Vendored assets (no runtime network dependency)

| Path | What | Source |
|---|---|---|
| `public/models/hand_landmarker.task` | MediaPipe hand model (~7.8 MB) | `storage.googleapis.com/mediapipe-models/hand_landmarker/.../float16/1` |
| `public/wasm/` | `@mediapipe/tasks-vision` v1.0.1 WASM fileset | copied from the npm package |
| `public/audio/*.wav` | 6 crate loops + `vinyl-noise.wav` | **procedurally synthesized**, see below |

### About the bundled crate

The six loops in `public/audio/` are **synthesized from scratch** by
[`scripts/make_loops.mjs`](scripts/make_loops.mjs) — no sampled material, so
they are CC0 by origin and carry no attribution requirement. They exist so the
audio engine and deck are demoable end to end.

**Phase 4 replaces them** with curated, licence-verified tracks from Free Music
Archive / ccMixter / Pixabay per PRD §8.1. Every
[`manifest.json`](src/tracks/manifest.json) entry must keep a verified
`license` and `sourceUrl`.

Regenerate the loops with:

```bash
node scripts/make_loops.mjs
```

## Status

| Phase | State |
|---|---|
| 0 · Scaffold | ✅ Vite 8 + React 19 + TS + Tailwind 4 + Zustand, Vitest, tokens, vendored model/WASM |
| 1 · Audio engine | ✅ worklet read head, cubic interp, `rate` AudioParam, `TurntableEngine`, physics + tests, power gate |
| 2 · The deck, visually | ✅ plinth, platter, vinyl, spindle, tonearm, strobe, controls, pitch detent; rotation locked to audio; mouse scratch |
| 3 · Gesture control | ⛔ not started — `HandTracker` / `poseCodes` / `gestureMachine` stubs pending; `oneEuroFilter` + `platterMapping` already built and tested |
| 4 · Crate & uploads | 🟡 crate UI, manifest, waveform thumbnails, local file drop all work; **bundled tracks are placeholders** |
| 5 · Polish & art direction | ⛔ not started (vinyl-noise layer is wired but understated) |

## Browser targets

Chrome/Edge 120+ desktop (primary), Safari 17+ and Firefox 125+ (supported),
mobile degraded to touch. Requires HTTPS or `localhost`.
