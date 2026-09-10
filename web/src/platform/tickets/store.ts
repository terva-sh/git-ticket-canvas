import { ApiError, TicketClient } from './client'
import { reconcileRecord, reconcileTickets, reuse } from './reconcile'
import { emptyRouting, normalizeLayout, normalizeRouting } from './layout'
import type { SyncMetadata } from './sync'
import type { Board, CardChanges, Cards, CreateRequest, Frames, FrameTransaction, LayoutRequest, NormalizedBoard, Op, Routing, RoutingTransaction, Schema, Ticket } from './types'

function acceptedLayout(board: Board, name: string): NormalizedBoard {
  try { return normalizeLayout(board, name) } catch (error) {
    throw new ApiError(200, { code: 'invalid_response', message: error instanceof Error ? error.message : 'Invalid layout' })
  }
}

export interface PersistedState extends Routing {
  board: string; tickets: Map<string, Ticket>; cards: Cards; frames: Frames; boards: string[]
  config: Schema | null; storePath: string; readOnly: boolean; layoutSchema: number | null; captureToken: string | null
}
export class TicketStore {
  state: PersistedState = {
    captureToken: null, board: 'default', tickets: new Map(), cards: {}, frames: {}, ...emptyRouting(), boards: [], config: null, storePath: '', readOnly: false, layoutSchema: null,
  }
  sync: SyncMetadata | undefined
  onWriteSettled?: () => void
  private generation = 0
  private read = 0
  private epoch = 0
  private writes = 0
  private tail: Promise<unknown> = Promise.resolve()
  // Valid only for the current accepted board, never for an optimistic edit.
  private validator: string | undefined

  constructor(private readonly client: TicketClient) {}

  selectBoard(board: string) {
    if (board === this.state.board) return
    this.generation++
    this.read++
    this.validator = undefined
    this.sync = undefined
    this.state = { ...this.state, board, cards: {}, frames: {}, ...emptyRouting(), layoutSchema: null, captureToken: null }
  }

  async load(): Promise<boolean> {
    const read = ++this.read, epoch = this.epoch, generation = this.generation
    const board = this.state.board, validator = this.validator
    const current = () => read === this.read && epoch === this.epoch && generation === this.generation && !this.writes
    try {
      let result = await this.client.board(board, validator)
      if (!current()) return false
      if (result.status === 304) {
        if (validator) { this.sync = reuse(this.sync, result.sync); return false }
        // A proxy or inconsistent server may send 304 without a usable cache.
        // Retry once unconditionally; never loop or accept an empty board.
        result = await this.client.board(board)
        if (!current()) return false
        if (result.status === 304) throw new ApiError(304, { code: 'invalid_response', message: 'Server returned 304 without a cached board' })
      }
      const response = result.data
      const layout = acceptedLayout(response.layout, board)
      const previous = this.state, laidOut = this.withLayout(layout)
      const next: PersistedState = {
        ...laidOut, board, tickets: reconcileTickets(previous.tickets, response.tickets),
        boards: reuse(previous.boards, response.boards), config: reuse(previous.config, response.config),
        storePath: response.storePath, readOnly: response.readOnly, layoutSchema: response.layout.schema,
        captureToken: typeof response.captureToken === 'string' && response.captureToken.length > 0 ? response.captureToken : null,
      }
      this.sync = reuse(this.sync, result.sync)
      this.validator = result.etag || undefined
      if (laidOut === previous && next.tickets === previous.tickets && next.boards === previous.boards
        && next.config === previous.config && next.storePath === previous.storePath
        && next.readOnly === previous.readOnly && next.layoutSchema === previous.layoutSchema
        && next.captureToken === previous.captureToken) return false
      this.state = next
      return true
    } catch (error) {
      if (read !== this.read || epoch !== this.epoch || generation !== this.generation) return false
      throw error
    }
  }

  // Shared by every layout-bearing publication; unchanged routing entries retain identity.
  private withLayout(layout: NormalizedBoard): PersistedState {
    const previous = this.state
    const cards = reconcileRecord(previous.cards, layout.cards), frames = reconcileRecord(previous.frames, layout.frames)
    const pens = reconcileRecord(previous.pens, layout.pens)
    const ruleOrder = reuse(previous.ruleOrder, layout.ruleOrder), inbox = reuse(previous.inbox, layout.inbox)
    if (cards === previous.cards && frames === previous.frames && pens === previous.pens
      && ruleOrder === previous.ruleOrder && inbox === previous.inbox && layout.schema === previous.layoutSchema) return previous
    return { ...previous, cards, frames, pens, ruleOrder, inbox, layoutSchema: layout.schema }
  }

  // Serialize writes so two responses cannot regress an accepted mutation.
  // Invalidate reads on both sides, including reads started during a write.
  private write<T>(run: () => Promise<T>): Promise<T> {
    this.epoch++
    this.validator = undefined
    // A queued write may change any capture input, even when its response is partial.
    if (this.state.captureToken !== null) this.state = { ...this.state, captureToken: null }
    this.writes++
    const result = this.tail.then(run)
    const settled = result.finally(() => {
      this.epoch++; this.writes--; this.validator = undefined
      if (!this.writes) this.onWriteSettled?.()
    })
    this.tail = settled.catch(() => {})
    return settled
  }

  // An invalidation received during a mutation must read after the mutation,
  // not consume its only notification with a read that the epoch guard rejects.
  async whenIdle(): Promise<void> {
    while (this.writes) await this.tail
  }

  async patch(id: string, ops: Op[], revision: string) {
    const generation = this.generation
    try {
      return await this.write(async () => {
        const response = await this.client.patch(id, { ifRevision: revision, ops })
        if (generation === this.generation) {
          const accepted = reuse(this.state.tickets.get(response.ticket.id), response.ticket)!
          if (accepted !== this.state.tickets.get(response.ticket.id)) {
            const tickets = new Map(this.state.tickets)
            tickets.set(response.ticket.id, accepted)
            this.state = { ...this.state, tickets }
          }
        }
        return response.ticket
      })
    } catch (error) {
      // Batches can fail after applying earlier ops. Reload those and stale
      // revisions once, never retry the edit. Preserve the mutation error even if
      // the reload fails, so the caller cannot mistake this for a saved edit.
      if (ops.length > 1 || error instanceof ApiError && error.code === 'stale_revision') await this.load().catch(() => false)
      throw error
    }
  }

  create(request: CreateRequest) {
    const generation = this.generation
    const body = { ...request, board: request.board || this.state.board }
    return this.write(async () => {
      const response = await this.client.create(body)
      const layout = response.layout ? acceptedLayout(response.layout, body.board) : undefined
      if (generation === this.generation && body.board === this.state.board) {
        const tickets = new Map(this.state.tickets)
        tickets.set(response.ticket.id, response.ticket)
        this.state = { ...(layout ? this.withLayout(layout) : this.state), tickets }
      }
      return layout ? { ...response, layout } : response
    })
  }

  saveLayout(board: string, cards: CardChanges) {
    return this.saveBoardLayout({ board, cards })
  }

  /** Commit one frame operation without debounce, in the ordinary mutation queue.
   * The caller records history only after success and against the returned Board.
   * layout_conflict reloads the active generation but never retries the operation.
   */
  async saveFrameLayout(board: string, transaction: FrameTransaction) {
    return this.saveTransaction(board, transaction)
  }

  /** Whole-routing CAS, optionally atomic with card and frame edits. No placement
   * is derived here and this method never writes ticket labels or frame history.
   */
  async saveRoutingLayout(board: string, transaction: RoutingTransaction) {
    try {
      normalizeRouting(transaction.routing)
      normalizeRouting(transaction.expect.routing)
    } catch (error) {
      throw new ApiError(422, { code: 'invalid_layout', message: error instanceof Error ? error.message : 'Invalid routing' })
    }
    return this.saveTransaction(board, transaction)
  }

  private async saveTransaction(board: string, transaction: FrameTransaction | RoutingTransaction) {
    if (this.state.readOnly) throw new ApiError(403, { code: 'read_only', message: 'Store is read-only' })
    for (const kind of ['cards', 'frames'] as const) {
      for (const id of Object.keys(transaction[kind])) {
        if (!Object.hasOwn(transaction.expect[kind], id)) {
          throw new ApiError(422, { code: 'invalid_layout', message: `Missing ${kind} preimage for ${id}` })
        }
      }
    }
    const generation = this.generation
    try {
      // Do not forward FrameOperation.label or other client-only metadata.
      const request = { board, cards: transaction.cards, frames: transaction.frames,
        ...(Object.hasOwn(transaction, 'capture') ? { capture: transaction.capture } : {}) }
      return await this.saveBoardLayout('routing' in transaction
        ? { ...request, routing: transaction.routing, expect: transaction.expect }
        : { ...request, expect: transaction.expect })
    } catch (error) {
      if (generation === this.generation && board === this.state.board && error instanceof ApiError && error.code === 'layout_conflict') {
        // A queued ticket-only write cannot refresh routing. Reading before it
        // settles would discard this recovery read through the write-epoch guard.
        await this.whenIdle()
        if (generation === this.generation && board === this.state.board) await this.load().catch(() => false)
      }
      throw error
    }
  }

  private saveBoardLayout(request: LayoutRequest) {
    const generation = this.generation, body = structuredClone(request)
    return this.write(async () => {
      if ((body.frames || body.routing) && this.state.readOnly) throw new ApiError(403, { code: 'read_only', message: 'Store is read-only' })
      const response = acceptedLayout(await this.client.layout(body), body.board)
      if (generation === this.generation && body.board === this.state.board) this.state = this.withLayout(response)
      return response
    })
  }

  remove(id: string, revision: string, force = false) {
    const generation = this.generation, board = this.state.board
    return this.write(async () => {
      const response = await this.client.remove(id, board, revision, force)
      if (generation === this.generation) {
        const tickets = new Map(this.state.tickets)
        tickets.delete(response.removed)
        const cards = { ...this.state.cards }
        let frames = this.state.frames
        if (!response.layoutError) {
          delete cards[response.removed]
          frames = reconcileRecord(frames, Object.fromEntries(Object.entries(frames).map(([id, frame]) =>
            [id, frame.members.includes(response.removed)
              ? { ...frame, members: frame.members.filter(member => member !== response.removed) } : frame])))
        }
        this.state = { ...this.state, tickets, cards, frames }
      }
      return response
    })
  }
}

// Debounce independently by board. Capture the board and copy geometry when
// enqueued, not when the timer fires. New edits during a request get a new batch.
export class LayoutWriter {
  private pending = new Map<string, {
    cards: CardChanges; timer?: ReturnType<typeof setTimeout>
    waiters: { resolve: () => void; reject: (error: unknown) => void }[]
  }>()
  constructor(private readonly save: (board: string, cards: CardChanges) => Promise<unknown>, private readonly delay = 200) {}

  enqueue(board: string, cards: CardChanges): Promise<void> {
    let batch = this.pending.get(board)
    if (!batch) {
      batch = { cards: {}, waiters: [] }
      this.pending.set(board, batch)
    }
    clearTimeout(batch.timer)
    Object.assign(batch.cards, structuredClone(cards))
    const promise = new Promise<void>((resolve, reject) => batch!.waiters.push({ resolve, reject }))
    batch.timer = setTimeout(() => {
      this.pending.delete(board)
      const current = batch!
      Promise.resolve().then(() => this.save(board, current.cards)).then(
        () => current.waiters.forEach(w => w.resolve()),
        error => current.waiters.forEach(w => w.reject(error)),
      )
    }, this.delay)
    return promise
  }
}
