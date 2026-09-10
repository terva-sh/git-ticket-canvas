import { sameJSON } from '../tickets/reconcile'
import { captureMembers, moveFrame, FrameConflict, type FrameBounds, type FrameOperation, type Point } from './frames'
import type { Placement } from './placement'
import type { Scene } from './scene'

export interface CaptureUnavailable { readonly kind: 'unavailable'; readonly reason: string }
export interface ReadyCapture {
  readonly kind: 'ready'; readonly scene: Scene; readonly captureToken: string
  readonly members: readonly string[]; readonly rectangles: ReadonlyMap<string, Placement>
}
export type CaptureResult = ReadyCapture | CaptureUnavailable
export type CaptureValidation = { readonly ok: true } | { readonly ok: false; readonly reason: string }
export type PreparedMove = { readonly kind: 'ready'; readonly operation: FrameOperation; readonly capture: ReadyCapture }
  | CaptureUnavailable | { readonly kind: 'noop' }
export interface RedoReceipt { readonly kind: 'redo'; readonly scene: Scene; readonly members: readonly string[] }
export type RedoResult = RedoReceipt | CaptureUnavailable

const unavailable = (reason: string): CaptureUnavailable => Object.freeze({ kind: 'unavailable', reason })
const validBounds = (b: FrameBounds): boolean => [b.x, b.y, b.w, b.h, b.x + b.w, b.y + b.h].every(Number.isFinite)
  && b.w > 0 && b.h > 0
function sameMap<V>(a: ReadonlyMap<string, V>, b: ReadonlyMap<string, V>): boolean {
  return a.size === b.size && [...a].every(([key, value]) => b.has(key) && sameJSON(value, b.get(key)))
}
/** Compare values, including symbol owners, not newly allocated scene wrappers.
 * Revision/baseline changes conservatively invalidate even unchanged geometry.
 */
function sameScene(a: Scene, b: Scene): boolean {
  return a === b || (a.storePath === b.storePath && a.board === b.board && a.appGeneration === b.appGeneration
    && a.generation === b.generation && a.baseline === b.baseline && a.revision === b.revision
    && a.mode === b.mode && a.captureReady === b.captureReady && a.collisionSafe === b.collisionSafe
    && a.captureToken === b.captureToken && a.overlayOwner === b.overlayOwner
    && sameJSON(a.staged, b.staged) && sameJSON(a.cards, b.cards) && sameJSON(a.frames, b.frames)
    && sameJSON(a.obstacles, b.obstacles) && sameMap(a.positions, b.positions)
    && (a.sample === b.sample || (!!a.sample && !!b.sample
      && a.sample.baseline === b.sample.baseline && a.sample.revision === b.sample.revision
      && a.sample.complete === b.sample.complete && sameMap(a.sample.cards, b.sample.cards)
      && sameMap(a.sample.controls, b.sample.controls))))
}
function ready(scene: Scene | null): scene is Scene {
  return !!scene && scene.mode === 'accepted' && scene.captureReady && scene.collisionSafe
    && !!scene.captureToken && scene.overlayOwner === null && !scene.staged.length
    && !!scene.sample?.complete && scene.sample.baseline === scene.baseline && scene.sample.revision === scene.revision
    && scene.sample.cards.size === scene.positions.size
    && [...scene.positions].every(([id, r]) => !r.provisional && r.mode !== 'preview'
      && scene.sample!.cards.has(id) && [r.x, r.y, r.width, r.height].every(Number.isFinite)
      && r.width > 0 && r.height > 0)
}
function rectangles(scene: Scene, ids: readonly string[]): ReadonlyMap<string, Placement> {
  const data = new Map(ids.map(id => [id, scene.positions.get(id)!]))
  const view: ReadonlyMap<string, Placement> = {
    get size() { return data.size }, get: id => data.get(id), has: id => data.has(id),
    entries: () => data.entries(), keys: () => data.keys(), values: () => data.values(),
    [Symbol.iterator]: () => data[Symbol.iterator](),
    forEach(fn, thisArg) { data.forEach((r, id) => fn.call(thisArg, r, id, view)) },
  }
  return Object.freeze(view)
}
/** Only called on newly created plain operation records, never caller data. */
function freezeOperation<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeOperation(child)
    Object.freeze(value)
  }
  return value
}

/** Local concurrency receipt, not server authorization or proof of DOM geometry.
 * Observe every scene transition, including holds/unavailability. The caller must
 * fence unpublished state and validate again immediately before submission.
 */
export class CaptureGuard {
  private scene: Scene | null = null
  private epoch = 0
  private captures = new WeakMap<ReadyCapture, number>()
  private redos = new WeakMap<RedoReceipt, number>()

  observe(scene: Scene): void {
    if (!this.scene || !sameScene(this.scene, scene)) this.epoch++
    this.scene = scene
  }
  private receipt(scene: Scene, ids: readonly string[]): ReadyCapture {
    const members = Object.freeze([...new Set(ids)].sort())
    const capture: ReadyCapture = Object.freeze({ kind: 'ready', scene, captureToken: scene.captureToken!,
      members, rectangles: rectangles(scene, members) })
    this.captures.set(capture, this.epoch)
    return capture
  }
  capture(bounds: FrameBounds): CaptureResult {
    const scene = this.scene
    if (!ready(scene)) return unavailable('Scene is not ready for capture')
    if (!validBounds(bounds)) return unavailable('Capture bounds must be finite with positive size')
    const members = captureMembers(scene.frames, bounds, [...scene.positions].map(([id, r]) =>
      ({ id, x: r.x, y: r.y, w: r.width, h: r.height })))
    return this.receipt(scene, members)
  }
  validate(capture: CaptureResult): CaptureValidation {
    if (capture.kind !== 'ready' || this.captures.get(capture) !== this.epoch || !ready(this.scene)) {
      return { ok: false, reason: 'Capture is unavailable, foreign or no longer current' }
    }
    return { ok: true }
  }
  prepareMove(frameId: string, delta: Point): PreparedMove {
    const scene = this.scene
    if (!ready(scene)) return unavailable('Scene is not ready for frame movement')
    const frame = Object.hasOwn(scene.frames, frameId) ? scene.frames[frameId] : null
    if (!frame) return unavailable('Frame no longer exists')
    if (frame.members.some(id => !scene.positions.has(id))) return unavailable('A frame member has no current rectangle')
    try {
      const operation = moveFrame({ cards: scene.cards, frames: scene.frames, tickets: scene.positions },
        frameId, delta.x, delta.y, scene.positions)
      if (!operation) return Object.freeze({ kind: 'noop' })
      return Object.freeze({ kind: 'ready', operation: freezeOperation(operation), capture: this.receipt(scene, frame.members) })
    } catch (error) {
      if (error instanceof FrameConflict) return unavailable(error.message)
      throw error
    }
  }
  armRedo(ids: Iterable<string>): RedoResult {
    const scene = this.scene
    if (!ready(scene)) return unavailable('Scene is not ready for redo')
    const members = Object.freeze([...new Set(ids)].sort())
    if (members.some(id => !scene.positions.has(id))) return unavailable('A redo member has no current rectangle')
    const receipt: RedoReceipt = Object.freeze({ kind: 'redo', scene, members })
    this.redos.set(receipt, this.epoch)
    return receipt
  }
  validateRedo(receipt: RedoResult): CaptureValidation {
    if (receipt.kind !== 'redo' || this.redos.get(receipt) !== this.epoch || !ready(this.scene)) {
      return { ok: false, reason: 'Redo is unavailable, foreign or no longer current' }
    }
    return { ok: true }
  }
}
