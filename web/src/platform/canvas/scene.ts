import type { Cards } from '../tickets/types'
import type { Frames } from './frames'
import { SCENE_LIMIT, type Placement, type PlacementInput, type PlacementSnapshot, type Rectangle, type Obstacle } from './placement'
import { PlacementSnapshots, type BoardScope } from './snapshots'

export interface SceneScope { readonly storePath: string; readonly board: string; readonly appGeneration: number }
/** Caller-owned committed receipts, not proof of DOM completeness. */
export interface SceneSample {
  readonly baseline: string; readonly revision: number; readonly complete: boolean
  readonly cards: ReadonlyMap<string, string | symbol>; readonly controls: ReadonlyMap<string, string | symbol>
}
export interface ScenePublication {
  readonly input: PlacementInput; readonly frames: Frames; readonly captureToken: string | null
  readonly sample: SceneSample
}
export interface Scene extends SceneScope, BoardScope {
  readonly revision: number; readonly baseline: string
  readonly mode: 'unavailable' | 'accepted' | 'stale' | 'gesture-frozen' | 'pending-manual-overlay' | 'frame-frozen'
  readonly positions: ReadonlyMap<string, Placement>
  readonly placement: PlacementSnapshot | null; readonly obstacles: readonly Obstacle[]
  readonly cards: Readonly<Cards>; readonly frames: Frames
  readonly sample: SceneSample | null; readonly captureToken: string | null
  readonly captureReady: boolean; readonly collisionSafe: boolean
  readonly staged: readonly string[]; readonly overlayOwner: string | null
}
export interface Gesture { readonly scene: Scene }
export interface FrameHold { readonly scene: Scene }
export interface Submission extends SceneScope {
  readonly generation: number; readonly owner: string; readonly cards: Readonly<Cards>; readonly scene: Scene
}
export interface PendingCard { readonly owner: string; readonly identity: string; readonly card: Cards[string] }

// A frozen Map still has set/delete. Copy into a facade and keep its backing map private.
function mapView<K, V>(entries: Iterable<readonly [K, V]>): ReadonlyMap<K, V> {
  const data = new Map(entries)
  const view: ReadonlyMap<K, V> = {
    get size() { return data.size }, get: k => data.get(k), has: k => data.has(k),
    entries: () => data.entries(), keys: () => data.keys(), values: () => data.values(),
    [Symbol.iterator]: () => data[Symbol.iterator](),
    forEach(fn, thisArg) { data.forEach((v, k) => fn.call(thisArg, v, k, view)) },
  }
  return Object.freeze(view)
}
function copyCards(cards: Readonly<Cards>): Readonly<Cards> {
  return Object.freeze(Object.fromEntries(Object.entries(cards).map(([id, card]) => [id, Object.freeze({ ...card })])))
}
function copyFrames(frames: Frames): Frames {
  return Object.freeze(Object.fromEntries(Object.entries(frames).map(([id, frame]) => [id,
    Object.freeze({ ...frame, members: Object.freeze([...frame.members]) })]))) as Frames
}
function copySample(sample: SceneSample): SceneSample {
  return Object.freeze({ ...sample, cards: mapView(sample.cards), controls: mapView(sample.controls) })
}
export function sceneRect(scene: Scene, id: string): Placement | null { return scene.positions.get(id) ?? null }
export function sceneCenter(scene: Scene, id: string): { x: number; y: number } | null {
  const r = sceneRect(scene, id)
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
}
export function sceneBounds(scene: Scene, ids: Iterable<string>): Rectangle | null {
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity
  for (const id of ids) {
    const r = sceneRect(scene, id)
    if (!r) continue
    x = Math.min(x, r.x); y = Math.min(y, r.y)
    right = Math.max(right, r.x + r.width); bottom = Math.max(bottom, r.y + r.height)
  }
  return x === Infinity ? null : { x, y, width: right - x, height: bottom - y }
}

/** Pure opt-in consumer state. Only publish computes placement. Release/completion
 * never flushes a queued publication: the caller must supply a fresh commit.
 * Use a dedicated PlacementSnapshots instance, not the diagnostic bridge's instance.
 */
export class SceneCoordinator {
  private scope: BoardScope | null = null
  private context: SceneScope = { storePath: '', board: '', appGeneration: 0 }
  private current: Scene = this.empty()
  private gesture: Gesture | null = null
  private frame: FrameHold | null = null
  private owners = new Map<string, PendingCard>()
  private submissions = new Set<Submission>()
  private serial = 0
  private aggregate: string | null = null
  private watermark = -1

  constructor(private readonly snapshots: PlacementSnapshots) {}
  get scene(): Scene { return this.current }
  get pending(): ReadonlyMap<string, PendingCard> { return mapView(this.owners) }

  private empty(): Scene {
    return Object.freeze({ ...this.context, generation: this.scope?.generation ?? 0,
      revision: -1, baseline: '', mode: 'unavailable', positions: mapView<string, Placement>([]),
      placement: null, obstacles: Object.freeze([]),
      cards: Object.freeze({}), frames: Object.freeze({}), sample: null, captureToken: null,
      captureReady: false, collisionSafe: false, staged: Object.freeze([]), overlayOwner: null })
  }
  activate(context: SceneScope): BoardScope {
    this.context = Object.freeze({ ...context })
    this.scope = this.snapshots.activate(context.board)
    this.gesture = null; this.frame = null; this.owners.clear(); this.submissions.clear()
    this.aggregate = null; this.watermark = -1; this.current = this.empty()
    return this.scope
  }
  private cancelProposal() {
    if (this.scope && this.aggregate) this.snapshots.cancel(this.scope, this.aggregate)
  }
  private changedOwners() {
    this.cancelProposal()
    this.aggregate = this.owners.size ? `overlay:${++this.serial}` : null
  }
  private overlay(base: Scene, mode: Scene['mode'], cards: Readonly<Cards>): Scene {
    const positions = new Map(base.positions)
    for (const [id, card] of Object.entries(cards)) {
      const old = positions.get(id)
      if (old) positions.set(id, Object.freeze({ ...old, x: card.x, y: card.y, mode: 'preview' }))
    }
    return Object.freeze({ ...base, positions: mapView(positions), mode, captureReady: false,
      collisionSafe: false, overlayOwner: this.aggregate })
  }
  private pendingProjection(base: Scene): Scene {
    return this.overlay(base, 'pending-manual-overlay', Object.fromEntries([...this.owners].map(([id, p]) => [id, p.card])))
  }
  private stale(input: PlacementInput) {
    const identities = new Map(input.tickets.map(t => [t.id, t.identity]))
    const positions = mapView([...this.current.positions].filter(([id, p]) => identities.get(id) === p.identity))
    this.current = Object.freeze({ ...this.current, positions,
      mode: this.current.baseline ? 'stale' : 'unavailable', captureReady: false, collisionSafe: false,
      staged: Object.freeze(input.tickets.filter(t => !positions.has(t.id)).map(t => t.id)) })
  }
  private fromSnapshot(snapshot: PlacementSnapshot, p: ScenePublication): Scene {
    const provisional = [...snapshot.positions.values()].some(r => r.provisional)
    return Object.freeze({ ...this.context, board: snapshot.board, generation: snapshot.generation,
      revision: snapshot.revision, baseline: snapshot.baseline, positions: snapshot.positions, placement: snapshot,
      obstacles: Object.freeze(p.input.obstacles.map(o => Object.freeze({ ...o }))),
      cards: copyCards(p.input.cards), frames: copyFrames(p.frames), sample: copySample(p.sample),
      captureToken: p.captureToken, mode: this.owners.size ? 'pending-manual-overlay' : 'accepted',
      captureReady: !this.owners.size && !provisional && !!p.captureToken,
      collisionSafe: !provisional, staged: Object.freeze([]), overlayOwner: this.aggregate })
  }
  publish(p: ScenePublication): void {
    const { input, sample } = p
    if (!this.scope || input.board !== this.scope.board || input.generation !== this.scope.generation
      || !Number.isSafeInteger(input.revision) || input.revision < this.watermark) return
    this.watermark = input.revision
    // Observations during holds are fenced, not queued for automatic release.
    if (this.gesture || this.frame) return
    let removed = false
    const identities = new Map(input.tickets.map(t => [t.id, t.identity]))
    for (const [id, pending] of this.owners) {
      if (identities.get(id) !== pending.identity) { this.owners.delete(id); removed = true }
    }
    if (removed) this.changedOwners()
    // Fixture obstacles need not be DOM controls. The producer attests complete
    // obstacle sampling; control receipts are retained, not inferred from IDs.
    if (!sample.complete || sample.baseline !== input.baseline || sample.revision !== input.revision
      || sample.cards.size !== input.tickets.length || input.tickets.some(t => !sample.cards.has(t.id))) {
      this.cancelProposal(); this.stale(input); return
    }
    // Keep an unchanged aggregate proposal available for controller content reuse.
    const baseInput = { ...input, previews: new Map() }
    const accepted = this.snapshots.accept(baseInput)
    if (!accepted.ok) { this.stale(input); return }
    const base = this.fromSnapshot(accepted.snapshot, p)
    if (!this.owners.size) { this.current = base; return }
    const proposed = this.snapshots.propose({ ...baseInput, previews: mapView(this.owners) }, this.aggregate!)
    this.current = proposed.ok ? this.fromSnapshot(proposed.snapshot, p) : this.pendingProjection(base)
  }
  beginGesture(): Gesture | null {
    if (this.gesture || this.frame || !this.current.positions.size
      || !['accepted', 'pending-manual-overlay'].includes(this.current.mode) || !this.current.collisionSafe) return null
    this.gesture = Object.freeze({ scene: this.current })
    this.current = Object.freeze({ ...this.current, mode: 'gesture-frozen', captureReady: false })
    return this.gesture
  }
  private validatedCards(base: Scene, cards: Readonly<Cards>): Readonly<Cards> {
    for (const [id, c] of Object.entries(cards)) {
      if (!base.positions.has(id) || !Number.isFinite(c.x) || !Number.isFinite(c.y)
        || Math.abs(c.x) > SCENE_LIMIT || Math.abs(c.y) > SCENE_LIMIT) throw new Error('Invalid scene card projection')
    }
    return copyCards(cards)
  }
  projectGesture(handle: Gesture, cards: Readonly<Cards>): Scene {
    if (handle !== this.gesture) return this.current
    this.current = this.overlay(handle.scene, 'gesture-frozen', this.validatedCards(handle.scene, cards))
    return this.current
  }
  submitDrop(handle: Gesture, cards: Readonly<Cards>): Submission {
    if (handle !== this.gesture) throw new Error('Inactive gesture')
    const submitted = Object.freeze({ ...this.context, generation: this.scope!.generation,
      owner: `submission:${++this.serial}`, cards: this.validatedCards(handle.scene, cards), scene: handle.scene })
    for (const [id, card] of Object.entries(submitted.cards)) this.owners.set(id, Object.freeze({
      owner: submitted.owner, identity: handle.scene.positions.get(id)!.identity, card }))
    this.submissions.add(submitted); this.changedOwners()
    this.current = this.pendingProjection(handle.scene)
    this.gesture = null
    return submitted
  }
  cancelGesture(handle: Gesture): void {
    if (handle !== this.gesture) return
    this.gesture = null
    // A later commit must restore readiness even when no input was queued.
    this.current = Object.freeze({ ...handle.scene, mode: 'stale', captureReady: false, collisionSafe: false })
  }
  complete(submission: Submission, _outcome: 'success' | 'failure'): void {
    if (!this.submissions.delete(submission)) return
    let changed = false
    for (const [id, pending] of this.owners) {
      if (pending.owner === submission.owner) { this.owners.delete(id); changed = true }
    }
    if (!changed) return
    this.changedOwners()
    // Neither outcome is an authoritative response. Wait for committed publication.
    if (!this.gesture && !this.frame) this.current = Object.freeze({ ...this.current,
      mode: 'stale', captureReady: false, collisionSafe: false, overlayOwner: this.aggregate })
  }
  beginFrame(): FrameHold | null {
    if (this.gesture || this.frame || this.owners.size || !this.current.captureReady) return null
    this.frame = Object.freeze({ scene: this.current })
    this.current = Object.freeze({ ...this.current, mode: 'frame-frozen', captureReady: false })
    return this.frame
  }
  endFrame(handle: FrameHold): void {
    if (handle !== this.frame) return
    this.frame = null
    this.current = Object.freeze({ ...handle.scene, mode: 'stale', captureReady: false, collisionSafe: false })
  }
}
