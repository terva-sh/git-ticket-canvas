import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM } from '../../platform/canvas/geometry'
import type { View } from '../../platform/canvas/geometry'

/**
 * Where a person left the board, per store and per board: the magnification and
 * the corner they were looking at.
 *
 * Both, rather than the magnification alone. A remembered zoom with a forgotten
 * pan lands somebody at the right scale on the wrong part of a board, which on
 * a large board is barely better than landing nowhere.
 *
 * In the UI layer rather than in platform because it touches `localStorage`,
 * and tests/platform/boundaries.test.ts keeps platform free of the DOM. That
 * boundary is worth more than filing this beside the geometry it clamps
 * against.
 *
 * In the browser rather than in the layout file, deliberately. Where you are
 * looking is a view preference and not a fact about the work: writing it to
 * `.tickets/canvas/*.yml` would put a diff in the repository every time
 * somebody scrolled, and on a canvas serving several people it would make two
 * readers fight over one position.
 *
 * Every function here survives storage being unavailable. Private browsing and
 * a full quota both throw on access, and a board that will not open because it
 * could not remember where it was would be a poor trade.
 */
const PREFIX = 'git-ticket-canvas.view'

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

/** The remembered view, or null where there is none to trust. */
export function recall(store: string, board: string): View | null {
  const held = storage()
  if (!held || !store || !board) return null
  try {
    const raw = held.getItem(key(store, board))
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const { x, y, k } = parsed as Partial<View>
    if (![x, y, k].every(n => typeof n === 'number' && Number.isFinite(n))) return null
    // A magnification outside the limits the wheel can reach would strand
    // somebody at a scale they cannot scroll out of, so the record is discarded
    // rather than clamped: whatever wrote it was not this.
    if (k! < MIN_ZOOM || k! > MAX_ZOOM) return null
    return { x: x!, y: y!, k: k! }
  } catch {
    return null
  }
}

export function remember(store: string, board: string, view: View): void {
  const held = storage()
  if (!held || !store || !board) return
  if (![view.x, view.y, view.k].every(Number.isFinite)) return
  try {
    // Rounded, because a drag produces a long decimal and the difference
    // between 1.0000001 and 1 is not worth a write.
    held.setItem(key(store, board), JSON.stringify({
      x: Math.round(view.x * 100) / 100,
      y: Math.round(view.y * 100) / 100,
      k: Math.round(view.k * 10_000) / 10_000,
    }))
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

/** What to magnify a board at when nothing was remembered. */
export const OPENING_ZOOM = DEFAULT_ZOOM
