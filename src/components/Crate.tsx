import { useRef, useState } from 'react'
import { loadTrackIntoDeck } from '../state/deckController'
import { useDeckStore } from '../state/useDeckStore'
import type { Track } from '../tracks/types'
import { TrackCard } from './TrackCard'

const LOCAL_COLORS = ['#4a7ad0', '#3f8f7a', '#d0672e', '#7a5bd0', '#c8452e', '#5aa0c0']

let localSeq = 0
function trackFromFile(file: File): Track {
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

/**
 * The crate (PRD §8). Bundled tracks + drag-and-drop of the user's own files.
 * Nothing is ever uploaded — files are decoded locally in the browser.
 */
export function Crate() {
  const crate = useDeckStore((s) => s.crate)
  const addUserTracks = useDeckStore((s) => s.addUserTracks)
  const loadError = useDeckStore((s) => s.loadError)
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const ingest = (files: FileList | File[]) => {
    const audio = Array.from(files).filter(
      (f) => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(f.name),
    )
    if (audio.length === 0) return
    const tracks = audio.map(trackFromFile)
    addUserTracks(tracks)
    // auto-load the first dropped file
    void loadTrackIntoDeck(tracks[0])
  }

  return (
    <section
      className="tt-crate"
      data-dragover={dragOver}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files.length) ingest(e.dataTransfer.files)
      }}
    >
      <header className="tt-crate__head">
        <h2>CRATE</h2>
        <div className="tt-crate__actions">
          {loadError ? (
            <span className="tt-crate__error" role="alert">
              {loadError}
            </span>
          ) : (
            <span className="tt-crate__hint">
              drop audio files here — they never leave your machine
            </span>
          )}
          <button type="button" onClick={() => fileInput.current?.click()}>
            + Add track
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="audio/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) ingest(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      </header>

      <div className="tt-crate__strip">
        {crate.map((t) => (
          <TrackCard key={t.id} track={t} />
        ))}
      </div>
    </section>
  )
}
