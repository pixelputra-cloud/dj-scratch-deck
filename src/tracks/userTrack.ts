import type { Track } from './types'

const LOCAL_COLORS = ['#4a7ad0', '#3f8f7a', '#d0672e', '#7a5bd0', '#c8452e', '#5aa0c0']
let localSeq = 0

export function isAudioFile(f: File): boolean {
  return f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(f.name)
}

/** Wrap a user-picked File as a Track. Decoded locally, never uploaded. */
export function trackFromFile(file: File): Track {
  const color = LOCAL_COLORS[localSeq % LOCAL_COLORS.length]
  localSeq += 1
  return {
    id: `local-${localSeq}-${file.name}`,
    title: file.name.replace(/\.[^.]+$/, ''),
    artist: 'Your file',
    bpm: null,
    file: URL.createObjectURL(file),
    labelColor: color,
    source: 'local',
    license: 'user-supplied — decoded locally, never uploaded',
  }
}
