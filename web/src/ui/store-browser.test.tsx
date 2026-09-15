// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { StoreBrowser } from './StoreBrowser'
import { StorePicker } from './StorePicker'
import type { StoreSummary } from '../platform/tickets/types'

let root: HTMLDivElement
beforeEach(() => { root = document.createElement('div'); document.body.append(root) })
afterEach(() => { act(() => render(null, root)); root.remove(); vi.restoreAllMocks() })

function store(name: string, path: string, extra: Partial<StoreSummary> = {}): StoreSummary {
  return { name, display: path.split('/').pop()!, path: `${path}/.tickets`,
    available: true, active: false, favorite: false, readOnly: false, root: '/ws', ...extra }
}
const stores = [
  store('one', '/ws/org/one'),
  store('two', '/ws/org/two', { favorite: true }),
  store('child', '/ws/org/one/fixture', { parent: 'one' }),
  store('broken', '/ws/org/gone', { available: false, reason: 'no .tickets store at or above /ws/org/gone' }),
]
function element<T extends HTMLElement>(selector: string) { return root.querySelector<T>(selector)! }
function rows() { return [...root.querySelectorAll<HTMLElement>('.store-row')].map(row => row.dataset.store) }

function mount(props: Partial<Parameters<typeof StoreBrowser>[0]> = {}) {
  const onOpen = vi.fn(), onFavorite = vi.fn(), onClose = vi.fn()
  act(() => render(<StoreBrowser stores={stores} current="one" onOpen={onOpen}
    onFavorite={onFavorite} onClose={onClose} {...props} />, root))
  return { onOpen, onFavorite, onClose }
}

it('lists every store, with a declared child under its parent', () => {
  mount()
  expect(rows()).toEqual(['two', 'one', 'child', 'broken'])
  const child = element<HTMLElement>('.store-row[data-store="child"]')
  expect(child.dataset.depth).toBe('1')
  expect(element('.store-group-label')!.textContent).toBe('Favorites')
})

// The store somebody most needs to see is the one that will not open.
it('shows an unavailable store with its reason instead of hiding it', () => {
  mount()
  const row = element<HTMLElement>('.store-row[data-store="broken"]')
  expect(row.dataset.available).toBe('false')
  expect(row.querySelector('.store-reason')!.textContent).toContain('no .tickets store')
  expect(row.querySelector<HTMLButtonElement>('.store-open')!.disabled).toBe(true)
})

// The id has a whole workspace to stay unique across, so it is long and
// repeats the heading. The row shows the directory instead.
it('shows the display name, not the id, and still selects on the id', () => {
  const { onOpen } = mount({
    stores: [store('git-local-sothr-com_Sothr-Containers_alpine', '/ws/git.local.sothr.com/Sothr-Containers/alpine')],
    current: null,
  })
  const row = element<HTMLElement>('.store-row')
  expect(row.querySelector('.store-name')!.textContent).toBe('alpine')
  expect(row.dataset.store).toBe('git-local-sothr-com_Sothr-Containers_alpine')
  act(() => { element<HTMLButtonElement>('.store-open').click() })
  expect(onOpen).toHaveBeenCalledWith('git-local-sothr-com_Sothr-Containers_alpine')
})

it('narrows to the search and counts what is shown', () => {
  mount()
  expect(element('#storeCount').textContent).toBe('4 of 4')
  act(() => {
    const search = element<HTMLInputElement>('#storeSearch')
    search.value = 'two'
    search.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(rows()).toEqual(['two'])
  expect(element('#storeCount').textContent).toBe('1 of 4')
})

it('opens a store and marks a favorite', () => {
  const { onOpen, onFavorite } = mount()
  act(() => { element<HTMLButtonElement>('.store-row[data-store="two"] .store-open').click() })
  expect(onOpen).toHaveBeenCalledWith('two')

  const mark = element<HTMLButtonElement>('.store-row[data-store="one"] .store-favorite')
  expect(mark.getAttribute('aria-pressed')).toBe('false')
  act(() => { mark.click() })
  expect(onFavorite).toHaveBeenCalledWith('one', true)
})

it('is reachable by keyboard: focus lands in the search and Escape closes', () => {
  const { onClose } = mount()
  expect(document.activeElement).toBe(element('#storeSearch'))
  act(() => { element('#storeBrowser').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
  expect(onClose).toHaveBeenCalled()
  // Every row is a button, so the tab order is the reading order.
  expect(root.querySelectorAll('.store-open').length).toBe(stores.length)
})

it('offers a rescan only when the canvas has roots to search', () => {
  mount()
  expect(root.querySelector('#storeRescan')).toBeNull()
  const onRescan = vi.fn()
  mount({ onRescan })
  act(() => { element<HTMLButtonElement>('#storeRescan').click() })
  expect(onRescan).toHaveBeenCalled()
})

it('keeps the toolbar control compact whatever the store count', () => {
  const many = Array.from({ length: 22 }, (_, i) => store(`s${i}`, `/ws/org/s${i}`))
  const onOpen = vi.fn(), onBrowse = vi.fn()
  act(() => render(<StorePicker stores={many} current="s3" recent={['s7']} onOpen={onOpen} onBrowse={onBrowse} />, root))
  expect(element('#storePickerLabel').textContent).toBe('s3')
  // Two stores may display the same name; the id is what stays distinct.
  expect(root.querySelectorAll('.store-quick-item').length).toBeLessThanOrEqual(8)
  expect(element('#browseStores').textContent).toContain('22')
  act(() => { element<HTMLButtonElement>('#browseStores').click() })
  expect(onBrowse).toHaveBeenCalled()
})

it('returns focus to whatever opened it', () => {
  const opener = document.createElement('button')
  document.body.append(opener); opener.focus()
  mount()
  expect(document.activeElement).toBe(element('#storeSearch'))
  act(() => render(null, root))
  expect(document.activeElement).toBe(opener)
  opener.remove()
})
