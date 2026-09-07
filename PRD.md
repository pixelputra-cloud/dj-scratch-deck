# PRD — Gesture-Controlled DJ Turntable

**Project codename:** `dj_turntable`
**Owner:** Vidhu (Pixel Putra)
**Status:** Approved for build
**Date:** 7 Sep 2026
**Intended consumer of this document:** Claude Code, building from an empty repo.

---

## 1. Summary

A single-page web app presenting one photogenic DJ turntable. The user picks a track (from a bundled crate or their own file), drops it on the deck, hits start, and then plays the record with their hands in front of the webcam — scratching the platter, riding the pitch fader, stopping and starting the motor, switching 33⅓/45 — without touching mouse or keyboard.

Every gesture-driven control is **also** a normal clickable control. Gesture is the headline; the mouse is the floor.

### What "done" looks like

A user opens the page on a laptop, allows camera access, loads a track, and within thirty seconds is dragging their index finger in circles over the on-screen platter and hearing the record scratch forward and backward under their hand. They stop, palm-out, and the record spins down with a pitch drop. They grin.

---

## 2. Goals & non-goals

### Goals

- **G1** — One turntable, faithfully modelled: plinth, platter, spindle, start/stop, 33/45 selector, pitch fader.
- **G2** — Real scratching. Forward *and* reverse audio driven by hand angular velocity, not a canned scratch sample.
- **G3** — Complete hands-free operation: every one of the six components reachable by gesture.
- **G4** — Track selection: a bundled crate plus drag-and-drop of the user's own files.
- **G5** — A page that looks like a piece of DJ gear, art-directed later against a token layer built in from day one.
- **G6** — Ships as a static single-page build; no server, no accounts, no backend.

### Non-goals (v1)

- Two decks, a crossfader, or beatmatching between decks.
- Beat detection, BPM sync, key detection, waveform-accurate cue points.
- Recording or exporting a mix.
- Effects rack (filter, echo, flanger) — architecture leaves room, v1 ships none.
- Mobile-first layout. Desktop is the target; mobile is best-effort and degrades to touch.
- Streaming-service integration. See §4.4 for why this is structurally impossible.

---

## 3. Platform & stack

| Layer | Choice | Reasoning |
|---|---|---|
| Build | **Vite 6 + TypeScript 5** | Instant HMR, trivial static output, no server needed. Next.js would add a server runtime this app never uses. |
| UI | **React 19** | Component boundaries map cleanly onto the physical parts of the deck. |
| Styling | **Tailwind CSS 4 + CSS custom properties** | Utilities for layout; a CSS-variable token layer for everything themeable, so §8.6 restyling is a one-file change. |
| State | **Zustand** | The deck is one small store read by a 60fps render loop. Context + reducers would re-render the tree every frame; Zustand's selector subscriptions won't. |
| Audio | **Web Audio API + a custom `AudioWorkletProcessor`** | Non-negotiable. See §4.1. |
| Hand tracking | **`@mediapipe/tasks-vision` v1.0.1**, `HandLandmarker` | Current stable (published 31 Jul 2026). 21 landmarks/hand, 2 hands, GPU delegate, runs in the browser with no server. |
| Filtering | **One Euro filter** (~40 lines, no dependency) | Purpose-built for noisy interactive pointer signals: low jitter when the hand is still, low lag when it moves fast. A plain EMA forces you to choose one or the other, and scratching needs both. |
| Testing | **Vitest** for the maths; manual for the feel | Angle unwrapping, filters and the physics model are pure functions and must be unit-tested. Nothing else usefully can be. |

**Browser targets:** Chrome/Edge 120+ desktop (primary), Safari 17+ and Firefox 125+ (supported), mobile (degraded, touch-only). Requires HTTPS or `localhost` — `getUserMedia` will not run otherwise.

**No Tone.js.** It abstracts over exactly the layer this project needs raw access to.

---

## 4. Feasibility analysis

This section exists so the build doesn't discover these things in week two.

### 4.1 Scratching requires a custom AudioWorklet — `playbackRate` will not do

`AudioBufferSourceNode.playbackRate` is the obvious tool and it is the wrong one:

1. **It cannot go negative.** Scratching is fundamentally bidirectional — the backward pull is half the sound. An `AudioBufferSourceNode` cannot play in reverse. This alone rules it out.
2. Rapid `playbackRate` automation produces resampling artefacts under fast modulation.
3. There is no clean way to read the exact current playhead position to keep the visual disc locked to the audio.

**The design:** an `AudioWorkletProcessor` (`turntable-processor.js`) that owns the decoded sample data and a floating-point virtual read head.

```
Per output sample:
  position += rate                     // rate may be negative
  out = interpolate(buffer, position)  // cubic Hermite, 4-tap
  wrap or clamp position at buffer bounds
```

- `rate` is exposed as a **custom `AudioParam`** with `automationRate: 'a-rate'`. This is the key trick: the gesture loop calls `rateParam.setTargetAtTime(target, ctx.currentTime, 0.015)` at ~30–60Hz, and the audio thread receives a per-sample smoothed ramp for free. Without this, 30fps rate updates against a 128-sample render quantum produce audible stepping ("zipper noise") on every scratch.
- Sample data is transferred into the worklet once, on load, via `port.postMessage({channels}, [buf0, buf1])` with transferable `ArrayBuffer`s — zero-copy, no per-frame messaging.
- The worklet posts its `position` back over `port` at ~30Hz so the visual platter angle stays locked to the audio playhead. **The disc's rotation is never a CSS animation** — it is driven from the reported position, so what you see is what you hear.
- Interpolation: 4-tap cubic Hermite. Linear interpolation is audibly gritty at high `|rate|`, which is exactly when scratching happens.

*Reference for the approach: [web-audio-pitch-dropper](https://github.com/yuichkun/web-audio-pitch-dropper) uses the same virtual-position-plus-interpolation architecture and confirms it as the viable route.*

### 4.2 Latency budget — set expectations honestly

| Stage | Typical |
|---|---|
| Camera frame capture & delivery | 16–33 ms |
| MediaPipe inference (GPU delegate, 640×480) | 8–25 ms |
| One Euro filter group delay | ~10–20 ms |
| `setTargetAtTime` smoothing constant | ~15 ms |
| Audio output buffer | 5–20 ms |
| **Hand-to-ear total** | **≈ 55–110 ms** |

A real DVS system is under 10 ms. **This will not feel like vinyl under your fingers, and the PRD should not pretend otherwise.** It will feel like expressive, responsive gestural control of a record — which is its own thing and is genuinely fun. Frame the product that way in the UI copy.

Mitigations, in order of payoff:
1. Request `frameRate: { ideal: 60 }` from `getUserMedia`. Halves the largest single term.
2. Run `HandLandmarker` in a **Web Worker** with `OffscreenCanvas` so main-thread React rendering never delays inference.
3. Use the **lite** hand model (~3 MB) rather than full (~7.5 MB) unless accuracy demands otherwise.
4. Keep the One Euro `minCutoff` high enough that fast motion passes through nearly unfiltered.

### 4.3 Other constraints the build must respect

- **Autoplay policy.** `AudioContext` starts suspended and can only be resumed inside a real user-input event handler. A *hand gesture is not a user-input event.* The app therefore needs an explicit "tap to power on" click gate before anything makes sound. Design it as part of the fiction — a power switch on the plinth — not as a browser-compliance apology.
- **HTTPS.** Camera access requires a secure context. Note this in the README for deployment.
- **Thread contention.** The audio worklet runs on a dedicated high-priority thread, so a main-thread stall stutters the *gestures*, not the audio — the record simply keeps spinning at its last rate. This is the correct failure mode and should be left as-is.
- **Model assets.** Vendor `hand_landmarker.task` and the MediaPipe WASM fileset into `public/` rather than loading from jsDelivr/Google Cloud Storage. Removes a network dependency, a CDN-drift risk, and a first-load stall.
- **Lighting.** Hand tracking degrades badly in low light or against a busy background. The camera panel must show live landmark overlays so the user can see *why* it isn't working and move their hand into frame.

### 4.4 Why Spotify/SoundCloud were ruled out

Their web SDKs hand you a controlled playback element, not raw PCM. There is no route to the decoded sample data, so no route to a variable-rate read head, so no scratching and no pitch control. Licence terms also forbid the manipulation. This is a structural block, not an effort problem — bundled and user-supplied files are the only viable sources.

---

## 5. The six components

Coordinate convention: the platter is a **true circle in screen space**. Depth comes from lighting, shadow and layering, not from a `rotateX` perspective transform. This is a deliberate call — a tilted platter renders as an ellipse, and every gesture-to-angle calculation would then need an inverse ellipse projection, adding a class of bugs for a marginal visual gain. Flat circle, rich shading.

### 5.1 Plinth

The chassis. Holds everything, defines the silhouette.

- Layered CSS: base fill, brushed-metal gradient sweep, fine noise texture overlay, inner bevel highlight, deep drop shadow.
- Rounded rectangle, roughly 4:3, platter offset left of centre; controls occupy the right column and lower-right corner, as on a real deck.
- Every colour drawn from CSS variables (§8.6).

### 5.2 Platter & vinyl

The centrepiece and the only gesture-scratchable surface.

- **Platter:** metal disc, concentric machining rings, subtle rim highlight.
- **Vinyl:** sits on the platter. SVG concentric groove strokes with pseudo-random opacity variation for surface texture; a specular highlight arc that sweeps as the disc turns; a centre label disc carrying the track title, artist and a per-track accent colour.
- **Rotation** is set each animation frame from the audio playhead position reported by the worklet — `angle = (position / SAMPLES_PER_REV) × 360°`, where `SAMPLES_PER_REV = sampleRate × 60/33.333` and is **constant**. Because `position` already advances at the rate that pitch and rpm produce, a constant divisor gives the correct visual speed at 45 and under every pitch setting for free. Audio and visual can never drift apart.
- **Strobe ring:** dot markers around the platter rim, rendered so they appear stationary when pitch is at 0% and drift proportionally when it isn't — exactly like the strobe on a real Technics. Cheap to implement, disproportionately convincing.
- **Hit region** for gesture: an annulus, inner radius 18% and outer radius 100% of platter radius. The inner exclusion keeps a fingertip resting near the spindle from producing wild angular velocities (small radius, huge Δθ).

### 5.3 Spindle

Centre post. Purely visual: a short metallic cylinder rendered with a radial gradient and a cast shadow, drawn above the vinyl. It sells the layering.

### 5.4 Start/stop button

- Toggles the motor. Click, or palm-hold gesture.
- **On:** platter accelerates to target velocity with a first-order lag, τ ≈ 0.35 s — the torque-up of a direct-drive deck.
- **Off:** velocity decays to zero over ≈ 1.2 s, producing the classic power-down pitch drop. This must be a smooth curve, not a linear ramp; cubic ease-out reads as mechanical.
- Backlit ring that illuminates when on.

### 5.5 Speed selector — 33⅓ / 45

- Two buttons, lit state on the active one. Click, or two-finger-hold gesture.
- Changes nominal rotation speed, so at 45 the record plays 1.35× faster and higher. Switch mid-playback and the speed *ramps* over ≈ 0.4 s — instant jumps sound broken.
- `nominalRate = rpm / 33.333` against a source assumed to be mastered at 33⅓.

### 5.6 Pitch control

- Vertical fader on the right of the plinth. Drag, or pinch gesture.
- Range toggle: **±8%** (default) and **±16%**.
- A detent at exact 0% — the fader snaps to it within ±0.4% and gives a small visual click. Real decks have this and hands look for it.
- Numeric readout to one decimal, e.g. `+3.2%`.
- Pitch feeds the physics model's target velocity (§7.2); it is not applied separately downstream. There is exactly one place that computes the final rate.

---

## 6. Gesture specification

The most detailed section, because full hands-free control is the highest-risk part of the build.

### 6.1 Pipeline

```
getUserMedia (640×480, 60fps ideal)
  → <video> element (hidden, source of truth)
  → HandLandmarker.detectForVideo(video, ts)   [in a Web Worker]
  → normalised landmarks, up to 2 hands
  → mirror x  (x' = 1 - x, to match the mirrored selfie preview)
  → per-hand pose code + One Euro filtered positions
  → gesture state machine (hysteresis + dwell + latching)
  → deck store actions
```

### 6.2 Landmark reference

Indices used: `0` wrist · `4` thumb tip · `8` index tip · `12` middle tip · `16` ring tip · `20` pinky tip · `5/9/13/17` finger MCP joints · `6/10/14/18` PIP joints.

**Hand scale** (for making all thresholds resolution- and distance-independent) = distance from wrist `0` to middle MCP `9`. Every distance threshold below is expressed as a multiple of this.

**Finger extended** = `dist(tip, wrist) > dist(pip, wrist) × 1.15`. Evaluated for all five fingers, yielding a 5-bit **pose code**.

### 6.3 The gesture vocabulary

| Gesture | Pose | Controls | Activation |
|---|---|---|---|
| **SCRATCH** | Index extended (middle optional), fingertip `8` inside the platter annulus | Platter velocity | 2 consecutive qualifying frames |
| **PINCH-PITCH** | Thumb–index tip distance < `0.35 × handScale`, other fingers curled | Pitch fader | Immediate on pinch |
| **PALM-HOLD** | All five extended, hand near-stationary | Start/stop toggle | 700 ms dwell |
| **TWO-FINGER-HOLD** | Index + middle extended only, hand near-stationary | 33/45 toggle | 700 ms dwell |

#### SCRATCH — the important one

1. Convert fingertip `8` from normalised coords to platter-local screen coords.
2. `θ = atan2(y − cy, x − cx)`.
3. **Unwrap** against the previous frame's θ: if `Δθ > π`, subtract `2π`; if `Δθ < −π`, add `2π`. Without this every crossing of the ±π boundary produces a violent spurious spike. This is the single most bug-prone line in the project — unit-test it.
4. `ω = Δθ_unwrapped / Δt`, passed through a One Euro filter (`minCutoff ≈ 1.5 Hz`, `beta ≈ 0.6`).
5. `rate = ω / ω_nominal`, where `ω_nominal = 2π × (33.333/60)` rad/s.
6. Clamp `rate` to **±4.0**. Beyond that it's tracking noise, not intent.
7. **On release:** hand off to the physics model, which eases velocity back to the motor's target with τ = 0.35 s. The record spins back up — it does not snap.
8. **Exit hysteresis:** requires 3 consecutive non-qualifying frames. A single dropped detection mid-scratch must not release the record; that would be the most annoying possible bug.

#### PINCH-PITCH

On pinch-down, capture `y₀` and the current pitch `p₀`. While held: `pitch = p₀ + (y₀ − y) × 45`, clamped to the active range (so a full-screen-height drag covers roughly ±22%, comfortably more than needed). Release when tip distance exceeds `0.55 × handScale` — deliberately wider than the entry threshold, so a slightly loosened pinch doesn't drop the fader.

#### Dwell gestures (PALM-HOLD, TWO-FINGER-HOLD)

Both require:
- The pose code to remain **unchanged** for the entire 700 ms window. Any change resets the timer to zero.
- Hand centroid velocity below `0.15 × handScale` per frame. **Stillness is doing most of the work here** — a hand travelling toward the platter is moving, so it cannot accidentally trigger a dwell gesture.
- **Latching:** fires exactly once, then requires the pose to break before it can arm again. Prevents a held palm from toggling the motor thirty times a second.
- A **radial progress ring** rendered at the hand position during the dwell. Non-negotiable UX: without visible progress, dwell gestures feel like a lottery.

### 6.4 Disambiguation rules

1. **Priority:** SCRATCH > PINCH > dwell gestures. If a fingertip is inside the platter annulus, only SCRATCH may fire.
2. **Global cooldown:** 500 ms after any latched gesture fires, no other latched gesture may fire.
3. **Mutual exclusion:** PALM and TWO-FINGER are distinct pose codes and cannot both be active.
4. **Two-hand assignment:** when two hands are visible, the hand whose index tip is nearer the platter centre owns SCRATCH; the other owns pitch and dwell gestures. This gives the natural DJ posture — one hand on the record, one on the fader — and prevents both hands fighting over one control.
5. **No hands detected:** all gesture-held controls release cleanly. The record returns to motor velocity, the fader stays where it was left.

### 6.5 Gesture HUD

A persistent panel showing, per detected hand: the mirrored camera feed with landmark skeleton overlay, the current pose name, which control it currently owns, and dwell progress. This is simultaneously the debugging tool during the build and the thing that makes the feature comprehensible to a first-time user. Collapsible, not removable.

### 6.6 Degradation

Camera denied, unavailable, or no hands in frame → the app is fully functional via mouse and touch. The camera panel shows a clear, unapologetic "gesture control off — camera not available" state with a retry affordance. **The turntable must never be blocked on the camera.**

---

## 7. Audio engine specification

### 7.1 Graph

```
TurntableWorkletNode  →  GainNode (deck volume)  →  AnalyserNode  →  destination
VinylNoiseNode (loop) →  GainNode (scaled by |rate|)  ─────────────┘
```

The vinyl surface-noise loop, gain-modulated by absolute playback rate, is a small addition with a large realism payoff — the record sounds like it's *there* even in silent passages, and the noise pitches with the scratch.

### 7.2 Platter physics model

One pure, unit-testable function, stepped once per animation frame:

```
state: { velocity, motorOn, nominalRate, pitchPercent, handVelocity | null }

targetVelocity = motorOn ? nominalRate × (1 + pitch/100) : 0

if handVelocity != null:            // hand is on the record
    velocity = handVelocity
else:                               // free-running
    τ = motorOn ? 0.35 : 1.2
    velocity += (targetVelocity − velocity) × (1 − exp(−dt/τ))
```

Then `rateParam.setTargetAtTime(velocity, ctx.currentTime, 0.015)`.

Two time constants, one for spin-up and a longer one for spin-down, produce both the torque-up and the power-down pitch drop from the same three lines.

### 7.3 Loading

1. `fetch` → `arrayBuffer` → `AudioContext.decodeAudioData`.
2. Extract channel `Float32Array`s, `postMessage` to the worklet as transferables.
3. Render a static waveform overview into the crate row for the loaded track.
4. Show a determinate loading state — decoding a five-minute track takes a noticeable moment.
5. **Memory guard:** cap decoded audio at ~15 minutes per track and refuse politely above that. A decoded stereo 44.1 kHz minute is ~21 MB of `Float32Array`; several long tracks will exhaust a tab.

### 7.4 Playback behaviour at buffer bounds

Loop the read position by default (`position mod length`), so scratching past the end of a track wraps rather than falling silent. Expose as a toggle; looping is the sane default for a freestyle toy.

---

## 8. Track selection & the crate

### 8.1 Bundled crate

Ship **6 tracks** in `public/audio/`, MP3 128–192 kbps, 30–90 s each, chosen for scratchability — clear transients, prominent breaks, distinct vocal stabs.

Manifest at `src/tracks/manifest.json`:

```json
{
  "id": "break-01",
  "title": "…",
  "artist": "…",
  "bpm": 94,
  "file": "/audio/break-01.mp3",
  "labelColor": "#c8452e",
  "license": "CC0",
  "sourceUrl": "…"
}
```

**Licensing is a build task, not an afterthought.** Curate from [Free Music Archive](https://freemusicarchive.org) (filter to CC0/CC BY), [ccMixter](http://ccmixter.org), [Freesound](https://freesound.org) (CC0 filter) or Pixabay Music. Every bundled track must carry its licence and source URL in the manifest, and an attribution line must appear in the UI credits. Do not ship a track whose licence has not been verified.

### 8.2 User uploads

- Drag-and-drop onto the page, plus a file-picker button.
- Accept `audio/*` — MP3, WAV, OGG, M4A, FLAC where the browser can decode them.
- Decoded locally via `decodeAudioData`; **nothing is ever uploaded anywhere.** Say so in the UI — users hesitate to drop personal music into a web page.
- User tracks appear in the crate for the session, tagged as local, with a generated label colour. Not persisted across reloads in v1.
- Handle decode failure with a clear per-file error, not a silent nothing.

### 8.3 Crate UI

A horizontal strip below the deck: sleeve-style cards with title, artist, BPM and waveform thumbnail. Click, or drag onto the platter, to load. The currently loaded track is visibly lifted out of the crate.

---

## 9. Visual design direction

Full art direction is a **separate later phase**. This section defines only the structure that phase will work against.

### 9.1 v1 default look

Dark studio: near-black background with a soft warm key light from upper-left. Plinth in brushed dark aluminium. Vinyl matte black with a warm-amber label. Amber backlighting on the start button and speed selector. Accent glow used sparingly — the deck should look lit, not neon.

### 9.2 Layout

```
┌──────────────────────────────────────────────┐
│  header — title, camera toggle, help         │
├───────────────────────────────┬──────────────┤
│                               │  camera feed │
│          T H E   D E C K      │  + landmarks │
│    (plinth, platter, arm,     │              │
│     spindle, controls)        │  gesture HUD │
│                               │              │
├───────────────────────────────┴──────────────┤
│  crate — track cards, drop zone              │
└──────────────────────────────────────────────┘
```

Single page, no routing, no scroll on a 1440×900 viewport.

### 9.3 Motion

- Disc rotation: driven from audio position, never CSS-animated.
- Tonearm: SVG, pivoting from rest through the record as playback progresses. Cosmetic, and worth every line — it's the detail that reads as "turntable" at a glance.
- Buttons: sub-100 ms press response with a light bloom.
- Respect `prefers-reduced-motion` for decorative motion; the platter itself is content, not decoration, and keeps turning.

### 9.4 Token layer

All themeable values as CSS custom properties in one file — `--plinth-base`, `--plinth-metal`, `--vinyl-base`, `--label-accent`, `--glow`, `--strobe`, `--text-primary`, and so on. **The later art-direction phase should be a change to this file plus texture assets, and nothing else.** Enforce this from the first commit; retrofitting it is painful.

---

## 10. Architecture

```
public/
  audio/               # bundled crate + vinyl-noise loop
  models/              # hand_landmarker.task (vendored)
  wasm/                # MediaPipe WASM fileset (vendored)
  worklets/
    turntable-processor.js     # plain JS — see note below

src/
  main.tsx
  App.tsx
  audio/
    TurntableEngine.ts         # context, graph, load/decode, worklet bridge
    platterPhysics.ts          # pure velocity model            [tested]
  gesture/
    HandTracker.ts             # MediaPipe wrapper + worker plumbing
    handTracker.worker.ts
    poseCodes.ts               # landmarks → 5-bit pose code    [tested]
    gestureMachine.ts          # hysteresis, dwell, latch, priority [tested]
    oneEuroFilter.ts           #                                [tested]
    platterMapping.ts          # screen → platter angle, unwrap [tested]
  state/
    useDeckStore.ts            # zustand
  components/
    Deck.tsx  Plinth.tsx  Platter.tsx  Vinyl.tsx  Spindle.tsx
    Tonearm.tsx  StrobeRing.tsx  StartButton.tsx  SpeedSelector.tsx
    PitchFader.tsx  Crate.tsx  TrackCard.tsx  CameraPanel.tsx
    GestureHUD.tsx  PowerGate.tsx
  tracks/manifest.json
  styles/tokens.css
```

**Note on the worklet file.** Author `turntable-processor.js` as **plain JavaScript in `public/worklets/`** and load it with `audioContext.audioWorklet.addModule('/worklets/turntable-processor.js')`. TypeScript-in-a-worklet through Vite's `?url` import works but is a recurring source of build-config friction for a file that is ~150 lines of numeric code with no imports. Take the boring path; type the *message contract* in `TurntableEngine.ts` instead.

**Store shape** (`useDeckStore`):

```ts
{
  powered: boolean            // audio context resumed
  motorOn: boolean
  rpm: 33.333 | 45
  pitchPercent: number
  pitchRange: 8 | 16
  velocity: number            // current platter velocity
  position: number            // samples, from worklet
  loadedTrack: Track | null
  crate: Track[]
  cameraState: 'off' | 'requesting' | 'on' | 'denied' | 'error'
  hands: HandState[]
  activeGestures: { scratch, pinch, dwell }
}
```

The 60fps render loop reads `velocity`/`position` through a **ref, not a subscription** — pushing 60 store updates per second through React's reconciler will drop frames. Store holds discrete state; continuous values ride in refs.

---

## 11. Build phases

Each phase is independently demoable and independently testable. **Audio comes before visuals and well before gestures**, because it carries the technical risk and everything downstream depends on it being right.

### Phase 0 — Scaffold
Vite + React + TS + Tailwind + Zustand. Token file. Empty component shells. Vendor the MediaPipe model and WASM into `public/`. Vitest configured.
**Done when:** dev server runs, tests run.

### Phase 1 — Audio engine (highest risk — do it first)
Worklet processor with virtual read head, cubic interpolation, `rate` AudioParam. `TurntableEngine`. Track load/decode. Physics model with unit tests. Power gate. Temporary ugly HTML buttons for start/stop, 33/45, and a pitch slider.
**Done when:** a bundled track loads and plays; the pitch slider bends it smoothly with no zipper noise; start/stop produces a convincing spin-up and pitch-drop; dragging a debug slider to a negative rate plays the track backwards cleanly.

### Phase 2 — The deck, visually
Plinth, platter, vinyl with grooves, spindle, tonearm, strobe ring, real start/stop button, speed selector, pitch fader with detent. Disc rotation locked to audio position. Full mouse/touch control — dragging the vinyl with a mouse scratches it.
**Done when:** it looks like a turntable, mouse-scratching works, and audio and visual rotation never drift.

### Phase 3 — Gesture control
Camera panel, MediaPipe in a worker, landmark overlay. One Euro filter, angle unwrapping, pose codes — all unit-tested before wiring. SCRATCH first, alone, until it feels right. Then PINCH-PITCH. Then the two dwell gestures with progress rings. Then the disambiguation rules and two-hand assignment. Gesture HUD.
**Done when:** all four gestures work reliably in normal room lighting, false positives are rare, and losing the hand mid-scratch doesn't drop the record.

### Phase 4 — Crate & uploads
Manifest, six licence-verified bundled tracks, crate strip with waveform thumbnails, drag-and-drop upload, load-to-platter interaction, attribution credits.
**Done when:** a user can load a bundled track and their own file and switch between them without a reload.

### Phase 5 — Polish & art direction
Vinyl noise layer. Loading and error states. Keyboard shortcuts. Onboarding overlay teaching the gesture vocabulary. Accessibility pass. **Then the theme exploration**, working through `tokens.css`.

---

## 12. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Gesture latency makes scratching feel disconnected | **High** | Measure early in Phase 3. Worker-based inference, 60fps camera, minimal filtering. Frame the product as expressive control, not a DVS — set the expectation in the UI. |
| Dwell gestures fire accidentally mid-performance | **High** | Stillness requirement, pose stability, latching, 500 ms global cooldown, platter priority. Visible dwell rings so the user sees it coming and can abort. |
| ±π angle-unwrapping bug producing audio spikes | **Medium** | Isolate in `platterMapping.ts`, unit-test the boundary crossing in both directions before it is ever wired to audio. |
| Zipper noise from stepped rate updates | **Medium** | `setTargetAtTime` on an a-rate custom AudioParam. Verified as part of Phase 1 exit criteria. |
| Hand tracking fails in the user's lighting | **Medium** | Landmark overlay so the failure is legible. Full mouse fallback always present. |
| Bundled track licensing | **Medium** | Licence and source URL mandatory per manifest entry; no unverified track ships. |
| Memory exhaustion from long decoded tracks | **Low** | 15-minute cap with a clear message. |
| Safari worklet/`decodeAudioData` quirks | **Low** | Test on Safari at the end of Phase 1, before building on top of the engine. |

---

## 13. Acceptance criteria

**Audio**
- A bundled track loads in under 2 s on a warm cache and plays without artefacts.
- Pitch adjustment across the full ±8% range produces no clicks, steps or zipper noise.
- A rate of −1.0 plays the track backwards at correct speed and pitch.
- Start/stop spin-up and spin-down are smooth, curved, and audibly mechanical.
- Switching 33↔45 mid-playback ramps over ~0.4 s rather than jumping.

**Visual**
- Vinyl rotation and audio playhead remain locked with no visible drift over 5 minutes of playback.
- The strobe ring appears stationary at exactly 0% pitch and drifts proportionally otherwise.
- 60fps maintained on a 2020-or-later laptop with the camera active.

**Gesture**
- With one hand in normal room lighting, all four gestures are recognised on at least 9 of 10 deliberate attempts.
- During 60 s of continuous scratching, the record is never spuriously released.
- Over 5 minutes of normal use, fewer than 2 accidental latched-gesture activations.
- Both hands can operate independently: one scratching, one on the pitch fader.

**Robustness**
- Denying camera permission leaves every control fully usable via mouse.
- Removing both hands from frame releases held controls cleanly and returns the record to motor speed.
- The page never crashes, hangs, or loses audio on a rapid load/unload/reload cycle.

**Delivery**
- `npm run build` produces a static bundle deployable to any static host.
- No network requests at runtime beyond the app's own assets.

---

## 14. Open questions for later phases

1. **Theme direction** — deliberately deferred. Candidates worth exploring: 1970s hi-fi warmth (wood veneer, cream, chrome), Technics SL-1200 authenticity (silver/black, precise), or a stylised neon club aesthetic. Phase 5.
2. **Persistence** — should the user's uploaded crate survive a reload via IndexedDB? Adds real complexity; deferred until the core is proven.
3. **Second deck** — the architecture supports it (`TurntableEngine` is instantiable), but a crossfader plus two camera-tracked hands is a materially harder gesture problem. Explicitly out of scope for v1.
4. **Record-and-share** — capturing a mix via `MediaRecorder` on the analyser tap is technically straightforward and a strong sharing hook. Post-v1 candidate.

---

## Appendix A — Constants

```
NOMINAL_RPM_33      = 33.333
NOMINAL_RPM_45      = 45
SPINUP_TAU          = 0.35    s
SPINDOWN_TAU        = 1.20    s
RPM_CHANGE_RAMP     = 0.40    s
RATE_SMOOTHING_TAU  = 0.015   s
MAX_SCRATCH_RATE    = 4.0     ×
PLATTER_INNER_R     = 0.18    (fraction of platter radius)
DWELL_MS            = 700     ms
GESTURE_COOLDOWN_MS = 500     ms
SCRATCH_ENTER_FRAMES = 2
SCRATCH_EXIT_FRAMES  = 3
PINCH_ENTER_DIST    = 0.35    × handScale
PINCH_EXIT_DIST     = 0.55    × handScale
STILLNESS_THRESHOLD = 0.15    × handScale per frame
ONE_EURO_MIN_CUTOFF = 1.5     Hz
ONE_EURO_BETA       = 0.6
PITCH_RANGE_DEFAULT = 8       %
PITCH_DETENT_WIDTH  = 0.4     %
MAX_TRACK_MINUTES   = 15
CAMERA_RESOLUTION   = 640 × 480
CAMERA_FPS_IDEAL    = 60
```

Every one of these is a starting value to be tuned by feel during its phase, not a fixed requirement.
