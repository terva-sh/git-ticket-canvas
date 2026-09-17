import type { ComponentChildren } from 'preact'
import { forwardRef } from 'preact/compat'
import { useCallback, useImperativeHandle, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { autoPlace, cardWidthFor, DEFAULT_ZOOM, fitView, posOf, toScene, zoomAt, zoomTo } from '../platform/canvas/geometry'
import { captureMembers } from '../platform/canvas/frames'
import type { Density, Point, View } from '../platform/canvas/geometry'
import type { Card, CardChanges, Cards, Frame, Frames, Ticket } from '../platform/tickets/types'
import './FrameCanvas.css'
import { matchesTicket } from '../platform/tickets/filters'
import type { LabelFilters, LabelMatch } from '../platform/tickets/filters'
import { CardView } from './canvas/CardView'
import { Edges } from './canvas/Edges'
import type { Placement } from './canvas/Edges'
import { drawGrid } from './canvas/grid'
import { useMeasurements } from './canvas/useMeasurements'
import { ControlMeasurements } from './canvas/controlMeasurements'
import { SampledFrame } from './canvas/SampledFrame'

const empty: LabelFilters = new Map()

export interface CanvasProps {
  /** Told whenever the view moves, because it is a ref and nothing outside this
   * component can see it change. Called per motion frame during a drag, so a
   * listener that does more than compare must debounce. */
  onView?(view: View): void
  samplingProbe?: import('./canvas/committedSampling').CommittedSampling
  samplingPublication?: import('./canvas/committedSampling').SamplingPublication | null
  samplingReady?: () => boolean
  publicationBridge?: import('../platform/canvas/publications').PublicationBridge
  publication?: import('../platform/canvas/publications').Publication | null
  publicationReady?: () => boolean
  board: string
  tickets: ReadonlyMap<string, Ticket>
  cards: Cards
  frames?: Frames
  selectedFrame?: string | null
  frameCreating?: boolean
  layoutBusy?: boolean
  onSelectFrame?: (id: string) => void
  onNewFrame?: (frame: Frame) => void
  onFrameMove?: (id: string, before: Frame, dx: number, dy: number, positions: ReadonlyMap<string, Point>, cards: Cards) => Promise<unknown>
  onFrameResize?: (id: string, before: Frame, next: Frame) => Promise<unknown>
  statuses: readonly string[]
  selection: ReadonlySet<string>
  relationships?: import('./canvas/Edges').RelationshipMode
  /** How much of a card to show. Defaults to the full presentation. */
  density?: Density
  /** How far a fit may shrink the board. A small screen would otherwise frame
   * a large board at a magnification nobody can read. */
  fitFloor?: number
  /** Where the inspector sits. A fit reserves room for it only where it sits
   * beside the board; a sheet that covers the board is transient and reserving
   * for it would frame every board into a corner. */
  inspector?: import('../platform/canvas/viewport').InspectorPlacement
  query: string
  filters: ReadonlySet<string>
  labelFilters?: LabelFilters
  /** Carried rather than defaulted here: the toolbar owns which mode is in
      force, and a card deciding for itself is how dimming and the count come
      to disagree about what the same filters mean. */
  labelMatch?: LabelMatch
  readOnly: boolean
  onSelect: (id: string, additive: boolean) => void
  onLayout: (board: string, cards: CardChanges) => Promise<unknown>
  /** The drop target waits on the source: onLink(prerequisite, dependent). */
  onLink: (from: string, to: string) => Promise<unknown>
  onCompose: (point: { x: number; y: number; sceneX: number; sceneY: number }) => void
  onError: (message: string) => void
  onBusy: (busy: boolean) => void
  children?: ComponentChildren
}

export interface CanvasHandle {
  fit(): void
  /** Hand every selected card back to automatic placement. */
  releaseSelected(): void
  /** Put the board back at an exact view. */
  setView(view: View): void
  /** Multiply the magnification, about the centre of the viewport. */
  zoomBy(factor: number): void
  /** Set an exact magnification, about the centre of the viewport. */
  zoomTo(k: number): void
  /** Back to 1:1. Distinct from fit, which frames every card instead. */
  resetZoom(): void
  focus(id: string): void
  arrange(): void
  composeCentre(): void
  cancel(): void
  newFrame(): void
  captureFrame(frame: Frame): string[]
  framePositions(): ReadonlyMap<string, Point>
  layoutReady(): boolean
}

interface GestureBase {
  pointerId: number
  capture: HTMLDivElement
  pointer: Point
  view: View
  // Freeze both positions and pin styling. Polls and older save completions must
  // not change a gesture's start, even before its first motion frame.
  positions: Map<string, Placement>
  endBusy: () => void
}
type Gesture = GestureBase & (
  | { kind: 'pan' }
  | { kind: 'card'; ids: string[]; moved: boolean; delta: Point; readOnly: boolean }
  | { kind: 'link'; from: string; to: string | null; point: Point }
  | { kind: 'frame-move' | 'frame-resize'; id: string; before: Frame; next: Frame; cards: Cards; delta: Point; moved: boolean }
  | { kind: 'frame-draw'; start: Point; bounds: Frame }
)
interface LocalState {
  view: View
  /** A null is a removal in flight: the card is going back to the rules. */
  previews: Map<string, Card | null>
  gesture: Gesture | null
  motion: Point | null
  frame: number | null
  frameCount: number
  mounted: boolean
}

/** Parent owns accepted cards and write ordering; this component owns only UI previews. */
export const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas(props, ref) {
  const stage = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLCanvasElement>(null)
  const latest = useRef(props)
  latest.current = props
  /** The card width the current density renders at. A callback reads it from
   * here rather than closing over a width, because density changes between a
   * gesture starting and the callback running. */
  const activeWidth = () => cardWidthFor(latest.current.density ?? 'full')
  const local = useRef<LocalState>({
    view: { x: 120, y: 90, k: 1 }, previews: new Map<string, Card | null>(), gesture: null,
    motion: null, frame: null, frameCount: 0, mounted: false,
  }).current
  const [, setRevision] = useState(0)
  const redraw = () => setRevision(n => n + 1)
  // The view is a ref so that a wheel gesture can keep every delta and render
  // once a frame. That means nothing outside here sees it change, so a control
  // that displays the level has to be told.
  const reportView = () => latest.current.onView?.(local.view)
  const commitView = (view: View) => {
    local.view = view
    reportView()
    redraw()
  }
  const measurements = useMeasurements(stage)
  const [controls] = useState(() => new ControlMeasurements())
  const controlsChanged = useCallback(() => { if (local.mounted) setRevision(n => n + 1) }, [local])
  const placementCalculations = useRef(0)

  // Sample this committed publication only. Busy(false) is earlier than drop
  // preview installation and must never flush diagnostic placement itself.
  useLayoutEffect(() => {
    const bridge = props.publicationBridge, publication = props.publication
    const ready = () => local.mounted && !local.gesture && !local.previews.size
      && !latest.current.layoutBusy && !!latest.current.publicationReady?.()
    if (!bridge || !publication || !ready()) return
    const request = bridge.request(publication)
    if (!request) return
    const sample = measurements.sample(request)
    if (sample) bridge.report(request, sample, ready())
  }, [props.publicationBridge, props.publication, measurements.sizes, !!local.gesture, local.previews.size, props.layoutBusy])

  useLayoutEffect(() => {
    const probe = props.samplingProbe, publication = props.samplingPublication
    const ready = () => local.mounted && !local.gesture && !local.previews.size
      && !latest.current.layoutBusy && latest.current.samplingPublication === publication && !!latest.current.samplingReady?.()
    if (!probe || !publication || !ready()) return
    const source = () => {
      const cards = measurements.sampleCards()
      if (!cards || cards.some(card => !card.incarnation)) return null
      return { cards: cards as import('./canvas/committedSampling').SampleCard[], controls: controls.sample() }
    }
    const request = probe.request(publication, source)
    if (request) probe.sample(request, source, ready)
  })

  function positions(): Map<string, Placement> {
    placementCalculations.current++
    const p = latest.current
    // Spreading the previews would leave a null under the id. `isPinned` and
    // `posOf` both test truthiness so it would behave, but a card on its way
    // back to the rules has no saved position and the set should say so.
    const pinned: Cards = { ...p.cards }
    for (const [id, card] of local.previews) {
      if (card) pinned[id] = card
      else delete pinned[id]
    }
    const automatic = autoPlace(p.tickets.values(), pinned, p.statuses)
    const result = new Map<string, Placement>()
    for (const id of p.tickets.keys()) {
      const frozen = local.gesture?.positions.get(id)
      const placement = frozen ?? { ...posOf(id, pinned, automatic), pinned: !!pinned[id], z: pinned[id]?.z || 1 }
      const gesture = local.gesture
      if (gesture?.kind === 'card' && gesture.moved && !gesture.readOnly && gesture.ids.includes(id)) {
        result.set(id, { ...placement, x: placement.x + gesture.delta.x, y: placement.y + gesture.delta.y })
      } else if (gesture?.kind === 'frame-move' && gesture.moved && gesture.before.members.includes(id)) {
        result.set(id, { ...placement, x: placement.x + gesture.delta.x, y: placement.y + gesture.delta.y, pinned: true })
      } else result.set(id, placement)
    }
    return result
  }

  function cancelFrame() {
    if (local.frame !== null) cancelAnimationFrame(local.frame)
    local.frame = null
    local.motion = null
  }

  function release(): Gesture | null {
    cancelFrame()
    const gesture = local.gesture
    local.gesture = null
    if (!gesture) return null
    // Clear state before releasing; release can dispatch lostpointercapture.
    const element = gesture.capture
    try {
      if (element.hasPointerCapture(gesture.pointerId)) element.releasePointerCapture(gesture.pointerId)
    } catch { /* The browser may already have discarded a detached pointer. */ }
    gesture.endBusy()
    return gesture
  }

  function cancel() {
    const pendingFrame = local.frame !== null
    const gesture = release()
    // Wheel deltas update the view before their RAF; keep DOM and view in sync
    // even when Escape or a toolbar action cancels that scheduled render.
    if ((gesture || pendingFrame) && local.mounted) redraw()
  }

  function viewport() {
    const element = stage.current!
    const inspector = element.querySelector<HTMLElement>('#framePanel.open, #inspector.open')
    const bounds = element.getBoundingClientRect()
    if (inspector) {
      const panel = inspector.getBoundingClientRect()
      const beside = Math.round(panel.left - bounds.left)
      const above = Math.round(panel.top - bounds.top)
      // A panel that covers the stage in both directions leaves nothing to fit
      // into. It is an overlay somebody is about to close rather than a split,
      // so the fit works from the whole stage and ignores it.
      if (panel.width >= bounds.width - 1 && above <= 0) return { width: element.clientWidth, height: element.clientHeight }
      return panel.width >= bounds.width - 1
        ? { width: element.clientWidth, height: Math.max(1, above) }
        : { width: Math.max(1, beside), height: element.clientHeight }
    }
    // Room held back for an inspector that is not open yet, so opening one does
    // not push the board somebody just framed. Only where it will sit beside
    // the board: a sheet covers it and holding room back for that would frame
    // every board into a corner it never needed.
    return { width: latest.current.inspector === 'beside' ? Math.max(320, element.clientWidth - 400) : element.clientWidth,
      height: element.clientHeight }
  }

  function fit() {
    const element = stage.current
    if (!element) return
    cancel()
    const view = fitView([
      // Stamp the active width on each card. `fitView` falls back to the full
      // width per card, so a compact board would otherwise fit as if every
      // card were still 280 wide.
      ...[...positions()].map(([id, point]) => ({ ...point, width: activeWidth(),
        height: measurements.elements.get(id)?.offsetHeight ?? measurements.heights.get(id) })),
      ...Object.values(latest.current.frames || {}).map(frame => ({ x: frame.x, y: frame.y - 24,
        width: frame.w, height: frame.h + 24 })),
    ], viewport(), 0, latest.current.fitFloor)
    if (view) commitView(view)
  }

  function compose(client: Point) {
    const element = stage.current
    if (!element) return
    const p = latest.current
    if (p.readOnly) { p.onError('read-only'); return }
    const bounds = element.getBoundingClientRect()
    const scene = toScene(client, local.view, bounds)
    p.onCompose({ x: client.x - bounds.left, y: client.y - bounds.top, sceneX: scene.x, sceneY: scene.y })
  }

  function save(changes: CardChanges) {
    if (!Object.keys(changes).length) return
    const p = latest.current
    if (p.readOnly) { p.onError('read-only'); return }
    // Each save owns its exact preview objects. An older completion cannot
    // remove a later drag or arrange preview for the same card.
    for (const [id, card] of Object.entries(changes)) local.previews.set(id, card)
    redraw()
    const complete = () => {
      if (!local.mounted) return
      for (const [id, card] of Object.entries(changes)) {
        if (local.previews.get(id) === card) local.previews.delete(id)
      }
      redraw()
    }
    const failed = (error: unknown) => {
      // A committed drop still needs failure feedback after a board switch.
      // The application ignores this callback only after the whole app unmounts.
      p.onError(`Could not save board ${p.board}: ${error instanceof Error ? error.message : String(error)}`)
    }
    try { void p.onLayout(p.board, changes).then(complete, error => { failed(error); complete() }) }
    catch (error) { failed(error); complete() }
  }

  /** Hand cards back to the rules. A saved position is the only thing that
   * makes a card manual, so removing it is the whole operation.
   *
   * Dragging moves every selected card, so this releases every selected card
   * when the pressed one is in the selection, and just that card when it is
   * not. Anything already automatic is dropped rather than written as a
   * redundant removal that would still cost a round trip.
   */
  function releaseCards(ids: readonly string[]) {
    const p = latest.current
    const changes: CardChanges = {}
    for (const id of ids) if (p.cards[id]) changes[id] = null
    save(changes)
  }
  // Stable, because CardView is memoized and a fresh callback per render would
  // re-render every card on every pan frame. It reads the selection through
  // `latest` for the same reason every other callback here does.
  const releaseCard = useCallback((id: string) => {
    const p = latest.current
    releaseCards(p.selection.has(id) ? [...p.selection] : [id])
  }, [])

  function captureFrame(frame: Frame) {
    return captureMembers(latest.current.frames || {}, frame, [...positions()].map(([id, point]) => ({
      id, x: point.x, y: point.y, w: activeWidth(),
      h: measurements.elements.get(id)?.offsetHeight ?? measurements.heights.get(id) ?? 240,
    })))
  }

  useImperativeHandle(ref, () => ({
    fit,
    // Compact density hides the card head, and with it the only control this
    // has. A board read at compact is exactly the large one somebody most
    // needs to undo a drag on, so the keyboard reaches it too.
    releaseSelected() { releaseCards([...latest.current.selection]) },
    // Used to put somebody back where they left a board they are already
    // looking at. Coming back to a board this component was not mounted for
    // goes through initialView instead, which nothing can race.
    setView(view: View) { cancel(); commitView({ ...view }) },
    // A control has no pointer on the board, so these hold the middle of the
    // viewport still rather than zooming about a corner.
    zoomBy(factor: number) {
      if (!stage.current) return
      const bounds = stage.current.getBoundingClientRect()
      commitView(zoomTo(local.view, local.view.k * factor, bounds))
    },
    zoomTo(k: number) {
      if (!stage.current) return
      const bounds = stage.current.getBoundingClientRect()
      commitView(zoomTo(local.view, k, bounds))
    },
    // Distinct from fit: fit frames everything, which is what you want when you
    // have lost the board. This is 1:1, which is what you want when you have
    // chosen a magnification and drifted off it.
    resetZoom() {
      if (!stage.current) return
      const bounds = stage.current.getBoundingClientRect()
      commitView(zoomTo(local.view, DEFAULT_ZOOM, bounds))
    },
    captureFrame,
    framePositions: positions,
    layoutReady: () => !local.gesture && !local.previews.size,
    newFrame() {
      if (latest.current.readOnly || latest.current.layoutBusy || !stage.current) return
      cancel()
      const bounds = stage.current.getBoundingClientRect()
      const point = toScene({ x: bounds.left + 60, y: bounds.top + 60 }, local.view, bounds)
      latest.current.onNewFrame?.({ title: 'New frame', x: Math.round(point.x), y: Math.round(point.y), w: 620, h: 420,
        color: '#759bcc', members: [] })
    },
    focus(id) {
      if (!latest.current.tickets.has(id) || !stage.current) return
      cancel()
      const point = positions().get(id)!
      const k = local.view.k
      local.view = {
        x: viewport().width / 2 - (point.x + activeWidth() / 2) * k,
        y: viewport().height / 2 - (point.y + (measurements.heights.get(id) ?? 120) / 2) * k,
        k,
      }
      reportView()
      redraw()
    },
    arrange() {
      if (latest.current.readOnly || latest.current.layoutBusy) return
      cancel()
      // Confirmation belongs to the toolbar's parent, not the canvas.
      save(Object.fromEntries(autoPlace(latest.current.tickets.values(), {}, latest.current.statuses)))
      fit()
    },
    composeCentre() {
      if (!stage.current) return
      cancel()
      const bounds = stage.current.getBoundingClientRect()
      compose({ x: bounds.left + viewport().width / 2,
        y: bounds.top + viewport().height / 2 })
    },
    cancel,
  }))

  function canvasTarget(target: EventTarget | null): Element | null {
    if (!(target instanceof Element) || !stage.current?.contains(target)) return null
    if (target.closest('#framePanel, .frame-membership, #frameHistory, #inspector, #composer, #toolbar, input, select, textarea, summary, .card-label-disclosure')) return null
    if (target.closest('button') && !target.closest('.canvas-frame-title, .canvas-frame-resize')) return null
    // Unknown children are overlays too. Only the canvas's own elements start gestures.
    if (target !== stage.current && !target.closest('#scene, #grid, #hint')) return null
    return target
  }

  function pointerDown(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0 || local.gesture) return
    const target = canvasTarget(event.target)
    const element = stage.current
    if (!target || !element) return
    cancelFrame()
    const p = latest.current
    const frameHandle = target.closest<HTMLElement>('[data-frame-gesture]')
    const frameID = frameHandle?.dataset.frameId
    const frame = frameID ? p.frames?.[frameID] : undefined
    if (p.layoutBusy && (frame || target.closest('#cards .card') || p.frameCreating)) return
    const card = target.closest<HTMLDivElement>('#cards .card')
    const id = card?.dataset.id
    const handle = target.closest('.handle')
    const pointer = { x: event.clientX, y: event.clientY }
    const base: GestureBase = { pointerId: event.pointerId, capture: element, pointer, view: { ...local.view },
      positions: positions(), endBusy: () => p.onBusy(false) }
    let gesture: Gesture
    if (frame && frameID) {
      p.onSelectFrame?.(frameID)
      if (p.readOnly || local.previews.size) return
      gesture = { ...base, kind: frameHandle?.dataset.frameGesture === 'resize' ? 'frame-resize' : 'frame-move',
        id: frameID, before: structuredClone(frame), next: structuredClone(frame), cards: structuredClone(p.cards),
        delta: { x: 0, y: 0 }, moved: false }
    } else if (p.frameCreating && !p.readOnly && !card) {
      const start = toScene(pointer, local.view, element.getBoundingClientRect())
      gesture = { ...base, kind: 'frame-draw', start,
        bounds: { title: 'New frame', ...start, w: 0, h: 0, color: '#759bcc', members: [] } }
    } else if (id && p.tickets.has(id)) {
      if (handle && !p.readOnly) {
        gesture = { ...base, kind: 'link', from: id, to: null,
          point: toScene(pointer, local.view, element.getBoundingClientRect()) }
      } else {
        const ids = p.selection.has(id) || event.shiftKey ? new Set(p.selection) : new Set<string>()
        ids.add(id)
        gesture = { ...base, kind: 'card', ids: [...ids].filter(key => p.tickets.has(key)),
          moved: false, delta: { x: 0, y: 0 }, readOnly: p.readOnly }
        // Additive selection on an already selected card retains a multi-drag.
        p.onSelect(id, event.shiftKey || p.selection.has(id))
      }
    } else gesture = { ...base, kind: 'pan' }
    try { element.setPointerCapture(event.pointerId) }
    catch { return } // A detached stage cannot own a gesture.
    local.gesture = gesture
    p.onBusy(true)
    event.preventDefault()
    redraw()
  }

  function applyMotion(point: Point) {
    const gesture = local.gesture
    const element = stage.current
    if (!gesture || !element) return
    if (gesture.kind === 'pan') {
      local.view = { ...gesture.view, x: gesture.view.x + point.x - gesture.pointer.x,
        y: gesture.view.y + point.y - gesture.pointer.y }
      reportView()
    } else if (gesture.kind === 'card') {
      const dx = (point.x - gesture.pointer.x) / gesture.view.k
      const dy = (point.y - gesture.pointer.y) / gesture.view.k
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) gesture.moved = true
      gesture.delta = { x: dx, y: dy }
    } else if (gesture.kind === 'frame-move' || gesture.kind === 'frame-resize') {
      const dx = Math.round((point.x - gesture.pointer.x) / gesture.view.k)
      const dy = Math.round((point.y - gesture.pointer.y) / gesture.view.k)
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) gesture.moved = true
      gesture.delta = { x: dx, y: dy }
      gesture.next = gesture.kind === 'frame-move' ? { ...gesture.before, x: gesture.before.x + dx, y: gesture.before.y + dy }
        : { ...gesture.before, w: Math.max(80, gesture.before.w + dx), h: Math.max(80, gesture.before.h + dy) }
    } else if (gesture.kind === 'frame-draw') {
      const next = toScene(point, gesture.view, element.getBoundingClientRect())
      gesture.bounds = { ...gesture.bounds, x: Math.round(Math.min(next.x, gesture.start.x)), y: Math.round(Math.min(next.y, gesture.start.y)),
        w: Math.round(Math.abs(next.x - gesture.start.x)), h: Math.round(Math.abs(next.y - gesture.start.y)) }
    } else if (gesture.kind === 'link') {
      const target = document.elementFromPoint(point.x, point.y)?.closest<HTMLDivElement>('#cards .card')
      const id = target && element.contains(target) ? target.dataset.id : undefined
      gesture.to = id && id !== gesture.from && latest.current.tickets.has(id) ? id : null
      gesture.point = toScene(point, gesture.view, element.getBoundingClientRect())
    }
  }

  function pointerMove(event: PointerEvent) {
    if (!local.gesture || event.pointerId !== local.gesture.pointerId || !event.isPrimary || event.buttons !== 1) return
    local.motion = { x: event.clientX, y: event.clientY }
    if (local.frame !== null) return
    local.frame = requestAnimationFrame(() => {
      local.frame = null
      if (!local.mounted || !local.motion) return
      applyMotion(local.motion)
      local.motion = null
      local.frameCount++
      redraw()
    })
  }

  function pointerUp(event: PointerEvent) {
    if (!local.gesture || event.pointerId !== local.gesture.pointerId || event.button !== 0 || !event.isPrimary) return
    // The final point can arrive before the queued RAF. Do not save the previous frame.
    applyMotion({ x: event.clientX, y: event.clientY })
    const current = positions()
    const gesture = release()
    redraw()
    if (!gesture) return
    const p = latest.current
    if (gesture.kind === 'frame-draw') {
      if (!p.readOnly && !p.layoutBusy && gesture.bounds.w >= 80 && gesture.bounds.h >= 80) p.onNewFrame?.(gesture.bounds)
    } else if (gesture.kind === 'frame-move' || gesture.kind === 'frame-resize') {
      if (!gesture.moved || p.readOnly || p.layoutBusy) return
      const result = gesture.kind === 'frame-move'
        ? p.onFrameMove?.(gesture.id, gesture.before, gesture.delta.x, gesture.delta.y, gesture.positions, gesture.cards)
        : p.onFrameResize?.(gesture.id, gesture.before, gesture.next)
      void result?.catch(error => p.onError(error instanceof Error ? error.message : String(error)))
    } else if (gesture.kind === 'card' && gesture.moved) {
      if (gesture.readOnly || p.readOnly) { p.onError('read-only'); return }
      const changes: Cards = {}
      for (const id of gesture.ids) {
        const point = current.get(id)
        if (point) changes[id] = { x: Math.round(point.x), y: Math.round(point.y) }
      }
      save(changes)
    } else if (gesture.kind === 'link' && gesture.to) {
      if (p.readOnly) { p.onError('read-only'); return }
      if (!p.tickets.has(gesture.from) || !p.tickets.has(gesture.to)) return
      const failed = (error: unknown) => {
        if (local.mounted) latest.current.onError(error instanceof Error ? error.message : String(error))
      }
      try { void p.onLink(gesture.from, gesture.to).catch(failed) }
      catch (error) { failed(error) }
    }
  }

  function pointerCancel(event: PointerEvent) {
    if (event.pointerId === local.gesture?.pointerId) cancel()
  }

  function wheel(event: WheelEvent) {
    if (!canvasTarget(event.target)) return
    event.preventDefault()
    if (local.gesture || !stage.current) return
    // Updating the ref preserves every wheel delta while only rendering once per frame.
    local.view = zoomAt(local.view, { x: event.clientX, y: event.clientY }, stage.current.getBoundingClientRect(), event.deltaY)
    reportView()
    if (local.frame !== null) return
    local.frame = requestAnimationFrame(() => {
      local.frame = null
      if (local.mounted) { local.frameCount++; redraw() }
    })
  }

  // Native listeners give wheel an explicit passive:false and share one cleanup path.
  // Indirection keeps listeners stable without retaining old props or callback closures.
  const handlers = useRef({ pointerDown, pointerMove, pointerUp, pointerCancel, wheel, cancel })
  handlers.current = { pointerDown, pointerMove, pointerUp, pointerCancel, wheel, cancel }
  useLayoutEffect(() => {
    local.mounted = true
    const element = stage.current!
    const down = (event: PointerEvent) => handlers.current.pointerDown(event)
    const move = (event: PointerEvent) => handlers.current.pointerMove(event)
    const up = (event: PointerEvent) => handlers.current.pointerUp(event)
    const abort = (event: PointerEvent) => handlers.current.pointerCancel(event)
    const scroll = (event: WheelEvent) => handlers.current.wheel(event)
    const blur = () => handlers.current.cancel()
    element.addEventListener('pointerdown', down)
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerup', up)
    element.addEventListener('pointercancel', abort)
    element.addEventListener('lostpointercapture', abort)
    element.addEventListener('wheel', scroll, { passive: false })
    window.addEventListener('blur', blur)
    return () => {
      local.mounted = false
      element.removeEventListener('pointerdown', down)
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', up)
      element.removeEventListener('pointercancel', abort)
      element.removeEventListener('lostpointercapture', abort)
      element.removeEventListener('wheel', scroll)
      window.removeEventListener('blur', blur)
      handlers.current.cancel()
    }
  }, [])

  useLayoutEffect(() => {
    if (props.readOnly && local.gesture?.kind !== 'pan') cancel()
  }, [props.readOnly])

  const view = local.view
  useLayoutEffect(() => {
    if (grid.current && stage.current) drawGrid(grid.current, stage.current, view)
  }, [view, measurements.viewportRevision])

  const placed = positions()
  // The same predicate the toolbar counts with, so a dimmed card and the count
  // can never disagree about what the filters mean.
  const matching = new Set([...props.tickets.values()].filter(ticket => matchesTicket(ticket,
    { statuses: props.filters, labels: props.labelFilters || empty, labelMatch: props.labelMatch, query: props.query })).map(t => t.id))
  const gesture = local.gesture
  const ghost = gesture?.kind === 'link' ? { from: gesture.from, point: gesture.point } : null
  // One width for this render. The stylesheet, the edge anchors and the fit
  // bounds all take it from here rather than choosing a constant themselves.
  const cardWidth = activeWidth()
  return <div id="stage" ref={stage} data-canvas-frame={local.frameCount}
    data-placement-calculations={placementCalculations.current}
    class={gesture?.kind === 'pan' ? 'panning' : gesture?.kind === 'link' ? 'linking' : ''}
    style={{ touchAction: 'none' }}
    onDblClick={event => {
      const target = canvasTarget(event.target)
      if (event.button === 0 && target && !target.closest('.card, .canvas-frame') && !local.gesture && !props.frameCreating) compose({ x: event.clientX, y: event.clientY })
    }}>
    <canvas id="grid" ref={grid} />
    <div id="scene" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
      '--card-w': `${cardWidth}px` }}>
      <div id="frameLayer">{Object.entries(props.frames || {}).map(([id, accepted]) => {
        const frame = (gesture?.kind === 'frame-move' || gesture?.kind === 'frame-resize') && gesture.id === id ? gesture.next : accepted
        const dimmed = frame.members.filter(member => props.tickets.has(member) && !matching.has(member)).length
        if (props.samplingProbe) return <SampledFrame key={id} id={id} frame={frame} dimmed={dimmed}
          selected={props.selectedFrame === id} readOnly={props.readOnly} busy={props.layoutBusy}
          controls={controls} changed={controlsChanged} onSelect={props.onSelectFrame} />
        return <div key={id} class={`canvas-frame ${props.selectedFrame === id ? 'selected' : ''}`} data-frame-id={id}
          style={{ transform: `translate(${frame.x}px, ${frame.y}px)`, width: `${frame.w}px`, height: `${frame.h}px`, '--frame-color': frame.color }}>
          <button class="canvas-frame-title" data-frame-id={id} data-frame-gesture="move"
            onClick={() => props.onSelectFrame?.(id)}>{frame.title} · {frame.members.length} members{dimmed > 0 && ` · ${dimmed} filtered`}</button>
          {!props.readOnly && <button class="canvas-frame-resize" data-frame-id={id} data-frame-gesture="resize"
            disabled={props.layoutBusy} aria-label={`Resize ${frame.title} boundary only`} onClick={() => props.onSelectFrame?.(id)}>↘</button>}
        </div>
      })}</div>
      {gesture?.kind === 'frame-draw' && <div class="canvas-frame-draft" style={{ left: gesture.bounds.x, top: gesture.bounds.y,
        width: gesture.bounds.w, height: gesture.bounds.h }} />}
      <Edges tickets={props.tickets} positions={placed} heights={measurements.heights} matching={matching} ghost={ghost}
        mode={props.relationships} selection={props.selection} cardWidth={cardWidth} />
      <div id="cards">{[...props.tickets.values()].map(ticket => {
        const point = placed.get(ticket.id)!
        return <CardView key={ticket.id} ticket={ticket} x={point.x} y={point.y} z={point.z} pinned={point.pinned}
          selected={props.selection.has(ticket.id)} dimmed={!matching.has(ticket.id)}
          frameTitle={Object.values(props.frames || {}).find(frame => frame.members.includes(ticket.id))?.title}
          frameMember={!!props.selectedFrame && !!props.frames?.[props.selectedFrame]?.members.includes(ticket.id)}
          target={gesture?.kind === 'link' && gesture.to === ticket.id} register={measurements.register}
          density={props.density} onRelease={props.readOnly ? undefined : releaseCard}
          incarnation={props.samplingPublication?.tickets.find(item => item.id === ticket.id)?.incarnation} />
      })}</div>
    </div>
    {props.frameCreating && <div id="frameDrawHint" role="status">Draw on empty canvas to capture card centers, or enter bounds in the frame panel. Escape cancels.</div>}
    <div id="hint">drag canvas to pan · scroll to zoom · double-click to file a ticket · drag the right handle to link
      {!props.readOnly && ' · u hands the selection back to automatic placement'}
      {props.relationships !== 'none' && <div>Solid arrow: ticket → dependency · Dashed warm arrow: parent → child · hover or select to name one edge</div>}
    </div>
    {props.children}
  </div>
})
