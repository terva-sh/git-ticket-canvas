import type { RenderableProps } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { PublicationBridge, Publication } from '../platform/canvas/publications'
import type { CommittedSampling, SamplingPublication } from './canvas/committedSampling'
import { TicketClient, ApiError } from '../platform/tickets/client'
import { TicketStore, LayoutWriter } from '../platform/tickets/store'
import { LiveUpdates, type LiveStatus } from '../platform/tickets/live'
import type { CardChanges, Cards, Frame, Op, Ticket, VersionInfo } from '../platform/tickets/types'
import { FrameHistory, applyFrameOperation, assertFrameOperation, createFrame, moveFrame, resizeFrame, updateFrame, deleteFrame, setMembership } from '../platform/canvas/frames'
import type { FrameOperation, FrameState, Point } from '../platform/canvas/frames'
import { sameJSON } from '../platform/tickets/reconcile'
import { FramePanel, FrameMembership } from './FramesPanel'
import { Canvas, type CanvasHandle } from './Canvas'
import { Toolbar } from './Toolbar'
import type { RelationshipMode } from './canvas/Edges'
import { Inspector } from './Inspector'
import { Composer, type ComposerPosition } from './Composer'
import { FeedbackMessage, type Feedback } from './Feedback'

interface InterfaceState {
  selected: string | null; selection: Set<string>; query: string; filters: Set<string>
  composer: ComposerPosition | null; composerKey: number; generation: number
}
export function App({ publicationBridge, samplingProbe }: RenderableProps<{ publicationBridge?: PublicationBridge; samplingProbe?: CommittedSampling }>) {
  const [bridge] = useState(() => publicationBridge)
  const [probe] = useState(() => samplingProbe)
  const samplingPublication = useRef<SamplingPublication | null>(null)
  const publication = useRef<Publication | null>(null)
  const [client] = useState(() => new TicketClient())
  const [store] = useState(() => new TicketStore(client))
  const [snapshot, setSnapshot] = useState(store.state)
  // undefined while the one-time fetch is in flight, null once it failed.
  // The label never renders blank: it waits, then shows a version or unknown.
  const [version, setVersion] = useState<VersionInfo | null | undefined>(undefined)
  const published = useRef(store.state), publications = useRef(0)
  const [ui, setUI] = useState<InterfaceState>({ selected: null, selection: new Set(), query: '', filters: new Set(),
    composer: null, composerKey: 0, generation: 0 })
  const [frameUI, setFrameUI] = useState<{ selected: string | null; draft: Frame | null; key: number }>({ selected: null, draft: null, key: 0 })
  const frameLatest = useRef(frameUI); frameLatest.current = frameUI
  const histories = useRef(new Map<string, FrameHistory>())
  const historyFor = (board: string) => {
    let history = histories.current.get(board)
    if (!history) { history = new FrameHistory(); histories.current.set(board, history) }
    return history
  }
  const frameRequest = useRef<object | null>(null)
  const [framePreview, setFramePreview] = useState<{ board: string; generation: number; state: FrameState } | null>(null)
  const [, setHistoryVersion] = useState(0)
  const [relationships, setRelationships] = useState<RelationshipMode>('selected')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [sync, setSync] = useState<LiveStatus>({ connection: 'connecting', stale: false, degraded: false, readFailed: false })
  const live = useRef<LiveUpdates>()
  const latest = useRef(ui); latest.current = ui
  const generation = useRef(0), feedbackId = useRef(0), busy = useRef(false), mounted = useRef(true)
  const deferredRead = useRef(false), canvas = useRef<CanvasHandle>(null), fitFrame = useRef(0)
  const publish = () => {
    if (!mounted.current || published.current === store.state) return
    if (store.state.layoutSchema !== null) historyFor(store.state.board).observe({ cards: store.state.cards, frames: store.state.frames, tickets: store.state.tickets })
    published.current = store.state
    publication.current = bridge?.publish(store.state, generation.current) ?? null
    samplingPublication.current = probe?.publish({ store, board: store.state.board, generation: generation.current,
      publication: store.state, captureToken: store.state.captureToken, tickets: [...store.state.tickets.keys()],
      births: Object.fromEntries([...store.state.tickets].map(([id, ticket]) => [id, ticket.createdAt])),
      controls: Object.keys(store.state.frames).flatMap(id => store.state.readOnly ? [`title:${id}`] : [`title:${id}`, `resize:${id}`]) }) ?? null
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
    await store.whenIdle()
    if (!mounted.current) return
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
    return store.sync
  }
  const onBusy = (value: boolean) => {
    if (value) { bridge?.hold(); probe?.hold() }
    busy.current = value || !!frameRequest.current
    if (!busy.current && deferredRead.current) {
      deferredRead.current = false
      if (live.current) live.current.request()
      else void refresh().catch(report)
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
    bridge?.hold(); probe?.hold()
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
    setFrameUI(current => ({ ...current, selected: null, draft: null }))
    setUI(current => ({ ...current, selected: id,
      selection: new Set(additive ? [...current.selection, id] : [id]) }))
  }
  function closeFrames() {
    canvas.current?.cancel()
    setFrameUI(current => ({ ...current, selected: null, draft: null }))
  }
  function selectFrame(id: string) {
    setFrameUI(current => ({ ...current, selected: id, draft: null }))
    setUI(current => ({ ...current, composer: null }))
  }
  function newFrameDraft(draft: Frame) {
    setFrameUI(current => ({ selected: null, draft, key: current.key + 1 }))
    setUI(current => ({ ...current, composer: null }))
  }
  const frameState = (): FrameState => ({ cards: snapshot.cards, frames: snapshot.frames, tickets: snapshot.tickets })
  async function performFrame(op: FrameOperation | null, mode: 'edit' | 'undo' | 'redo' = 'edit') {
    if (!op) return
    if (store.state.readOnly) throw new Error('read-only')
    if (frameRequest.current || !canvas.current?.layoutReady()) throw new Error('Wait for the current canvas gesture or placement save to finish.')
    const board = snapshot.board, version = generation.current, history = historyFor(board)
    assertFrameOperation({ cards: store.state.cards, frames: store.state.frames, tickets: store.state.tickets }, op)
    const preview = applyFrameOperation(frameState(), op), token = {}
    frameRequest.current = token
    setFramePreview({ board, generation: version, state: preview })
    onBusy(true)
    try {
      const response = await store.saveFrameLayout(board, op)
      const accepted = { cards: response.cards, frames: response.frames || {}, tickets: preview.tickets }
      if (mode === 'undo') history.acceptUndo(op, accepted)
      else if (mode === 'redo') history.acceptRedo(op, accepted)
      else history.record(op, accepted)
      toast(`${op.label} saved on ${board}.`)
    } catch (error) {
      report(error)
      throw error
    } finally {
      if (frameRequest.current === token) {
        frameRequest.current = null
        if (mounted.current) { setFramePreview(null); setHistoryVersion(n => n + 1) }
      }
      publish()
      onBusy(false)
      void refresh(version !== generation.current).catch(report)
    }
  }
  async function frameHistoryAction(redo: boolean) {
    try {
      const history = historyFor(snapshot.board)
      await performFrame(redo ? history.redo(frameState()) : history.undo(frameState()), redo ? 'redo' : 'undo')
    } catch (error) { report(error); setHistoryVersion(n => n + 1) }
  }
  async function frameMove(id: string, before: Frame, dx: number, dy: number, positions: ReadonlyMap<string, Point>, cards: Cards) {
    const base = { ...frameState(), cards, frames: { ...snapshot.frames, [id]: before } }
    await performFrame(moveFrame(base, id, dx, dy, positions))
  }
  async function frameResize(id: string, before: Frame, next: Frame) {
    await performFrame(resizeFrame({ ...frameState(), frames: { ...snapshot.frames, [id]: before } }, id,
      { x: before.x, y: before.y, w: next.w, h: next.h }))
  }
  async function saveFrame(kind: 'create' | 'move' | 'resize' | 'appearance' | 'delete', next: Frame, baseline?: Frame) {
    const version = generation.current
    if (kind === 'create') {
      const id = `frame-${typeof crypto.randomUUID === 'function' ? crypto.randomUUID()
        : Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')}`
      const members = canvas.current?.captureFrame(next) || []
      await performFrame(createFrame(frameState(), id, { ...next, members }))
      if (version === generation.current) { canvas.current?.cancel(); selectFrame(id) }
      return
    }
    const id = frameLatest.current.selected
    if (!id) throw new Error('Select a frame first.')
    const before = baseline || snapshot.frames[id]
    if (!before || !sameJSON(before, snapshot.frames[id])) throw new Error('This frame changed. Cancel the draft and review the current frame before saving.')
    if (kind === 'move') await frameMove(id, before, next.x - before.x, next.y - before.y, canvas.current!.framePositions(), snapshot.cards)
    else if (kind === 'resize') await frameResize(id, before, next)
    else if (kind === 'appearance') await performFrame(updateFrame(frameState(), id, { title: next.title, color: next.color }))
    else {
      await performFrame(deleteFrame(frameState(), id))
      if (version === generation.current) closeFrames()
    }
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
    const version = generation.current
    await patch(ticket, [{ op: 'addDependency', id: from }])
    // Relationships default to Selected, which draws an edge only around a
    // selected card. The link gesture selects nothing, so without this the drop
    // saves an edge nobody can see and reads as a link that did not take.
    if (version === generation.current) select(to)
    toast(`${ticket.short} now waits on ${store.state.tickets.get(from)?.short || from}`)
  }
  function switchBoard(name: string) {
    closeFrames()
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
    if (store.state.readOnly || frameRequest.current) return
    if (confirm('Lay every card out in status lanes? This replaces the positions on this board.')) canvas.current?.arrange()
  }
  const actions = useRef({ refresh, closeComposer, closeInspector, closeFrames, remove })
  actions.current = { refresh, closeComposer, closeInspector, closeFrames, remove }
  useEffect(() => {
    mounted.current = true
    publication.current = bridge?.publish(published.current, generation.current) ?? null
    let first = true
    const updates = new LiveUpdates({
      read: () => { const fit = first; first = false; return actions.current.refresh(fit) },
      board: () => store.state.board,
      status: status => { if (mounted.current) setSync(status) },
    })
    live.current = updates
    store.onWriteSettled = () => updates.request()
    updates.start()
    // Build identity is fixed for the life of the process, so one read is
    // enough. It is independent of the board: a failure here must not stop
    // loading, and a board failure must not hide which build is running.
    client.version().then(info => { if (mounted.current) setVersion(info) },
      () => { if (mounted.current) setVersion(null) })
    const visible = () => { if (!document.hidden) updates.request() }
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable
      if (event.isComposing) return
      if (event.key === 'Escape') {
        canvas.current?.cancel()
        if (frameLatest.current.selected || frameLatest.current.draft) actions.current.closeFrames()
        else if (latest.current.composer) actions.current.closeComposer()
        else if (typing) target.blur()
        else actions.current.closeInspector()
        return
      }
      if (typing) return
      if (event.key === '/') { event.preventDefault(); document.getElementById('search')?.focus() }
      if (event.key === 'n') { event.preventDefault(); canvas.current?.composeCentre() }
      if (event.key === 'f') { event.preventDefault(); canvas.current?.fit() }
      if ((event.key === 'Delete' || event.key === 'Backspace') && latest.current.selected && !frameLatest.current.selected && !frameLatest.current.draft && !frameRequest.current) {
        event.preventDefault()
        const ticket = store.state.tickets.get(latest.current.selected)
        if (ticket) void actions.current.remove(ticket)
      }
    }
    document.addEventListener('visibilitychange', visible)
    document.addEventListener('keydown', keyboard)
    return () => {
      mounted.current = false
      bridge?.dispose(); probe?.hold()
      updates.stop(); live.current = undefined; store.onWriteSettled = undefined
      cancelAnimationFrame(fitFrame.current)
      document.removeEventListener('visibilitychange', visible)
      document.removeEventListener('keydown', keyboard)
    }
  }, [store, client])
  const matches = (ticket: Ticket) => {
    if (ui.filters.size && !ui.filters.has(ticket.status)) return false
    const query = ui.query.trim().toLowerCase()
    return !query || [ticket.id, ticket.title, ticket.type, ticket.status, ticket.priority, ticket.milestone,
      ...ticket.labels, ...ticket.assignees, ticket.body.description].filter(Boolean).join(' ').toLowerCase().includes(query)
  }
  const syncMessage = sync.readFailed ? snapshot.config
    ? 'Refresh failed. Showing the last accepted board; retrying.' : 'Board unavailable. Retrying.'
    : sync.stale ? 'Store data is incomplete or invalid. Showing the last valid board; retrying.'
    : sync.degraded ? 'Store watcher unavailable. Using periodic reconciliation.'
    : sync.connection === 'polling' ? 'Live updates disconnected. Polling every 12 seconds.' : ''
  const displayed = framePreview?.board === snapshot.board && framePreview.generation === ui.generation ? framePreview.state : snapshot
  const selectedFrame = frameUI.selected ? snapshot.frames[frameUI.selected] : undefined
  const frameOpen = !!frameUI.draft || !!selectedFrame
  const history = historyFor(snapshot.board)
  const frameMatching = new Set([...snapshot.tickets.values()].filter(matches).map(ticket => ticket.id))
  return <>
    <div id="syncStatus" role="status" class="sync-status" hidden={!syncMessage}
      data-connection={sync.connection} data-stale={sync.stale} data-degraded={sync.degraded}>{syncMessage}</div>
    <div id="toolbarRoot" data-store-publications={publications.current}><Toolbar storePath={snapshot.storePath} readOnly={snapshot.readOnly} version={version}
      boards={snapshot.boards} board={snapshot.board} config={snapshot.config} query={ui.query} filters={ui.filters}
      counts={`${[...snapshot.tickets.values()].filter(matches).length} of ${snapshot.tickets.size}`}
      relationships={relationships} onRelationships={setRelationships}
      onNewFrame={() => canvas.current?.newFrame()} onUndoFrame={() => { void frameHistoryAction(false) }} onRedoFrame={() => { void frameHistoryAction(true) }}
      framePending={!!framePreview} undoFrame={history.undoEntry} redoFrame={history.redoEntry}
      onQuery={query => setUI(current => ({ ...current, query }))}
      onFilter={status => setUI(current => {
        const filters = new Set(current.filters); filters.has(status) ? filters.delete(status) : filters.add(status)
        return { ...current, filters }
      })} onBoard={name => { void changeBoard(name) }} onNewBoard={() => { void newBoard() }}
      onNew={() => canvas.current?.composeCentre()} onFit={() => canvas.current?.fit()} onArrange={arrange} /></div>
    <Canvas key={ui.generation} ref={canvas} board={snapshot.board} tickets={snapshot.tickets} cards={displayed.cards}
      publicationBridge={bridge} publication={publication.current}
      samplingProbe={probe} samplingPublication={samplingPublication.current}
      samplingReady={() => mounted.current && !busy.current && !frameRequest.current && published.current === store.state
        && samplingPublication.current?.publication === snapshot && samplingPublication.current.generation === generation.current
        && samplingPublication.current.captureToken === store.state.captureToken && store.state.layoutSchema !== null}
      publicationReady={() => mounted.current && !busy.current && !frameRequest.current && published.current === store.state}
      frames={displayed.frames} selectedFrame={frameUI.selected} frameCreating={!!frameUI.draft} layoutBusy={!!framePreview}
      onSelectFrame={selectFrame} onNewFrame={newFrameDraft} onFrameMove={frameMove} onFrameResize={frameResize}
      statuses={snapshot.config?.statuses || []} selection={ui.selection} query={ui.query} filters={ui.filters}
      relationships={relationships} readOnly={snapshot.readOnly} onSelect={select} onLayout={saveLayout} onLink={link} onCompose={compose}
      onError={message => toast(message, true)} onBusy={onBusy}>
      <div id="formsRoot">
        <div id="frameHistory" role="status" hidden={!framePreview && !history.undoEntry?.blockedReason && !history.redoEntry?.blockedReason}>
          {framePreview && <div>Saving frame operation. The submitted save continues if you close this panel.</div>}
          {history.undoEntry?.blockedReason && <div class="frame-conflict">Undo blocked: {history.undoEntry.blockedReason}. No partial reversal.</div>}
          {history.redoEntry?.blockedReason && <div class="frame-conflict">Redo blocked: {history.redoEntry.blockedReason}.</div>}
        </div>
        {frameOpen && <FramePanel key={`${ui.generation}:${frameUI.selected || `draft-${frameUI.key}`}`}
          frame={frameUI.draft || selectedFrame!} creating={!!frameUI.draft} tickets={snapshot.tickets} matching={frameMatching}
          readOnly={snapshot.readOnly} pending={!!framePreview} onClose={closeFrames}
          onCapture={frame => canvas.current?.captureFrame(frame) || []} onSave={saveFrame}
          onRemoveMissing={ids => performFrame(setMembership(frameState(), ids, null))} />}
        <Inspector ticket={snapshot.tickets.get(ui.selected || '') || null} config={snapshot.config}
          tickets={snapshot.tickets} readOnly={snapshot.readOnly || !!framePreview} concealed={frameOpen} onPatch={patch} onClose={closeInspector}
          onNavigate={id => { select(id); canvas.current?.focus(id) }} onDelete={remove}>
          {ui.selected && <FrameMembership ticketId={ui.selected} frames={snapshot.frames} readOnly={snapshot.readOnly}
            pending={!!framePreview} onSelectFrame={selectFrame}
            onChange={target => performFrame(setMembership(frameState(), [ui.selected!], target))} />}
        </Inspector>
        {ui.composer && <Composer key={ui.composerKey} position={ui.composer} readOnly={snapshot.readOnly}
          onCreate={create} onClose={() => closeComposer(ui.composer)} />}
        <FeedbackMessage feedback={feedback} />
      </div>
    </Canvas>
  </>
}
