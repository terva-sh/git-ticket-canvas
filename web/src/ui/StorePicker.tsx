import type { StoreSummary } from '../platform/tickets/types'
import { displayPath, shortList } from '../platform/tickets/stores'

export interface StorePickerProps {
  stores: readonly StoreSummary[]
  current: string | null
  recent: readonly string[]
  onOpen(name: string): void
  onBrowse(): void
}

/**
 * The compact control: the store being shown, a few worth reaching in one
 * click, and the way into the full list.
 *
 * Nothing here grows with the number of stores. A workspace of twenty-two
 * repositories is a list, not a menu, and the list has its own view.
 */
export function StorePicker(p: StorePickerProps) {
  if (p.stores.length < 2 && !p.current) return null
  const shown = p.stores.find(store => store.name === p.current)
  const quick = shortList(p.stores, p.current, p.recent)
  return <details class="store-picker" id="storePicker">
    <summary class="tool" id="storePickerLabel" title={shown ? displayPath(shown.path) : 'Choose a store'}>
      {shown?.display ?? 'Choose a store'}
    </summary>
    <div class="store-picker-body">
      <ul class="store-quick">
        {quick.map(store => <li key={store.name}>
          <button type="button" class="store-quick-item" data-store={store.name}
            aria-current={store.name === p.current ? 'true' : undefined}
            disabled={!store.available} title={displayPath(store.path)}
            onClick={() => p.onOpen(store.name)}>
            {store.favorite && <span aria-hidden="true">{'★ '}</span>}{store.display}
          </button>
        </li>)}
      </ul>
      <button type="button" class="tool" id="browseStores" onClick={p.onBrowse}>
        Browse all stores ({p.stores.length})
      </button>
    </div>
  </details>
}
