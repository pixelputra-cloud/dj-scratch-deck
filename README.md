# Scratch Deck — a gesture-controlled DJ turntable

**▶ Play it: https://pixelputra-cloud.github.io/dj-scratch-deck/**

One photogenic turntable you play with your hands in front of a webcam —
scratching the platter, riding the pitch fader, stopping and starting the
motor. Every gesture control is also a normal clickable control, so it works
with just a mouse too. Nothing is uploaded: the audio and the camera feed
never leave your machine.

Built from [`PRD.md`](PRD.md). This is an **MVP** — scaffold, the audio
engine, the visual deck with full mouse/touch control, and hands-free gesture
control (MediaPipe hand tracking). The curated crate (Phase 4) and final art
direction (Phase 5) are still open — see [Status](#status).

## Controls

| Gesture | Mouse | Does |
|---|---|---|
| Open hand over the platter | drag the platter | **scratch** — drives the record, reverse included |
| Point with one finger, move up/down | drag the pitch fader | **pitch** (±8 / ±16 %) |
| Make a fist, hold still off the platter | click **START / STOP** | start / stop the motor |
| Index + middle, hold still | click **33 / 45** | switch speed |

## Run it

```bash
npm install
npm run dev
```

Then open the printed `localhost` URL. `getUserMedia` needs a secure context —
**HTTPS or `localhost`** — so the webcam only works on the deployed link or a
local dev server, not from a plain `file://` open.

```bash
npm run build     # static bundle in dist/, deployable to any static host
npm run test      # Vitest — the maths (physics, filters, angle unwrap)
npm run lint
```

### Deploy

`main` auto-deploys to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). The build reads
its base path from `DEPLOY_BASE` (the workflow sets `/dj-scratch-deck/`;
default is `/`), and every runtime reference to a `public/` file goes through
[`src/lib/asset.ts`](src/lib/asset.ts) so the bundle is portable to any
sub-path or a domain root.

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
  The mouse and the fingertip share this one path.
- **Gestures** — `HandLandmarker` ([`@mediapipe/tasks-vision`](https://www.npmjs.com/package/@mediapipe/tasks-vision))
  runs on the main thread in [`HandTracker.ts`](src/gesture/HandTracker.ts);
  its WASM loader would not reliably initialise inside a module worker, and
  `detectForVideo` is ~10–25 ms. Landmarks →
  [`poseCodes.ts`](src/gesture/poseCodes.ts) (5-bit finger pose, hand scale) →
  [`gestureMachine.ts`](src/gesture/gestureMachine.ts) (1-frame scratch enter /
  3-frame exit hysteresis, 700 ms latched dwell, 500 ms global cooldown,
  annulus-priority disambiguation, two-hand role assignment). The camera frame
  maps onto the platter, so the same `ScratchTracker` drives scratch from a
  fingertip. All of this is pure and unit-tested before it touches audio. The
  full-page camera backdrop carries a live landmark skeleton so a user can see
  *why* tracking isn't working.
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
| `public/audio/*.wav` | 6 crate loops | **procedurally synthesized**, see below |

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
| 2 · The deck, visually | ✅ big centred platter, vinyl, machined strobe/marker ring, PNG-faced transport stack, pitch detent; rotation locked to audio; mouse scratch. Redesigned since the PRD: no chassis/tonearm/spindle, camera feed is the full-page background |
| 3 · Gesture control | ✅ MediaPipe on the main thread, landmark overlay, all four gestures (open-hand SCRATCH, POINT-PITCH, FIST-HOLD start/stop, TWO-FINGER-HOLD speed), disambiguation + two-hand assignment, HUD. **Logic unit-tested; the "does it feel right" pass wants real Chrome + a webcam.** |
| 4 · Crate & uploads | 🟡 crate drawer, manifest, drag-a-card-onto-the-disc, local file drop all work; **bundled tracks are procedural placeholders** |
| 5 · Polish & art direction | 🟡 disc + transport art done (supplied PNGs, token layer); onboarding/keyboard/a11y pass still open |

## Browser targets

Chrome/Edge 120+ desktop (primary), Safari 17+ and Firefox 125+ (supported),
mobile degraded to touch. Requires HTTPS or `localhost`.
