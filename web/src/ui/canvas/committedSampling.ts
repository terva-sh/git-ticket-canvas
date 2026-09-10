/** Test-only measurement evidence. No placement or mutation consumer imports this module. */
export interface SamplingContext {
  readonly store: object
  readonly board: string
  readonly generation: number
  readonly publication: object
  readonly captureToken: string | null
  readonly tickets: readonly string[]
  readonly births?: Readonly<Record<string, string>>
  readonly controls: readonly string[]
}
export interface SamplingPublication extends Omit<SamplingContext, 'tickets'> {
  readonly tickets: readonly Readonly<{ id: string; incarnation: symbol }>[]
}
export interface SamplingRequest extends SamplingPublication { readonly fence: number }
export interface SampleCard { id: string; incarnation: symbol; owner: symbol; height: number; connected: boolean }
export interface SampleControl { id: string; owner: symbol; rect: { x: number; y: number; w: number; h: number }; connected: boolean }
export interface SampleData { cards: SampleCard[]; controls: SampleControl[] }
export type SamplingSource = () => SampleData | null
export interface SamplingReceipt {
  readonly request: SamplingRequest
  readonly complete: true
  readonly captureReady: boolean
  readonly geometryRevision: number
  readonly controlRevision: number
  readonly cards: readonly Readonly<SampleCard>[]
  readonly controls: readonly Readonly<Omit<SampleControl, 'rect'> & { readonly rect: Readonly<SampleControl['rect']> }>[]
}
function equal(a: SampleData, b: SampleData): boolean {
  return a.cards.length === b.cards.length && a.controls.length === b.controls.length
    && a.cards.every((card, i) => { const other = b.cards[i]!; return card.id === other.id && card.owner === other.owner
      && card.incarnation === other.incarnation && card.height === other.height && card.connected === other.connected })
    && a.controls.every((control, i) => { const other = b.controls[i]!; return control.id === other.id && control.owner === other.owner
      && control.connected === other.connected && (['x', 'y', 'w', 'h'] as const).every(key => control.rect[key] === other.rect[key]) })
}
function copy(data: SampleData): SampleData {
  return { cards: data.cards.map(card => ({ ...card })).sort((a, b) => a.id.localeCompare(b.id)),
    controls: data.controls.map(control => ({ ...control, rect: { ...control.rect } })).sort((a, b) => a.id.localeCompare(b.id)) }
}
export class CommittedSampling {
  private current: SamplingPublication | null = null
  private fence = 0
  private requests = new WeakMap<object, SampleData>()
  private previous: SampleData | null = null
  private revision = 0
  private controlRevision = 0
  /** Diagnostics only. A receipt is not a submission capability. */
  receipt: SamplingReceipt | null = null

  publish(context: SamplingContext): SamplingPublication {
    const old = this.current
    const sameBoard = old?.store === context.store && old.board === context.board && old.generation === context.generation
    const identities = new Map(sameBoard ? old.tickets.map(ticket => [ticket.id, ticket.incarnation]) : [])
    this.hold()
    this.current = Object.freeze({ ...context, births: Object.freeze({ ...context.births }), controls: Object.freeze([...context.controls]),
      tickets: Object.freeze(context.tickets.map(id => Object.freeze({ id,
        incarnation: old?.births?.[id] === context.births?.[id] ? identities.get(id) ?? Symbol(id) : Symbol(id) }))) })
    return this.current
  }
  hold(): void { this.fence++; this.receipt = null }
  request(publication: SamplingPublication, source: SamplingSource): SamplingRequest | null {
    if (publication !== this.current) return null
    const fence = this.fence, data = source()
    if (!data || publication !== this.current || fence !== this.fence) return null
    const request = Object.freeze({ ...publication, fence })
    this.requests.set(request, copy(data))
    return request
  }
  private valid(request: SamplingRequest): boolean {
    return this.requests.has(request) && request.fence === this.fence && request.publication === this.current?.publication
      && request.store === this.current.store && request.board === this.current.board && request.generation === this.current.generation
  }
  private complete(request: SamplingRequest, data: SampleData): boolean {
    const cards = new Map(data.cards.map(card => [card.id, card])), controls = new Map(data.controls.map(control => [control.id, control]))
    return cards.size === data.cards.length && controls.size === data.controls.length
      && cards.size === request.tickets.length && controls.size === request.controls.length
      && request.tickets.every(ticket => { const card = cards.get(ticket.id); return !!card && card.connected
        && card.incarnation === ticket.incarnation && typeof card.owner === 'symbol' && Number.isFinite(card.height) && card.height > 0 })
      && request.controls.every(id => { const control = controls.get(id); return !!control && control.connected
        && typeof control.owner === 'symbol' && Object.values(control.rect).every(Number.isFinite) && control.rect.w > 0 && control.rect.h > 0 })
  }
  sample(request: SamplingRequest, source: SamplingSource, ready: () => boolean): SamplingReceipt | null {
    if (!this.valid(request)) return null
    this.receipt = null
    if (!ready()) return null
    const raw = source()
    if (!raw) return null
    const first = copy(raw)
    const owners = this.requests.get(request)!
    const sameOwners = first.cards.length === owners.cards.length && first.controls.length === owners.controls.length
      && first.cards.every((card, i) => card.id === owners.cards[i]!.id && card.owner === owners.cards[i]!.owner
        && card.incarnation === owners.cards[i]!.incarnation)
      && first.controls.every((control, i) => control.id === owners.controls[i]!.id && control.owner === owners.controls[i]!.owner)
    if (!sameOwners || !this.complete(request, first) || !this.valid(request) || !ready()) return null
    // A second fresh read detects owner replacement or geometry changes caused
    // by a getter/registration callback during the first pass.
    const second = source()
    if (!second || !this.complete(request, second) || !equal(first, copy(second)) || !this.valid(request) || !ready()) return null
    if (!this.previous || !equal({ cards: [], controls: this.previous.controls }, { cards: [], controls: first.controls })) this.controlRevision++
    if (!this.previous || !equal(this.previous, first)) this.revision++
    this.previous = first
    this.receipt = Object.freeze({ request, complete: true, captureReady: !!request.captureToken,
      geometryRevision: this.revision, controlRevision: this.controlRevision, cards: Object.freeze(first.cards.map(card => Object.freeze({ ...card }))),
      controls: Object.freeze(first.controls.map(control => Object.freeze({ ...control, rect: Object.freeze({ ...control.rect }) }))) })
    return this.receipt
  }
}
