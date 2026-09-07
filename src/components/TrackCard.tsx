import { loadTrackIntoDeck } from '../state/deckController'
import { useDeckStore } from '../state/useDeckStore'
import type { Track } from '../tracks/types'

interface Props {
  track: Track
}

/** One compact crate row (PRD §8.3): thumbnail, title, artist, BPM.
 *  Click to load, or drag onto the disc. */
export function TrackCard({ track }: Props) {
  const loadedId = useDeckStore((s) => s.loadedTrack?.id ?? null)
  const loadingId = useDeckStore((s) => s.loadingTrackId)

  const isLoaded = loadedId === track.id
  const isLoading = loadingId === track.id

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-deck-track', track.id)
    e.dataTransfer.setData('text/plain', track.title)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <button
      type="button"
      className="tt-card"
      data-loaded={isLoaded}
      data-loading={isLoading}
      draggable
      onDragStart={onDragStart}
      onClick={() => loadTrackIntoDeck(track)}
      style={{ ['--card-accent' as string]: track.labelColor }}
      aria-label={`Load ${track.title} by ${track.artist}`}
    >
      <span className="tt-card__sleeve" aria-hidden>
        <span className="tt-card__disc" />
      </span>
      <span className="tt-card__title">{track.title}</span>
      <span className="tt-card__sub">
        <span>{track.artist}</span>
        {track.bpm ? <span className="tt-card__bpm">{track.bpm} BPM</span> : null}
        {track.source === 'local' ? (
          <span className="tt-card__local">LOCAL</span>
        ) : null}
      </span>
      {isLoading ? <span className="tt-card__spin" aria-hidden /> : null}
    </button>
  )
}
