export interface Track {
  id: string
  title: string
  artist: string
  /** Nominal BPM, informational only in v1 (no beat sync). May be null for
   *  user uploads where we don't know it. */
  bpm: number | null
  /** Absolute URL for bundled tracks (served from /audio/…), or an object
   *  URL for a user-supplied File. */
  file: string
  /** Centre-label accent colour, drives --label-accent for this track. */
  labelColor: string
  /** 'bundled' tracks carry a verified licence; 'local' are the user's own
   *  files, decoded in-browser and never uploaded anywhere. */
  source: 'bundled' | 'local'
  license?: string
  sourceUrl?: string
}

/** A decoded, ready-to-play track: raw channel data plus metadata. */
export interface DecodedTrack {
  track: Track
  sampleRate: number
  /** One Float32Array per channel (1 = mono, 2 = stereo). */
  channels: Float32Array[]
  durationSeconds: number
}
