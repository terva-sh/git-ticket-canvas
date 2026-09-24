import { useEffect, useRef, useState } from 'preact/hooks'
import { TicketClient, RegistryClient, ApiError, storeBase } from '../platform/tickets/client'
import { TicketStore, LayoutWriter } from '../platform/tickets/store'
import { LiveUpdates, type LiveStatus } from '../platform/tickets/live'
import type { ActorResponse, CardChanges, PersonResponse, Cards, Frame, Op, Routing, SessionResponse, StoreSummary, Ticket, VersionInfo } from '../platform/tickets/types'
import { FrameHistory, applyFrameOperation, assertFrameOperation, createFrame, moveFrame, resizeFrame, updateFrame, deleteFrame, setMembership } from '../platform/canvas/frames'
import type { FrameOperation, FrameState, Point } from '../platform/canvas/frames'
import type { View } from '../platform/canvas/geometry'
import { OPENING_ZOOM } from './canvas/viewMemory'
import { recall, remember } from './canvas/viewMemory'
import { sameJSON } from '../platform/tickets/reconcile'
import { closingCycle } from '../platform/tickets/relations'
import { cycleLabel, emptyBoardHelp, labelUniverse, matchesTicket, type LabelFilters, type LabelMatch, type Relaxation } from '../platform/tickets/filters'
import { FramePanel, FrameMembership } from './FramesPanel'
import { Canvas, type CanvasHandle } from './Canvas'
import { Toolbar } from './Toolbar'
import { StoreBrowser } from './StoreBrowser'
import { SessionDialog } from './SessionDialog'
import { DisplayDialog } from './DisplayDialog'
import { useDisplay } from './useDisplay'
import type { RelationshipMode } from './canvas/Edges'
import { Inspector } from './Inspector'
import { PlacementSection } from './Placement'
import { PensPanel } from './PensPanel'
import { cloneRouting } from '../platform/canvas/pens'
import { explain } from '../platform/canvas/resolve'
import { Composer, type ComposerPosition } from './Composer'
import { FeedbackMessage, type Feedback } from './Feedback'

/** The store named in the address, which a reload and a shared link both keep. */
function storeInAddress() {
  if (typeof location === 'undefined') return null
  return new URLSearchParams(location.hash.replace(/^#/, '')).get('store')
}

interface InterfaceState {
  selected: string | null; selection: Set<string>; query: string; filters: Set<string>
  /** Selection mode, entered by holding a card on a touch screen. While it is
   * on, a tap on a card adds or removes it rather than replacing the
   * selection, which is what shift does with a mouse. */
  selecting: boolean
  labelFilters: LabelFilters
  /** How the required labels combine. `all` is what the board has always done. */
  labelMatch: LabelMatch
  composer: ComposerPosition | null; composerKey: number; generation: number
}
export function App() {
  const [registry] = useState(() => new RegistryClient())
  const [store] = useState(() => new TicketStore(new TicketClient()))
  // The store being shown. Null until the canvas has asked which stores there
  // are, and on a canvas that serves one store under the flat routes.
  const [storeId, setStoreId] = useState<string | null>(null)
  // False until the canvas knows which store it is showing, so the first board
  // read is not issued against a base that is about to change.
  const [booted, setBooted] = useState(false)
  const [stores, setStores] = useState<StoreSummary[]>([])
  const [browsing, setBrowsing] = useState(false)
  const [rescanning, setRescanning] = useState(false)
  // Who is signed in. Every canvas answers, and a desk one answers that nobody
  // is, which is how the control knows to stay hidden.
  const [session, setSession] = useState<SessionResponse | null>(null)
  const [account, setAccount] = useState(false)
  const [actor, setActor] = useState<ActorResponse | null | undefined>(undefined)
  const [actorError, setActorError] = useState<string | undefined>(undefined)
  const [actorBusy, setActorBusy] = useState(false)
  const [peopleList, setPeopleList] = useState<PersonResponse[] | null | undefined>(undefined)
  // The stores looked at this session, most recent first. Session state, like
  // the relationship mode: the durable record of what matters is the favorites.
  const recent = useRef<string[]>([])
  const [snapshot, setSnapshot] = useState(store.state)
  // undefined while the one-time fetch is in flight, null once it failed.
  // The label never renders blank: it waits, then shows a version or unknown.
  const [version, setVersion] = useState<VersionInfo | null | undefined>(undefined)
  const published = useRef(store.state), publications = useRef(0)
  const [ui, setUI] = useState<InterfaceState>({ selected: null, selection: new Set(), selecting: false, query: '', filters: new Set(),
    labelFilters: new Map(), labelMatch: 'all', composer: null, composerKey: 0, generation: 0 })
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
  // Rule authoring. The draft and the preview live here rather than in the
  // panel because the canvas draws the preview, and a submitted Apply has to
  // outlive the panel that submitted it.
  interface PensState { open: boolean; base: Routing | null; draft: Routing | null; previewed: Routing | null; conflict: string; pending: boolean }
  const noPens: PensState = { open: false, base: null, draft: null, previewed: null, conflict: '', pending: false }
  const [pensUI, setPensUI] = useState<PensState>(noPens)
  const pensLatest = useRef(pensUI); pensLatest.current = pensUI
  const [, setHistoryVersion] = useState(0)
  const [relationships, setRelationships] = useState<RelationshipMode>('selected')
  // Chosen from the size and shape of this window, and overridable per person
  // in this browser. Nothing about it reaches the layout file: two people on one
  // board must not be able to change each other's toolbar.
  const display = useDisplay()
  const density = display.settings.density
  const [displayOpen, setDisplayOpen] = useState(false)
  // The magnification, mirrored here only so the toolbar can show it. The
  // canvas owns the view; this follows it.
  const [zoom, setZoom] = useState(OPENING_ZOOM)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [sync, setSync] = useState<LiveStatus>({ connection: 'connecting', stale: false, degraded: false, readFailed: false })
  const live = useRef<LiveUpdates>()
  const latest = useRef(ui); latest.current = ui
  const generation = useRef(0), feedbackId = useRef(0), busy = useRef(false), mounted = useRef(true)
  const deferredRead = useRef(false), canvas = useRef<CanvasHandle>(null), fitFrame = useRef(0)
  /** Debounces the view write, because a pan reports every motion frame. */
  const viewWrite = useRef<ReturnType<typeof setTimeout>>()
  const pendingView = useRef<(() => void) | null>(null)
  const publish = () => {
    if (!mounted.current || published.current === store.state) return
    if (store.state.layoutSchema !== null) historyFor(store.state.board).observe({ cards: store.state.cards, frames: store.state.frames, tickets: store.state.tickets })
    published.current = store.state
    publications.current++
    setSnapshot(store.state)
    setUI(current => current.selected && !store.state.tickets.has(current.selected)
      ? { ...current, selected: null, selection: new Set(), selecting: false } : current)
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
          if (mounted.current && !busy.current) restoreOrFit()
        })
      }
    }
    return store.sync
  }
  const onBusy = (value: boolean) => {
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
    // Additive keeps selection mode as it was, so a shift-click on a desk
    // neither enters it nor ends it; anything else starts a new selection.
    setUI(current => ({ ...current, selected: id,
      selection: new Set(additive ? [...current.selection, id] : [id]), selecting: additive && current.selecting }))
  }
  /** A card held on a touch screen: added to the selection, and the mode on. */
  function hold(id: string) {
    select(id, true)
    setUI(current => ({ ...current, selecting: true }))
  }
  /** A tap in selection mode. `select` can only add, and this is the one
   * place that takes a card back out. The inspector keeps showing a card that
   * is still selected, and the mode ends with the last card, because a count
   * of none has nothing left to act on. */
  function toggle(id: string) {
    setFrameUI(current => ({ ...current, selected: null, draft: null }))
    setUI(current => {
      const selection = new Set(current.selection)
      if (!selection.delete(id)) selection.add(id)
      const selected = selection.has(id) ? id
        : current.selected && selection.has(current.selected) ? current.selected : [...selection].pop() ?? null
      return { ...current, selected, selection, selecting: selection.size > 0 }
    })
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
  const acceptedRouting = (): Routing => ({ pens: store.state.pens ?? {}, ruleOrder: store.state.ruleOrder ?? [], inbox: store.state.inbox ?? { x: 0, y: 0 } })
  // Opening brings back the draft that was there, if one was: the toolbar
  // button is not a way to lose edits. A fresh draft begins only when there
  // is none, and Cancel is the one control that discards one.
  function openPens() {
    closeFrames()
    setUI(current => ({ ...current, composer: null }))
    setPensUI(current => {
      if (current.draft && current.base) return { ...current, open: true }
      const base = acceptedRouting()
      return { open: true, base, draft: cloneRouting(base), previewed: null, conflict: '', pending: false }
    })
  }
  // Closing keeps the draft for next time and a pending Apply running; the
  // toast reports how that ended. The preview is withdrawn, because a
  // preview nobody can see should not keep drawing the board or locking it.
  const closePens = () => setPensUI(current => ({ ...current, open: false, previewed: null }))
  // An edit after a preview withdraws the preview: what Apply would write is
  // exactly what was previewed, and that is no longer the draft.
  const pensDraft = (next: Routing) => setPensUI(current => ({ ...current, draft: next, previewed: null }))
  const pensPreview = () => setPensUI(current => current.draft ? { ...current, previewed: cloneRouting(current.draft), conflict: '' } : current)
  const pensCancel = () => setPensUI(current => {
    const base = acceptedRouting()
    return { ...current, base, draft: cloneRouting(base), previewed: null, conflict: '' }
  })
  async function pensApply(): Promise<'saved' | 'refused'> {
    const current = pensLatest.current
    if (store.state.readOnly) throw new Error('read-only')
    if (!current.previewed || !current.base) throw new Error('Preview the draft before applying it.')
    if (frameRequest.current || !canvas.current?.layoutReady()) throw new Error('Wait for the current canvas gesture or placement save to finish.')
    const board = snapshot.board, version = generation.current, routing = current.previewed, expected = current.base
    setPensUI(state => ({ ...state, pending: true, conflict: '' }))
    onBusy(true)
    try {
      await store.saveRoutingLayout(board, { cards: {}, frames: {}, routing, expect: { cards: {}, frames: {}, routing: expected } })
      toast(`Rules saved on ${board}.`)
      if (mounted.current && version === generation.current) {
        const base = acceptedRouting()
        setPensUI(state => ({ ...state, pending: false, base, draft: cloneRouting(base), previewed: null }))
      }
      return 'saved'
    } catch (error) {
      if (mounted.current && version === generation.current) {
        // The store already re-read the board on a conflict. The preview is
        // withdrawn because what it showed was against rules that no longer
        // hold, and so is the draft: a routing write replaces the whole
        // record, and a draft begun over the old rules would silently drop
        // whatever the other writer added. The current rules are shown instead.
        const conflict = error instanceof ApiError && error.code === 'layout_conflict'
        if (conflict) {
          const base = acceptedRouting()
          setPensUI(state => ({ ...state, pending: false, previewed: null, base, draft: cloneRouting(base),
            conflict: 'Apply refused: the board\'s rules changed on disk while the preview was held (layout_conflict). The preview and the draft were discarded; the rules shown are the current ones. Make the change again against them.' }))
        } else setPensUI(state => ({ ...state, pending: false }))
        if (conflict) { report(error); return 'refused' }
      }
      report(error)
      throw error
    } finally {
      publish()
      onBusy(false)
      void refresh(version !== generation.current).catch(report)
    }
  }
  function closeInspector() { setUI(current => ({ ...current, selected: null, selection: new Set(), selecting: false })) }
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
  // Why dropping `from` onto `to` must not write, or null when it may. The
  // store refuses only a self-reference, so a longer loop would be accepted and
  // leave every ticket in it unready until somebody ran `git ticket check`.
  // This asks the predicate the inspector's picker uses, so the drag and the
  // picker cannot disagree about what closes a cycle. The drop makes `to` wait
  // on `from`, and the answer lists the loop from `to`, each waiting on the next.
  function linkRefusal(from: string, to: string): string | null {
    const cycle = closingCycle(store.state.tickets, 'dependency', to, from)
    if (!cycle) return null
    const name = (id: string) => store.state.tickets.get(id)?.short || id
    const steps = cycle.map((id, i) => `${name(id)} waits on ${name(cycle[(i + 1) % cycle.length])}`)
    return `Not linked: that would close a cycle, ${steps.join(', ')}.`
  }
  async function link(from: string, to: string) {
    if (store.state.readOnly) { toast('read-only', true); return }
    const ticket = store.state.tickets.get(to)
    if (!ticket) return
    // The canvas refuses a cycle while the link is dragged. This covers a drop
    // it judged against a board the store has refreshed since.
    const refused = linkRefusal(from, to)
    if (refused) { toast(refused, true); return }
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
    setUI(current => ({ ...current, generation: version, selected: null, selection: new Set(), selecting: false, composer: null }))
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
  // Switching stores builds a new client and a new live connection rather than
  // repointing either. Anything already in flight then belongs to the client
  // that issued it, and the store's own epoch and generation counters reject it
  // when it returns.
  const openStore = (name: string, remember = true) => {
    if (name === storeId) return
    // The store is in the address, so a reload comes back to it and a link to
    // one store is a link somebody can send.
    if (remember && typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#store=${encodeURIComponent(name)}`)
    }
    store.selectStore(name, new TicketClient(undefined, storeBase(name)))
    setStoreId(name)
    recent.current = [name, ...recent.current.filter(had => had !== name)].slice(0, 8)
    setBrowsing(false)
    histories.current.clear()
    setUI(current => ({ ...current, selected: null, selection: new Set(), selecting: false, composer: null, generation: current.generation + 1 }))
    setFrameUI({ selected: null, draft: null, key: 0 })
    setPensUI(noPens)
    setSnapshot(store.state)
    published.current = store.state
  }
  const toggleFavorite = async (name: string, favorite: boolean) => {
    // Answered with the whole list, so the rows follow the file rather than an
    // optimistic guess that a failed write would leave wrong.
    try {
      const updated = await registry.setFavorite(name, favorite)
      const marked = new Set(updated.stores)
      setStores(current => current.map(store => ({ ...store, favorite: marked.has(store.name) })))
    } catch (error) { report(error) }
  }
  const rescan = async () => {
    setRescanning(true)
    try {
      const result = await registry.rescan()
      setStores(result.stores)
      toast(result.added || result.removed
        ? `Found ${result.added} new ${result.added === 1 ? 'store' : 'stores'}, dropped ${result.removed}.`
        : 'No change to the stores on disk.')
    } catch (error) { report(error) } finally { setRescanning(false) }
  }
  const actions = useRef({ refresh, closeComposer, closeInspector, closeFrames, remove })
  actions.current = { refresh, closeComposer, closeInspector, closeFrames, remove }
  // Asked once. A session changes when somebody logs in or out, and both of
  // those are a page load.
  useEffect(() => {
    let cancelled = false
    void registry.session()
      .then(answer => { if (!cancelled) setSession(answer) })
      // A canvas that cannot answer is one with nothing to show here, and a
      // failure to fetch it must not be a visible error on a working board.
      .catch(() => { if (!cancelled) setSession(null) })
    return () => { cancelled = true }
  }, [registry])
  // The actor is per store, so it follows the store being looked at, and is
  // fetched when the dialog opens rather than on every board change.
  useEffect(() => {
    if (!account || !storeId || !session?.authenticated) return
    let cancelled = false
    setActor(undefined); setActorError(undefined)
    void registry.actor(storeId)
      .then(answer => { if (!cancelled) setActor(answer) })
      .catch(() => { if (!cancelled) setActor(null) })
    return () => { cancelled = true }
  }, [account, storeId, registry, session?.authenticated])
  // Only an administrator can read this, and only while the dialog is open.
  useEffect(() => {
    if (!account || !session?.admin) return
    let cancelled = false
    setPeopleList(undefined)
    void registry.people()
      .then(answer => { if (!cancelled) setPeopleList(answer.people) })
      .catch(() => { if (!cancelled) setPeopleList(null) })
    return () => { cancelled = true }
  }, [account, registry, session?.admin])
  // Where a board opens. Somebody who left a board at a magnification and a
  // corner is put back there; somebody arriving for the first time gets the fit
  // that frames every card. The two are one decision rather than two, because
  // the opening fit and a restore both want the view and only one can have it.
  //
  // This runs on the first read of a board rather than from an effect on
  // storeId: the canvas remounts while a store opens, and an effect that pushes
  // a view races that remount.
  function restoreOrFit() {
    const board = store.state.board
    const held = storeId && board ? recall(storeId, board) : null
    if (held) { setZoom(held.k); canvas.current?.setView(held) }
    else canvas.current?.fit()
  }
  // Called per motion frame during a pan, so the write waits for the gesture to
  // settle and the magnifier is told only when the number it shows changed.
  const viewChanged = (view: View) => {
    setZoom(current => (Math.abs(current - view.k) > 0.0001 ? view.k : current))
    if (!storeId || !snapshot.board) return
    const board = snapshot.board, at = { ...view }
    pendingView.current = () => remember(storeId, board, at)
    clearTimeout(viewWrite.current)
    viewWrite.current = setTimeout(flushView, 300)
  }
  // Reloading within the debounce is exactly how somebody finds out the canvas
  // forgot where they were, so leaving the page writes what is owed.
  function flushView() {
    clearTimeout(viewWrite.current)
    const write = pendingView.current
    pendingView.current = null
    write?.()
  }
  const chooseActor = async (wanted: string) => {
    if (!storeId) return
    setActorBusy(true); setActorError(undefined)
    try {
      setActor(await registry.setActor(storeId, wanted))
      toast(`Your writes to ${storeId} are stamped ${wanted}.`)
    } catch (error) {
      // Shown in the dialog rather than as a toast: it is an answer to what was
      // just typed, and it belongs beside the field.
      setActorError(error instanceof Error ? error.message : String(error))
    } finally { setActorBusy(false) }
  }
  // Which stores this canvas serves, and which one to open. A canvas over one
  // store answers with that one; a canvas over a tree answers with all of them
  // and the browser picks the store last looked at.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [listed, favorites] = await Promise.all([registry.stores(), registry.favorites().catch(() => undefined)])
        if (cancelled) return
        setStores(listed.stores)
        const usable = listed.stores.filter(s => s.available)
        const asked = storeInAddress()
        const wanted = usable.find(s => s.name === asked)
          ?? usable.find(s => s.name === favorites?.lastStoreId)
          ?? usable.find(s => s.favorite) ?? usable[0]
        if (wanted) openStore(wanted.name, wanted.name !== asked)
      } catch {
        // No store list: an older server, or one that could not answer. The
        // flat routes still work for a canvas over a single store, so fall
        // through to them rather than showing nothing.
      }
      if (!cancelled) setBooted(true)
    })()
    const followAddress = () => {
      const asked = storeInAddress()
      if (asked) openStore(asked, false)
    }
    window.addEventListener('hashchange', followAddress)
    return () => { cancelled = true; window.removeEventListener('hashchange', followAddress) }
  }, [registry])

  useEffect(() => {
    if (!booted) return
    let first = true
    const updates = new LiveUpdates({
      read: () => { const fit = first; first = false; return actions.current.refresh(fit) },
      board: () => store.state.board,
      status: status => { if (mounted.current) setSync(status) },
      url: storeId ? `${storeBase(storeId)}/events` : undefined,
    })
    live.current = updates
    store.onWriteSettled = () => updates.request()
    updates.start()
    const visible = () => { if (!document.hidden) updates.request() }
    document.addEventListener('visibilitychange', visible)
    return () => {
      updates.stop(); live.current = undefined; store.onWriteSettled = undefined
      document.removeEventListener('visibilitychange', visible)
    }
  }, [store, booted, storeId])

  // The stylesheet needs these and `#app` is outside this tree, so they go on
  // the document element. Attributes rather than classes so a value that this
  // version does not know replaces the old one instead of joining it.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.dataset.targets = display.settings.targets
    root.dataset.inspector = display.settings.inspector
    root.dataset.toolbar = display.toolbar
    // Stylesheets key on this: the phone header, the phone's ticket sheet, and
    // the tablet and desk inspector placements, which exclude the phone.
    // Toolbar also takes the same value as a prop to choose which header to
    // render, because nothing re-renders it when only this attribute changes.
    root.dataset.layout = display.settings.layout
  }, [display.settings.targets, display.settings.inspector, display.toolbar, display.settings.layout])

  useEffect(() => {
    mounted.current = true
    // Build identity is fixed for the life of the process, so one read is
    // enough. It is independent of the board and of the store: a failure here
    // must not stop loading, and a board failure must not hide which build is
    // running.
    registry.version().then(info => { if (mounted.current) setVersion(info) },
      () => { if (mounted.current) setVersion(null) })
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
      // Compact density hides the card head, which carries the only control for
      // this, and a large board is where both compact and an accidental drag
      // are most likely.
      // Canvas.save refuses on a read-only board and says so, so this does not
      // check first: a silent key is worse than one that explains itself.
      if (event.key === 'u') { event.preventDefault(); canvas.current?.releaseSelected() }
      if ((event.key === 'Delete' || event.key === 'Backspace') && latest.current.selected && !frameLatest.current.selected && !frameLatest.current.draft && !frameRequest.current) {
        event.preventDefault()
        const ticket = store.state.tickets.get(latest.current.selected)
        if (ticket) void actions.current.remove(ticket)
      }
    }
    document.addEventListener('keydown', keyboard)
    const leaving = () => flushView()
    window.addEventListener('pagehide', leaving)
    return () => {
      mounted.current = false
      cancelAnimationFrame(fitFrame.current)
      document.removeEventListener('keydown', keyboard)
      window.removeEventListener('pagehide', leaving)
      flushView()
    }
  }, [store, registry])
  const activeFilters = { statuses: ui.filters, labels: ui.labelFilters, labelMatch: ui.labelMatch, query: ui.query }
  const matches = (ticket: Ticket) =>
    matchesTicket(ticket, activeFilters)
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
  // Only ever consulted when the board came back empty, and it re-counts the
  // store once per candidate to do it. That is a handful of passes over the
  // tickets already in memory, and it happens on the one render where there is
  // nothing else to draw.
  const emptyHelp = emptyBoardHelp(snapshot.tickets.values(), activeFilters)
  const relax = (kind: Relaxation['kind']) => setUI(current => kind === 'labelMatch' ? { ...current, labelMatch: 'any' }
    : kind === 'labels' ? { ...current, labelFilters: new Map() }
      : kind === 'statuses' ? { ...current, filters: new Set<string>() }
        : { ...current, query: '' })
  // The inspector explains the selected card by the same resolver the pen layer
  // places it with, so the panel cannot disagree with the board.
  const selectedTicket = snapshot.tickets.get(ui.selected || '') || null
  const routing = { pens: snapshot.pens ?? {}, ruleOrder: snapshot.ruleOrder ?? [], inbox: snapshot.inbox ?? { x: 0, y: 0 } }
  // While a preview is held the board is drawn by the previewed rules, so
  // the pen layer and every automatic card show where things would land.
  const shownRouting = pensUI.previewed ?? routing
  const pensOpen = pensUI.open && !!pensUI.draft && !!pensUI.base
  return <>
    <div id="syncStatus" role="status" class="sync-status" hidden={!syncMessage}
      data-connection={sync.connection} data-stale={sync.stale} data-degraded={sync.degraded}>{syncMessage}</div>
    {emptyHelp && <div id="filterNotice" class="filter-notice" role="status">
      <p class="filter-notice-reason">{emptyHelp.reason}</p>
      {!!emptyHelp.offers.length && <div class="filter-notice-offers">{emptyHelp.offers.map(offer =>
        <button key={offer.kind} type="button" class="tool" data-relax={offer.kind}
          onClick={() => relax(offer.kind)}>{offer.label} <span class="badge">{offer.count}</span></button>)}</div>}
    </div>}
    <div id="toolbarRoot" data-store-publications={publications.current}><Toolbar layout={display.settings.layout} storePath={snapshot.storePath} readOnly={snapshot.readOnly} version={version}
      boards={snapshot.boards} board={snapshot.board} config={snapshot.config} query={ui.query} filters={ui.filters}
      counts={`${[...snapshot.tickets.values()].filter(matches).length} of ${snapshot.tickets.size}`}
      relationships={relationships} onRelationships={setRelationships}
      density={density} densityAutomatic={display.automatic.density}
      densityChosen={display.overrides.density !== undefined}
      onDensity={value => display.choose('density', value)}
      onDisplay={() => setDisplayOpen(true)}
      zoom={zoom} onZoomIn={() => canvas.current?.zoomBy(1.25)}
      onZoomOut={() => canvas.current?.zoomBy(1 / 1.25)}
      onZoomReset={() => canvas.current?.resetZoom()}
      // Not before the layout has been read: a draft begun over an empty board
      // would only be refused once the real one arrived.
      onPens={openPens} pensPending={pensUI.pending || snapshot.layoutSchema === null}
      onNewFrame={() => canvas.current?.newFrame()} onUndoFrame={() => { void frameHistoryAction(false) }} onRedoFrame={() => { void frameHistoryAction(true) }}
      framePending={!!framePreview} undoFrame={history.undoEntry} redoFrame={history.redoEntry}
      labels={labelUniverse(snapshot.config?.labels, snapshot.tickets.values())} labelFilters={ui.labelFilters}
      labelMatch={ui.labelMatch}
      onLabelFilter={label => setUI(current => ({ ...current, labelFilters: cycleLabel(current.labelFilters, label) }))}
      onClearLabelFilters={() => setUI(current => ({ ...current, labelFilters: new Map() }))}
      onLabelMatch={labelMatch => setUI(current => ({ ...current, labelMatch }))}
      onQuery={query => setUI(current => ({ ...current, query }))}
      onFilter={status => setUI(current => {
        const filters = new Set(current.filters); filters.has(status) ? filters.delete(status) : filters.add(status)
        return { ...current, filters }
      })} onBoard={name => { void changeBoard(name) }} onNewBoard={() => { void newBoard() }}
      stores={stores.length ? { stores, current: storeId, recent: recent.current,
        onOpen: openStore, onBrowse: () => setBrowsing(true) } : undefined}
      account={session?.authenticated ? { name: session.name || session.email || session.subject || 'Account',
        onOpen: () => setAccount(true) } : undefined}
      selecting={ui.selecting ? { count: ui.selection.size, onDone: () => setUI(current => ({ ...current, selecting: false })) } : undefined}
      onNew={() => canvas.current?.composeCentre()} onFit={() => canvas.current?.fit()} onArrange={arrange} /></div>
    {account && session?.authenticated && <SessionDialog session={session} store={storeId || ''}
      actor={actor} actorError={actorError} busy={actorBusy} people={peopleList}
      onActor={wanted => { void chooseActor(wanted) }} onClose={() => setAccount(false)} />}
    {displayOpen && <DisplayDialog display={display} onClose={() => setDisplayOpen(false)} />}
    {browsing && <StoreBrowser stores={stores} current={storeId} busy={rescanning}
      onOpen={openStore} onFavorite={(name, favorite) => { void toggleFavorite(name, favorite) }}
      onRescan={() => { void rescan() }} onClose={() => setBrowsing(false)} />}
    <Canvas key={ui.generation} ref={canvas} board={snapshot.board} tickets={snapshot.tickets} cards={displayed.cards}
      frames={displayed.frames} selectedFrame={frameUI.selected} frameCreating={!!frameUI.draft} layoutBusy={!!framePreview || !!pensUI.previewed || pensUI.pending}
      onSelectFrame={selectFrame} onNewFrame={newFrameDraft} onFrameMove={frameMove} onFrameResize={frameResize}
      statuses={snapshot.config?.statuses || []} priorities={snapshot.config?.priorities || []}
      pens={shownRouting.pens} ruleOrder={shownRouting.ruleOrder} inbox={shownRouting.inbox} selection={ui.selection} query={ui.query} filters={ui.filters} labelFilters={ui.labelFilters} labelMatch={ui.labelMatch}
      onView={viewChanged}
      relationships={relationships} density={density} fitFloor={display.floor} inspector={display.settings.inspector}
      layout={display.settings.layout} tip={!display.tipClosed} onTipClosed={display.closeTip} readOnly={snapshot.readOnly} onSelect={select} selecting={ui.selecting} onHold={hold} onToggle={toggle}
      onSelectionDone={() => setUI(current => ({ ...current, selecting: false }))} onLayout={saveLayout} onLink={link} linkRefusal={linkRefusal} onCompose={compose}
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
        {pensOpen && <PensPanel key={ui.generation} accepted={routing} draft={pensUI.draft!} previewed={pensUI.previewed}
          tickets={snapshot.tickets} cards={snapshot.cards} config={snapshot.config} readOnly={snapshot.readOnly} pending={pensUI.pending}
          conflict={pensUI.conflict} onDraft={pensDraft} onPreview={pensPreview} onApply={pensApply} onCancel={pensCancel} onClose={closePens} />}
        <Inspector ticket={snapshot.tickets.get(ui.selected || '') || null} config={snapshot.config}
          tickets={snapshot.tickets} readOnly={snapshot.readOnly || !!framePreview || pensUI.pending} concealed={frameOpen || pensOpen} onPatch={patch} onClose={closeInspector}
          onNavigate={id => { select(id); canvas.current?.focus(id) }} onDelete={remove}>
          {ui.selected && <FrameMembership ticketId={ui.selected} frames={snapshot.frames} readOnly={snapshot.readOnly}
            pending={!!framePreview} onSelectFrame={selectFrame}
            onChange={target => performFrame(setMembership(frameState(), [ui.selected!], target))} />}
          {selectedTicket && <PlacementSection ticket={selectedTicket} pinned={snapshot.cards[selectedTicket.id] ?? null}
            explanation={explain(routing, selectedTicket, !!snapshot.cards[selectedTicket.id])} pens={routing.pens} inbox={routing.inbox}
            readOnly={snapshot.readOnly} pending={!!framePreview} onRelease={id => canvas.current?.release([id])} />}
        </Inspector>
        {ui.composer && <Composer key={ui.composerKey} position={ui.composer} readOnly={snapshot.readOnly}
          onCreate={create} onClose={() => closeComposer(ui.composer)} />}
        <FeedbackMessage feedback={feedback} />
      </div>
    </Canvas>
  </>
}
