# Project Status — Gesture-Controlled DJ Turntable

**Snapshot for handoff.** Read this before working on the repo so you build on the
current state without re-litigating decisions already made. `PRD.md` is the
original spec; this file records what was actually built and where it diverged.

- **Repo:** `E:\Claude_Matrix\dj_turntable` · single-page static web app · no backend, no accounts
- **Branch:** `main` · 11 commits · working tree clean
- **~4,000 lines** TS/TSX in `src/` · **51 unit tests** passing · `npm run build` + `npm run lint` green
- **Original PRD phases 0–3 are done** (scaffold, audio engine, visual deck, gesture control). Phases 4–5 (curated crate, art-direction polish) are not.

---

## 1. What it is

One photogenic turntable in the browser. Pick a track, hit start, and play the
record with your hands in front of the webcam — scratch the platter, ride the
pitch fader, start/stop the motor, switch 33⅓/45 — or do all of it with the
mouse. Every gesture control is also a normal clickable control.

The technical core (unchanged from the PRD and working): a custom
`AudioWorkletProcessor` owns the decoded sample data and a floating-point
virtual read head, so playback rate can go **negative** (real reverse) and the
visual disc is locked to the audio playhead, never CSS-animated.

---

## 2. Tech stack (as installed — newer than the PRD's stated versions)

| Layer | Actual | PRD said |
|---|---|---|
| Build | **Vite 8** + `@vitejs/plugin-react` 6 | Vite 6 |
| Language | **TypeScript ~6.0** (`tsc -b` in the build) | TS 5 |
| UI | **React 19.2** | React 19 |
| Styling | **Tailwind CSS 4** (`@tailwindcss/vite`) + a CSS-variable token layer (`src/styles/tokens.css`) | Tailwind 4 + tokens |
| State | **Zustand 5** | Zustand |
| Audio | **Web Audio API + `AudioWorkletProcessor`** (`public/worklets/turntable-processor.js`, plain JS) | same |
| Hand tracking | **`@mediapipe/tasks-vision` 1.0.1**, `HandLandmarker`, **run on the main thread** (see pivots) | worker + OffscreenCanvas |
| Filtering | **One Euro filter** (`src/gesture/oneEuroFilter.ts`, ~40 lines, no dep) | same |
| Tests | **Vitest 5** (`npx vitest run` — there is no `test` npm script) | Vitest |
| Lint | **oxlint** (`.oxlintrc.json`, ignores `public/`) | PRD said nothing; scaffold chose oxlint over eslint |

Scripts: `dev`, `build` (`tsc -b && vite build`), `lint` (`oxlint`), `preview`.
Run tests with `npx vitest run`.

Vendored offline (no runtime CDN, per PRD §4.3):
- `public/models/hand_landmarker.task` (~7.8 MB — the only published bundle; the
  PRD's "lite ~3 MB" model doesn't exist as a `.task`. The file has **2 leading
  NUL bytes exactly as Google's CDN serves it** — not corruption, MediaPipe
  loads it fine.)
- `public/wasm/` — the `tasks-vision` WASM fileset, copied from the npm package.
- `public/audio/*.wav` — 6 crate loops + `vinyl-noise.wav` (**procedurally
  synthesised**, see pivots).

---

## 3. Architecture / file map

```
public/
  worklets/turntable-processor.js   plain-JS worklet: virtual read head, 4-tap cubic Hermite,
                                    negative-capable `rate` a-rate AudioParam, ~30 Hz playhead postback
  models/ wasm/ audio/              vendored assets

src/
  main.tsx  App.tsx                 App = layout shell: <GestureBackdrop> + <Deck> + <SidePanel> + <PowerGate>
  audio/
    TurntableEngine.ts              AudioContext, node graph, fetch/decode, worklet bridge, 15-min guard
    platterPhysics.ts               ONE pure velocity model (motor+pitch+rpm+hand). spin-up 0.35s / spin-down 1.2s.   [tested]
    workletContract.ts              typed message contract for the worklet
  gesture/
    poseCodes.ts                    landmarks -> 5-bit finger pose, hand scale, pinch dist, predicates             [tested]
    gestureMachine.ts               hysteresis / dwell / latch / cooldown / priority / two-hand assignment          [tested]
    oneEuroFilter.ts                                                                                                [tested]
    platterMapping.ts               screen->angle, the ±π unwrap (highest-risk line), ScratchTracker                [tested]
    HandTracker.ts                  getUserMedia + MediaPipe on the MAIN THREAD + rAF pump + error surfacing
    handTracker.worker.ts           parked (unused) — worker version kept for a later optimisation pass
    useGestureTracking.ts           React hook: owns HandTracker lifecycle, paints the full-page landmark overlay
  state/
    useDeckStore.ts                 zustand — DISCRETE state only
    deckRuntime.ts                  mutable object for CONTINUOUS per-frame values (position, velocity, motorOn, …). read via ref, never React.
    deckController.ts               the ONE rAF loop + engine glue. only caller of stepPlatter / engine.setRate. also processGestureResult().
  components/
    Deck.tsx                        composes the deck; owns the single view frame loop (writes the disc rotation; vinyl + rim ring locked together)
    Platter.tsx                     platter; publishes geometry (px) for scratch maths; pointer scratch; drag-to-load drop target
    Vinyl.tsx  StrobeRing.tsx       the record + the rim strobe band
    StartButton.tsx SpeedSelector.tsx PitchFader.tsx   skeuomorphic transport controls (left stack)
    SidePanel.tsx                   right-edge tabbed drawer -> CratePanel / GesturePanel
    Crate.tsx (CratePanel) GestureHUD.tsx (GesturePanel) TrackCard.tsx
    GestureBackdrop.tsx CameraControl.tsx PowerGate.tsx
  tracks/
    manifest.json loadManifest.ts   bundled crate
    userTrack.ts                     trackFromFile / isAudioFile (shared by Crate + Platter)
    types.ts
  lib/ constants.ts math.ts         PRD Appendix-A constants + pure helpers
  styles/ tokens.css deck.css

scripts/make_loops.mjs               regenerates the 6 procedural crate loops
```

**Deleted vs the PRD's §10 architecture:** `Plinth.tsx`, `Tonearm.tsx`,
`Spindle.tsx`, `CameraPanel.tsx` — the chassis, tonearm and spindle are gone by
design (see pivots); the camera panel was replaced by the backdrop + header
control.

---

## 4. What's built and working

**Audio engine (PRD Phase 1 — verified against the exit criteria)**
- Worklet virtual read head + 4-tap cubic Hermite interpolation.
- `rate` exposed as an **a-rate `AudioParam`**; the frame loop calls
  `setTargetAtTime(..., 0.015)` — no zipper noise.
- Negative rate = clean reverse. Loop-at-bounds by default (toggle in the store).
- `TurntableEngine`: fetch → `decodeAudioData` → zero-copy transfer of channel
  `ArrayBuffer`s into the worklet; 15-minute memory guard; vinyl-noise layer
  gain-modulated by `|rate|`.
- `stepPlatter` — one pure function, unit-tested: spin-up torque, power-off
  pitch drop, 33↔45 ramp, pitch scales the target, hand overrides incl. reverse.
- **Power gate** click to resume the `AudioContext` (autoplay policy).

**Visual deck (PRD Phase 2)**
- Disc rotation written each frame from the worklet's reported playhead position
  — audio and visual cannot drift.
- Mouse scratching over the platter annulus via `ScratchTracker`
  (atan2 → ±π unwrap → One Euro → clamped rate) — the **same maths the fingertip
  uses**.
- Strobe band, groove field, cast-metal platter, per-track label, detented pitch.

**Gesture control (PRD Phase 3, gesture set revised — see pivots)**
- MediaPipe `HandLandmarker` (main thread) → mirror x → `poseCodes` →
  `gestureMachine` → deck actions, + a full-page mirrored landmark overlay
  (electric-cyan, layered ABOVE the deck).
- Four gestures: **SCRATCH** = open hand over the platter (1-frame enter /
  3-frame exit hysteresis so a dropped detection never drops the record;
  scratch pivot = mean of the four fingertips); **PINCH-PITCH** = thumb+index;
  **FIST-HOLD** = closed fist off the platter, still, 700 ms → start/stop;
  **TWO-FINGER-HOLD** = index+middle, still, 700 ms → 33/45. 700 ms latched
  dwell (pose must break to re-arm), 500 ms global cooldown, annulus priority,
  two-hand role assignment.
- Scratch response is shaped: `rate = sign(g)·|g|^0.7 · 1.7`, dead-banded and
  clamped, with a raised One Euro filter (3.5 Hz / β 1.2) and a tighter
  audio-side ramp (`RATE_SMOOTHING_TAU_SCRATCH` 0.008) while a hand/pointer is
  on the record — so small hand motions register and the scratch lags less.
- Camera-denied / no-camera path leaves the deck fully mouse-operable and shows
  the real failure reason (`cameraError`). **This is the only part of gesture
  that's verifiable without real hardware.**

**Crate**
- 6 bundled tracks (procedural placeholders), compact cards (thumbnail / title /
  artist / BPM), click-to-load, **drag a card onto the disc to load**, local
  file drop-and-decode (drop on the crate or on the disc), nothing uploaded.

**51 tests:** `platterPhysics`, `oneEuroFilter`, `platterMapping` (±π seam both
directions), `poseCodes`, `gestureMachine`.

---

## 5. Pivots from PRD v1 — read this so you don't "fix" them backwards

### Stack / infra
- **Newer tool versions** (table in §2). `tsc -b` runs in the build.
- **oxlint** instead of eslint.
- **No `test` npm script** — use `npx vitest run`.

### MediaPipe runs on the **main thread**, not a Web Worker
PRD §4.2 wanted worker inference. `@mediapipe/tasks-vision`'s WASM loader does
not initialise reliably inside a `{ type: 'module' }` worker; a working tracker
beats a lower-latency broken one. `handTracker.worker.ts` is kept for a later
pass. `detectForVideo(video, ts)` runs per rAF (~10–25 ms, can hitch a frame).

### Bundled crate = **procedural placeholders**, not curated CC tracks
PRD §8.1 wants 6 licence-verified CC0/CC-BY tracks from FMA/ccMixter/Pixabay.
Instead there are 6 loops **synthesised from scratch** (`scripts/make_loops.mjs`)
— CC0 by origin, no attribution needed. Phase 4 curation is still to do. The
`manifest.json` schema (licence + sourceUrl mandatory) is ready for real tracks.
See the recent conversation for a full analysis of track-import options
(local-first + persistence, CORS-allowlisted URL paste with archive.org, Jamendo
API — **not** YouTube/Spotify extraction).

### The whole visual layout was redesigned (several rounds, user-driven)
PRD §9.2 = header / (deck-left | camera+HUD-right) / crate-strip-bottom, with a
4:3 brushed-metal plinth, platter offset left, tonearm, controls in a right
column. **Current:**
- **No plinth / chassis, no tonearm, no spindle** — all deleted.
- **Camera feed is the full-page background** (`GestureBackdrop`), with a soft
  scrim; the landmark skeleton is painted across the whole viewport using an
  `object-fit: cover` projection so hands line up with the deck.
- **One large disc** `min(80vh, 53vw, 620px)`, dead-centred in the stage
  (`.tt-deck` is `display:grid; place-items:center`).
- **Transport controls = a PNG-faced floating stack on the LEFT** (no housing).
  The button / rail / knob faces are pre-rendered images the user supplied,
  vendored from `assets/` into **`public/controls/`** and referenced by absolute
  path (same convention as `public/fonts`). Ten files:
  `speed-selector-{33,45}-{on,off}.png`, `start-stop.png`,
  `pitch-fader-{base,slider,lcd-readout,range-toggle-8,range-toggle-16}.png`.
  - `SpeedSelector` / `PitchFader` range key: `<button>` whose `<img>` src swaps
    on state. `StartButton`: the pill PNG is a CSS `background`; a live
    `.tt-start__label` (gradient matched to the pill's baked fill) covers the
    baked "START" so it can still read **STOP**, and lights amber + shows an
    inline LED dot while the motor runs.
  - `PitchFader` keeps all its pointer logic; the rail is the `base` PNG, the
    knob is the `slider` PNG positioned by `left %` with `TRAVEL = 0.12`
    reserved at each end (kept in sync with `pointerToPitch`'s `pad`). The `–` /
    `+` are baked into the rail; a thin CSS `.tt-pitch__detent` line marks 0 and
    flares on the store-enforced centre detent. Tap within ~20 % of an end to
    jump to that extreme. Right = faster. Works the same at ±8 / ±16.
  - The disc diameter is one var, `--disc-w: min(80vh, 53vw, 620px)` on
    `.tt-deck`, used by both `.tt-platter` and the stack. The stack is
    `position: absolute`, right edge parked 14 px off the disc's left edge
    (`right: calc(50% + var(--disc-w)/2 + 14px)`), and it **scales continuously
    to fit the left gutter**: `transform: scale(clamp(0.5, (var(--gutter) -
    24px) / 342px, 1))` with `--gutter: (100vw - var(--disc-w))/2` and
    `transform-origin: right center` (342 px ≈ the row's natural width; a static
    `scale(0.82)` precedes it as a fallback for engines without length/length
    division). So it's full size when the gutter is wide, shrinks smoothly as
    the viewport narrows, and never reaches the (still dead-centred) disc —
    ~14 px gap at every width, down to a 0.5 floor.
  - Only four live-accent tokens remain in `tokens.css`
    (`--analog-ink`, `--analog-led`, `--analog-led-glow`, `--analog-lcd-ink`);
    the old CSS-drawn `--analog-cap/-frame/-shade/…` and dead `--fader-*` tokens
    were removed.
- **Crate + Gesture HUD merged into one right-edge tabbed drawer**
  (`SidePanel`, tabs *Crate* / *Gestures*); collapsed it's a single handle;
  turning the camera on brings the *Gestures* tab forward once. `CratePanel` /
  `GesturePanel` are content-only.
- **Camera enable/disable + the failure diagnostic live in a header
  `CameraControl`** (the sidebar `CameraPanel` is gone).
- **Glass mode:** `.tt-app[data-camera='on']` makes the platter metal and the
  vinyl body semi-transparent so the feed reads through the disc.

### Disc / vinyl redesign
- **Grooves are plain evenly-spaced concentric circles** (was pseudo-random
  opacity/spacing).
- **Centre label** rebuilt as a real record label: cream paper, per-track accent
  rim, 72-tick printed bezel, curved TITLE (top arc) + ARTIST (bottom arc) via
  `<textPath>`, BPM caption, reinforced hole.
- **Rim marker ring** (`StrobeRing`): the PRD's Technics strobe-aliasing idea
  was tried (drift off pitch offset) but read as disconnected — it now **rotates
  locked to the disc** (same transform as the vinyl in `Deck`'s frame loop), so
  the bold index mark tracks the record's own reference and the ring stops when
  the disc stops. Sparse (60 marks) so it doesn't shimmer when spinning.
- **Platter** reworked to read as die-cast aluminium (fine machining, brushed
  conic sheen, raised machined rim lip, inner vignette).

### Crate cards / waveform
- **Waveform thumbnails removed entirely** — `computePeaks`,
  `DecodedTrack.waveformPeaks`, and the store's `waveforms`/`setWaveform` are all
  gone (PRD §7.3 / §8.3 wanted a static waveform overview; user found the cards
  too heavy). Cards are now a compact one-liner + sub-line.
- **Drag-a-card-onto-the-disc** loading added (`Platter` is a drop target with a
  "DROP TO LOAD" ring) — matches PRD §8.3 intent.

### Gesture vocabulary + mapping
- PRD §6.3 had SCRATCH = a pointing index finger and PALM-HOLD = an open hand for
  start/stop. **Now: SCRATCH = open hand** (how DJs actually scratch, and the
  most robust pose for MediaPipe under fast motion), **start/stop = FIST-HOLD**
  off the platter. `poseCodes` exposes `isScratchPose` (open hand),
  `isFistPose`, `fingertipsCentroid`; `isPalmPose` is gone.
- **Scratch sensitivity** raised deliberately: multi-fingertip pivot,
  expo+gain response curve (`SCRATCH_GAIN`/`SCRATCH_EXPO`/`SCRATCH_DEADBAND`),
  higher `ONE_EURO_*`, `RATE_SMOOTHING_TAU_SCRATCH`, `SCRATCH_ENTER_FRAMES` 1.
  All are "tune by feel" constants in `lib/constants.ts`.
- `gestureMachine`'s context takes a **`mapPoint` cover-fit projector** (mirrored
  normalised camera point → viewport px, matching the full-page feed) instead of
  an internal `CAM_SPAN` platter-radius span. On-screen hand position and scratch
  target are now the same thing.
- The landmark overlay is **electric cyan**, layered **above** the deck (z-8)
  rather than behind it — camera feed → platter + markings → hand mapping.

### Store shape
- `velocity` / `position` are **not** in `useDeckStore` — they're in
  `deckRuntime` (mutable object, read via ref) per the PRD's own §10 note.
  `deckRuntime` also carries `motorOn`, `pitchPercent`, `gestureScratching` for
  the view loop.
- Added `cameraError`. Removed `waveforms`.

### Held from the PRD (keep these)
Worklet virtual-read-head + Hermite + a-rate param; rotation from playhead never
CSS-animated; one `stepPlatter`; isolated + tested ±π unwrap; One Euro filter;
the full gesture state-machine spec; the CSS token layer; the power gate;
Appendix-A constants; static build, no backend, no accounts, vendored model/WASM.

---

## 6. Not done / open

- **Phase 4** — real licence-verified crate; waveform overview if wanted back;
  attribution credits UI.
- **Phase 5** — vinyl-noise level-up, onboarding overlay teaching the gestures,
  keyboard shortcuts, accessibility pass, theme exploration via `tokens.css`.
- **Track import beyond local files** — see the conversation analysis
  (persistence via IndexedDB/OPFS, URL paste, Jamendo).
- **Real "does it feel right" gesture testing** — needs Chrome + a webcam;
  never validated in automation.
- Safari `decodeAudioData` / worklet quirks — not tested (PRD risk table).

---

## 7. Run / verify

```bash
npm install
npm run dev            # http://localhost:5173  (camera needs localhost or https)
npm run build          # tsc -b && vite build -> static dist/
npm run preview        # serve dist/
npx vitest run         # 51 tests
npm run lint           # oxlint
node scripts/make_loops.mjs   # regenerate the 6 procedural crate loops
```

---

## 8. Gotchas for the next agent

- **Bogus "change in order of Hooks" / `getSnapshot` null in `npm run dev`** —
  a Vite Fast-Refresh artifact after heavy HMR editing of hook code. It is **not
  a real bug**: gone on a clean reload and never present in `npm run build` /
  `npm run preview`. Verify against the production build before chasing it.
- **The automation / in-app test browser pauses `requestAnimationFrame` when
  hidden**, so disc rotation, strobe drift and physics convergence can't be
  fully checked there. It also **blocks `getUserMedia`**, so gesture recognition
  needs a real browser + webcam. What *is* verifiable headless: layout geometry,
  the camera-denied degradation path, store/DOM state, and no-console-errors.
- **The worklet is plain JS in `public/worklets/`** loaded via
  `audioWorklet.addModule('/worklets/turntable-processor.js')` — do not convert
  it to TS (PRD "Note on the worklet file"). Type the message contract in
  `workletContract.ts` instead.
- **One rAF loop only** — `deckController.startLoop()`. Continuous per-frame
  values go through `deckRuntime` + `onFrame(cb)`, never React state.
- **`platterMapping.ts` unwrap** is the highest-risk line in the project; it has
  seam-crossing tests in both directions. Touch with care.
