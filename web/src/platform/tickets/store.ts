import { ApiError, TicketClient } from './client'
import { reconcileRecord, reconcileTickets, reuse } from './reconcile'
import type { SyncMetadata } from './sync'
import type { CardChanges, Cards, CreateRequest, Op, Schema, Ticket } from './types'

export interface PersistedState {
  board: string; tickets: Map<string, Ticket>; cards: Cards; boards: string[]
  config: Schema | null; storePath: string; readOnly: boolean; layoutSchema: number | null
}
export class TicketStore {
  state: PersistedState = {
    board: 'default', tickets: new Map(), cards: {}, boards: [], config: null, storePath: '', readOnly: false, layoutSchema: null,
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
    this.state = { ...this.state, board, cards: {}, layoutSchema: null }
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
      if (response.layout.board !== board) throw new ApiError(200, { code: 'invalid_response', message: 'Server returned another board' })
      const previous = this.state
      const next: PersistedState = {
        board, tickets: reconcileTickets(previous.tickets, response.tickets),
        cards: reconcileRecord(previous.cards, response.layout.cards),
        boards: reuse(previous.boards, response.boards), config: reuse(previous.config, response.config),
        storePath: response.storePath, readOnly: response.readOnly, layoutSchema: response.layout.schema,
      }
      this.sync = reuse(this.sync, result.sync)
      this.validator = result.etag || undefined
      if (next.tickets === previous.tickets && next.cards === previous.cards && next.boards === previous.boards
        && next.config === previous.config && next.storePath === previous.storePath
        && next.readOnly === previous.readOnly && next.layoutSchema === previous.layoutSchema) return false
      this.state = next
      return true
    } catch (error) {
      if (read !== this.read || epoch !== this.epoch || generation !== this.generation) return false
      throw error
    }
  }

  // Serialize writes so two responses cannot regress an accepted mutation.
  // Invalidate reads on both sides, including reads started during a write.
  private write<T>(run: () => Promise<T>): Promise<T> {
    this.epoch++
    this.validator = undefined
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
      if (generation === this.generation && body.board === this.state.board) {
        const tickets = new Map(this.state.tickets)
        tickets.set(response.ticket.id, response.ticket)
        this.state = { ...this.state, tickets,
          cards: response.layout ? reconcileRecord(this.state.cards, response.layout.cards) : this.state.cards,
          layoutSchema: response.layout?.schema ?? this.state.layoutSchema }
      }
      return response
    })
  }

  saveLayout(board: string, cards: CardChanges) {
    const generation = this.generation
    const body = { board, cards: structuredClone(cards) }
    return this.write(async () => {
      const response = await this.client.layout(body)
      if (generation === this.generation && board === this.state.board) {
        const cards = reconcileRecord(this.state.cards, response.cards)
        if (cards !== this.state.cards || response.schema !== this.state.layoutSchema) {
          this.state = { ...this.state, cards, layoutSchema: response.schema }
        }
      }
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
        if (!response.layoutError) delete cards[response.removed]
        this.state = { ...this.state, tickets, cards }
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
