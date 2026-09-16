import { syncHeaders, type SyncMetadata } from './sync'
import type { ActorResponse, Board, PeopleResponse, BoardResponse, CreateRequest, DeleteResponse, ErrorBody, FavoritesResponse, LayoutRequest, PatchRequest, RescanResponse, Schema, SessionResponse, StoresResponse, TicketResponse, VersionInfo } from './types'

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly body: ErrorBody) {
    super(body.message)
  }
  get code() { return this.body.code }
}

/** HTTP read outcome, distinct from the board's wire representation. */
export type BoardRead = (
  | { status: 200; data: BoardResponse; etag: string | null }
  | { status: 304 }
) & { sync?: SyncMetadata }

/** The API prefix for one store. Every request the canvas makes is scoped. */
export function storeBase(store: string) {
  return `/api/stores/${encodeURIComponent(store)}`
}

export class TicketClient {
  // Calling native fetch as a class property binds the wrong receiver in browsers.
  // `base` is the store's own prefix: one canvas talks to one store, and
  // switching stores builds a new client rather than repointing this one, so a
  // request already in flight can never be mistaken for the next store's.
  constructor(
    private readonly send: typeof fetch = (input, init) => fetch(input, init),
    readonly base = '/api',
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.send(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return this.decode<T>(response)
  }

  private async decode<T>(response: Response): Promise<T> {
    const text = await response.text()
    let data: unknown
    try { data = text ? JSON.parse(text) : null } catch {
      throw new ApiError(response.status, { code: 'invalid_response', message: 'Server returned invalid JSON' })
    }
    if (!response.ok) {
      const error = data as Partial<ErrorBody> | null
      throw new ApiError(response.status, {
        ...error, code: error?.code || 'http_error', message: error?.message || response.statusText,
      })
    }
    if (data === null) throw new ApiError(response.status, { code: 'invalid_response', message: 'Server returned an empty response' })
    // A 207 is a completed ticket write with failed placement. Preserve both
    // the ticket result and layoutError; retrying creation would duplicate it.
    return data as T
  }

  async board(name: string, etag?: string): Promise<BoardRead> {
    // The store owns validators. Do not let the browser merge a cached body
    // into a 304 or reuse a response after a local mutation or board switch.
    const response = await this.send(`${this.base}/board?board=${encodeURIComponent(name)}`, {
      method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(10000),
      headers: etag ? { 'If-None-Match': etag } : undefined,
    })
    const sync = syncHeaders(response.headers), metadata = sync ? { sync } : {}
    if (response.status === 304) return { status: 304, ...metadata }
    return { status: 200, data: await this.decode<BoardResponse>(response), etag: response.headers.get('ETag'), ...metadata }
  }
  schema() { return this.request<Schema>('GET', `${this.base}/schema`) }
  version() { return this.request<VersionInfo>('GET', `${this.base}/version`) }
  create(body: CreateRequest) { return this.request<TicketResponse>('POST', `${this.base}/tickets`, body) }
  patch(id: string, body: PatchRequest) { return this.request<TicketResponse>('PATCH', `${this.base}/tickets/${encodeURIComponent(id)}`, body) }
  layout(body: LayoutRequest) { return this.request<Board>('PUT', `${this.base}/layout`, body) }
  remove(id: string, board: string, revision: string, force = false) {
    const query = new URLSearchParams({ board, ifRevision: revision, force: String(force) })
    return this.request<DeleteResponse>('DELETE', `${this.base}/tickets/${encodeURIComponent(id)}?${query}`)
  }
  /** The event stream for this store. */
  get events() { return `${this.base}/events` }
}

/** The stores this canvas serves, and which of them are favorites. */
export class RegistryClient {
  constructor(private readonly send: typeof fetch = (input, init) => fetch(input, init)) {}

  private async read<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.send(path, { cache: 'no-store', ...init })
    const text = await response.text()
    let data: unknown
    try { data = text ? JSON.parse(text) : null } catch {
      throw new ApiError(response.status, { code: 'invalid_response', message: 'Server returned invalid JSON' })
    }
    if (!response.ok) {
      const error = data as Partial<ErrorBody> | null
      throw new ApiError(response.status, {
        ...error, code: error?.code || 'http_error', message: error?.message || response.statusText,
      })
    }
    return data as T
  }

  stores() { return this.read<StoresResponse>('/api/stores') }
  version() { return this.read<VersionInfo>('/api/version') }
  favorites() { return this.read<FavoritesResponse>('/api/favorites') }
  setFavorite(store: string, favorite: boolean) {
    return this.read<FavoritesResponse>('/api/favorites', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ store, favorite }),
    })
  }
  rescan() { return this.read<RescanResponse>('/api/stores/rescan', { method: 'POST' }) }
  session() { return this.read<SessionResponse>('/api/session') }
  people() { return this.read<PeopleResponse>('/api/people') }
  actor(store: string) {
    return this.read<ActorResponse>(`/api/stores/${encodeURIComponent(store)}/actor`)
  }
  setActor(store: string, actor: string) {
    return this.read<ActorResponse>(`/api/stores/${encodeURIComponent(store)}/actor`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actor }),
    })
  }
}
