import { useDeckStore } from '../state/useDeckStore'

/**
 * Camera toggle for the header. Replaces the old sidebar panel — the feed
 * itself is now the page background (<GestureBackdrop>). Failures surface here
 * as a short label plus the diagnostic on hover.
 */
export function CameraControl({
  onEnable,
  onDisable,
}: {
  onEnable: () => void
  onDisable: () => void
}) {
  const state = useDeckStore((s) => s.cameraState)
  const error = useDeckStore((s) => s.cameraError)

  const label =
    state === 'on'
      ? 'Camera on'
      : state === 'requesting'
        ? 'Starting…'
        : state === 'denied'
          ? 'Camera blocked'
          : state === 'error'
            ? 'Camera failed'
            : 'Enable camera'

  const onClick = state === 'on' ? onDisable : onEnable

  return (
    <button
      type="button"
      className="tt-camctl"
      data-state={state}
      onClick={onClick}
      disabled={state === 'requesting'}
      title={error ?? undefined}
    >
      <span className="tt-camctl__dot" aria-hidden />
      {label}
      {(state === 'denied' || state === 'error') && error ? (
        <span className="tt-camctl__diag">{error}</span>
      ) : null}
    </button>
  )
}
