import { invalidation, type SyncMetadata } from './sync'

export interface LiveStatus {
  connection: 'connecting' | 'live' | 'polling'
  stale: boolean
  degraded: boolean
  readFailed: boolean
}
type Stream = Pick<EventSource, 'onopen' | 'onmessage' | 'onerror' | 'close'>
interface Options {
  read: () => Promise<SyncMetadata | undefined>
  board: () => string
  status: (status: LiveStatus) => void
  connect?: () => Stream
}

/** Notifications request authoritative reads; they never modify the board. */
export class LiveUpdates {
  private stopped = true
  private source?: Stream
  private pending = false
  private reading = false
  private queued?: ReturnType<typeof setTimeout>
  private poll?: ReturnType<typeof setTimeout>
  private pollDelay = 0
  private reconnect?: ReturnType<typeof setTimeout>
  private opening?: ReturnType<typeof setTimeout>
  private readRetry?: ReturnType<typeof setTimeout>
  private reconnectDelay = 1000
  private readDelay = 1000
  private wanted?: SyncMetadata
  private status: LiveStatus = { connection: 'connecting', stale: false, degraded: false, readFailed: false }

  constructor(private readonly options: Options) {}

  start() {
    if (!this.stopped) return
    this.stopped = false
    this.open()
    this.request()
    this.schedulePoll()
  }

  stop() {
    this.stopped = true
    this.source?.close(); this.source = undefined
    clearTimeout(this.queued); clearTimeout(this.poll); clearTimeout(this.reconnect)
    clearTimeout(this.opening); clearTimeout(this.readRetry)
    this.pending = false
  }

  /** Coalesce bursts and retain one follow-up when a read is already in flight. */
  request() {
    if (this.stopped) return
    this.pending = true
    if (this.reading || this.queued !== undefined) return
    this.queued = setTimeout(() => { this.queued = undefined; void this.drain() }, 0)
  }

  private update(change: Partial<LiveStatus>) {
    const next = { ...this.status, ...change }
    if (Object.keys(next).every(key => next[key as keyof LiveStatus] === this.status[key as keyof LiveStatus])) return
    this.status = next
    if (!this.stopped) this.options.status(next)
  }

  private schedulePoll() {
    const healthy = this.status.connection === 'live' && !this.status.degraded && !this.status.stale
    const delay = healthy ? 60000 : 12000
    // Repeated events and failed reconnects must not postpone the safety clock.
    if (this.poll !== undefined && this.pollDelay === delay) return
    clearTimeout(this.poll)
    this.pollDelay = delay
    this.poll = setTimeout(() => {
      this.poll = undefined; this.request(); this.schedulePoll()
    }, delay)
  }

  private open() {
    if (this.stopped) return
    try {
      const source = this.options.connect ? this.options.connect() : new EventSource('/api/events')
      this.source = source
      let first = true
      // Headers alone do not establish synchronization. Wait for a valid message.
      this.opening = setTimeout(() => this.disconnected(source), 10000)
      source.onopen = () => {}
      source.onmessage = event => {
        if (this.stopped || this.source !== source) return
        const message = invalidation(event.data)
        if (!message) { this.disconnected(source); return }
        clearTimeout(this.opening)
        this.reconnectDelay = 1000
        const previous = this.wanted
        if (!first && previous?.epoch === message.epoch && previous.generation > message.generation) return
        const initial = first; first = false
        this.wanted = message
        this.update({ connection: 'live', stale: message.stale, degraded: message.degraded })
        this.schedulePoll()
        const changed = previous?.epoch !== message.epoch || previous.generation !== message.generation
          || previous.stale !== message.stale || previous.degraded !== message.degraded
        const gap = previous?.epoch === message.epoch && message.generation > previous.generation + 1
        const relevant = message.scopes.some(scope => scope === 'tickets' || scope === 'config'
          || scope === 'boards' || scope === `layout:${this.options.board()}`)
        if (initial || changed && (relevant || gap || !previous || previous.epoch !== message.epoch
          || previous.stale !== message.stale || previous.degraded !== message.degraded)) this.request()
      }
      source.onerror = () => this.disconnected(source)
    } catch { this.disconnected() }
  }

  private disconnected(source?: Stream) {
    if (this.stopped || source && source !== this.source) return
    this.source?.close(); this.source = undefined
    clearTimeout(this.opening)
    this.update({ connection: 'polling' })
    this.schedulePoll()
    if (this.reconnect !== undefined) return
    this.reconnect = setTimeout(() => { this.reconnect = undefined; this.open() }, this.reconnectDelay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 12000)
  }

  private retryRead() {
    if (this.readRetry !== undefined || this.stopped) return
    this.readRetry = setTimeout(() => { this.readRetry = undefined; this.request() }, this.readDelay)
    this.readDelay = Math.min(this.readDelay * 2, 12000)
  }

  private async drain() {
    if (this.stopped || !this.pending || this.reading) return
    this.pending = false; this.reading = true
    try {
      const accepted = await this.options.read()
      if (this.stopped) return
      this.update({ readFailed: false })
      if (accepted) {
        const wanted = this.wanted
        if (wanted && accepted.epoch !== wanted.epoch) {
          // A request reached a restarted server while the old stream was open.
          this.wanted = undefined
          this.disconnected(this.source)
          this.retryRead()
        } else if (wanted && accepted.generation < wanted.generation) {
          this.retryRead()
        } else {
          clearTimeout(this.readRetry); this.readRetry = undefined; this.readDelay = 1000
          this.update({ stale: accepted.stale, degraded: accepted.degraded })
          this.schedulePoll()
        }
      }
    } catch {
      if (!this.stopped) { this.update({ readFailed: true }); this.retryRead() }
    } finally {
      this.reading = false
      if (!this.stopped && this.pending) this.request()
    }
  }
}
