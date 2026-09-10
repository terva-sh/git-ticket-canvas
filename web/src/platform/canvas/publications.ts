import { PlacementSnapshots, type BoardScope, type SnapshotResult } from './snapshots'
import type { MeasuredHeight, Obstacle, PlacementTicket } from './placement'
import type { Cards, Routing } from '../tickets/types'

export interface PublicationState extends Routing {
  board: string; storePath: string; layoutSchema: number | null
  tickets: ReadonlyMap<string, { id: string; createdAt: string; labels: readonly string[] }>
  cards: Cards
}
export interface Publication {
  readonly scope: BoardScope
  readonly baseline: string
  readonly identities: ReadonlyMap<string, string>
  readonly tickets: readonly PlacementTicket[]
  readonly routing: Routing
  readonly cards: Readonly<Cards>
}
export interface ReportRequest {
  readonly publication: Publication; readonly fence: number; readonly sequence: number
}
export interface CommittedSample {
  readonly token: ReportRequest
  readonly heights: ReadonlyMap<string, number>
  readonly registrations: ReadonlyMap<string, symbol>
}
function readonlyMap<K, V>(entries: Iterable<readonly [K, V]>): ReadonlyMap<K, V> {
  const data = new Map(entries)
  const result: ReadonlyMap<K, V> = {
    get size() { return data.size }, get: key => data.get(key), has: key => data.has(key),
    entries: () => data.entries(), keys: () => data.keys(), values: () => data.values(),
    [Symbol.iterator]: () => data[Symbol.iterator](),
    forEach(callback, thisArg) { data.forEach((value, key) => callback.call(thisArg, value, key, result)) },
  }
  return Object.freeze(result)
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

/** Opt-in diagnostic adapter. No position consumer or persistence capability. */
export class PublicationBridge {
  private readonly controller: PlacementSnapshots
  private readonly obstacles: readonly Obstacle[]
  private readonly onResult?: (result: SnapshotResult) => void
  private scope: BoardScope | null = null
  private storePath: string | null = null
  private board: string | null = null
  private appGeneration = -1
  private state: PublicationState | null = null
  private publication: Publication | null = null
  private observed = new Map<string, { birth: string; identity: string }>()
  private lifetime = 0
  private baseline = 0
  private revision = 0
  private fence = 0
  private sequence = 0
  private reported = 0
  private successful: { publication: Publication; key: string } | null = null
  private disposed = false
  private requests = new WeakSet<ReportRequest>()

  constructor(options: { controller?: PlacementSnapshots; obstacles: readonly Obstacle[]; onResult?: (result: SnapshotResult) => void }) {
    this.controller = options.controller ?? new PlacementSnapshots()
    this.obstacles = freeze(options.obstacles.map(obstacle => ({ ...obstacle })))
    this.onResult = options.onResult
  }
  get current(): Publication | null { return this.publication }
  publish(state: PublicationState, appGeneration: number): Publication | null {
    if (this.disposed) return null
    if (this.storePath !== state.storePath || this.board !== state.board || this.appGeneration !== appGeneration) {
      if (this.storePath !== state.storePath) this.observed.clear()
      this.storePath = state.storePath; this.board = state.board; this.appGeneration = appGeneration
      this.scope = this.controller.activate(state.board)
      this.state = null; this.publication = null; this.successful = null
      this.hold()
    }
    if (this.state === state) return this.publication
    this.state = state; this.publication = null; this.hold()
    if (state.layoutSchema === null) return null
    const observed = new Map<string, { birth: string; identity: string }>()
    const tickets = [...state.tickets.values()].map(ticket => {
      const prior = this.observed.get(ticket.id)
      const identity = prior?.birth === ticket.createdAt ? prior.identity : JSON.stringify([ticket.id, ticket.createdAt, ++this.lifetime])
      observed.set(ticket.id, { birth: ticket.createdAt, identity })
      return freeze({ id: ticket.id, identity, labels: [...ticket.labels] })
    })
    this.observed = observed
    const routing = freeze(structuredClone({ pens: state.pens, ruleOrder: state.ruleOrder, inbox: state.inbox }))
    this.publication = Object.freeze({ scope: this.scope!, baseline: `publication-${++this.baseline}`,
      identities: readonlyMap(tickets.map(ticket => [ticket.id, ticket.identity])), tickets: Object.freeze(tickets),
      routing, cards: freeze(structuredClone(state.cards)) })
    return this.publication
  }
  hold(): void { this.fence++ }
  request(publication: Publication | null): ReportRequest | null {
    if (this.disposed || !publication || publication !== this.publication) return null
    const request = Object.freeze({ publication, fence: this.fence, sequence: ++this.sequence })
    this.requests.add(request)
    return request
  }
  report(request: ReportRequest, sample: CommittedSample, ready: boolean): SnapshotResult | null {
    if (this.disposed || !ready || !this.requests.has(request) || request.publication !== this.publication
      || request.fence !== this.fence || request.sequence < this.reported || sample.token !== request) return null
    const publication = request.publication
    if (sample.registrations.size !== publication.identities.size
      || [...publication.identities.keys()].some(id => !sample.registrations.has(id))) return null
    this.reported = request.sequence
    const heights = new Map<string, MeasuredHeight>()
    for (const [id, identity] of publication.identities) {
      const height = sample.heights.get(id)
      if (height !== undefined && Number.isFinite(height) && height > 0) heights.set(id, { identity, height })
    }
    const key = JSON.stringify([...heights].sort(([a], [b]) => a.localeCompare(b)))
    if (this.successful?.publication === publication && this.successful.key === key) return null
    const result = this.controller.accept({ ...publication.scope, baseline: publication.baseline, revision: ++this.revision,
      tickets: publication.tickets, routing: publication.routing, cards: publication.cards,
      heights, previews: new Map(), obstacles: this.obstacles })
    this.successful = result.ok ? { publication, key } : null
    // A diagnostic observer cannot break the App publication/save path.
    try { this.onResult?.(result) } catch { /* Observer failures stay outside application state. */ }
    return result
  }
  dispose(): void { this.disposed = true; this.hold(); this.publication = null }
}
