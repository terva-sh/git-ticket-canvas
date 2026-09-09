/** Compare JSON values without depending on object key order or file revisions. */
export function sameJSON(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length
      && a.every((value, i) => sameJSON(value, b[i]))
  }
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length
    && keys.every(key => Object.hasOwn(right, key) && sameJSON(left[key], right[key]))
}

export function reuse<T>(previous: T, next: T): T {
  return sameJSON(previous, next) ? previous : next
}

/** Keep unchanged values and, when possible, the containing record itself. */
export function reconcileRecord<T>(previous: Record<string, T>, next: Record<string, T>): Record<string, T> {
  const entries = Object.entries(next).map(([key, value]) => [key,
    Object.hasOwn(previous, key) ? reuse(previous[key], value) : value] as const)
  return entries.length === Object.keys(previous).length && entries.every(([key, value]) => previous[key] === value)
    ? previous : Object.fromEntries(entries)
}

/** Preserve server ordering as well as the identity of each unchanged record. */
export function reconcileTickets<T extends { id: string }>(previous: Map<string, T>, next: T[]): Map<string, T> {
  const keys = [...previous.keys()]
  const entries = next.map(ticket => [ticket.id, reuse(previous.get(ticket.id), ticket)!] as const)
  return entries.length === previous.size && entries.every(([key, value], i) => keys[i] === key && previous.get(key) === value)
    ? previous : new Map(entries)
}
