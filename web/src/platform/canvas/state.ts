import type { Cards } from '../tickets/types'

// Local UI data is never folded into persisted ticket/layout responses.
// The legacy renderer owns DOM elements and form controls outside this object.
export interface CanvasState {
  view: { x: number; y: number; k: number }
  selection: Set<string>; selected: string | null; query: string; statusFilter: Set<string>
  auto: Map<string, { x: number; y: number }>; previews: Cards
}
export interface EditDraft { ticket: string; revision: string; field: string; value: string }
export function createCanvasState(): CanvasState {
  return {
    view: { x: 120, y: 90, k: 1 }, selection: new Set(), selected: null,
    query: '', statusFilter: new Set(), auto: new Map(), previews: {},
  }
}
