import { useRef, useState } from 'react'
import { loadTrackIntoDeck } from '../state/deckController'
import { useDeckStore } from '../state/useDeckStore'
import { isAudioFile, trackFromFile } from '../tracks/userTrack'
import { TrackCard } from './TrackCard'

/**
 * The crate (PRD §8), a right-edge drawer. Bundled tracks + drag-and-drop of
 * the user's own files; nothing is ever uploaded — files are decoded locally.
 */
export function Crate() {
  const crate = useDeckStore((s) => s.crate)
  const addUserTracks = useDeckStore((s) => s.addUserTracks)
  const loadError = useDeckStore((s) => s.loadError)
  const loadedTitle = useDeckStore((s) => s.loadedTrack?.title ?? null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [open, setOpen] = useState(true)

  const ingest = (files: FileList | File[]) => {
    const audio = Array.from(files).filter(isAudioFile)
    if (audio.length === 0) return
    const tracks = audio.map(trackFromFile)
    addUserTracks(tracks)
    void loadTrackIntoDeck(tracks[0]) // auto-load the first dropped file
  }

  return (
    <aside className="tt-crate" data-open={open} data-dragover={dragOver}>
      <button
        type="button"
        className="tt-crate__handle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Collapse crate' : 'Open crate'}
      >
        <span className="tt-crate__handle-label">CRATE</span>
        <span className="tt-crate__handle-chev">{open ? '▸' : '◂'}</span>
      </button>

      <div
        className="tt-crate__panel"
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
          <button type="button" onClick={() => fileInput.current?.click()}>
            + Add
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
        </header>

        <p className="tt-crate__hint" role={loadError ? 'alert' : undefined}>
          {loadError ?? 'drop audio files here — they never leave your machine'}
        </p>

        <div className="tt-crate__list">
          {crate.map((t) => (
            <TrackCard key={t.id} track={t} />
          ))}
        </div>

        {loadedTitle ? (
          <p className="tt-crate__now">▶ {loadedTitle}</p>
        ) : null}
      </div>
    </aside>
  )
}
