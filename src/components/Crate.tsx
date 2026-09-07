import { useRef, useState } from 'react'
import { loadTrackIntoDeck } from '../state/deckController'
import { useDeckStore } from '../state/useDeckStore'
import { isAudioFile, trackFromFile } from '../tracks/userTrack'
import { TrackCard } from './TrackCard'

/**
 * The crate — the "Crate" tab of <SidePanel>. Bundled tracks + drag-and-drop
 * of the user's own files; nothing is ever uploaded (decoded locally).
 */
export function CratePanel() {
  const crate = useDeckStore((s) => s.crate)
  const addUserTracks = useDeckStore((s) => s.addUserTracks)
  const loadError = useDeckStore((s) => s.loadError)
  const loadedTitle = useDeckStore((s) => s.loadedTrack?.title ?? null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const ingest = (files: FileList | File[]) => {
    const audio = Array.from(files).filter(isAudioFile)
    if (audio.length === 0) return
    const tracks = audio.map(trackFromFile)
    addUserTracks(tracks)
    void loadTrackIntoDeck(tracks[0]) // auto-load the first dropped file
  }

  return (
    <div
      className="tt-crate"
      data-dragover={dragOver}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files.length) ingest(e.dataTransfer.files)
      }}
    >
      <div className="tt-crate__head">
        <p className="tt-crate__hint" role={loadError ? 'alert' : undefined}>
          {loadError ?? 'click or drag a track onto the disc'}
        </p>
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
      </div>

      <div className="tt-crate__list">
        {crate.map((t) => (
          <TrackCard key={t.id} track={t} />
        ))}
      </div>

      {loadedTitle ? <p className="tt-crate__now">▶ {loadedTitle}</p> : null}
    </div>
  )
}
