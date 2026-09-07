/*
 * TurntableEngine.ts — owns the AudioContext, the node graph, track
 * loading/decoding and the bridge to the worklet.
 *
 * Graph (PRD §7.1):
 *   TurntableWorkletNode -> deckGain -> analyser -> destination
 *   vinylNoiseSource     -> noiseGain (scaled by |rate|) ----^
 *
 * The engine is instantiable (PRD §14.3 leaves room for a second deck); nothing
 * here is a singleton or a module global.
 */

import {
  MAX_TRACK_MINUTES,
  RATE_SMOOTHING_TAU,
} from '../lib/constants'
import { clamp } from '../lib/math'
import type { DecodedTrack, Track } from '../tracks/types'
import {
  PROCESSOR_NAME,
  RATE_PARAM,
  WORKLET_URL,
  type FromWorkletMessage,
  type ToWorkletMessage,
} from './workletContract'

export interface PositionReport {
  position: number
  length: number
  playing: boolean
}

export interface LoadResult {
  meta: DecodedTrack
}

export class TrackTooLongError extends Error {
  constructor(minutes: number) {
    super(
      `Track is ${minutes.toFixed(1)} min; the limit is ${MAX_TRACK_MINUTES} min. ` +
        `A decoded stereo minute is ~21 MB and several long tracks exhaust a tab.`,
    )
    this.name = 'TrackTooLongError'
  }
}

export class TurntableEngine {
  readonly ctx: AudioContext

  private worklet: AudioWorkletNode | null = null
  private deckGain: GainNode
  private analyser: AnalyserNode
  private noiseGain: GainNode
  private noiseSource: AudioBufferSourceNode | null = null
  private noiseBuffer: AudioBuffer | null = null

  private moduleAdded = false
  private positionListeners = new Set<(r: PositionReport) => void>()
  private loadedListeners = new Set<(durationSamples: number) => void>()

  private _lengthSamples = 0
  private _noiseEnabled = true

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' })

    this.deckGain = this.ctx.createGain()
    this.deckGain.gain.value = 0.9

    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048

    this.noiseGain = this.ctx.createGain()
    this.noiseGain.gain.value = 0

    this.deckGain.connect(this.analyser)
    this.analyser.connect(this.ctx.destination)
    this.noiseGain.connect(this.deckGain)
  }

  // ---- lifecycle ---------------------------------------------------------

  get powered(): boolean {
    return this.ctx.state === 'running'
  }

  get sampleRate(): number {
    return this.ctx.sampleRate
  }

  get lengthSamples(): number {
    return this._lengthSamples
  }

  /** Must be called from inside a real user-input handler (PRD §4.3). */
  async powerOn(): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    if (!this.moduleAdded) {
      await this.ctx.audioWorklet.addModule(WORKLET_URL)
      this.moduleAdded = true
    }
    if (!this.worklet) this.buildWorklet()
    if (this._noiseEnabled) this.startNoise()
  }

  private buildWorklet(): void {
    this.worklet = new AudioWorkletNode(this.ctx, PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    })
    this.worklet.port.onmessage = (e: MessageEvent<FromWorkletMessage>) => {
      const msg = e.data
      if (msg.type === 'position') {
        for (const l of this.positionListeners) l(msg)
      } else if (msg.type === 'loaded') {
        this._lengthSamples = msg.durationSamples
        for (const l of this.loadedListeners) l(msg.durationSamples)
      }
    }
    this.worklet.connect(this.deckGain)
  }

  // ---- track loading ---------------------------------------------------

  async loadTrack(track: Track): Promise<LoadResult> {
    const arrayBuf = await this.fetchBytes(track)
    // decodeAudioData detaches the input buffer on some engines; that's fine,
    // we don't reuse it.
    const audio = await this.ctx.decodeAudioData(arrayBuf)

    const minutes = audio.duration / 60
    if (minutes > MAX_TRACK_MINUTES) throw new TrackTooLongError(minutes)

    const channelCount = Math.min(2, audio.numberOfChannels)
    const channels: Float32Array[] = []
    const transfer: ArrayBuffer[] = []
    for (let c = 0; c < channelCount; c++) {
      const src = audio.getChannelData(c)
      const copy = new Float32Array(src.length)
      copy.set(src)
      channels.push(copy)
      transfer.push(copy.buffer)
    }

    if (!this.worklet) this.buildWorklet()
    const load: ToWorkletMessage = {
      type: 'load',
      channels: transfer,
      sampleRate: audio.sampleRate,
    }
    this.worklet!.port.postMessage(load, transfer)
    this._lengthSamples = channels[0].length

    const meta: DecodedTrack = {
      track,
      sampleRate: audio.sampleRate,
      channels, // buffers are detached post-transfer; kept for shape/length only
      durationSeconds: audio.duration,
    }
    return { meta }
  }

  private async fetchBytes(track: Track): Promise<ArrayBuffer> {
    const res = await fetch(track.file)
    if (!res.ok) throw new Error(`Failed to load ${track.file}: ${res.status}`)
    return res.arrayBuffer()
  }

  unloadTrack(): void {
    this.worklet?.port.postMessage({ type: 'unload' } satisfies ToWorkletMessage)
    this._lengthSamples = 0
  }

  // ---- transport / rate ---------------------------------------------

  /** The one place a rate reaches the audio thread. setTargetAtTime on the
   *  a-rate param gives a per-sample smoothed ramp — no zipper noise. */
  setRate(rate: number): void {
    if (!this.worklet) return
    const p = this.worklet.parameters.get(RATE_PARAM)
    if (!p) return
    p.setTargetAtTime(rate, this.ctx.currentTime, RATE_SMOOTHING_TAU)

    if (this._noiseEnabled) {
      // surface noise pitches and swells with the scratch (PRD §7.1)
      const target = 0.02 + clamp(Math.abs(rate), 0, 4) * 0.06
      this.noiseGain.gain.setTargetAtTime(
        target,
        this.ctx.currentTime,
        RATE_SMOOTHING_TAU,
      )
    }
  }

  setLoop(loop: boolean): void {
    this.worklet?.port.postMessage({
      type: 'setLoop',
      loop,
    } satisfies ToWorkletMessage)
  }

  seek(positionSamples: number): void {
    this.worklet?.port.postMessage({
      type: 'setPosition',
      position: positionSamples,
    } satisfies ToWorkletMessage)
  }

  setDeckVolume(v: number): void {
    this.deckGain.gain.setTargetAtTime(
      clamp(v, 0, 1),
      this.ctx.currentTime,
      0.02,
    )
  }

  // ---- vinyl noise ------------------------------------------------

  setNoiseEnabled(on: boolean): void {
    this._noiseEnabled = on
    if (!on) {
      this.noiseGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05)
    } else if (this.powered && !this.noiseSource) {
      this.startNoise()
    }
  }

  private async startNoise(): Promise<void> {
    if (this.noiseSource) return
    try {
      if (!this.noiseBuffer) {
        const res = await fetch('/audio/vinyl-noise.wav')
        if (!res.ok) return
        this.noiseBuffer = await this.ctx.decodeAudioData(await res.arrayBuffer())
      }
      const src = this.ctx.createBufferSource()
      src.buffer = this.noiseBuffer
      src.loop = true
      src.connect(this.noiseGain)
      src.start()
      this.noiseSource = src
    } catch {
      /* noise is cosmetic — never let it break audio */
    }
  }

  // ---- observers -----------------------------------------------

  onPosition(cb: (r: PositionReport) => void): () => void {
    this.positionListeners.add(cb)
    return () => this.positionListeners.delete(cb)
  }

  onLoaded(cb: (durationSamples: number) => void): () => void {
    this.loadedListeners.add(cb)
    return () => this.loadedListeners.delete(cb)
  }

  getAnalyser(): AnalyserNode {
    return this.analyser
  }

  // ---- teardown ----------------------------------------------

  async dispose(): Promise<void> {
    this.positionListeners.clear()
    this.loadedListeners.clear()
    try {
      this.noiseSource?.stop()
    } catch {
      /* already stopped */
    }
    this.worklet?.disconnect()
    this.noiseGain.disconnect()
    this.deckGain.disconnect()
    this.analyser.disconnect()
    if (this.ctx.state !== 'closed') await this.ctx.close()
  }
}
