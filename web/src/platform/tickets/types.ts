// Wire contract for internal/api. Vocabulary remains server-owned strings.
export interface Actor { ID: string; Name: string }
export interface Reference { ref: string; path?: string }
export interface Claim {
  actor: string; branch?: string; worktree?: string; commit?: string; session?: string
  claimedAt?: string; expiresAt?: string; expired: boolean
}
export interface ChecklistItem { index: number; checked: boolean; text: string }
export interface Entry { index: number; actor?: string; at?: string; text: string }
export interface TicketBody {
  description: string; plan: string; summary: string
  acceptanceCriteria: ChecklistItem[]; definitionOfDone: ChecklistItem[]
  notes: Entry[]; comments: Entry[]
}
export interface Readiness {
  ready: boolean; blocked: boolean; reason?: string
  blocking?: string[]; missing?: string[]; blockingChildren?: string[]
}
export interface Ticket {
  id: string; short: string; title: string; type: string; status: string
  statusReason?: string; priority: string; dueOn?: string; labels: string[]
  assignees: string[]; milestone?: string; parent?: string; origin?: string
  dependencies: string[]; blocksOn: string; references: Reference[]; claim?: Claim
  archived: boolean; createdAt: string; updatedAt: string; createdBy?: string
  updatedBy?: string; revision: string; body: TicketBody; readiness: Readiness
}
export interface Card { x: number; y: number; w?: number; z?: number; collapsed?: boolean }
export type Cards = Record<string, Card>
export type CardChanges = Record<string, Card | null>
export interface Frame { title: string; x: number; y: number; w: number; h: number; color: string; members: string[] }
export type Frames = Record<string, Frame>
export type FrameChanges = Record<string, Frame | null>
export interface LayoutExpectation { cards: CardChanges; frames: FrameChanges }
export interface FrameTransaction { cards: CardChanges; frames: FrameChanges; expect: LayoutExpectation }
// Older card-only responses omit frames. TicketStore normalizes them to {}.
export interface Board { schema: number; board: string; cards: Cards; frames?: Frames }
export interface Schema {
  statuses: string[]; openStatuses: string[]; terminalStatuses: string[]
  types: string[]; priorities: string[]; blocksOn: string[]; labels: string[]
  milestones: string[]; series: string[]; actors: Actor[] | null; actor: Actor
  transitions: Record<string, string[] | null>; reasonRequired: Record<string, string[]>
}
/** GET /api/version: the same envelope as `git-ticket-canvas --version --json`. */
export interface VersionInfo {
  schemaVersion: number; kind: 'version'; version: string; commit: string; go: string; modified: boolean
}
export interface BoardResponse {
  layout: Board; boards: string[]; tickets: Ticket[]; config: Schema
  storePath: string; readOnly: boolean
}
export interface TicketResponse { ticket: Ticket; layout?: Board; layoutError?: string }
export interface Dangling { Ticket: string; Title: string; Field: string }
export interface DeleteResponse { removed: string; dangling?: Dangling[] | null; layoutError?: string }
export interface ErrorBody {
  code: string; message: string; ticket?: string; field?: string; details?: Record<string, string>
}
export interface CreateRequest {
  title: string; series?: string; from?: string; type?: string; priority?: string
  labels?: string[]; assignees?: string[]; milestone?: string | null; parent?: string | null
  dependencies?: string[]; blocksOn?: string; dueOn?: string | null; description?: string
  plan?: string; acceptanceCriteria?: string[]; definitionOfDone?: string[]
  template?: string; board?: string; card?: Card
}
export type Op =
  | { op: 'setTitle'; title: string }
  | { op: 'setType'; type: string }
  | { op: 'setStatus'; status: string; reason?: string }
  | { op: 'setPriority'; priority: string }
  | { op: 'setParent'; parent: string | null }
  | { op: 'setOrigin'; origin: string | null }
  | { op: 'setMilestone'; milestone: string | null }
  | { op: 'setDueOn'; dueOn: string | null }
  | { op: 'setBlocksOn'; blocksOn: string }
  | { op: 'addLabel' | 'removeLabel'; label: string }
  | { op: 'assign' | 'unassign'; actor: string }
  | { op: 'addDependency' | 'removeDependency'; id: string }
  | { op: 'addReference'; ref: string; path?: string | null }
  | { op: 'removeReference'; ref: string }
  | { op: 'setDescription' | 'setPlan' | 'setSummary' | 'appendNote' | 'appendComment'; text: string }
  | { op: 'addChecklistItem'; section: string; text: string }
  | { op: 'setChecklistItem'; section: string; index: number; checked: boolean }
  | { op: 'removeChecklistItem'; section: string; index: number }
  | { op: 'claim'; branch?: string; worktree?: string; commit?: string; session?: string; expiresIn?: string; force?: boolean }
  | { op: 'release' | 'unarchive' }
  | { op: 'archive'; reason: string }
export interface PatchRequest { ifRevision: string; ops: Op[] }
export interface LayoutRequest { board: string; cards: CardChanges; frames?: FrameChanges; expect?: LayoutExpectation }
