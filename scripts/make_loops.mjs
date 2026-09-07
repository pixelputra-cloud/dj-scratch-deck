/*
 * Procedural CC0 demo loops for the bundled crate.
 *
 * These are synthesized from scratch here — no sampled material, so there is
 * no licensing question: they are CC0 by origin. They exist so Phases 1–2 are
 * demoable end to end. Phase 4 replaces them with curated, licence-verified
 * tracks from Free Music Archive / ccMixter / Pixabay per PRD §8.1.
 *
 * Output: mono 44.1 kHz WAV, an integer number of bars so the read-head loop
 * in the worklet wraps seamlessly.
 */
import { writeFileSync } from 'node:fs'

const SR = 44100

// ---------- WAV (PCM16 mono) ----------
function encodeWav(samples) {
  const n = samples.length
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(SR, 24)
  buf.writeUInt32LE(SR * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE((s < 0 ? s * 0x8000 : s * 0x7fff) | 0, 44 + i * 2)
  }
  return buf
}

// ---------- tiny synth voices ----------
const rnd = (() => {
  let s = 22222
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
})()

function addKick(out, t0, { freq = 55, drop = 38, dur = 0.28, gain = 0.95 } = {}) {
  const start = (t0 * SR) | 0
  const len = (dur * SR) | 0
  for (let i = 0; i < len && start + i < out.length; i++) {
    const t = i / SR
    const env = Math.exp(-t * 22)
    const pitchEnv = freq + drop * Math.exp(-t * 40)
    out[start + i] += Math.sin(2 * Math.PI * pitchEnv * t) * env * gain
  }
}

function addSnare(out, t0, { dur = 0.22, gain = 0.7, tone = 190 } = {}) {
  const start = (t0 * SR) | 0
  const len = (dur * SR) | 0
  let lp = 0
  for (let i = 0; i < len && start + i < out.length; i++) {
    const t = i / SR
    const env = Math.exp(-t * 26)
    const noise = rnd() * 2 - 1
    lp += (noise - lp) * 0.45
    const body = Math.sin(2 * Math.PI * tone * t) * Math.exp(-t * 30) * 0.5
    out[start + i] += (lp * 0.8 + body) * env * gain
  }
}

function addHat(out, t0, { dur = 0.05, gain = 0.28, open = false } = {}) {
  const start = (t0 * SR) | 0
  const d = open ? 0.18 : dur
  const len = (d * SR) | 0
  let hp = 0
  let prev = 0
  for (let i = 0; i < len && start + i < out.length; i++) {
    const t = i / SR
    const env = Math.exp(-t * (open ? 12 : 60))
    const noise = rnd() * 2 - 1
    hp = noise - prev + hp * 0.85
    prev = noise
    out[start + i] += hp * env * gain
  }
}

function addClap(out, t0, { gain = 0.5 } = {}) {
  for (let k = 0; k < 3; k++) addSnare(out, t0 + k * 0.011, { dur: 0.12, gain: gain * 0.5, tone: 1200 })
  addSnare(out, t0 + 0.033, { dur: 0.22, gain: gain * 0.7, tone: 900 })
}

function addTone(out, t0, freq, dur, { gain = 0.3, type = 'saw', decay = 6 } = {}) {
  const start = (t0 * SR) | 0
  const len = (dur * SR) | 0
  for (let i = 0; i < len && start + i < out.length; i++) {
    const t = i / SR
    const ph = (freq * t) % 1
    let v
    if (type === 'saw') v = 2 * ph - 1
    else if (type === 'square') v = ph < 0.5 ? 1 : -1
    else v = Math.sin(2 * Math.PI * ph)
    const env = Math.min(1, t * 60) * Math.exp(-t * decay)
    out[start + i] += v * env * gain
  }
}

function addBass(out, t0, freq, dur, { gain = 0.55 } = {}) {
  const start = (t0 * SR) | 0
  const len = (dur * SR) | 0
  let lp = 0
  for (let i = 0; i < len && start + i < out.length; i++) {
    const t = i / SR
    const ph = (freq * t) % 1
    const saw = 2 * ph - 1
    lp += (saw - lp) * 0.22 // low-pass for weight
    const env = Math.min(1, t * 80) * Math.exp(-t * 3.2)
    out[start + i] += lp * env * gain
  }
}

function softclip(out) {
  let peak = 0
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]))
  const norm = peak > 0 ? 0.89 / peak : 1
  for (let i = 0; i < out.length; i++) {
    const x = out[i] * norm
    out[i] = Math.tanh(x * 1.1) * 0.96
  }
}

function make(bars, bpm, fill) {
  const secPerBeat = 60 / bpm
  const dur = bars * 4 * secPerBeat
  const out = new Float32Array((dur * SR) | 0)
  fill(out, secPerBeat, (beat) => beat * secPerBeat)
  softclip(out)
  return encodeWav(out)
}

const OUT = 'E:/Claude_Matrix/dj_turntable/public/audio'

// 1. boom-bap 90bpm, 4 bars
writeFileSync(`${OUT}/boombap-90.wav`, make(4, 90, (out, spb, at) => {
  const bars = 4
  for (let b = 0; b < bars; b++) {
    const o = b * 4
    addKick(out, at(o + 0))
    addKick(out, at(o + 0.5), { gain: 0.6 })
    addSnare(out, at(o + 1))
    addKick(out, at(o + 2))
    addSnare(out, at(o + 3))
    if (b % 2 === 1) addKick(out, at(o + 2.75), { gain: 0.5 })
    for (let h = 0; h < 8; h++) addHat(out, at(o + h * 0.5), { gain: 0.22, open: h === 7 })
  }
}))

// 2. amen-style break 140bpm, 4 bars
writeFileSync(`${OUT}/amen-140.wav`, make(4, 140, (out, spb, at) => {
  for (let b = 0; b < 4; b++) {
    const o = b * 4
    addKick(out, at(o + 0), { freq: 60, dur: 0.2 })
    addKick(out, at(o + 0.75), { gain: 0.55 })
    addSnare(out, at(o + 1), { gain: 0.75 })
    addSnare(out, at(o + 1.5), { gain: 0.35 })
    addKick(out, at(o + 2.25), { gain: 0.6 })
    addSnare(out, at(o + 3), { gain: 0.75 })
    if (b === 3) { addSnare(out, at(o + 3.5), { gain: 0.5 }); addSnare(out, at(o + 3.75), { gain: 0.6 }) }
    for (let h = 0; h < 16; h++) addHat(out, at(o + h * 0.25), { gain: 0.14 })
  }
}))

// 3. four-on-the-floor 124bpm, 4 bars
writeFileSync(`${OUT}/house-124.wav`, make(4, 124, (out, spb, at) => {
  for (let b = 0; b < 4; b++) {
    const o = b * 4
    for (let k = 0; k < 4; k++) addKick(out, at(o + k), { freq: 50, drop: 30, dur: 0.24, gain: 0.9 })
    addClap(out, at(o + 1)); addClap(out, at(o + 3))
    for (let h = 0; h < 8; h++) if (h % 2 === 1) addHat(out, at(o + h * 0.5), { gain: 0.3, open: true })
    addBass(out, at(o + 0), 65.4, spb * 0.9, { gain: 0.4 })
    addBass(out, at(o + 2), 87.3, spb * 0.9, { gain: 0.4 })
  }
}))

// 4. vinyl stabs 96bpm, 4 bars
writeFileSync(`${OUT}/stabs-96.wav`, make(4, 96, (out, spb, at) => {
  const chord = [261.6, 311.1, 392.0]
  for (let b = 0; b < 4; b++) {
    const o = b * 4
    addKick(out, at(o + 0)); addSnare(out, at(o + 1)); addKick(out, at(o + 2)); addSnare(out, at(o + 3))
    for (let h = 0; h < 8; h++) addHat(out, at(o + h * 0.5), { gain: 0.18 })
    const hits = b % 2 === 0 ? [0.5, 2.5] : [0.5, 1.5, 3.5]
    for (const hp of hits) for (const f of chord) addTone(out, at(o + hp), f, 0.3, { gain: 0.16, type: 'saw', decay: 9 })
  }
}))

// 5. dnb 172bpm, 4 bars
writeFileSync(`${OUT}/dnb-172.wav`, make(4, 172, (out, spb, at) => {
  for (let b = 0; b < 4; b++) {
    const o = b * 4
    addKick(out, at(o + 0), { freq: 58, dur: 0.18 })
    addSnare(out, at(o + 1), { gain: 0.8 })
    addKick(out, at(o + 1.75), { gain: 0.55 })
    addKick(out, at(o + 2.5), { gain: 0.5 })
    addSnare(out, at(o + 3), { gain: 0.8 })
    for (let h = 0; h < 16; h++) addHat(out, at(o + h * 0.25), { gain: 0.1 })
    addBass(out, at(o + 0), 43.65, spb * 3.5, { gain: 0.5 }) // reese-ish long note
  }
}))

// 6. funk 100bpm, 4 bars
writeFileSync(`${OUT}/funk-100.wav`, make(4, 100, (out, spb, at) => {
  for (let b = 0; b < 4; b++) {
    const o = b * 4
    addKick(out, at(o + 0)); addKick(out, at(o + 0.75), { gain: 0.5 })
    addSnare(out, at(o + 1))
    addSnare(out, at(o + 1.75), { gain: 0.22 }) // ghost
    addKick(out, at(o + 2.25), { gain: 0.7 })
    addSnare(out, at(o + 3))
    addSnare(out, at(o + 3.5), { gain: 0.2 }) // ghost
    for (let h = 0; h < 16; h++) addHat(out, at(o + h * 0.25), { gain: h % 2 ? 0.1 : 0.2 })
    addBass(out, at(o + 0), 82.4, spb * 0.7, { gain: 0.4 })
    addBass(out, at(o + 2.25), 73.4, spb * 0.7, { gain: 0.4 })
  }
}))

console.log('wrote 6 loops to', OUT)
