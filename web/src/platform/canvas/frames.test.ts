import { describe, expect, it } from 'vitest'
import {
  applyFrameOperation, assertFrameOperation, captureMembers, createFrame, deleteFrame, FrameHistory,
  inverseFrameOperation, moveFrame, resizeFrame, setMembership, updateFrame,
  type Frame, type FrameOperation, type FrameState,
} from './frames'

const frame = (members: string[] = ['a', 'hidden']): Frame => ({ title: 'Work', x: 0, y: 0, w: 100, h: 100, color: 'slate', members })
function initial(): FrameState {
  return { cards: { a: { x: 5, y: 10, w: 42, z: 8, collapsed: true }, other: { x: 4, y: 5 } },
    frames: { f: frame(), g: frame(['other']) }, tickets: new Set(['a', 'hidden', 'other', 'free']) }
}
const positions = () => new Map([['a', { x: 5, y: 10 }], ['hidden', { x: 500, y: 900 }]])
function moved() {
  const before = initial(), op = moveFrame(before, 'f', 100, -20, positions())!
  const state = applyFrameOperation(before, op), history = new FrameHistory()
  history.record(op, state)
  return { before, op, state, history }
}
function perform(history: FrameHistory, state: FrameState, op: FrameOperation) {
  const next = applyFrameOperation(state, op)
  history.record(op, next)
  return next
}
function reverse(history: FrameHistory, state: FrameState, redo = false) {
  const op = redo ? history.redo(state) : history.undo(state)
  const next = applyFrameOperation(state, op)
  if (redo) history.acceptRedo(op, next)
  else history.acceptUndo(op, next)
  return next
}

describe('Pure frame operations', () => {
  it('normalizes submitted geometry before recording history to match persisted coordinates', () => {
    const state = initial()
    const op = createFrame(state, 'decimal', { ...frame([]), x: -1.235, y: 2.345, w: 100.123, h: 200.456 })
    expect(op.frames.decimal).toMatchObject({ x: -1.24, y: 2.35, w: 100.12, h: 200.46 })
    const accepted = applyFrameOperation(state, op), history = new FrameHistory()
    expect(() => history.record(op, accepted)).not.toThrow()
    expect(reverse(history, accepted)).toEqual(state)
  })
  it('allows cleaning dangling memberships and editing unrelated frames without restoring missing tickets', () => {
    const state = initial()
    state.frames.dangling = frame(['deleted'])
    expect(() => applyFrameOperation(state, updateFrame(state, 'f', { title: 'Renamed' })!)).not.toThrow()
    const cleanup = setMembership(state, ['deleted'], null)!
    expect(applyFrameOperation(state, cleanup).frames.dangling.members).toEqual([])
    expect(() => applyFrameOperation(state, updateFrame(state, 'dangling', { title: 'No cleanup' })!)).toThrow('no longer exists')
  })
  it('captures centers including hidden cards, boundaries and overlap without stealing membership', () => {
    const bounds = { x: 0, y: 0, w: 100, h: 100 }
    const cards = [
      { id: 'a', x: 10, y: 10, w: 20, h: 20 },
      { id: 'hidden', x: 90, y: 90, w: 20, h: 20 },
      { id: 'free', x: -10, y: -10, w: 20, h: 20 },
      { id: 'outside', x: 99, y: 99, w: 20, h: 20 },
    ]
    expect(captureMembers({ old: frame(['a']) }, bounds, cards)).toEqual(['free', 'hidden'])
    const state = { ...initial(), frames: { old: frame(['a']) } }
    const op = createFrame(state, 'new', frame(captureMembers(state.frames, bounds, cards)))
    expect(op.cards).toEqual({}); expect(op.expect.cards).toEqual({})
    expect(op.expect.frames).toEqual({ old: state.frames.old, new: null })
    expect(applyFrameOperation(state, op).cards).toEqual(state.cards)
    expect(() => createFrame(state, 'steal', frame(['a']))).toThrow('already belongs')
    expect(() => createFrame(state, 'old', frame([]))).toThrow('already exists')
  })
  it('moves every explicit member, including hidden and outside cards, preserving metadata and null preimages', () => {
    const { before, op, state } = moved()
    expect(op.cards).toEqual({ a: { x: 105, y: -10, w: 42, z: 8, collapsed: true }, hidden: { x: 600, y: 880 } })
    expect(op.expect.cards).toEqual({ a: before.cards.a, hidden: null })
    expect(op.expect.frames).toEqual({ f: before.frames.f })
    expect(state.frames.f).toEqual({ ...before.frames.f, x: 100, y: -20 })
    expect(state.frames.f.members).toEqual(['a', 'hidden'])
    expect(state.cards.other).toBe(before.cards.other)
    expect(state.tickets).toBe(before.tickets)
    expect(before.cards.hidden).toBeUndefined()
    expect(applyFrameOperation(state, inverseFrameOperation(op))).toEqual(before)
  })
  it('requires all positions and refuses stale manual positions and missing tickets', () => {
    expect(() => moveFrame(initial(), 'f', 1, 2, new Map())).toThrow('Position for ticket a')
    const stale = positions(); stale.set('a', { x: 9, y: 10 })
    expect(() => moveFrame(initial(), 'f', 1, 2, stale)).toThrow('changed')
    const state = initial(); state.tickets = new Set(['a', 'other'])
    expect(() => moveFrame(state, 'f', 1, 2, positions())).toThrow('hidden no longer exists')
    expect(() => createFrame(state, 'new', frame(['gone']))).toThrow('gone no longer exists')
    expect(() => moveFrame(initial(), 'f', Infinity, 0, positions())).toThrow('finite')
  })
  it('resizes, edits, removes membership and deletes without moving cards', () => {
    const state = initial()
    const resize = resizeFrame(state, 'f', { x: -30, y: -20, w: 20, h: 40 })!
    expect(resize.cards).toEqual({}); expect(resize.frames.f?.members).toEqual(['a', 'hidden'])
    const edit = updateFrame(state, 'f', { title: 'New', color: 'sand' })!
    expect(edit.frames.f).toEqual({ ...state.frames.f, title: 'New', color: 'sand' })
    const remove = setMembership(state, ['a'], null)!
    expect(remove.cards).toEqual({}); expect(remove.frames.f?.members).toEqual(['hidden'])
    const deletion = deleteFrame(state, 'f')
    expect(deletion).toMatchObject({ cards: {}, frames: { f: null }, expect: { frames: { f: state.frames.f } } })
    const deleted = applyFrameOperation(state, deletion)
    expect(deleted.cards).toEqual(state.cards); expect(deleted.tickets).toBe(state.tickets)
    expect(applyFrameOperation(deleted, inverseFrameOperation(deletion))).toEqual(state)
  })
  it('transfers atomically with source and destination ownership guards', () => {
    const state = initial(), op = setMembership(state, ['a', 'hidden'], 'g')!
    expect(op.cards).toEqual({})
    expect(op.frames.f?.members).toEqual([])
    expect(op.frames.g?.members).toEqual(['a', 'hidden', 'other'])
    expect(op.expect.frames).toEqual(state.frames)
    expect(() => applyFrameOperation({ ...state, frames: { ...state.frames, g: frame([]) } }, op)).toThrow('Frame g changed')
    const next = applyFrameOperation(state, op)
    expect(applyFrameOperation(next, inverseFrameOperation(op))).toEqual(state)
  })
  it('returns null for no-ops and snapshots mutable inputs', () => {
    const state = initial()
    expect(moveFrame(state, 'f', 0, 0, positions())).toBeNull()
    expect(resizeFrame(state, 'f', state.frames.f)).toBeNull()
    expect(updateFrame(state, 'f', { title: 'Work' })).toBeNull()
    expect(setMembership(state, ['hidden', 'a'], 'f')).toBeNull()
    expect(setMembership(state, ['free'], null)).toBeNull()
    const op = deleteFrame(state, 'f')
    state.frames.f.members.push('free')
    expect(op.expect.frames.f?.members).toEqual(['a', 'hidden'])
    expect(() => resizeFrame(initial(), 'f', { x: 0, y: 0, w: 0, h: 3 })).toThrow('positive')
  })
  it('checks all preimages at the save boundary and permits unrelated changes', () => {
    const { before, op } = moved()
    const unrelated = { ...before, cards: { ...before.cards, free: { x: 9, y: 9 } },
      frames: { ...before.frames, g: { ...before.frames.g, title: 'Elsewhere' } } }
    expect(() => assertFrameOperation(unrelated, op)).not.toThrow()
    expect(() => assertFrameOperation({ ...before, cards: { ...before.cards, hidden: { x: 1, y: 1 } } }, op)).toThrow('Card hidden changed')
    delete op.expect.cards.a
    expect(() => assertFrameOperation(before, op)).toThrow('Missing cards preimage')
  })
})

describe('FrameHistory', () => {
  it('restores automatic placement with null, and redoes exact manual positions', () => {
    const { before, state, history } = moved()
    const undo = history.undo(state)
    expect(undo.cards.hidden).toBeNull()
    expect(history.undoCount).toBe(1); expect(history.redoCount).toBe(0)
    const undone = reverse(history, state)
    expect(undone).toEqual(before)
    expect(history.undoCount).toBe(0); expect(history.redoCount).toBe(1)
    expect(reverse(history, undone, true)).toEqual(state)
  })
  it('undoes and redoes multiple own moves, edits, memberships, deletion and creation in order', () => {
    const history = new FrameHistory(), start: FrameState = { ...initial(), frames: { g: frame(['other']) } }
    let state = perform(history, start, createFrame(start, 'f', frame()))
    state = perform(history, state, moveFrame(state, 'f', 100, -20, positions())!)
    state = perform(history, state, moveFrame(state, 'f', 10, 20, new Map(Object.entries(state.cards)))!)
    state = perform(history, state, resizeFrame(state, 'f', { x: 8, y: 9, w: 200, h: 100 })!)
    state = perform(history, state, updateFrame(state, 'f', { title: 'Renamed' })!)
    state = perform(history, state, setMembership(state, ['a'], 'g')!)
    state = perform(history, state, deleteFrame(state, 'f'))
    const final = state
    for (let i = 0; i < 7; i++) state = reverse(history, state)
    expect(state).toEqual(start)
    for (let i = 0; i < 7; i++) state = reverse(history, state, true)
    expect(state).toEqual(final)
    expect(history.undoCount).toBe(7); expect(history.redoCount).toBe(0)
  })
  it.each(['card', 'frame', 'membership', 'deleted frame', 'deleted ticket'])('blocks later external or ordinary local %s edits without partial reversal', kind => {
    const { state, history } = moved(), external = structuredClone(state)
    if (kind === 'card') external.cards.a.x++
    if (kind === 'frame') external.frames.f.title = 'External'
    if (kind === 'membership') { external.frames.f.members = ['hidden']; external.frames.g.members.push('a') }
    if (kind === 'deleted frame') delete external.frames.f
    if (kind === 'deleted ticket') external.tickets = new Set(['a', 'other'])
    history.observe(external)
    expect(history.undoEntry?.blockedReason).toBeTruthy()
    const before = structuredClone(external)
    expect(() => history.undo(external)).toThrow()
    expect(external).toEqual(before)
    expect(history.undoCount).toBe(1); expect(history.redoCount).toBe(0)
    // An external edit does not become safe merely because it later reverts.
    expect(() => history.undo(state)).toThrow()
  })
  it('allows unrelated frame edits and ticket text changes without undoing them', () => {
    const { state, history } = moved()
    const external = { ...state, frames: { ...state.frames, g: { ...state.frames.g, title: 'External' } },
      tickets: new Map(['a', 'hidden', 'other', 'free'].map(id => [id, { title: 'Updated description' }])) }
    history.observe(external)
    const undone = reverse(history, external)
    expect(undone.frames.g.title).toBe('External')
    expect(undone.tickets).toBe(external.tickets)
  })
  it('blocks restoring deleted frame membership after assignment elsewhere or ticket deletion', () => {
    const before = initial(), deletion = deleteFrame(before, 'f'), state = applyFrameOperation(before, deletion)
    const history = new FrameHistory(); history.record(deletion, state)
    const transferred = applyFrameOperation(state, setMembership(state, ['a'], 'g')!)
    expect(() => history.undo(transferred)).toThrow('Membership')
    const another = new FrameHistory(); another.record(deletion, state)
    expect(() => another.undo({ ...state, tickets: new Set(['a', 'other']) })).toThrow('hidden no longer exists')
  })
  it('refreshes ownership read sets on restore, permits unrelated edits, and rejects new stealing frames', () => {
    const before = initial(), history = new FrameHistory()
    const state = perform(history, before, deleteFrame(before, 'f'))
    const external = applyFrameOperation(state, updateFrame(state, 'g', { color: 'sand' })!)
    const undo = history.undo(external)
    expect(undo.expect.frames.g?.color).toBe('sand')
    const race = { ...external, frames: { ...external.frames, new: frame(['a']) } }
    expect(() => applyFrameOperation(race, undo)).toThrow('another frame')
  })
  it('preserves stacks on failed undo/redo saves and accepts retry only after success', () => {
    const { state, history } = moved()
    const failedUndo = history.undo(state)
    // Network failure: deliberately do not call acceptUndo.
    expect(history.undoCount).toBe(1); expect(history.redoCount).toBe(0)
    expect(history.undo(state)).toEqual(failedUndo)
    expect(() => history.acceptUndo(failedUndo, state)).toThrow('did not accept')
    expect(history.undoCount).toBe(1)
    const undone = reverse(history, state), failedRedo = history.redo(undone)
    expect(history.redoCount).toBe(1); expect(history.undoCount).toBe(0)
    expect(history.redo(undone)).toEqual(failedRedo)
    expect(() => history.acceptRedo(failedRedo, undone)).toThrow('did not accept')
    expect(reverse(history, undone, true)).toEqual(state)
  })
  it('rejects save-time races and blocks redo after an ordinary edit', () => {
    const { state, history } = moved(), undo = history.undo(state)
    const race = { ...state, cards: { ...state.cards, a: { x: 999, y: 999 } } }
    expect(() => applyFrameOperation(race, undo)).toThrow('Card a changed')
    expect(history.undoCount).toBe(1)
    const undone = reverse(history, state)
    const changed = { ...undone, cards: { ...undone.cards, hidden: { x: 3, y: 4 } } }
    expect(() => history.redo(changed)).toThrow('Card hidden changed')
    expect(history.redoCount).toBe(1)
  })
  it('detects relevant external changes carried by a successful unrelated own response', () => {
    const { state, history } = moved()
    const op = updateFrame(state, 'g', { title: 'Own edit' })!
    const accepted = applyFrameOperation(state, op); accepted.cards.a.x++
    history.record(op, accepted)
    const undone = reverse(history, accepted)
    expect(() => history.undo(undone)).toThrow('Card a changed')
  })
  it('keeps independent board histories and clears redo only on successful new operations', () => {
    const { state, history: a } = moved(), b = new FrameHistory()
    const undone = reverse(a, state)
    b.record(null, initial())
    expect(b.undoCount).toBe(0); expect(a.redoCount).toBe(1)
    const op = updateFrame(undone, 'f', { title: 'Branch' })!
    expect(() => a.record(op, undone)).toThrow('did not accept')
    expect(a.redoCount).toBe(1)
    perform(a, undone, op)
    expect(a.redoCount).toBe(0); expect(a.undoCount).toBe(1)
    expect(new FrameHistory().undoCount).toBe(0)
  })
})
