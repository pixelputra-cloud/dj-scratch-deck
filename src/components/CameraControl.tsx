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

  // A shorter label swaps in on narrow screens (CSS-driven, see .tt-camctl__label-*)
  // so the button never gets clipped in the header on mobile.
  const shortLabel =
    state === 'on'
      ? 'On'
      : state === 'requesting'
        ? '…'
        : state === 'denied'
          ? 'Blocked'
          : state === 'error'
            ? 'Failed'
            : 'Camera'

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
      <span className="tt-camctl__label-full">{label}</span>
      <span className="tt-camctl__label-short">{shortLabel}</span>
      {(state === 'denied' || state === 'error') && error ? (
        <span className="tt-camctl__diag">{error}</span>
      ) : null}
    </button>
  )
}
