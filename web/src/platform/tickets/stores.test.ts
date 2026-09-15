import { expect, it } from 'vitest'
import { displayPath, groupStores, shortList } from './stores'
import type { StoreSummary } from './types'

function store(name: string, path: string, extra: Partial<StoreSummary> = {}): StoreSummary {
  return { name, display: path.split('/').pop()!, path: `${path}/.tickets`,
    available: true, active: false, favorite: false, readOnly: false, ...extra }
}
const workspace = '/ws'
function labels(groups: ReturnType<typeof groupStores>) { return groups.map(group => group.label) }
function names(groups: ReturnType<typeof groupStores>) {
  return groups.flatMap(group => group.stores.map(node => node.store.name))
}

it('shows the directory holding the store, not the store directory', () => {
  expect(displayPath('/ws/project/.tickets')).toBe('/ws/project')
  expect(displayPath('/ws/project')).toBe('/ws/project')
})

// Sixteen sibling repositories under forge/org become one heading and sixteen
// rows, which is the whole reason the view exists.
it('groups by root and then by the leading path', () => {
  const groups = groupStores([
    store('a', '/ws/forge/org/one', { root: workspace }),
    store('b', '/ws/forge/org/two', { root: workspace }),
    store('c', '/ws/other/repo', { root: workspace }),
  ])
  expect(labels(groups)).toEqual(['/ws/forge/org', '/ws/other'])
  expect(groups[0].stores.map(node => node.store.name)).toEqual(['a', 'b'])
})

it('puts favorites first, under their own heading', () => {
  const groups = groupStores([
    store('plain', '/ws/one', { root: workspace }),
    store('kept', '/ws/two', { root: workspace, favorite: true }),
  ])
  expect(labels(groups)).toEqual(['Favorites', '/ws'])
  expect(names(groups)).toEqual(['kept', 'plain'])
})

it('renders a declared child under its parent', () => {
  const groups = groupStores([
    store('project', '/ws/project', { root: workspace }),
    store('project_fixture', '/ws/project/docs/fixture', { root: workspace, parent: 'project' }),
  ])
  expect(labels(groups)).toEqual(['/ws'])
  expect(groups[0].stores).toHaveLength(1)
  expect(groups[0].stores[0].children.map(node => node.store.name)).toEqual(['project_fixture'])
})

// A search that hides a match is worse than one that shows it in an unexpected
// place, so a child whose parent was filtered out gets a row of its own.
it('promotes a child whose parent the search removed', () => {
  const groups = groupStores([
    store('project', '/ws/project', { root: workspace }),
    store('fixture', '/ws/project/docs/fixture', { root: workspace, parent: 'project' }),
  ], 'fixture')
  expect(names(groups)).toEqual(['fixture'])
  expect(groups[0].stores[0].children).toEqual([])
})

it('searches the name and the path', () => {
  const stores = [store('alpha', '/ws/one/repo', { root: workspace }), store('beta', '/ws/two/thing', { root: workspace })]
  expect(names(groupStores(stores, 'ALPHA'))).toEqual(['alpha'])
  expect(names(groupStores(stores, 'two/'))).toEqual(['beta'])
  expect(groupStores(stores, 'nothing')).toEqual([])
})

// An unavailable store is the one somebody most needs to see.
it('keeps an unavailable store in the list', () => {
  const groups = groupStores([store('gone', '/ws/gone', { root: workspace, available: false, reason: 'no store there' })])
  expect(names(groups)).toEqual(['gone'])
  expect(groups[0].stores[0].store.reason).toBe('no store there')
})

it('handles a store whose root is not a prefix of its path', () => {
  const groups = groupStores([store('odd', '/elsewhere/repo', { root: workspace })])
  expect(labels(groups)).toEqual(['/ws//elsewhere'])
  expect(names(groups)).toEqual(['odd'])
})

it('keeps two roots with the same leading segments apart', () => {
  const groups = groupStores([
    store('one', '/a/org/repo', { root: '/a' }),
    store('two', '/b/org/repo', { root: '/b' }),
  ])
  expect(labels(groups)).toEqual(['/a/org', '/b/org'])
})

it('files a store nobody rooted under its own heading', () => {
  expect(labels(groupStores([store('named', '/somewhere/else')]))).toEqual(['Named on the command line'])
})

it('offers the current store, then favorites, then what was looked at', () => {
  const stores = [
    store('current', '/ws/a', { root: workspace }),
    store('kept', '/ws/b', { root: workspace, favorite: true }),
    store('seen', '/ws/c', { root: workspace }),
    store('never', '/ws/d', { root: workspace }),
  ]
  expect(shortList(stores, 'current', ['seen']).map(s => s.name)).toEqual(['current', 'kept', 'seen'])
  expect(shortList(stores, null, [], 2).map(s => s.name)).toEqual(['kept'])
})

// Once ids are hashed, the name on the row is the only thing a person can type.
it('searches the display name, not only the id and the path', () => {
  const stores = [
    store('a1b2c3d4', '/ws/org/alpine', { display: 'alpine' }),
    store('e5f6a7b8', '/ws/org/buildah', { display: 'buildah' }),
  ]
  expect(names(groupStores(stores, 'alpine'))).toEqual(['a1b2c3d4'])
  expect(names(groupStores(stores, 'e5f6'))).toEqual(['e5f6a7b8'])
})

