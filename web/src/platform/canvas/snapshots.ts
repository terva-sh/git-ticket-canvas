import { allocatePlacement, preparePlacement, type PlacementError, type PlacementInput,
  type PlacementSnapshot, type PlacementWork, type PreparedPlacement } from './placement'

export interface BoardScope { readonly board: string; readonly generation: number }
export type SnapshotError = Readonly<PlacementError | { code: 'stale-input' | 'no-baseline' | 'revision-conflict'; message: string }>
export type SnapshotResult = { ok: true; snapshot: PlacementSnapshot; work: PlacementWork }
  | { ok: false; error: SnapshotError; work: PlacementWork }
interface Cache { key: string; snapshot: PlacementSnapshot }
interface Watermark { revision: number; baseline: string; key?: string }
const noWork = (): PlacementWork => ({ candidates: 0, collisionChecks: 0, retained: 0 })
const reject = (code: SnapshotError['code'], message: string): SnapshotResult => ({ ok: false, error: Object.freeze({ code, message }), work: noWork() })
function reuse(cache: Cache, input: PlacementInput): SnapshotResult & { ok: true } {
  const previous = cache.snapshot
  const snapshot = previous.board === input.board && previous.generation === input.generation
    && previous.revision === input.revision && previous.baseline === input.baseline ? previous
    : Object.freeze({ ...previous, board: input.board, generation: input.generation, revision: input.revision, baseline: input.baseline })
  return { ok: true, snapshot, work: noWork() }
}

/** Pure, synchronous owner of accepted and proposed placement. No getter computes.
 * Callers supply full-board inputs, monotonic per-generation revisions, and fresh
 * incarnation/preview tokens. A proposal is never an accepted cache candidate.
 */
export class PlacementSnapshots {
  private generation = 0
  private scope: BoardScope | null = null
  private boards = new Map<string, Cache>()
  private current: Cache | null = null
  private proposal: (Cache & { owner: string }) | null = null
  private latest: Watermark | null = null
  private acceptedFailure: SnapshotError | null = null
  constructor(private readonly allocator: typeof allocatePlacement = allocatePlacement) {}

  get accepted(): PlacementSnapshot | null { return this.current?.snapshot ?? null }
  get proposed(): PlacementSnapshot | null { return this.proposal?.snapshot ?? null }
  /** An accepted update failed. The accepted getter still carries OLD lineage. */
  get failure(): SnapshotError | null { return this.acceptedFailure }

  activate(board: string): BoardScope {
    if (typeof board !== 'string' || !board.length) throw new Error('Invalid board')
    this.scope = Object.freeze({ board, generation: ++this.generation })
    this.current = null; this.proposal = null; this.latest = null; this.acceptedFailure = null
    return this.scope
  }
  private matches(scope: BoardScope): boolean {
    return this.scope?.board === scope.board && this.scope?.generation === scope.generation
  }
  private fail(result: SnapshotResult): SnapshotResult {
    if (!result.ok) this.acceptedFailure = Object.freeze({ ...result.error })
    this.proposal = null
    return result
  }
  accept(input: PlacementInput): SnapshotResult {
    if (!this.matches(input)) return reject('stale-input', 'Inactive board generation')
    if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
      return this.fail(reject('invalid-input', 'Invalid placement lineage'))
    }
    if (this.latest && input.revision < this.latest.revision) return reject('stale-input', 'Older accepted revision')
    const sameRevision = this.latest?.revision === input.revision
    if (sameRevision && this.latest!.baseline !== input.baseline) return this.fail(reject('revision-conflict', 'Revision already has another baseline'))
    if (!sameRevision) {
      // Record even failed attempts, so an older callback cannot replace them.
      this.latest = { revision: input.revision, baseline: input.baseline }
      this.proposal = null
    }
    if (typeof input.baseline !== 'string' || !input.baseline.length) return this.fail(reject('invalid-input', 'Invalid placement baseline'))
    let prepared: PreparedPlacement
    try { prepared = preparePlacement(input) }
    catch (error) { return this.fail(reject('invalid-input', error instanceof Error ? error.message : String(error))) }
    if (sameRevision && this.latest!.key !== prepared.key) return this.fail(reject('revision-conflict', 'Revision already has different content'))
    this.latest!.key = prepared.key
    const previous = this.boards.get(input.board)
    const result = previous?.key === prepared.key ? reuse(previous, prepared.input) : this.allocator(prepared.input, previous?.snapshot)
    if (!result.ok) return this.fail(result)
    this.current = { key: prepared.key, snapshot: result.snapshot }
    this.boards.set(input.board, this.current)
    this.acceptedFailure = null
    return result
  }
  propose(input: PlacementInput, owner: string): SnapshotResult {
    if (!this.matches(input)) return reject('stale-input', 'Inactive board generation')
    if (!this.current || this.acceptedFailure || input.revision !== this.current.snapshot.revision || input.baseline !== this.current.snapshot.baseline) {
      return reject('no-baseline', 'Proposal requires the current accepted baseline')
    }
    if (typeof owner !== 'string' || !owner.length) return reject('invalid-input', 'Missing proposal owner')
    const previous = this.proposal
    this.proposal = null
    let prepared: PreparedPlacement
    try { prepared = preparePlacement(input) }
    catch (error) { return reject('invalid-input', error instanceof Error ? error.message : String(error)) }
    const cached = previous?.key === prepared.key ? previous : this.current.key === prepared.key ? this.current : undefined
    const result = cached ? reuse(cached, prepared.input) : this.allocator(prepared.input, this.current.snapshot)
    if (result.ok) this.proposal = { key: prepared.key, snapshot: result.snapshot, owner }
    return result
  }
  cancel(scope: BoardScope, owner: string): boolean {
    if (!this.matches(scope) || !this.proposal || this.proposal.owner !== owner) return false
    this.proposal = null
    return true
  }
}
