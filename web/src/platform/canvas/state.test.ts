import { expect, it } from 'vitest'
import { createCanvasState } from './state'
import { TicketStore } from '../tickets/store'
import { TicketClient } from '../tickets/client'

it('isolates viewport, selection, previews and filters from persisted state and other canvases', () => {
  const a = createCanvasState(), b = createCanvasState(), store = new TicketStore(new TicketClient())
  a.view.x = 999; a.selection.add('TKT-1'); a.previews['TKT-1'] = { x: 10, y: 20 }
  a.statusFilter.add('draft'); a.auto.set('TKT-1', { x: 1, y: 2 })
  expect(b).toEqual(createCanvasState())
  expect(store.state.cards).toEqual({}); expect(store.state.tickets.size).toBe(0)
  expect(store.state).not.toHaveProperty('view'); expect(store.state).not.toHaveProperty('selection')
})
