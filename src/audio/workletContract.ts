/*
 * The typed message contract for public/worklets/turntable-processor.js.
 * The worklet itself is untyped plain JS; this file is the single source of
 * truth for what crosses the port in either direction.
 */

import { asset } from '../lib/asset'

/** main thread -> worklet */
export type ToWorkletMessage =
  | {
      type: 'load'
      /** One ArrayBuffer per channel, each backing a Float32Array of PCM.
       *  Sent as transferables — do not touch them afterwards on this side. */
      channels: ArrayBuffer[]
      sampleRate: number
    }
  | { type: 'unload' }
  | { type: 'setLoop'; loop: boolean }
  | { type: 'setPosition'; position: number }

/** worklet -> main thread */
export type FromWorkletMessage =
  | { type: 'loaded'; durationSamples: number }
  | {
      type: 'position'
      /** Current read head, in samples, already wrapped into [0, length). */
      position: number
      length: number
      playing: boolean
    }

export const RATE_PARAM = 'rate'
export const PROCESSOR_NAME = 'turntable-processor'
export const WORKLET_URL = asset('worklets/turntable-processor.js')
