import type { Board, BoardResponse, CreateRequest, DeleteResponse, ErrorBody, LayoutRequest, PatchRequest, Schema, TicketResponse } from './types'

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly body: ErrorBody) {
    super(body.message)
  }
  get code() { return this.body.code }
}

export class TicketClient {
  // Calling native fetch as a class property binds the wrong receiver in browsers.
  constructor(private readonly send: typeof fetch = (input, init) => fetch(input, init)) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.send(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
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

  board(name: string) { return this.request<BoardResponse>('GET', `/api/board?board=${encodeURIComponent(name)}`) }
  schema() { return this.request<Schema>('GET', '/api/schema') }
  create(body: CreateRequest) { return this.request<TicketResponse>('POST', '/api/tickets', body) }
  patch(id: string, body: PatchRequest) { return this.request<TicketResponse>('PATCH', `/api/tickets/${encodeURIComponent(id)}`, body) }
  layout(body: LayoutRequest) { return this.request<Board>('PUT', '/api/layout', body) }
  remove(id: string, board: string, revision: string, force = false) {
    const query = new URLSearchParams({ board, ifRevision: revision, force: String(force) })
    return this.request<DeleteResponse>('DELETE', `/api/tickets/${encodeURIComponent(id)}?${query}`)
  }
}
