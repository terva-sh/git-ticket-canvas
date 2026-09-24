import type { ComponentChildren } from 'preact'
import { forwardRef } from 'preact/compat'
import { useCallback, useImperativeHandle, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { cardWidthFor, DEFAULT_ZOOM, fitView, pinchView, posOf, toScene, zoomAt, zoomTo } from '../platform/canvas/geometry'
import { resolveBoard } from '../platform/canvas/resolve'
import { captureMembers } from '../platform/canvas/frames'
import type { Density, Point, View } from '../platform/canvas/geometry'
import type { Card, CardChanges, Cards, Frame, Frames, Pens, Ticket } from '../platform/tickets/types'
import './FrameCanvas.css'
import { matchesTicket } from '../platform/tickets/filters'
import type { LabelFilters, LabelMatch } from '../platform/tickets/filters'
import { CardView } from './canvas/CardView'
import { Edges } from './canvas/Edges'
import type { Placement } from './canvas/Edges'
import { drawGrid } from './canvas/grid'
import { useMeasurements } from './canvas/useMeasurements'

const empty: LabelFilters = new Map()
/** How far, in CSS pixels, a phone's press on a card may wander and still be a
 * tap that opens it. A fingertip is never perfectly still, and a pan that
 * opened a sheet whenever it happened to start on a card would cover the board
 * it was trying to move. */
const TAP_SLOP = 8
/** How long a finger has to stay on a card, within TAP_SLOP, to select it and
 * enter selection mode. A touch screen has no shift key. */
const HOLD_MS = 450
/** A second tap within this long and this near the first is a double tap. The
 * stage counts taps itself: whether a browser still synthesises `dblclick`
 * from touch once `touch-action` is `none` varies, so it is not trusted for
 * touch at all. */
const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_SLOP = 24
/** How long after a finger lifts a `dblclick` is taken to be the browser's
 * echo of that touch rather than a mouse. Long enough to cover a slow second
 * tap, and far shorter than anybody takes to put a finger down and pick up a
 * mouse. */
const TOUCH_ECHO_MS = 800

export interface CanvasProps {
  /** Told whenever the view moves, because it is a ref and nothing outside this
   * component can see it change. Called per motion frame during a drag, so a
   * listener that does more than compare must debounce. */
  onView?(view: View): void
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
  /** The board's rules, from the layout file. A board with no pens, or a
   * caller that passes none, places cards in status lanes as it always has. */
  pens?: Pens
  ruleOrder?: readonly string[]
  inbox?: Point
  /** The store's priority order, least urgent first, for packing a pen. */
  priorities?: readonly string[]
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
  /** What the board offers. A phone views and triages, so on `phone` nothing
   * here writes layout: a drag from a card pans, a tap opens it, and the link
   * handle, the frame handles and the Manual control are not drawn. */
  layout?: import('../platform/canvas/viewport').Layout
  /** Whether the phone's first-visit tip is still waiting to be closed. Only
   * the phone shows it, in place of the hint. */
  tip?: boolean
  onTipClosed?: () => void
  /** Whether the pointer is coarse. It chooses which hint describes the
   * board, because the hint is about hands, not about the size of the window. */
  coarse?: boolean
  query: string
  filters: ReadonlySet<string>
  labelFilters?: LabelFilters
  /** Carried rather than defaulted here: the toolbar owns which mode is in
      force, and a card deciding for itself is how dimming and the count come
      to disagree about what the same filters mean. */
  labelMatch?: LabelMatch
  readOnly: boolean
  onSelect: (id: string, additive: boolean) => void
  /** Whether selection mode is on. While it is, nothing selects on a press: a
   * tap on a card toggles it, and a tap on empty board leaves the mode. */
  selecting?: boolean
  /** A finger held still on a card for HOLD_MS: select it and enter the mode. */
  onHold?: (id: string) => void
  /** A tap on a card in selection mode. */
  onToggle?: (id: string) => void
  /** A tap on empty board in selection mode. */
  onSelectionDone?: () => void
  onLayout: (board: string, cards: CardChanges) => Promise<unknown>
  /** The drop target waits on the source: onLink(prerequisite, dependent). */
  onLink: (from: string, to: string) => Promise<unknown>
  /** Why a link from `from` dropped on `to` would be refused, or null when it
   * would not. Asked once per card the link enters, so the card can show the
   * refusal before the drop, and the drop can say why instead of writing. */
  linkRefusal?: (from: string, to: string) => string | null
  onCompose: (point: { x: number; y: number; sceneX: number; sceneY: number }) => void
  onError: (message: string) => void
  onBusy: (busy: boolean) => void
  children?: ComponentChildren
}

export interface CanvasHandle {
  fit(): void
  /** Hand every selected card back to automatic placement. */
  releaseSelected(): void
  /** Hand these cards back, whatever is selected: what the inspector's
   * control does for the one card it is showing. */
  release(ids: readonly string[]): void
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
  // `tap` is the card a phone's pan started on. If the pointer never travels
  // past TAP_SLOP, the lift was a tap and opens that card.
  // `moved` is tracked for every pan: a touch pan that never passed TAP_SLOP
  // was a tap, which names the edge it landed on (`edge`) or, on empty board
  // (`empty`), may be half of a double tap. `leave` is a press on empty board
  // in selection mode: if it stays a tap, the lift leaves the mode.
  | { kind: 'pan'; tap?: string; moved?: boolean; edge?: string; empty?: boolean; leave?: boolean }
  // `tap` is set in selection mode: a lift within TAP_SLOP toggles that card
  // and saves nothing.
  | { kind: 'card'; ids: string[]; moved: boolean; delta: Point; readOnly: boolean; tap?: string }
  // A refused card is never `to`: it gets no target highlight and the drop
  // writes nothing, as over empty board, and `refused` says why.
  | { kind: 'link'; from: string; to: string | null; refused: { id: string; message: string } | null; point: Point }
  | { kind: 'frame-move' | 'frame-resize'; id: string; before: Frame; next: Frame; cards: Cards; delta: Point; moved: boolean }
  | { kind: 'frame-draw'; start: Point; bounds: Frame }
)
/** Two fingers moving the board. Not a `Gesture`: it has two pointers, touches
 * no card, and saves nothing, so every path that ends a gesture by saving
 * would be one more place to remember that this one must not. */
interface Pinch {
  ids: readonly [number, number]
  /** Where both fingers were, and the view, when the second one landed. Each
   * frame is measured from here, never from the frame before. */
  from: readonly [Point, Point]
  view: View
  endBusy: () => void
}
/** A finger that has landed on a card and may yet be a long press. */
interface Hold {
  pointerId: number
  id: string
  /** Where the finger landed. More than TAP_SLOP from here is not a hold. */
  start: Point
  timer: ReturnType<typeof setTimeout>
}
interface LocalState {
  view: View
  /** A null is a removal in flight: the card is going back to the rules. */
  previews: Map<string, Card | null>
  gesture: Gesture | null
  /** Every finger down on the canvas, and where it is now. Filled
   * on a down over the canvas and emptied on a lift or a cancel, but not on a
   * lost capture: releasing capture is not a lift, and starting a pinch
   * releases the first finger's capture on purpose. */
  touches: Map<number, Point>
  pinch: Pinch | null
  hold: Hold | null
  /** The edge a tap named. It stays named until the next tap, because a
   * finger cannot hover and a name that left with the finger would never be
   * read. */
  named: string | null
  /** The last touch tap on empty board, waiting to see if a second follows. */
  lastTap: { at: number; point: Point } | null
  /** When a finger last lifted, so a `dblclick` echoing it can be ignored. */
  touchLift: number
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
    touches: new Map<number, Point>(), pinch: null, hold: null,
    named: null, lastTap: null, touchLift: -Infinity, motion: null, frame: null, frameCount: 0, mounted: false,
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
  const placementCalculations = useRef(0)

  /** The rules as the resolver reads them. Empty when the caller passed none. */
  const routing = (p: CanvasProps) => ({ pens: p.pens ?? {}, ruleOrder: p.ruleOrder ?? [], inbox: p.inbox ?? { x: 0, y: 0 } })

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
    const resolved = resolveBoard(p.tickets.values(), routing(p), pinned, p.statuses, p.priorities)
    const automatic = resolved.positions
    const result = new Map<string, Placement>()
    for (const id of p.tickets.keys()) {
      const frozen = local.gesture?.positions.get(id)
      // Unhoused is a fact about an automatic card the rules could not place;
      // a pinned card is where somebody put it, whatever the rules say.
      const unhoused = !pinned[id] && resolved.explanations.get(id)?.destination.kind === 'inbox'
      const placement = frozen ?? { ...posOf(id, pinned, automatic), pinned: !!pinned[id], z: pinned[id]?.z || 1, unhoused }
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

  function endHold() {
    if (local.hold) clearTimeout(local.hold.timer)
    local.hold = null
  }

  function release(): Gesture | null {
    // Whatever ends the gesture ends the hold with it: a lift, a cancel, and
    // a second finger, which starts a pinch by releasing this gesture.
    endHold()
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

  /** Stop following two fingers. The view stays wherever they took it: a
   * pinch writes nothing, so there is nothing to roll back. */
  function endPinch(): boolean {
    const pinch = local.pinch
    if (!pinch) return false
    local.pinch = null
    pinch.endBusy()
    return true
  }

  function cancel() {
    const pendingFrame = local.frame !== null
    const gesture = release()
    const pinched = endPinch()
    // Wheel deltas update the view before their RAF; keep DOM and view in sync
    // even when Escape or a toolbar action cancels that scheduled render.
    if ((gesture || pinched || pendingFrame) && local.mounted) redraw()
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
    release(ids: readonly string[]) { releaseCards(ids) },
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
      const p = latest.current
      save(Object.fromEntries(resolveBoard(p.tickets.values(), routing(p), {}, p.statuses, p.priorities).positions))
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
    // Only fingers are counted. A mouse is one pointer, and a stylus is one
    // too; a pinch is two fingers.
    if (event.pointerType === 'touch' && canvasTarget(event.target)) {
      // The primary pointer is the first finger of a new touch, so any finger
      // still recorded is one whose lift never arrived. Counting it would make
      // this finger the second of a pinch with a finger that is not there.
      if (event.isPrimary) local.touches.clear()
      local.touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
      // A third finger is ignored rather than turning the pinch into
      // something else. It is still counted, so its lift is not a surprise.
      if (local.pinch || local.touches.size > 2) return
      if (local.touches.size === 2) {
        startPinch()
        event.preventDefault()
        return
      }
    }
    startGesture(event)
  }

  /** The second finger has landed. Whatever the first one started is dropped
   * without saving, the same way a cancelled pointer drops it: a card goes
   * back to where it was, a link leaves no edge, a frame is not drawn. Two
   * fingers almost never mean "and keep dragging that card". */
  function startPinch() {
    const [[first, a], [second, b]] = [...local.touches]
    release()
    // Both fingers are captured to the board for as long as the pinch lasts.
    // Dropping the first finger's gesture released its capture, and a finger
    // that then wandered off the board would lift somewhere the board never
    // hears, leaving the pinch running after the fingers are gone.
    const element = stage.current
    for (const id of [first, second]) {
      try { element?.setPointerCapture(id) }
      catch { /* A finger already gone is lifted by its own event. */ }
    }
    const p = latest.current
    local.pinch = { ids: [first, second], from: [a, b], view: { ...local.view }, endBusy: () => p.onBusy(false) }
    p.onBusy(true)
    redraw()
  }

  /** Move the view to where the two fingers have taken it. */
  function applyPinch() {
    const pinch = local.pinch
    const element = stage.current
    if (!pinch || !element) return
    const a = local.touches.get(pinch.ids[0]), b = local.touches.get(pinch.ids[1])
    if (!a || !b) return
    local.view = pinchView(pinch.view, pinch.from, [a, b], element.getBoundingClientRect())
    reportView()
  }

  /** A finger has come off the canvas, by lifting or by the browser cancelling
   * it. If it was one of a pinch's two, the pinch ends where it got to, and a
   * finger still down carries on as a pan from where it is now. A pan and not
   * whatever it began before the pinch, because a finger left behind after a
   * pinch almost never means "now move this card". */
  function lift(event: PointerEvent) {
    const pinch = local.pinch
    if (pinch?.ids.includes(event.pointerId)) {
      local.touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
      applyPinch()
    }
    local.touches.delete(event.pointerId)
    if (!pinch?.ids.includes(event.pointerId)) return
    cancelFrame()
    endPinch()
    const rest = pinch.ids.find(id => local.touches.has(id))
    if (rest !== undefined) startPan(rest, local.touches.get(rest)!)
    if (local.mounted) { local.frameCount++; redraw() }
  }

  function startPan(pointerId: number, pointer: Point) {
    const element = stage.current
    if (!element || local.gesture) return
    const p = latest.current
    try { element.setPointerCapture(pointerId) }
    catch { return } // The finger may already be gone.
    // Moved from the start: a finger left behind by a pinch is never a tap.
    local.gesture = { kind: 'pan', moved: true, pointerId, capture: element, pointer, view: { ...local.view },
      positions: positions(), endBusy: () => p.onBusy(false) }
    p.onBusy(true)
  }

  function startGesture(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0 || local.gesture) return
    const target = canvasTarget(event.target)
    const element = stage.current
    if (!target || !element) return
    cancelFrame()
    const p = latest.current
    // A phone's board writes no layout. The frame handles and the link handle
    // are not drawn there, and a press on a card is a pan rather than a drag.
    const phone = p.layout === 'phone'
    const frameHandle = target.closest<HTMLElement>('[data-frame-gesture]')
    const frameID = frameHandle?.dataset.frameId
    const frame = frameID ? p.frames?.[frameID] : undefined
    if (p.layoutBusy && (frame || (!phone && target.closest('#cards .card')) || p.frameCreating)) return
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
    } else if (p.frameCreating && !p.readOnly && !card && !phone) {
      // Not on a phone, whose board writes no layout. A phone offers no New
      // frame, but a draft opened on a tablet layout outlives a switch to the
      // phone one, and drawing would redraw what Create and capture saves.
      const start = toScene(pointer, local.view, element.getBoundingClientRect())
      gesture = { ...base, kind: 'frame-draw', start,
        bounds: { title: 'New frame', ...start, w: 0, h: 0, color: '#759bcc', members: [] } }
    } else if (id && p.tickets.has(id) && phone) {
      // Selected on the lift, and only if the finger stayed put. A finger that
      // lands on a card is almost always starting a pan, and a card moved by
      // accident is a layout write somebody has to find and undo.
      gesture = { ...base, kind: 'pan', tap: id, moved: false }
    } else if (id && p.tickets.has(id)) {
      if (handle && !p.readOnly) {
        gesture = { ...base, kind: 'link', from: id, to: null, refused: null,
          point: toScene(pointer, local.view, element.getBoundingClientRect()) }
      } else if (p.selecting) {
        // Nothing is selected yet: whether this press adds the card, takes it
        // out, or drags the lot is only known once it lifts or travels.
        gesture = { ...base, kind: 'card', ids: [...new Set([...p.selection, id])].filter(key => p.tickets.has(key)),
          moved: false, delta: { x: 0, y: 0 }, readOnly: p.readOnly, tap: id }
      } else {
        const ids = p.selection.has(id) || event.shiftKey ? new Set(p.selection) : new Set<string>()
        ids.add(id)
        gesture = { ...base, kind: 'card', ids: [...ids].filter(key => p.tickets.has(key)),
          moved: false, delta: { x: 0, y: 0 }, readOnly: p.readOnly }
        // Additive selection on an already selected card retains a multi-drag.
        p.onSelect(id, event.shiftKey || p.selection.has(id))
      }
    } else {
      const edge = target.closest<SVGElement>('[data-edge]')?.dataset.edge
      gesture = { ...base, kind: 'pan', moved: false, edge, leave: !!p.selecting && !card,
        // Empty as a double-click reads it, so the two file in the same places.
        empty: !edge && !target.closest('.card, .canvas-frame') }
    }
    try { element.setPointerCapture(event.pointerId) }
    catch { return } // A detached stage cannot own a gesture.
    local.gesture = gesture
    p.onBusy(true)
    // A long press is only looked for where a card press started something of
    // its own, and never in the mode, where holding a card is just a slow tap.
    if (event.pointerType === 'touch' && id && !p.selecting && p.onHold
      && ((gesture.kind === 'pan' && gesture.tap) || (gesture.kind === 'card' && !gesture.tap))) {
      startHold(event.pointerId, id, pointer)
    }
    event.preventDefault()
    redraw()
  }

  function startHold(pointerId: number, id: string, start: Point) {
    endHold()
    local.hold = { pointerId, id, start, timer: setTimeout(() => {
      const hold = local.hold
      const gesture = local.gesture
      local.hold = null
      if (!local.mounted || !hold || gesture?.pointerId !== hold.pointerId) return
      const p = latest.current
      if (!p.tickets.has(hold.id)) return
      if (gesture.kind === 'pan') {
        // The lift must not open the card as well. The finger can still pan;
        // a phone moves no cards, so there is nothing to drag.
        gesture.tap = undefined
      } else if (gesture.kind === 'card') {
        // Start the drag again from where the finger is now. A hold that
        // wandered a few pixels and lifted would otherwise save them.
        const now = local.touches.get(hold.pointerId) ?? hold.start
        gesture.pointer = now
        gesture.delta = { x: 0, y: 0 }
        gesture.moved = false
        cancelFrame()
      }
      p.onHold?.(hold.id)
      redraw()
    }, HOLD_MS) }
  }

  function applyMotion(point: Point) {
    const gesture = local.gesture
    const element = stage.current
    if (!gesture || !element) return
    if (gesture.kind === 'pan') {
      local.view = { ...gesture.view, x: gesture.view.x + point.x - gesture.pointer.x,
        y: gesture.view.y + point.y - gesture.pointer.y }
      if (Math.hypot(point.x - gesture.pointer.x, point.y - gesture.pointer.y) > TAP_SLOP) gesture.moved = true
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
      const candidate = id && id !== gesture.from && latest.current.tickets.has(id) ? id : null
      // Asked when the pointer enters a card rather than on every frame: the
      // answer walks the dependency graph.
      if (candidate !== (gesture.to ?? gesture.refused?.id ?? null)) {
        const message = candidate ? latest.current.linkRefusal?.(gesture.from, candidate) : null
        gesture.to = message ? null : candidate
        gesture.refused = candidate && message ? { id: candidate, message } : null
      }
      gesture.point = toScene(point, gesture.view, element.getBoundingClientRect())
    }
  }

  function pointerMove(event: PointerEvent) {
    if (local.touches.has(event.pointerId)) local.touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
    // Checked on every move rather than once a frame: a finger that travels
    // past the slop and back within one frame has still moved.
    const hold = local.hold
    if (hold?.pointerId === event.pointerId
      && Math.hypot(event.clientX - hold.start.x, event.clientY - hold.start.y) > TAP_SLOP) endHold()
    if (local.pinch) {
      if (!local.pinch.ids.includes(event.pointerId) || local.frame !== null) return
      // Batched to a frame the way the wheel is: every move updates where the
      // fingers are, and the view is worked out once from the latest.
      local.frame = requestAnimationFrame(() => {
        local.frame = null
        if (!local.mounted || !local.pinch) return
        applyPinch()
        local.frameCount++
        redraw()
      })
      return
    }
    // Matched on the pointer rather than on being primary: the finger left
    // down after a pinch keeps panning, and it need not be the primary one.
    if (!local.gesture || event.pointerId !== local.gesture.pointerId || event.buttons !== 1) return
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

  /** A finger lifted from a gesture. A tap names the edge it landed on and
   * unnames any other, and two taps on empty board file a ticket, the way a
   * double-click does. Anything else breaks a double tap in progress. */
  function touchUp(gesture: Gesture, event: PointerEvent) {
    const tapped = (gesture.kind === 'pan' || gesture.kind === 'card') && !gesture.moved
    if (tapped) local.named = gesture.kind === 'pan' ? gesture.edge ?? null : null
    const last = local.lastTap
    local.lastTap = null
    if (!tapped || gesture.kind !== 'pan' || !gesture.empty) return
    const p = latest.current
    // A phone's board is for reading, and its New ticket button is always
    // there. A double tap on it is too easily a missed tap on a card.
    if (p.layout === 'phone' || p.frameCreating) return
    // In selection mode a tap on empty board is how somebody leaves it, and a
    // second tap there to be sure should not file a ticket as well.
    if (p.selecting) return
    const point = { x: event.clientX, y: event.clientY }
    if (last && event.timeStamp - last.at <= DOUBLE_TAP_MS
      && Math.hypot(point.x - last.point.x, point.y - last.point.y) <= DOUBLE_TAP_SLOP) compose(point)
    else local.lastTap = { at: event.timeStamp, point }
  }

  function pointerUp(event: PointerEvent) {
    lift(event)
    if (event.pointerType === 'touch') local.touchLift = event.timeStamp
    if (!local.gesture || event.pointerId !== local.gesture.pointerId || event.button !== 0) return
    // The final point can arrive before the queued RAF. Do not save the previous frame.
    applyMotion({ x: event.clientX, y: event.clientY })
    const current = positions()
    const gesture = release()
    if (gesture && event.pointerType === 'touch') touchUp(gesture, event)
    redraw()
    if (!gesture) return
    const p = latest.current
    if (gesture.kind === 'pan') {
      if (gesture.moved) return
      if (gesture.tap && p.tickets.has(gesture.tap)) {
        if (p.selecting) p.onToggle?.(gesture.tap)
        else p.onSelect(gesture.tap, event.shiftKey)
      } else if (gesture.leave && p.selecting) p.onSelectionDone?.()
    } else if (gesture.kind === 'card' && gesture.tap
      && Math.hypot(gesture.delta.x, gesture.delta.y) * gesture.view.k <= TAP_SLOP) {
      if (p.tickets.has(gesture.tap)) p.onToggle?.(gesture.tap)
    } else if (gesture.kind === 'frame-draw') {
      if (!p.readOnly && !p.layoutBusy && gesture.bounds.w >= 80 && gesture.bounds.h >= 80) p.onNewFrame?.(gesture.bounds)
    } else if (gesture.kind === 'frame-move' || gesture.kind === 'frame-resize') {
      if (!gesture.moved || p.readOnly || p.layoutBusy) return
      const result = gesture.kind === 'frame-move'
        ? p.onFrameMove?.(gesture.id, gesture.before, gesture.delta.x, gesture.delta.y, gesture.positions, gesture.cards)
        : p.onFrameResize?.(gesture.id, gesture.before, gesture.next)
      void result?.catch(error => p.onError(error instanceof Error ? error.message : String(error)))
    } else if (gesture.kind === 'card' && gesture.moved) {
      if (gesture.readOnly || p.readOnly) { p.onError('read-only'); return }
      // Dragging a card that was not selected brings it into the selection,
      // as a shift-drag on a desk does.
      if (gesture.tap && !p.selection.has(gesture.tap)) p.onSelect(gesture.tap, true)
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
    } else if (gesture.kind === 'link' && gesture.refused) {
      p.onError(gesture.refused.message)
    }
  }

  function pointerCancel(event: PointerEvent) {
    lift(event)
    lostCapture(event)
  }

  function lostCapture(event: PointerEvent) {
    if (event.pointerId === local.gesture?.pointerId) cancel()
  }

  function wheel(event: WheelEvent) {
    if (!canvasTarget(event.target)) return
    event.preventDefault()
    if (local.gesture || local.pinch || !stage.current) return
    // Updating the ref preserves every wheel delta while only rendering once per frame.
    local.view = zoomAt(local.view, { x: event.clientX, y: event.clientY }, stage.current.getBoundingClientRect(), event.deltaY)
    reportView()
    if (local.frame !== null) return
    local.frame = requestAnimationFrame(() => {
      local.frame = null
      if (local.mounted) { local.frameCount++; redraw() }
    })
  }

  /** The window lost focus mid-gesture. The lifts may never arrive, so the
   * fingers are forgotten along with the gesture. */
  function blur() {
    local.touches.clear()
    cancel()
  }

  // Native listeners give wheel an explicit passive:false and share one cleanup path.
  // Indirection keeps listeners stable without retaining old props or callback closures.
  const handlers = useRef({ pointerDown, pointerMove, pointerUp, pointerCancel, lostCapture, wheel, cancel, blur })
  handlers.current = { pointerDown, pointerMove, pointerUp, pointerCancel, lostCapture, wheel, cancel, blur }
  useLayoutEffect(() => {
    local.mounted = true
    const element = stage.current!
    const down = (event: PointerEvent) => handlers.current.pointerDown(event)
    const move = (event: PointerEvent) => handlers.current.pointerMove(event)
    const up = (event: PointerEvent) => handlers.current.pointerUp(event)
    const abort = (event: PointerEvent) => handlers.current.pointerCancel(event)
    const lost = (event: PointerEvent) => handlers.current.lostCapture(event)
    const scroll = (event: WheelEvent) => handlers.current.wheel(event)
    const blur = () => handlers.current.blur()
    element.addEventListener('pointerdown', down)
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerup', up)
    element.addEventListener('pointercancel', abort)
    element.addEventListener('lostpointercapture', lost)
    element.addEventListener('wheel', scroll, { passive: false })
    window.addEventListener('blur', blur)
    return () => {
      local.mounted = false
      element.removeEventListener('pointerdown', down)
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', up)
      element.removeEventListener('pointercancel', abort)
      element.removeEventListener('lostpointercapture', lost)
      element.removeEventListener('wheel', scroll)
      window.removeEventListener('blur', blur)
      handlers.current.cancel()
    }
  }, [])

  useLayoutEffect(() => {
    // A pinch only moves the view, so turning read-only has nothing to stop.
    if (props.readOnly && local.gesture && local.gesture.kind !== 'pan') cancel()
  }, [props.readOnly])

  const view = local.view
  useLayoutEffect(() => {
    if (grid.current && stage.current) drawGrid(grid.current, stage.current, view)
  }, [view, measurements.viewportRevision])

  const placed = positions()
  // The pens' extents for the layer below; the same call positions() made,
  // without the previews, because a pen's outline follows the accepted board.
  const ruled = resolveBoard(props.tickets.values(), routing(props), props.cards, props.statuses, props.priorities)
  // The same predicate the toolbar counts with, so a dimmed card and the count
  // can never disagree about what the filters mean.
  const matching = new Set([...props.tickets.values()].filter(ticket => matchesTicket(ticket,
    { statuses: props.filters, labels: props.labelFilters || empty, labelMatch: props.labelMatch, query: props.query })).map(t => t.id))
  const gesture = local.gesture
  const ghost = gesture?.kind === 'link' ? { from: gesture.from, point: gesture.point, refused: !!gesture.refused } : null
  // One width for this render. The stylesheet, the edge anchors and the fit
  // bounds all take it from here rather than choosing a constant themselves.
  const cardWidth = activeWidth()
  const phone = props.layout === 'phone'
  return <div id="stage" ref={stage} data-canvas-frame={local.frameCount}
    data-placement-calculations={placementCalculations.current}
    class={gesture?.kind === 'pan' || local.pinch ? 'panning' : gesture?.kind === 'link' ? `linking${gesture.refused ? ' link-refused' : ''}` : ''}
    style={{ touchAction: 'none' }}
    onDblClick={event => {
      // A touch files through touchUp. This is a mouse, or the browser echoing
      // a double tap that touchUp has already seen.
      if (event.timeStamp - local.touchLift < TOUCH_ECHO_MS) return
      const target = canvasTarget(event.target)
      if (event.button === 0 && target && !target.closest('.card, .canvas-frame') && !local.gesture && !props.frameCreating) compose({ x: event.clientX, y: event.clientY })
    }}>
    <canvas id="grid" ref={grid} />
    <div id="scene" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
      '--card-w': `${cardWidth}px` }}>
      {ruled.ruled && <div id="penLayer">{(props.ruleOrder ?? []).map((id, order) => {
        const pen = props.pens?.[id], extent = ruled.pens.get(id)
        if (!pen || !extent) return null
        // Drawn at the height the cards needed, so an overfull pen grows
        // downward and shows it rather than clipping or hiding a card.
        return <div key={id} class={`canvas-pen ${extent.overflow ? 'overflow' : ''}`} data-pen-id={id} data-pen-count={extent.count}
          style={{ transform: `translate(${pen.x}px, ${pen.y}px)`, width: `${pen.w}px`, height: `${extent.height}px`, '--pen-color': pen.color }}>
          <div class="canvas-pen-title"><span class="canvas-pen-order">{order + 1}</span> {pen.title}
            <span class="canvas-pen-count">{extent.count}{extent.overflow ? ', grown to fit' : ''}</span></div>
        </div>
      })}
        <div class="canvas-inbox" data-inbox-count={ruled.inbox}
          style={{ transform: `translate(${(props.inbox ?? { x: 0 }).x}px, ${(props.inbox ?? { y: 0 }).y}px)` }}>
          <div class="canvas-pen-title">Inbox <span class="canvas-pen-count">{ruled.inbox}{ruled.inbox ? ', matched no rule' : ''}</span></div>
        </div>
      </div>}
      <div id="frameLayer">{Object.entries(props.frames || {}).map(([id, accepted]) => {
        const frame = (gesture?.kind === 'frame-move' || gesture?.kind === 'frame-resize') && gesture.id === id ? gesture.next : accepted
        const dimmed = frame.members.filter(member => props.tickets.has(member) && !matching.has(member)).length
        return <div key={id} class={`canvas-frame ${props.selectedFrame === id ? 'selected' : ''}`} data-frame-id={id}
          style={{ transform: `translate(${frame.x}px, ${frame.y}px)`, width: `${frame.w}px`, height: `${frame.h}px`, '--frame-color': frame.color }}>
          {/* On a phone the title is a label: the frame panel offers only
            * edits, which a phone does not make, and everything it would show a
            * reader is already written here. A finger on it pans the board. */}
          {phone
            ? <span class="canvas-frame-label" data-frame-id={id}>{frame.title} · {frame.members.length} members{dimmed > 0 && ` · ${dimmed} filtered`}</span>
            : <button class="canvas-frame-title" data-frame-id={id} data-frame-gesture="move"
              onClick={() => props.onSelectFrame?.(id)}>{frame.title} · {frame.members.length} members{dimmed > 0 && ` · ${dimmed} filtered`}</button>}
          {!props.readOnly && !phone && <button class="canvas-frame-resize" data-frame-id={id} data-frame-gesture="resize"
            disabled={props.layoutBusy} aria-label={`Resize ${frame.title} boundary only`} onClick={() => props.onSelectFrame?.(id)}>↘</button>}
        </div>
      })}</div>
      {gesture?.kind === 'frame-draw' && <div class="canvas-frame-draft" style={{ left: gesture.bounds.x, top: gesture.bounds.y,
        width: gesture.bounds.w, height: gesture.bounds.h }} />}
      <Edges tickets={props.tickets} positions={placed} heights={measurements.heights} matching={matching} ghost={ghost}
        mode={props.relationships} selection={props.selection} cardWidth={cardWidth} named={local.named} />
      <div id="cards">{[...props.tickets.values()].map(ticket => {
        const point = placed.get(ticket.id)!
        return <CardView key={ticket.id} ticket={ticket} x={point.x} y={point.y} z={point.z} pinned={point.pinned} unhoused={!!point.unhoused}
          selected={props.selection.has(ticket.id)} dimmed={!matching.has(ticket.id)}
          frameTitle={Object.values(props.frames || {}).find(frame => frame.members.includes(ticket.id))?.title}
          frameMember={!!props.selectedFrame && !!props.frames?.[props.selectedFrame]?.members.includes(ticket.id)}
          target={gesture?.kind === 'link' && gesture.to === ticket.id}
          refused={gesture?.kind === 'link' && gesture.refused?.id === ticket.id} register={measurements.register}
          density={props.density} linkable={!phone} onRelease={props.readOnly || phone ? undefined : releaseCard} />
      })}</div>
    </div>
    {props.frameCreating && <div id="frameDrawHint" role="status">Draw on empty canvas to capture card centers, or enter bounds in the frame panel. Escape cancels.</div>}
    {/* A phone gets one line, once. Anywhere else the hint describes the
      * pointer in hand: a finger cannot hover, and a mouse cannot pinch. On a
      * coarse pointer it also carries what a title would have said, because
      * nothing shows a title to a finger. */}
    {phone
      ? props.tip && <button id="boardTip" type="button" title="Tap to close" onClick={() => props.onTipClosed?.()}>
        drag to move around · pinch to zoom · tap a card to open it</button>
      : props.coarse
        ? <div id="hint" data-pointer="coarse">drag to pan · pinch to zoom · double-tap to file a ticket · hold a card to select several
          <div>drag a card's round handle onto another card to make that one depend on it
            {!props.readOnly && ' · tap Manual to hand a card back to automatic placement'} · tap the zoom level for 1:1</div>
          {props.relationships !== 'none' && <div>Solid arrow: ticket → dependency · Dashed warm arrow: parent → child · tap an edge or select a card to name one edge</div>}
        </div>
        : <div id="hint">drag canvas to pan · scroll to zoom · double-click to file a ticket · drag the right handle to link
          {!props.readOnly && ' · u hands the selection back to automatic placement'}
          {props.relationships !== 'none' && <div>Solid arrow: ticket → dependency · Dashed warm arrow: parent → child · hover or select to name one edge</div>}
        </div>}
    {props.children}
  </div>
})
