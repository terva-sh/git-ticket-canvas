import type { StoreSummary } from './types'

/** One store and the stores it declared, which render under it. */
export interface StoreNode { store: StoreSummary; children: StoreNode[] }
/** A heading and the stores under it. */
export interface StoreGroup { label: string; stores: StoreNode[] }

/** The directory holding the store, which is what a person recognizes. A path
 *  from the server ends in the store directory itself. */
export function displayPath(path: string) {
  return path.replace(/\/\.tickets\/?$/, '')
}

function relativeTo(root: string, path: string) {
  const full = displayPath(path)
  if (!root) return full
  const base = root.replace(/\/+$/, '')
  return full === base ? '' : full.startsWith(`${base}/`) ? full.slice(base.length + 1) : full
}

function matches(store: StoreSummary, query: string) {
  if (!query) return true
  const needle = query.toLowerCase()
  return store.display.toLowerCase().includes(needle) ||
    store.name.toLowerCase().includes(needle) ||
    displayPath(store.path).toLowerCase().includes(needle)
}

/** The heading a store belongs under: its root, then the leading segments of
 *  its path below that root. A workspace laid out as forge/org/repo puts
 *  sixteen sibling repositories under one heading instead of sixteen. */
function heading(store: StoreSummary) {
  // A store with no root was named rather than found, and saying so is more use
  // than filing it under whichever directory it happens to sit in.
  if (!store.root) return 'Named on the command line'
  const lead = relativeTo(store.root, store.path).split('/').slice(0, -1).join('/')
  return lead ? `${store.root}/${lead}` : store.root
}

/**
 * Group stores for the browser view: favorites first, then one heading per root
 * and leading path, with a declared child under its parent.
 *
 * A child whose parent does not survive the search is promoted to a row of its
 * own rather than dropped, because a search that hides a match is worse than
 * one that shows it in an unexpected place.
 */
export function groupStores(stores: readonly StoreSummary[], query = ''): StoreGroup[] {
  const kept = stores.filter(store => matches(store, query))
  const visible = new Set(kept.map(store => store.name))
  const nodes = new Map<string, StoreNode>(kept.map(store => [store.name, { store, children: [] }]))

  const groups: StoreGroup[] = []
  const byLabel = new Map<string, StoreNode[]>()
  const favorites: StoreNode[] = []

  for (const store of kept) {
    const node = nodes.get(store.name)!
    // A child renders under its parent, and only when the parent is still here.
    if (store.parent && visible.has(store.parent) && store.parent !== store.name) {
      nodes.get(store.parent)!.children.push(node)
      continue
    }
    if (store.favorite) { favorites.push(node); continue }
    const label = heading(store)
    const bucket = byLabel.get(label)
    if (bucket) bucket.push(node); else byLabel.set(label, [node])
  }

  if (favorites.length) groups.push({ label: 'Favorites', stores: favorites })
  for (const [label, list] of [...byLabel].sort(([a], [b]) => a.localeCompare(b))) {
    groups.push({ label, stores: list })
  }
  return groups
}

/** The stores a compact control offers without opening the full view: the one
 *  being shown, then favorites, then whatever was looked at recently. */
export function shortList(stores: readonly StoreSummary[], current: string | null, recent: readonly string[], limit = 8) {
  const picked: StoreSummary[] = []
  const add = (store: StoreSummary | undefined) => {
    if (store && !picked.some(have => have.name === store.name)) picked.push(store)
  }
  add(stores.find(store => store.name === current))
  for (const store of stores) if (store.favorite) add(store)
  for (const name of recent) add(stores.find(store => store.name === name))
  return picked.slice(0, limit)
}
