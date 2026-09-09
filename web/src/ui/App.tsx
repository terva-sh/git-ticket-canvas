import { useEffect, useRef, useState } from 'preact/hooks'
import { TicketClient, ApiError } from '../platform/tickets/client'
import { TicketStore, LayoutWriter } from '../platform/tickets/store'
import type { CardChanges, Op, Ticket } from '../platform/tickets/types'
import { Canvas, type CanvasHandle } from './Canvas'
import { Toolbar } from './Toolbar'
import { Inspector } from './Inspector'
import { Composer, type ComposerPosition } from './Composer'
import { FeedbackMessage, type Feedback } from './Feedback'

interface InterfaceState {
  selected: string | null; selection: Set<string>; query: string; filters: Set<string>
  composer: ComposerPosition | null; composerKey: number; generation: number
}
export function App() {
  const [store] = useState(() => new TicketStore(new TicketClient()))
  const [snapshot, setSnapshot] = useState(store.state)
  const published = useRef(store.state), publications = useRef(0)
  const [ui, setUI] = useState<InterfaceState>({ selected: null, selection: new Set(), query: '', filters: new Set(),
    composer: null, composerKey: 0, generation: 0 })
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const latest = useRef(ui); latest.current = ui
  const generation = useRef(0), feedbackId = useRef(0), busy = useRef(false), mounted = useRef(true)
  const deferredRead = useRef(false), canvas = useRef<CanvasHandle>(null), fitFrame = useRef(0)
  const publish = () => {
    if (!mounted.current || published.current === store.state) return
    published.current = store.state
    publications.current++
    setSnapshot(store.state)
    setUI(current => current.selected && !store.state.tickets.has(current.selected)
      ? { ...current, selected: null, selection: new Set() } : current)
  }
  const toast = (message: string, error = false) => {
    if (mounted.current) setFeedback({ id: ++feedbackId.current, message, error })
  }
  const report = (error: unknown) => toast(error instanceof Error ? error.message : String(error), true)
  const [writer] = useState(() => new LayoutWriter((board, cards) => store.saveLayout(board, cards)))

  async function refresh(fit = false) {
    if (busy.current) { deferredRead.current = true; return }
    await store.load()
    if (busy.current) { deferredRead.current = true; return }
    // A response can be accepted while a drag delays publication. A later
    // 304 must still publish that accepted state once the gesture ends.
    if (published.current !== store.state) {
      publish()
      if (fit) {
        cancelAnimationFrame(fitFrame.current)
        fitFrame.current = requestAnimationFrame(() => {
          fitFrame.current = 0
          if (mounted.current && !busy.current) canvas.current?.fit()
        })
      }
    }
  }
  const onBusy = (value: boolean) => {
    busy.current = value
    if (!value && deferredRead.current) {
      deferredRead.current = false
      void refresh().catch(report)
    }
  }
  async function patch(ticket: Ticket, ops: Op[]) {
    if (store.state.readOnly) throw new Error('read-only')
    try {
      const result = await store.patch(ticket.id, ops, ticket.revision)
      publish(); return result
    } catch (error) {
      publish()
      if (error instanceof ApiError && error.code === 'stale_revision') toast('That ticket changed on disk since this page read it. Reloading.', true)
      else report(error)
      throw error
    }
  }
  async function saveLayout(board: string, cards: CardChanges) {
    if (store.state.readOnly) throw new Error('read-only')
    const version = generation.current
    try { await writer.enqueue(board, cards) }
    finally {
      publish()
      // A board read can be refused while this write is in flight. Refresh
      // the new board now rather than leaving it blank until the next poll.
      if (version !== generation.current) void refresh(true).catch(report)
    }
  }
  function select(id: string, additive = false) {
    setUI(current => ({ ...current, selected: id,
      selection: new Set(additive ? [...current.selection, id] : [id]) }))
  }
  function closeInspector() { setUI(current => ({ ...current, selected: null, selection: new Set() })) }
  async function remove(ticket: Ticket) {
    if (store.state.readOnly) { toast('read-only', true); return }
    const version = generation.current
    if (!confirm(`Delete ${ticket.short} "${ticket.title}"? The file is removed from disk.`)) return
    let result
    try { result = await store.remove(ticket.id, ticket.revision) }
    catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'ticket_referenced' || version !== generation.current) { report(error); return }
      if (!confirm(`${error.message}\n\nRemove anyway and leave the references dangling?`)) return
      try { result = await store.remove(ticket.id, ticket.revision, true) }
      catch (failure) { report(failure); return }
    }
    publish()
    toast(result.layoutError ? `Deleted; placement cleanup failed: ${result.layoutError}` : 'Deleted.', !!result.layoutError)
    await refresh().catch(report)
  }
  function compose(point: { x: number; y: number; sceneX: number; sceneY: number }) {
    if (store.state.readOnly) { toast('read-only', true); return }
    const position = { ...point, board: store.state.board, generation: generation.current }
    setUI(current => ({ ...current, composer: position, composerKey: current.composerKey + 1 }))
  }
  function closeComposer(position = latest.current.composer) {
    setUI(current => current.composer === position ? { ...current, composer: null } : current)
  }
  async function create(title: string, position: ComposerPosition) {
    if (store.state.readOnly) throw new Error('read-only')
    try {
      const result = await store.create({ title, board: position.board,
        card: { x: Math.round(position.sceneX), y: Math.round(position.sceneY) } })
      publish()
      if (position.generation === generation.current) select(result.ticket.id)
      toast(result.layoutError ? `Ticket filed; placement failed: ${result.layoutError}` :
        `Filed ${result.ticket.short || result.ticket.id} as draft.`, !!result.layoutError)
      return result
    } catch (error) { report(error); throw error }
  }
  async function link(from: string, to: string) {
    if (store.state.readOnly) { toast('read-only', true); return }
    const ticket = store.state.tickets.get(to)
    if (!ticket) return
    await patch(ticket, [{ op: 'addDependency', id: from }])
    toast(`${ticket.short} now waits on ${store.state.tickets.get(from)?.short || from}`)
  }
  function switchBoard(name: string) {
    canvas.current?.cancel()
    store.selectBoard(name)
    const version = ++generation.current
    setUI(current => ({ ...current, generation: version, selected: null, selection: new Set(), composer: null }))
    publish()
  }
  async function changeBoard(name: string) { switchBoard(name); await refresh(true).catch(report) }
  async function newBoard() {
    if (store.state.readOnly) return
    const name = (prompt('New board name (letters, digits, - and _):') || '').trim()
    if (!name) return
    switchBoard(name)
    try { await store.saveLayout(name, {}) } catch (error) { report(error) }
    await refresh(true).catch(report)
  }
  function arrange() {
    if (store.state.readOnly) return
    if (confirm('Lay every card out in status lanes? This replaces the positions on this board.')) canvas.current?.arrange()
  }
  const actions = useRef({ refresh, closeComposer, closeInspector, remove })
  actions.current = { refresh, closeComposer, closeInspector, remove }
  useEffect(() => {
    mounted.current = true
    void actions.current.refresh(true).catch(report)
    const timer = setInterval(() => { void actions.current.refresh().catch(() => {}) }, 12000)
    const visible = () => { if (!document.hidden) void actions.current.refresh().catch(() => {}) }
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable
      if (event.isComposing) return
      if (event.key === 'Escape') {
        canvas.current?.cancel()
        if (latest.current.composer) actions.current.closeComposer()
        else if (typing) target.blur()
        else actions.current.closeInspector()
        return
      }
      if (typing) return
      if (event.key === '/') { event.preventDefault(); document.getElementById('search')?.focus() }
      if (event.key === 'n') { event.preventDefault(); canvas.current?.composeCentre() }
      if (event.key === 'f') { event.preventDefault(); canvas.current?.fit() }
      if ((event.key === 'Delete' || event.key === 'Backspace') && latest.current.selected) {
        event.preventDefault()
        const ticket = store.state.tickets.get(latest.current.selected)
        if (ticket) void actions.current.remove(ticket)
      }
    }
    document.addEventListener('visibilitychange', visible)
    document.addEventListener('keydown', keyboard)
    return () => {
      mounted.current = false
      clearInterval(timer)
      cancelAnimationFrame(fitFrame.current)
      document.removeEventListener('visibilitychange', visible)
      document.removeEventListener('keydown', keyboard)
    }
  }, [store])
  const matches = (ticket: Ticket) => {
    if (ui.filters.size && !ui.filters.has(ticket.status)) return false
    const query = ui.query.trim().toLowerCase()
    return !query || [ticket.id, ticket.title, ticket.type, ticket.status, ticket.priority, ticket.milestone,
      ...ticket.labels, ...ticket.assignees, ticket.body.description].filter(Boolean).join(' ').toLowerCase().includes(query)
  }
  return <>
    <div id="toolbarRoot" data-store-publications={publications.current}><Toolbar storePath={snapshot.storePath} readOnly={snapshot.readOnly}
      boards={snapshot.boards} board={snapshot.board} config={snapshot.config} query={ui.query} filters={ui.filters}
      counts={`${[...snapshot.tickets.values()].filter(matches).length} of ${snapshot.tickets.size}`}
      onQuery={query => setUI(current => ({ ...current, query }))}
      onFilter={status => setUI(current => {
        const filters = new Set(current.filters); filters.has(status) ? filters.delete(status) : filters.add(status)
        return { ...current, filters }
      })} onBoard={name => { void changeBoard(name) }} onNewBoard={() => { void newBoard() }}
      onNew={() => canvas.current?.composeCentre()} onFit={() => canvas.current?.fit()} onArrange={arrange} /></div>
    <Canvas key={ui.generation} ref={canvas} board={snapshot.board} tickets={snapshot.tickets} cards={snapshot.cards}
      statuses={snapshot.config?.statuses || []} selection={ui.selection} query={ui.query} filters={ui.filters}
      readOnly={snapshot.readOnly} onSelect={select} onLayout={saveLayout} onLink={link} onCompose={compose}
      onError={message => toast(message, true)} onBusy={onBusy}>
      <div id="formsRoot">
        <Inspector ticket={snapshot.tickets.get(ui.selected || '') || null} config={snapshot.config}
          tickets={snapshot.tickets} readOnly={snapshot.readOnly} onPatch={patch} onClose={closeInspector}
          onNavigate={id => { select(id); canvas.current?.focus(id) }} onDelete={remove} />
        {ui.composer && <Composer key={ui.composerKey} position={ui.composer} readOnly={snapshot.readOnly}
          onCreate={create} onClose={() => closeComposer(ui.composer)} />}
        <FeedbackMessage feedback={feedback} />
      </div>
    </Canvas>
  </>
}
