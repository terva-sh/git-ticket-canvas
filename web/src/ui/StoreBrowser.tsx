import { useEffect, useRef, useState } from 'preact/hooks'
import type { StoreSummary } from '../platform/tickets/types'
import { displayPath, groupStores, type StoreNode } from '../platform/tickets/stores'

export interface StoreBrowserProps {
  stores: readonly StoreSummary[]
  current: string | null
  onOpen(name: string): void
  onFavorite(name: string, favorite: boolean): void
  onClose(): void
  /** Search for the roots again without a restart. Absent when the canvas was
   *  started with no roots to search. */
  onRescan?(): void
  busy?: boolean
}

function Row({ node, depth, current, onOpen, onFavorite }: {
  node: StoreNode; depth: number; current: string | null
  onOpen(name: string): void; onFavorite(name: string, favorite: boolean): void
}) {
  const store = node.store
  return <>
    <li class="store-row" data-store={store.name} data-depth={depth} data-available={String(store.available)}>
      <button type="button" class="store-open" style={{ paddingLeft: `${8 + depth * 16}px` }}
        disabled={!store.available} aria-current={store.name === current ? 'true' : undefined}
        title={store.available ? displayPath(store.path) : store.reason}
        onClick={() => onOpen(store.name)}>
        <span class="store-name">{store.name}</span>
        <span class="store-path">{displayPath(store.path)}</span>
        {store.readOnly && <span class="badge warn store-flag">read-only</span>}
        {store.active && <span class="badge store-flag">open</span>}
        {!store.available && <span class="badge warn store-flag store-reason">{store.reason || 'unavailable'}</span>}
      </button>
      <button type="button" class="store-favorite" aria-pressed={store.favorite}
        aria-label={`${store.favorite ? 'Remove' : 'Add'} ${store.name} ${store.favorite ? 'from' : 'to'} favorites`}
        onClick={() => onFavorite(store.name, !store.favorite)}>{store.favorite ? '★' : '☆'}</button>
    </li>
    {node.children.map(child =>
      <Row key={child.store.name} node={child} depth={depth + 1} current={current} onOpen={onOpen} onFavorite={onFavorite} />)}
  </>
}

/**
 * The full list of stores: search, favorites first, then one heading per root
 * and leading path.
 *
 * An unavailable store is shown with its reason rather than hidden. A path
 * somebody mistyped should be diagnosable from this page instead of from the
 * server log.
 */
export function StoreBrowser(p: StoreBrowserProps) {
  const [query, setQuery] = useState('')
  const search = useRef<HTMLInputElement>(null)
  // Focus moves in when the view opens and back to whatever opened it when the
  // view closes, so the keyboard does not land at the top of the document.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    search.current?.focus()
    return () => opener?.focus?.()
  }, [])
  const groups = groupStores(p.stores, query)
  // Counted through the children too, so a nested store is not missing from the
  // total that tells you how much the search removed.
  const count = (nodes: readonly StoreNode[]): number =>
    nodes.reduce((total, node) => total + 1 + count(node.children), 0)
  const shown = groups.reduce((total, group) => total + count(group.stores), 0)

  return <div id="storeBrowser" class="store-browser" role="dialog" aria-modal="true" aria-label="Stores"
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); p.onClose() } }}>
    <div class="store-browser-head">
      <input ref={search} id="storeSearch" class="tool" type="search" placeholder="Search stores"
        autoComplete="off" value={query} onInput={event => setQuery(event.currentTarget.value)} />
      <span class="badge" id="storeCount">{shown} of {p.stores.length}</span>
      {p.onRescan && <button type="button" class="tool" id="storeRescan" disabled={p.busy}
        title="Search the configured roots again" onClick={p.onRescan}>Rescan</button>}
      <button type="button" class="tool" id="storeBrowserClose" onClick={p.onClose}>Close</button>
    </div>
    <div class="store-browser-body">
      {groups.length === 0 && <p class="store-empty">No store matches that search.</p>}
      {groups.map(group => <section key={group.label} class="store-group">
        <h2 class="store-group-label">{group.label}</h2>
        <ul class="store-list">
          {group.stores.map(node => <Row key={node.store.name} node={node} depth={0}
            current={p.current} onOpen={p.onOpen} onFavorite={p.onFavorite} />)}
        </ul>
      </section>)}
    </div>
  </div>
}
