import { asset } from '../lib/asset'
import manifest from './manifest.json'
import type { Track } from './types'

/** The bundled crate, typed. Every entry carries a verified licence +
 *  sourceUrl per PRD §8.1. */
export function bundledCrate(): Track[] {
  return manifest.tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    bpm: t.bpm,
    file: asset(t.file),
    labelColor: t.labelColor,
    source: 'bundled' as const,
    license: t.license,
    sourceUrl: t.sourceUrl,
  }))
}
