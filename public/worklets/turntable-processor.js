/*
 * turntable-processor.js  —  the variable-rate vinyl read head.
 *
 * Plain JS on purpose (PRD "Note on the worklet file"): ~150 lines of numeric
 * code, no imports, loaded with audioWorklet.addModule(). The message contract
 * is typed on the main-thread side in src/audio/workletContract.ts.
 *
 * Why this exists instead of AudioBufferSourceNode.playbackRate (PRD §4.1):
 *   1. playbackRate cannot go negative — scratching is bidirectional.
 *   2. fast rate automation resamples with artefacts.
 *   3. no clean read of the current playhead to lock the visual disc to audio.
 *
 * Design:
 *   - owns the decoded channel data (transferred in once, zero-copy)
 *   - a floating-point virtual read head `position`, in samples
 *   - per output sample:  position += rate ;  out = hermite4(buffer, position)
 *   - `rate` is an a-rate AudioParam, so setTargetAtTime on the main thread
 *     gives us a per-sample smoothed ramp for free — no zipper noise.
 */

const POSITION_POST_HZ = 30

class Turntable extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'rate',
        defaultValue: 0,
        minValue: -16,
        maxValue: 16,
        automationRate: 'a-rate',
      },
    ]
  }

  constructor() {
    super()
    /** @type {Float32Array[]} */
    this._channels = []
    this._length = 0
    this._position = 0
    this._loop = true
    this._postCounter = 0
    this._postEvery = Math.max(1, Math.round(sampleRate / POSITION_POST_HZ / 128))

    this.port.onmessage = (e) => this._onMessage(e.data)
  }

  _onMessage(msg) {
    switch (msg.type) {
      case 'load': {
        this._channels = msg.channels.map((buf) => new Float32Array(buf))
        this._length = this._channels.length ? this._channels[0].length : 0
        this._position = 0
        this.port.postMessage({ type: 'loaded', durationSamples: this._length })
        break
      }
      case 'unload':
        this._channels = []
        this._length = 0
        this._position = 0
        break
      case 'setLoop':
        this._loop = !!msg.loop
        break
      case 'setPosition':
        if (this._length > 0) {
          this._position = wrap(msg.position, this._length, this._loop)
        }
        break
    }
  }

  process(_inputs, outputs, parameters) {
    const output = outputs[0]
    const outChannels = output.length
    const frames = output[0] ? output[0].length : 128

    if (this._length === 0) {
      for (let c = 0; c < outChannels; c++) output[c].fill(0)
      this._maybePostPosition(false)
      return true
    }

    const rateParam = parameters.rate
    const rateIsConst = rateParam.length === 1
    const src = this._channels
    const srcChannels = src.length
    const len = this._length
    const loop = this._loop
    let pos = this._position

    for (let i = 0; i < frames; i++) {
      const rate = rateIsConst ? rateParam[0] : rateParam[i]

      let readPos = pos
      let silent = false
      if (loop) {
        readPos = ((readPos % len) + len) % len
      } else if (readPos < 0 || readPos >= len - 1) {
        silent = true
      }

      for (let c = 0; c < outChannels; c++) {
        if (silent) {
          output[c][i] = 0
          continue
        }
        // map output channel -> source channel (mono source feeds both)
        const sc = c < srcChannels ? src[c] : src[srcChannels - 1]
        output[c][i] = hermite4(sc, readPos, len, loop)
      }

      pos += rate
      if (loop) {
        pos = ((pos % len) + len) % len
      } else if (pos < -1) {
        pos = -1
      } else if (pos > len) {
        pos = len
      }
    }

    this._position = pos
    this._maybePostPosition(true)
    return true
  }

  _maybePostPosition(playing) {
    if (++this._postCounter >= this._postEvery) {
      this._postCounter = 0
      this.port.postMessage({
        type: 'position',
        position: this._position,
        length: this._length,
        playing,
      })
    }
  }
}

/** Positive-safe wrap / clamp of a read position. */
function wrap(p, len, loop) {
  if (loop) return ((p % len) + len) % len
  return p < 0 ? 0 : p > len - 1 ? len - 1 : p
}

/**
 * 4-tap cubic Hermite (Catmull-Rom) interpolation at fractional sample `pos`.
 * Linear interpolation is audibly gritty at high |rate|, which is exactly when
 * scratching happens (PRD §4.1).
 */
function hermite4(buf, pos, len, loop) {
  const i1 = Math.floor(pos)
  const t = pos - i1

  let i0 = i1 - 1
  let i2 = i1 + 1
  let i3 = i1 + 2

  if (loop) {
    i0 = ((i0 % len) + len) % len
    i2 = ((i2 % len) + len) % len
    i3 = ((i3 % len) + len) % len
  } else {
    if (i0 < 0) i0 = 0
    if (i2 > len - 1) i2 = len - 1
    if (i3 > len - 1) i3 = len - 1
  }

  const p0 = buf[i0]
  const p1 = buf[i1]
  const p2 = buf[i2]
  const p3 = buf[i3]

  const c0 = p1
  const c1 = 0.5 * (p2 - p0)
  const c2 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3
  const c3 = 0.5 * (p3 - p0) + 1.5 * (p1 - p2)

  return ((c3 * t + c2) * t + c1) * t + c0
}

registerProcessor('turntable-processor', Turntable)
