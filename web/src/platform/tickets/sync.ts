/** Server synchronization metadata is separate from ticket and layout identity. */
export interface SyncMetadata {
  epoch: string
  generation: number
  stale: boolean
  degraded: boolean
}
export interface Invalidation extends SyncMetadata { scopes: string[] }

export function syncHeaders(headers: Headers): SyncMetadata | undefined {
  const epoch = headers.get('X-Canvas-Epoch'), raw = headers.get('X-Canvas-Generation')
  const stale = headers.get('X-Canvas-Stale'), degraded = headers.get('X-Canvas-Degraded')
  if (!epoch || !raw || !/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))
    || !['true', 'false'].includes(stale || '') || !['true', 'false'].includes(degraded || '')) return undefined
  return { epoch, generation: Number(raw), stale: stale === 'true', degraded: degraded === 'true' }
}

export function invalidation(data: string): Invalidation | undefined {
  try {
    const value: unknown = JSON.parse(data)
    if (!value || typeof value !== 'object') return
    const v = value as Record<string, unknown>
    if (typeof v.epoch !== 'string' || !v.epoch || typeof v.generation !== 'number'
      || !Number.isSafeInteger(v.generation) || v.generation < 0
      || typeof v.stale !== 'boolean' || typeof v.degraded !== 'boolean'
      || !Array.isArray(v.scopes) || !v.scopes.every(s => typeof s === 'string')) return
    return v as unknown as Invalidation
  } catch { return undefined }
}
