import type { ComponentChildren } from 'preact'
import { forwardRef } from 'preact/compat'
import { useImperativeHandle, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { autoPlace, fitView, posOf, toScene, zoomAt } from '../platform/canvas/geometry'
import type { Point, View } from '../platform/canvas/geometry'
import type { Card, CardChanges, Cards, Ticket } from '../platform/tickets/types'
import { CardView, matches } from './canvas/CardView'
import { CARD_WIDTH, Edges } from './canvas/Edges'
import type { Placement } from './canvas/Edges'
import { drawGrid } from './canvas/grid'
import { useMeasurements } from './canvas/useMeasurements'

export interface CanvasProps {
  board: string
  tickets: ReadonlyMap<string, Ticket>
  cards: Cards
  statuses: readonly string[]
  selection: ReadonlySet<string>
  query: string
  filters: ReadonlySet<string>
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
  focus(id: string): void
  arrange(): void
  composeCentre(): void
  cancel(): void
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
)
interface LocalState {
  view: View
  previews: Map<string, Card>
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
  const local = useRef<LocalState>({
    view: { x: 120, y: 90, k: 1 }, previews: new Map(), gesture: null,
    motion: null, frame: null, frameCount: 0, mounted: false,
  }).current
  const [, setRevision] = useState(0)
  const redraw = () => setRevision(n => n + 1)
  const measurements = useMeasurements(stage)
  const placementCalculations = useRef(0)

  function positions(): Map<string, Placement> {
    placementCalculations.current++
    const p = latest.current
    const pinned = { ...p.cards, ...Object.fromEntries(local.previews) }
    const automatic = autoPlace(p.tickets.values(), pinned, p.statuses)
    const result = new Map<string, Placement>()
    for (const id of p.tickets.keys()) {
      const frozen = local.gesture?.positions.get(id)
      const placement = frozen ?? { ...posOf(id, pinned, automatic), pinned: !!pinned[id], z: pinned[id]?.z || 1 }
      const gesture = local.gesture
      if (gesture?.kind === 'card' && gesture.moved && !gesture.readOnly && gesture.ids.includes(id)) {
        result.set(id, { ...placement, x: placement.x + gesture.delta.x, y: placement.y + gesture.delta.y })
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

  function fit() {
    const element = stage.current
    if (!element) return
    cancel()
    const view = fitView([...positions()].map(([id, point]) => ({ ...point,
      height: measurements.elements.get(id)?.offsetHeight ?? measurements.heights.get(id),
    })), { width: element.clientWidth, height: element.clientHeight })
    if (view) { local.view = view; redraw() }
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

  function save(changes: Cards) {
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

  useImperativeHandle(ref, () => ({
    fit,
    focus(id) {
      if (!latest.current.tickets.has(id) || !stage.current) return
      cancel()
      const point = positions().get(id)!
      const k = local.view.k
      local.view = {
        x: stage.current.clientWidth / 2 - 380 / 2 - (point.x + CARD_WIDTH / 2) * k,
        y: stage.current.clientHeight / 2 - (point.y + 60) * k,
        k,
      }
      redraw()
    },
    arrange() {
      if (latest.current.readOnly) return
      cancel()
      // Confirmation belongs to the toolbar's parent, not the canvas.
      save(Object.fromEntries(autoPlace(latest.current.tickets.values(), {}, latest.current.statuses)))
      fit()
    },
    composeCentre() {
      if (!stage.current) return
      cancel()
      const bounds = stage.current.getBoundingClientRect()
      compose({ x: bounds.left + (stage.current.clientWidth - 360) / 2,
        y: bounds.top + stage.current.clientHeight / 2 })
    },
    cancel,
  }))

  function canvasTarget(target: EventTarget | null): Element | null {
    if (!(target instanceof Element) || !stage.current?.contains(target)) return null
    if (target.closest('#inspector, #composer, #toolbar')) return null
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
    const card = target.closest<HTMLDivElement>('#cards .card')
    const id = card?.dataset.id
    const handle = target.closest('.handle')
    const pointer = { x: event.clientX, y: event.clientY }
    const base: GestureBase = { pointerId: event.pointerId, capture: element, pointer, view: { ...local.view },
      positions: positions(), endBusy: () => p.onBusy(false) }
    let gesture: Gesture
    if (id && p.tickets.has(id)) {
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
    } else if (gesture.kind === 'card') {
      const dx = (point.x - gesture.pointer.x) / gesture.view.k
      const dy = (point.y - gesture.pointer.y) / gesture.view.k
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) gesture.moved = true
      gesture.delta = { x: dx, y: dy }
    } else {
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
    if (gesture.kind === 'card' && gesture.moved) {
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
  }, [view, measurements.revision])

  const placed = positions()
  const matching = new Set([...props.tickets.values()].filter(t => matches(t, props.query, props.filters)).map(t => t.id))
  const gesture = local.gesture
  const ghost = gesture?.kind === 'link' ? { from: gesture.from, point: gesture.point } : null
  return <div id="stage" ref={stage} data-canvas-frame={local.frameCount}
    data-placement-calculations={placementCalculations.current}
    class={gesture?.kind === 'pan' ? 'panning' : gesture?.kind === 'link' ? 'linking' : ''}
    style={{ touchAction: 'none' }}
    onDblClick={event => {
      const target = canvasTarget(event.target)
      if (event.button === 0 && target && !target.closest('.card') && !local.gesture) compose({ x: event.clientX, y: event.clientY })
    }}>
    <canvas id="grid" ref={grid} />
    <div id="scene" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
      <Edges tickets={props.tickets} positions={placed} heights={measurements.heights} matching={matching} ghost={ghost} />
      <div id="cards">{[...props.tickets.values()].map(ticket => {
        const point = placed.get(ticket.id)!
        return <CardView key={ticket.id} ticket={ticket} x={point.x} y={point.y} z={point.z} pinned={point.pinned}
          selected={props.selection.has(ticket.id)} dimmed={!matching.has(ticket.id)}
          target={gesture?.kind === 'link' && gesture.to === ticket.id} register={measurements.register} />
      })}</div>
    </div>
    <div id="hint">drag canvas to pan · scroll to zoom · double-click to file a ticket · drag the right handle to link</div>
    {props.children}
  </div>
})
