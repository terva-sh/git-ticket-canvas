import { LAYOUTS, TOOLBAR_SCALES } from '../platform/canvas/viewport'
import type { DisplayOverrides, Layout, ToolbarScale } from '../platform/canvas/viewport'

/**
 * What somebody has chosen to disagree with about the automatic display
 * settings.
 *
 * In the browser, per person, never in the layout file. Two people reading one
 * board must not be able to change each other's toolbar, and a preference about
 * a window is not a fact about the work. This is the same reasoning and the same
 * shape as `viewMemory`, which holds where a board was left.
 *
 * Only the keys somebody actually set are stored. That way a later change to
 * the rules in `platform/canvas/viewport.ts` reaches everybody who never
 * disagreed and nobody who did, rather than freezing whatever was automatic on
 * the day they first opened a board.
 *
 * Every function here survives storage being unavailable. Private browsing and
 * a full quota both throw on access.
 */
const KEY = 'git-ticket-canvas.display'

/** The stored record. `toolbar` sits beside the overrides rather than among
 * them: it is a preference with a default, not a disagreement with something
 * the window asked for. */
export interface StoredDisplay extends DisplayOverrides {
  toolbar?: ToolbarScale
  /** The phone's first-visit tip has been tapped closed. Kept here rather than
   * under a key of its own so that it is one more line in the one allowlist,
   * and absent rather than false until somebody closes it. */
  tipClosed?: true
  /** The list in place of the board. The board is the absence of a record, the
   * way the default toolbar size is, so a phone opens on the board the first
   * time and nobody who never switched has anything stored. */
  view?: 'list'
}

/** What the stage shows. A preference with a default, like the toolbar size:
 * nothing about a window says whether somebody wants a list. */
export type View = 'board' | 'list'

const DENSITIES = ['full', 'compact']
const PLACEMENTS = ['beside', 'bottom', 'over']
const TARGETS = ['fine', 'coarse']

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function pick<T extends string>(value: unknown, allowed: readonly string[]): T | undefined {
  return typeof value === 'string' && allowed.includes(value) ? value as T : undefined
}

/** The overrides in force, with anything unrecognised dropped rather than
 * trusted: a value this version does not know would otherwise select a layout
 * that does not exist. */
export function recall(): StoredDisplay {
  const held = storage()
  if (!held) return {}
  try {
    const raw = held.getItem(KEY)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const record = parsed as Record<string, unknown>
    const overrides: StoredDisplay = {}
    // Each key is rebuilt from its own allowlist, so a setting added to
    // `DisplayChoices` without a line here is silently forgotten on reload.
    const layout = pick<Layout>(record.layout, LAYOUTS)
    if (layout) overrides.layout = layout
    const density = pick<'full' | 'compact'>(record.density, DENSITIES)
    if (density) overrides.density = density
    const inspector = pick<'beside' | 'bottom' | 'over'>(record.inspector, PLACEMENTS)
    if (inspector) overrides.inspector = inspector
    const targets = pick<'fine' | 'coarse'>(record.targets, TARGETS)
    if (targets) overrides.targets = targets
    const toolbar = pick<ToolbarScale>(record.toolbar, TOOLBAR_SCALES)
    if (toolbar) overrides.toolbar = toolbar
    if (record.tipClosed === true) overrides.tipClosed = true
    if (record.view === 'list') overrides.view = 'list'
    return overrides
  } catch {
    return {}
  }
}

export function remember(overrides: StoredDisplay): void {
  const held = storage()
  if (!held) return
  try {
    // An empty set of overrides is somebody back on automatic, which is the
    // absence of a record rather than a record of nothing.
    if (!Object.keys(overrides).length) held.removeItem(KEY)
    else held.setItem(KEY, JSON.stringify(overrides))
  } catch {
    // A full quota is not a reason to interrupt somebody reading a board.
  }
}

export function forget(): void {
  remember({})
}
