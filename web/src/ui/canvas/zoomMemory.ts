import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM } from '../../platform/canvas/geometry'

/**
 * Where a person left the magnification, per store and per board.
 *
 * In the UI layer rather than in platform because it touches `localStorage`,
 * and tests/platform/boundaries.test.ts keeps platform free of the DOM. That
 * boundary is worth more than filing this beside the geometry it clamps
 * against.
 *
 * In the browser rather than in the layout file, deliberately. A zoom level is
 * a view preference and not a fact about the work: writing it to
 * `.tickets/canvas/*.yml` would put a diff in the repository every time
 * somebody scrolled, and on a canvas serving several people it would make two
 * readers fight over one number.
 *
 * Every function here survives storage being unavailable. Private browsing and
 * a full quota both throw on access, and a board that will not open because it
 * could not remember how big it was would be a poor trade.
 */
const PREFIX = 'git-ticket-canvas.zoom'

function key(store: string, board: string): string {
  return `${PREFIX}.${store}.${board}`
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** The remembered level, or null where there is none to trust. */
export function recall(store: string, board: string): number | null {
  const held = storage()
  if (!held || !store || !board) return null
  try {
    const raw = held.getItem(key(store, board))
    if (raw === null) return null
    const k = Number.parseFloat(raw)
    // A value outside the limits the wheel can reach would strand somebody at a
    // magnification they cannot scroll out of, so it is discarded rather than
    // clamped: whatever wrote it was not this.
    if (!Number.isFinite(k) || k < MIN_ZOOM || k > MAX_ZOOM) return null
    return k
  } catch {
    return null
  }
}

export function remember(store: string, board: string, k: number): void {
  const held = storage()
  if (!held || !store || !board || !Number.isFinite(k)) return
  try {
    // Rounded, because a wheel produces a long decimal and the difference
    // between 1.0000001 and 1 is not worth a write.
    held.setItem(key(store, board), k.toFixed(4))
  } catch {
    // A full quota is not a reason to interrupt somebody reading a board.
  }
}

export function forget(store: string, board: string): void {
  const held = storage()
  if (!held) return
  try {
    held.removeItem(key(store, board))
  } catch {
    // As above.
  }
}

/** What to open a board at when nothing was remembered. */
export const OPENING_ZOOM = DEFAULT_ZOOM
