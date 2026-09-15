# Project Status — Scratch Deck (gesture-controlled DJ turntable)

**Snapshot for handoff.** Read this before working on the repo so you build on the
current state without re-litigating decisions already made. `PRD.md` is the
original spec; this file records what was actually built and where it diverged.

- **Local:** `E:\Claude_Matrix\dj_turntable` · single-page static web app · no backend, no accounts
- **GitHub:** <https://github.com/pixelputra-cloud/dj-scratch-deck> (public) · **Live:** <https://pixelputra-cloud.github.io/dj-scratch-deck/>
- **Branch:** `main` · 40 commits · working tree clean · in sync with `origin/main`
- **~4,200 lines** TS/TSX in `src/` · **56 unit tests** passing · `npm run build` + `npm run lint` green · auto-deploys to GitHub Pages on push
- **Original PRD phases 0–3 are done** (scaffold, audio engine, visual deck, gesture control) and the MVP is deployed. Phases 4–5 (curated crate, art-direction polish) are not.

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
- `public/audio/*.wav` — 6 crate loops (**procedurally synthesised**, see
  pivots).
- `public/controls/*.png` (11 files) — the transport-control button art
  (source copies also kept in `assets/`).
- `public/images/powergate-bg.jpg` — the power-gate background photo
  (source `assets/DJarena.png`, re-encoded to JPEG on the way in).

Every runtime reference to a `public/` file goes through **`src/lib/asset.ts`**
(`asset(p)` → `import.meta.env.BASE_URL + p`) so the bundle works both at a
domain root and under a sub-path. Vite rebases HTML/CSS asset URLs with `base`
by itself; JS string literals it does not, hence the helper.

---

## 3. Architecture / file map

```
.github/workflows/deploy.yml        build (npm ci · tsc · vite build · lint) + publish dist/ to GitHub Pages on push to main

public/
  worklets/turntable-processor.js   plain-JS worklet: virtual read head, 4-tap cubic Hermite,
                                    negative-capable `rate` a-rate AudioParam, ~30 Hz playhead postback
  models/ wasm/ audio/ controls/    vendored assets (controls/ = transport-button PNGs)

src/
  main.tsx  App.tsx                 App = layout shell: <GestureBackdrop> + <Deck> + <SidePanel> + <PowerGate>
  audio/
    TurntableEngine.ts              AudioContext, node graph, fetch/decode, worklet bridge, 15-min guard
    platterPhysics.ts               ONE pure velocity model (motor+pitch+rpm+hand). spin-up 0.35s / spin-down 1.2s.   [tested]
    workletContract.ts              typed message contract for the worklet
  gesture/
    poseCodes.ts                    landmarks -> 5-bit finger pose, hand scale, predicates                         [tested]
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
    StartButton.tsx SpeedSelector.tsx PitchFader.tsx   PNG-faced transport controls (left stack, <img> src swaps on state)
    SidePanel.tsx                   right-edge tabbed drawer -> CratePanel / GesturePanel
    Crate.tsx (CratePanel) GestureHUD.tsx (GesturePanel) TrackCard.tsx
    GestureBackdrop.tsx CameraControl.tsx PowerGate.tsx
  tracks/
    manifest.json loadManifest.ts   bundled crate
    userTrack.ts                     trackFromFile / isAudioFile (shared by Crate + Platter)
    types.ts
  lib/ constants.ts math.ts asset.ts   PRD Appendix-A constants + pure helpers + base-path asset() resolver
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
  `ArrayBuffer`s into the worklet; 15-minute memory guard. (A vinyl-surface-
  noise ambience layer was tried and **removed** — see pivots.)
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
  scratch pivot = mean of the four fingertips); **TWO-FINGER-PITCH** =
  index+middle extended, moved left/right (no pinch/contact — see pivots);
  **FIST-HOLD** = closed fist off the platter, still, 700 ms → start/stop;
  **ONE-FINGER-HOLD** = a lone pointing finger, still, 700 ms → 33/45. 700 ms
  latched dwell (pose must break to re-arm), 500 ms global cooldown, annulus
  priority, two-hand role assignment.
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

**56 tests:** `platterPhysics`, `oneEuroFilter`, `platterMapping` (±π seam both
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

### Vinyl surface-noise ambience layer — removed entirely
PRD §7.1's "vinyl noise" idea (a looping surface-hiss bed mixed under
playback, swelling with scratch speed) was built (`TurntableEngine`: a
`noiseGain`/`noiseSource`/`noiseBuffer` trio, `startNoise()`,
`setNoiseEnabled()`, `public/audio/vinyl-noise.wav`) but had a bug the user
caught by ear: its gain formula, `0.02 + clamp(|rate|, 0, 4) * 0.06`, had no
zero floor — even at complete rest (motor off, no track, no interaction) it
sat at gain `0.02`. Worse, `powerOn()` started the noise loop unconditionally
the instant the deck powered on, and `setNoiseEnabled(false)` — the only way
to mute it — was **never called from anywhere in the UI**, so there was no
way for a user to turn it off. Net effect: a constant, un-silenceable
background hiss from the moment you hit POWER, which read as a stuck/broken
audio effect rather than ambience. Removed rather than patched — deleted
`noiseGain`/`noiseSource`/`noiseBuffer`, `startNoise()`,
`setNoiseEnabled()`, the `powerOn()`/`setRate()` calls into them, the
`asset('audio/vinyl-noise.wav')` fetch, and the file itself. If a surface-
noise layer is wanted back, it needs a genuine zero floor at rest and either
gate on `motorOn`/scratching or expose a real UI toggle — don't just restore
this version.

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
  vendored from `assets/` into **`public/controls/`** and loaded via
  `asset('controls/…')` (base-path safe). Eleven files:
  `speed-selector-{33,45}-{on,off}.png`, `start-stop-{on,off}.png`,
  `pitch-fader-{base,slider,lcd-readout,range-toggle-8,range-toggle-16}.png`.
  - `SpeedSelector` / `StartButton` / `PitchFader` range key: `<button>` whose
    `<img>` src swaps on state — every face is fully baked into the art now
    (no CSS overlays). `start-stop-on` (= "START" + lit lamp) shows while the
    motor runs, `start-stop-off` (= "STOP" + dark lamp) while it's stopped.
  - The stack is `flex-direction: column; align-items: center` — the 33/45
    pair and START sit centred on the pitch rail (the widest row; its readout
    and range key are equal-width, so the row's centre is the rail's centre).
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

### Power gate — real photo background, not a CSS-drawn scene
`PowerGate.tsx` / the `.tt-powergate*` rules in `deck.css`. Went through a
`/frontend-design` pass (elevate the wordmark, blurred spinning disc behind
the card) and then a full swap once the user supplied art:
- **Background is now a photo** — `assets/DJarena.png` (a DJ-arena
  illustration, user-supplied), vendored as `public/images/powergate-bg.jpg`
  (re-encoded to JPEG q84, 2.0 MB → 264 KB). `.tt-powergate` layers a
  top-to-bottom darkening `linear-gradient` over `url('/images/powergate-bg.jpg')`
  at `background-size: cover`; since the host is `position: fixed; inset: 0`,
  that always fills the viewport at any width, cropping evenly — no JS/media
  queries needed for the scaling itself.
- **The old CSS-drawn "blurred spinning record"** (`.tt-powergate__disc` +
  `-label` + `-sheen`, plus its `tt-pg-spin` / `tt-pg-disc-in` keyframes) is
  **gone** — replaced by the photo. A single `tt-pg-photo-in` opacity fade
  plays on `.tt-powergate` itself on mount; `.tt-powergate__grain` (noise) and
  `.tt-powergate__vignette` (edge darkening) are unchanged and still work over
  the photo.
- **The nameplate card is frosted glass** (`backdrop-filter: blur(28px)
  saturate(1.25)`, up from 18px, over a near-opaque dark gradient — `rgba(17,
  17, 21, 0.88)` → `rgba(8, 8, 10, 0.95)`) so the busy, colourful photo
  resolves into a soft wash behind the text rather than staying legible there
  — that blur *is* the point, not a bug to chase.
- Verified at desktop and mobile (375px) widths — `cover` recenters cleanly at
  both; no console errors. (One false alarm during testing: a screenshot taken
  immediately after an emulated-viewport resize showed the panel content
  missing even though computed styles were all correct (opacity 1, background
  present) — a **capture-timing artifact** of the in-app test browser, not a
  real bug; it rendered correctly on the next screenshot a couple of seconds
  later.)

### Mobile layout — the deck page gets a real narrow-viewport layout
Until now the deck page had essentially no mobile layout: the transport stack
(sized for a wide screen) and the header (one unwrapped row) just got smaller
via `transform: scale()`, which stopped working below ~1000 px and left the
stack clipped/overlapping the disc and the header text cut off. New
`@media (max-width: 700px)` block in `deck.css`:
- **`.tt-deck` switches from the desktop grid-centred-disc-with-a-floating-
  left-stack layout to a plain flex column**: disc first, controls after,
  reordered visually with `order` (DOM order is unchanged — controls still
  come first in `Deck.tsx`, for the desktop layout). `--disc-w` becomes
  `min(95vw, calc(100vh - 400px), 560px)` — width-bound on a tall phone,
  height-bound on a short one — so the disc is always as big as it can be
  without starving the controls under it. `.tt-deck` keeps `overflow-y: auto`
  as a safety net for anything shorter than the formula accounts for.
- **`.tt-deck__controls` goes from `position: absolute` + `transform: scale()`
  to `position: static`, a wrapped flex row, and `margin-top: auto`** — real
  (flow-based) sizing rather than a transform, and pinned to the bottom of the
  stage. Every control's width/height is now `calc(Npx * var(--ctl-scale, 1))`
  (added to `.tt-start`, `.tt-speed__btn`, `.tt-pitch__track`,
  `.tt-pitch__readout`, `.tt-pitch__range`, `.tt-pitch__slider`, and the
  detent's `top`/`bottom`) — `--ctl-scale` defaults to `1` (unset), so desktop
  is pixel-identical to before; mobile sets `--ctl-scale: 0.74` on
  `.tt-deck__controls` and everything under it shrinks for real, in flow.
  (Superseded below — the three groups are now equal-width and each wraps
  onto its own row.)
- **Header** (`.tt-app__header`) wraps onto a second row (`flex-wrap: wrap`)
  and shrinks; the "no disc" / track-title span (now `.tt-app__track` — added
  the class) truncates with an ellipsis instead of overflowing. The camera
  button carries two labels in the DOM now
  (`.tt-camctl__label-full` / `-short`, `CameraControl.tsx`) and CSS swaps
  which is visible — "Enable camera" → "Camera", "Camera blocked" →
  "Blocked", etc. — so it never clips. In practice the header fits on one line
  down to ~375 px anyway; the wrap rule is there for anything narrower.
- **`SidePanel` no longer defaults open on a narrow viewport** — it was
  `useState(true)` unconditionally, so its ~80vw body covered most of the
  disc the instant a phone loaded the page. `isNarrowViewport()` (a
  `matchMedia('(max-width: 700px)')` check, same breakpoint as the CSS) gates
  the initial state; desktop behaviour (opens by default) is unchanged.
- Verified by measuring computed geometry (not just screenshots — the in-app
  browser's screenshot capture is flaky right after a resize, see the power
  gate note above) at 375×812, 375×667, 375×500 and 375×320: the disc-size
  formula degrades gracefully, nothing clips or overlaps, and desktop at
  1440×860 is byte-for-byte the same control sizes/positions as before this
  change.

### Transport stack: START above 33/45; pitch-fader-base flush with them —
### everything native size, nothing scaled beyond `--ctl-scale`
Both on desktop and mobile. `Deck.tsx` renders `<StartButton/><SpeedSelector/>
<PitchFader/>` in that order (was speed, start, pitch) — column layout on
desktop, so this alone reordered it there; mobile is the same column, smaller.

This went through two wrong turns before landing here (see git history if it
ever needs re-deriving): first grew START/33/45 UP to the pitch rail's width
(too big, visibly softened — upscaling PNG art past native resolution
blurs); then shrank the *whole* pitch group DOWN via a `--pitch-scale`
factor to match (technically crisp, but the user's reference screenshots
showed the fader visibly bigger than that — "the pitch fader still looks too
small"). The actual answer needed no scaling trick at all:

- **`pitch-fader-base.png` (`.tt-pitch__track`) is natively 212×64 — the
  *exact same size* as `start-stop-{on,off}.png` (`.tt-start`).** Everything
  now stays at native PNG size (`.tt-start` 212×64, `.tt-speed__btn` 103×103
  ×2, `.tt-pitch__track` 212×64, `.tt-pitch__readout`/`__range` 59×64 each) —
  scaled only by the existing `var(--ctl-scale, 1)` (desktop's disc-relative
  clamp, or mobile's flat `0.74`), never anything on top. `--pitch-scale` is
  gone entirely.
- **The flush alignment (track edges = START edges = 33/45-pair edges) falls
  out of the layout for free**, from two facts: (a) `.tt-deck__controls` is
  `flex-direction: column; align-items: center` — START, the 33/45 pair, and
  the whole pitch row each get centred independently on the *same* axis
  (the container's width = its widest child, the 342px pitch row); (b) the
  pitch row's readout and range key are equal widths (59px each) flanking
  the track, so the track lands centred *within* that row too. Same centre +
  same width (212px) ⇒ same edges — no negative margins, no extra CSS.
  Readout and range key deliberately overhang left/right beyond START/33+45,
  matching the reference screenshots exactly.
- **This requires each control group on its own row — mobile included.** An
  earlier pass let mobile's `.tt-deck__controls` wrap as `flex-direction: row`
  (so a still-fits-together START+33/45 pair shared one line); that breaks
  the "same axis" premise above (a shared row's items don't individually
  centre on the container's axis) and was the reason mobile alignment kept
  drifting. Mobile now just inherits the same `flex-direction: column` as
  desktop — three stacked rows (START, 33/45, pitch), reference-accurate.
- **`.tt-deck__controls`'s desktop scale-to-fit divisor** (in the
  `right`/`transform: scale(clamp(...))` parking formula) is **342px** again
  — the container's natural width is set by the pitch row (its widest
  child), not the 33/45 pair.
- **Mobile `--disc-w` height reserve** (three stacked rows — START ~47px +
  33/45 ~76px + pitch ~47px + 2×16px row gaps ≈ 203px at `--ctl-scale: 0.74`
  — plus header clearance, the gap to the controls, and bottom padding; see
  the mobile-centring note right below for the current value). Verified at
  375×812 and 375×667 (no scroll either way, disc width- then height-bound as
  expected) and desktop 1600×900/900×700 (START, the 33/45 pair, and the
  pitch track all measure exactly flush — 212px vs 212px — with the
  readout/range overhanging as intended); functional checks (start toggle,
  speed switch, pitch tap-to-end, range toggle) still pass.

### Mobile polish: centred deck, closer controls, a more clickable header
Four small, mobile-only fixes (`@media (max-width: 700px)` in `deck.css`),
against reference screenshots:
- **`.tt-deck` centres the disc+controls group as one block** —
  `justify-content: flex-start` → `center`. Previously the disc sat right
  under the header and `.tt-deck__controls` had `margin-top: auto` pinning it
  to the very bottom of the screen, leaving a big dead gap on a tall phone.
  Removed that `margin-top: auto`; the group's own `gap: 14px` is now the
  actual disc-to-controls spacing (was up to ~200px), and the whole
  [disc, gap, controls] block centres vertically in the space below the
  fixed header.
- Reduced `.tt-deck`'s top padding **96px → 84px** (closer to the header's
  actual mobile height) and bumped bottom padding 20px → 24px, so the
  centring reads as "centred in the screen," not "centred in an
  already-top-biased box." `--disc-w`'s height-reserve term followed:
  **325px** (84 header clearance + 14 min gap + ~203 controls + 24 bottom
  padding).
- **`.tt-camctl` (the camera button) is a real tap target on mobile now** —
  padding `6px 10px` → `12px 16px` (≈24px → ≈37px tall), a brighter border
  (`rgba(255,255,255,0.22)`) and a faint fill (`rgba(255,255,255,0.07)`) so
  it doesn't read as flat text. Desktop's `.tt-camctl` rule is untouched.
- **`.tt-panel__handle` (the CRATE/GESTURES tab) is bigger and lit** on
  mobile — amber border + glow, brighter label text. *(Superseded by the
  bottom-sheet conversion right below — the handle is now a horizontal bar,
  not a vertical tab, but keeps this same lit treatment.)*
- All four verified via computed geometry (375×812, 375×667 — disc
  vertically centred with symmetric top/bottom slack, camera button ~37px
  tall, no scroll at either height) and functional checks (start/speed/pitch
  controls); desktop measured unchanged (1600×900) since none of these rules
  exist outside the mobile media query.

### `SidePanel` becomes a bottom sheet on mobile (was the same right-edge
### drawer as desktop, just resized)
Same `SidePanel.tsx` markup and DOM order (`[handle, body]`) on both — only
`deck.css`'s `@media (max-width: 700px)` block changes how `.tt-panel` is
positioned and stacked:
- **Desktop**: `.tt-panel { display: flex; align-items: stretch }` (row,
  default direction) anchored `right: 0`. Because `body` is the *last* child,
  it — not the handle — ends up flush against the container's anchored edge;
  the handle sits immediately to its left (or alone, flush right, when the
  body is `display: none`).
- **Mobile**: the exact same mechanism, rotated 90° — `flex-direction:
  column`, anchored `bottom: 0` (`top/right` cleared, `left: 0` added)
  instead of `right: 0`. Now `body` (last child) ends up flush against the
  *bottom* edge, and the handle sits directly *above* it — which is exactly
  the standard bottom-sheet shape (a grab bar at the top of a sheet that
  rises from the bottom edge), for free, with no markup or component change.
- `.tt-panel__handle` goes from a vertical tab (`writing-mode: vertical-rl`)
  to a full-width horizontal bar (`align-self: stretch`, horizontal text,
  rounded top corners, amber border + glow). The chevron glyphs are
  unchanged (◂ closed / ▸ open, still driven by `SidePanel.tsx`) but get
  `transform: rotate(90deg)` — ◂ (west) rotated 90° CW points up (closed =
  "tap to raise"), ▸ (east) rotated 90° CW points down (open = "tap to
  lower") — so the same two glyphs read correctly in the new orientation.
- `.tt-panel__body` goes full-width (`width: 100%`), `max-height: 75vh`
  (was a fixed `300px` wide side column), flat corners (the handle above it
  carries the rounding), amber side borders continuing the handle's frame.
- **`.tt-panel`'s z-index bumped to 40 on mobile** (was 20, inherited from
  desktop) — above `.tt-app__header`'s 30 — so an expanded sheet genuinely
  overlays every other UI feature, including the header, not just the deck
  behind it.
- The existing `@media (max-width: 820px)` / `(max-height: 620px)` rules
  for `.tt-panel__body` (from earlier in the file, predating the 700px
  breakpoint) still apply in the 700–820px tablet range, where the panel
  stays a side drawer; below 700px this new block's later-declared
  properties win.
- Verified: collapsed handle is a lit bar flush with the bottom edge;
  tapping it raises the sheet (tabs, crate list, gesture HUD all render,
  content scrolls); tapping outside still collapses it (the existing
  click-outside handler in `SidePanel.tsx` needed no changes); tab switching
  works; desktop geometry unchanged (1600×900: body still flush right,
  handle to its left, exactly as before).

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
- **Pitch was POINT-PITCH, not PINCH-PITCH** (superseded again below — now
  TWO-FINGER-PITCH — but the reasoning for dropping the pinch still stands,
  so kept here) — a lone pointing index finger (others curled) dragged the
  fader vertically; the old thumb-index pinch/contact test was gone
  entirely. The user flagged the pinch as hard to sustain via webcam
  tracking (three things had to hold at once: finger shape, tight
  thumb-index distance, AND motion) and asked for a single-pose gesture
  instead.
  - `poseCodes.ts`: `isPinchContext` → **`isPointPose`** (same finger test,
    index out + others curled — just no distance check anymore);
    `pinchDistance()` deleted; `PoseName`'s `'PINCH'` → `'POINT'`; `poseName`
    dropped its second (`pinching`) argument — the pose code alone is now
    enough to name it, since there's no separate distance-engaged state.
  - `gestureMachine.ts`: `HandFSM.pinching/pinchY0/pinchP0` →
    `pointing/pointY0/pointP0`, plus a new `pointDisqualify` counter and a
    per-hand `OneEuroFilter` (`pointFilter`) on the tracked index-tip Y.
    Engages the instant the pose matches (no enter-distance threshold to
    wait on); rides through `PITCH_POINT_EXIT_FRAMES` (3) consecutive
    dropped-pose frames before releasing, mirroring `SCRATCH_EXIT_FRAMES`,
    so one misread finger doesn't drop the drag.
  - **Gain now scales with the active pitch range**: `gain = pitchRange ×
    PITCH_GESTURE_GAIN` instead of a flat `45`. Previously ±16 needed
    *double* the hand travel of ±8 for the same swing (the old flat gain
    was tuned around ±8); now the same comfortable movement always sweeps
    the whole fader at either range.
  - New constants: `PITCH_POINT_EXIT_FRAMES`, `PITCH_GESTURE_GAIN`,
    `PITCH_ONE_EURO_MIN_CUTOFF`, `PITCH_ONE_EURO_BETA`, `PITCH_ONE_EURO_D_CUTOFF`.
    `PINCH_ENTER_DIST`/`PINCH_EXIT_DIST` removed.
  - **Follow-up tuning pass** (user feedback: still felt sluggish after the
    pose swap) — the *first* cut of these numbers erred hard toward
    smoothness over responsiveness: `PITCH_GESTURE_GAIN` **6.25 → 8**;
    `PITCH_ONE_EURO_MIN_CUTOFF` **1.4 Hz → 2.5 Hz**; `PITCH_ONE_EURO_BETA`
    **0.25 → 0.9** (this was the main culprit — the filter's whole point is
    low-jitter-at-rest *and* low-lag-in-motion, and a beta that low meant the
    cutoff barely rose even while the hand was genuinely moving, so it kept
    damping real motion, not just noise); added an explicit
    `PITCH_ONE_EURO_D_CUTOFF` **1.5 Hz** (was an implicit default of 1.0)
    so the velocity estimate itself reacts faster instead of lagging the raw
    motion by a frame or two. Confirmed in the `ramp()` unit tests: filtered
    output now settles to ~99% of the unfiltered target (was well under before
    — the original bounds had to be loosened because the new settle values
    landed above the old upper bound). Still gentler than the scratch
    filter (3.5 Hz / 1.2) — pitch wants a steady hold at rest, scratch never
    does — just meaningfully less gentle than the first pass. **Real-camera
    feel is still the only way to fully validate this** — these are
    "tune by feel" constants in `lib/constants.ts` if it needs another pass.
  - `ActiveGestures.pinch` → **`.point`** (`useDeckStore.ts`,
    `deckController.ts`); `GestureHUD.tsx`'s vocab entry and `active.pinch`
    reference updated to match (`POINT-PITCH`, `active.point`).
  - Tests (`gestureMachine.test.ts`): the old single-jump pinch assertions
    don't exercise a One-Euro filter meaningfully — replaced with a `ramp()`
    helper that moves the hand over ~30 frames (320 ms ramp + settle) before
    asserting, plus a new test for the debounced release and one confirming
    ±16 needs the same travel as ±8. `poseCodes.test.ts`: `pinchDistance`
    describe block deleted; `poseName` calls drop the second argument.
  - Mouse control (`PitchFader.tsx` drag) is **completely unchanged** — this
    only touches the gesture input path.

- **Pitch and speed swapped poses: pitch is now TWO-FINGER-PITCH (index+
  middle, moved left/right), speed is now ONE-FINGER-HOLD (a lone pointing
  finger, held still)** — the reverse of the assignment just above. User
  request, not a bug fix: horizontal index+middle movement for a horizontal
  fader, freeing up the single-finger pose (a pose MediaPipe reads very
  reliably) for the dwell/hold gesture instead of a continuous drag.
  - **No pose-predicate changes** — `isPointPose` and `isTwoFingerPose` in
    `poseCodes.ts` are exactly what they were; only which *role* in
    `gestureMachine.ts` each one feeds changed. `isPointPose`'s doc comment
    updated (it drives 33/45 now, not pitch); `poseName()` is untouched —
    pose labels are independent of what action a pose happens to trigger.
  - New `poseCodes.ts` helper: **`twoFingerCentroid(lm)`** — mean of the
    index (8) and middle (12) tips, same jitter-cutting rationale as
    `fingertipsCentroid`'s four-point average for scratch. `.x` (already
    mirrored, so "right on screen" = increasing x) is the drag reference;
    replaces the old single index-tip `.y` reference.
  - `gestureMachine.ts`: `HandFSM.pointing/pointY0/pointDisqualify/
    pointFilter` → **`pitchDragging/pitchX0/pitchDisqualify/pitchFilter`**
    (renamed off "point" since a pose-agnostic name is more durable — this
    is the second time the driving pose has changed). Drag trigger switched
    from `isPointPose` to `isTwoFingerPose`; the dwell candidate switched
    from `TWO_CODE` (`FINGER.INDEX | FINGER.MIDDLE`) to a new **`ONE_CODE`**
    (`FINGER.INDEX`); `result.activeDwell` for it is now `'POINT'` (was
    `'TWO-FINGER'`). The raw delta flips from `(anchorY0 - y)` (up = faster)
    to `(x - anchorX0)` (right = faster) — a real sign flip, not just a
    variable rename, to match the horizontal fader and the mouse drag's
    own "right = faster" convention.
  - `PITCH_POINT_EXIT_FRAMES` → **`PITCH_DRAG_EXIT_FRAMES`** (same value
    and role, pose-agnostic name); the gain/filter constants
    (`PITCH_GESTURE_GAIN`, `PITCH_ONE_EURO_*`) are unchanged in value, only
    their doc comments now say "horizontal" instead of "vertical".
  - `ActiveGestures.point` → **`.pitch`** (`useDeckStore.ts`,
    `deckController.ts`) — same reasoning as the FSM field rename; this
    flag means "the pitch gesture is active," not "a pointing pose is
    active," and the field name should say so regardless of which pose
    happens to drive it this week.
  - `GestureHUD.tsx` vocab: `TWO-FINGER-PITCH` / `ONE-FINGER-HOLD` entries
    swapped in; `active.point` → `active.pitch`.
  - Tests: `gestureMachine.test.ts`'s `POINT-PITCH` describe block →
    `TWO-FINGER-PITCH`, `ramp()` now moves hand X instead of Y with `TWO`
    fingers instead of `INDEX_ONLY`; the annulus-block and two-hand-
    assignment tests switched from `INDEX_ONLY` to `TWO` (they need to
    exercise the pose that actually drives pitch now); the cooldown test's
    second dwell switched from `TWO` to `INDEX_ONLY`. `poseCodes.test.ts`
    gained a `twoFingerCentroid` case. All at parity coverage with before —
    56 tests total (was 55; the extra is `twoFingerCentroid`'s test).

### Store shape
- `velocity` / `position` are **not** in `useDeckStore` — they're in
  `deckRuntime` (mutable object, read via ref) per the PRD's own §10 note.
  `deckRuntime` also carries `motorOn`, `pitchPercent`, `gestureScratching` for
  the view loop.
- Added `cameraError`. Removed `waveforms`.

### Deployment — GitHub Pages (new; the PRD only said "static build")
- Repo `pixelputra-cloud/dj-scratch-deck`, public. `.github/workflows/deploy.yml`
  runs on every push to `main`: `npm ci` → `npm run build` (with
  `DEPLOY_BASE=/dj-scratch-deck/`) → `npm run lint` → `upload-pages-artifact` →
  `deploy-pages`. Pages "build and deployment source" = **GitHub Actions**.
- Live at <https://pixelputra-cloud.github.io/dj-scratch-deck/>. HTTPS is
  automatic, so `getUserMedia` works for visitors.
- `vite.config.ts` `base: process.env.DEPLOY_BASE || '/'` — local dev/build stay
  at root, CI builds for the project sub-path. All the `public/` runtime refs
  (worklet URL, MediaPipe model + WASM base, control `<img>` srcs,
  `manifest.json` track files) now resolve through `asset()`; CSS
  `url()` / HTML hrefs Vite rebases itself. No tests reference asset paths.
- To ship a change: `git push`. To point at a different host/path: set
  `DEPLOY_BASE` (or leave default `/` for a root deploy on Netlify/Vercel).

### Held from the PRD (keep these)
Worklet virtual-read-head + Hermite + a-rate param; rotation from playhead never
CSS-animated; one `stepPlatter`; isolated + tested ±π unwrap; One Euro filter;
the full gesture state-machine spec; the CSS token layer; the power gate;
Appendix-A constants; static build, no backend, no accounts, vendored model/WASM.

---

## 6. Not done / open

- **Phase 4** — real licence-verified crate; waveform overview if wanted back;
  attribution credits UI.
- **Phase 5** — onboarding overlay teaching the gestures, keyboard shortcuts,
  accessibility pass, theme exploration via `tokens.css`.
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
npm run build          # tsc -b && vite build -> static dist/  (base '/')
npm run preview        # serve dist/
npx vitest run         # 56 tests
npm run lint           # oxlint
node scripts/make_loops.mjs   # regenerate the 6 procedural crate loops
git push              # -> GitHub Actions builds + deploys to Pages (~1 min)
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
  `audioWorklet.addModule(asset('worklets/turntable-processor.js'))` — do not
  convert it to TS (PRD "Note on the worklet file"). Type the message contract
  in `workletContract.ts` instead.
- **New `public/` assets must be reached through `asset()`** (in JS/TS) — a bare
  `'/foo.png'` literal 404s on the Pages sub-path. CSS `url()` and HTML are fine
  as-is (Vite rebases them).
- **One rAF loop only** — `deckController.startLoop()`. Continuous per-frame
  values go through `deckRuntime` + `onFrame(cb)`, never React state.
- **`platterMapping.ts` unwrap** is the highest-risk line in the project; it has
  seam-crossing tests in both directions. Touch with care.
