import type { Schema, VersionInfo } from '../platform/tickets/types'
import type { LabelFilters, LabelState } from '../platform/tickets/filters'
import type { RelationshipMode } from './canvas/Edges'

export interface ToolbarProps {
  storePath: string; readOnly: boolean; boards: string[]; board: string; query: string
  /** undefined while GET /api/version is in flight, null when it failed. */
  version?: VersionInfo | null
  config: Schema | null; filters: ReadonlySet<string>; counts: string
  onQuery(value: string): void; onFilter(value: string): void; onBoard(value: string): void
  onNewBoard(): void; onArrange(): void; onFit(): void; onNew(): void
  onNewFrame?(): void; onUndoFrame?(): void; onRedoFrame?(): void
  framePending?: boolean; undoFrame?: { label: string; blockedReason?: string }; redoFrame?: { label: string; blockedReason?: string }
  relationships?: RelationshipMode; onRelationships?(mode: RelationshipMode): void
  /** Every label the store offers, configured or carried by a ticket. */
  labels?: readonly string[]; labelFilters?: LabelFilters
  onLabelFilter?(label: string): void; onClearLabelFilters?(): void
}

const stateWords: Record<LabelState | 'off', string> = {
  include: 'included', exclude: 'excluded', off: 'not filtered',
}
/** What the button says with the popover shut, so the active filters are
 * readable without opening it. */
export function labelSummary(filters: LabelFilters | undefined): string {
  let include = 0, exclude = 0
  for (const state of filters?.values() || []) if (state === 'include') include++; else exclude++
  if (!include && !exclude) return 'Labels'
  const parts = []
  if (include) parts.push(`${include} in`)
  if (exclude) parts.push(`${exclude} out`)
  return `Labels: ${parts.join(', ')}`
}

/** One chip per label, cycling unselected to include to exclude. A ticket
 * carries many labels, so this is three-state where a status chip is a
 * checkbox. The state rides in the accessible name rather than aria-pressed,
 * which is binary and would report an exclusion as simply not pressed. */
function LabelFilter(p: ToolbarProps) {
  const filters = p.labelFilters
  const active = !!filters?.size
  return <details class="label-filter" id="labelFilter">
    <summary class="tool" aria-label={`Filter by label. ${labelSummary(filters)}`}>{labelSummary(filters)}</summary>
    <div class="label-filter-body">
      <div class="label-filter-head">
        <span class="badge">Click to require a label, again to exclude it</span>
        <button type="button" class="tool" id="clearLabelFilters" disabled={!active}
          onClick={() => p.onClearLabelFilters?.()}>Clear</button>
      </div>
      {p.labels?.length
        ? <div class="chip-row" id="labelChips">{p.labels.map(label => {
          const state = filters?.get(label) || 'off'
          return <button key={label} type="button" class="chip label-chip" data-label={label} data-state={state}
            aria-label={`${label}, ${stateWords[state]}`} onClick={() => p.onLabelFilter?.(label)}>
            <i class="mark" aria-hidden="true">{state === 'include' ? '+' : state === 'exclude' ? '\u2212' : '\u00b7'}</i>{label}
          </button>
        })}</div>
        : <p class="label-filter-empty">This store has no labels yet.</p>}
    </div>
  </details>
}
/** The compact label: the server's version as the CLI prints it, `+dirty`
 * when the build tree was modified, `unknown` when the server did not answer.
 * The CLI strips `+dirty` from Main.Version and keeps Modified separately, so
 * this re-attaches Go's own marker rather than inventing one. */
export function versionLabel(v: VersionInfo | null): string {
  if (!v) return 'unknown'
  return v.modified ? `${v.version}+dirty` : v.version
}

function Version({ version }: { version: VersionInfo | null | undefined }) {
  // Never render a blank label. While the fetch is in flight there is no
  // element at all; afterwards there is always a version or `unknown`.
  if (version === undefined) return null
  const commit = version ? version.commit.slice(0, 12) : 'unknown'
  return <details class="version" id="version">
    <summary class="badge" title="Server build">{versionLabel(version)}</summary>
    <dl class="version-details">
      <dt>version</dt><dd>{version?.version ?? 'unknown'}</dd>
      <dt>commit</dt><dd title={version?.commit}>{commit}</dd>
      <dt>modified</dt><dd>{version ? version.modified ? 'yes' : 'no' : 'unknown'}</dd>
      <dt>go</dt><dd>{version?.go ?? 'unknown'}</dd>
      {!version && <><dt>note</dt><dd>The server did not answer /api/version.</dd></>}
    </dl>
  </details>
}

export function Toolbar(p: ToolbarProps) {
  return <div id="toolbar">
    <div class="brand">git-ticket <span id="storePath">{p.storePath}</span></div>
    <Version version={p.version} />
    <select id="boardSelect" class="tool" title="Board" value={p.board} onChange={e => p.onBoard(e.currentTarget.value)}>
      {[...new Set([...p.boards, p.board])].map(board => <option key={board} value={board}>{board}</option>)}
    </select>
    <button id="newBoard" class="tool" title="New board" disabled={p.readOnly} onClick={p.onNewBoard}>+</button>
    <input id="search" class="tool" type="search" placeholder="Filter  /" autoComplete="off" value={p.query} onInput={e => p.onQuery(e.currentTarget.value)} />
    <div class="chip-row" id="statusFilters">{p.config?.statuses.map(status =>
      <button key={status} class="chip" style={{ color: `var(--s-${status})` }} aria-pressed={p.filters.has(status)} onClick={() => p.onFilter(status)}><i class="dot" />{status}</button>)}</div>
    <LabelFilter {...p} />
    <div class="spacer" /><span class="badge" id="counts">{p.counts}</span>
    <span class="badge warn" id="roBadge" hidden={!p.readOnly}>read-only</span>
    <label class="relationship-control">Relationships <select id="relationshipMode" class="tool" value={p.relationships || 'selected'}
      onChange={event => p.onRelationships?.(event.currentTarget.value as RelationshipMode)}>
      <option value="all">All</option><option value="selected">Selected</option><option value="none">None</option>
    </select></label>
    {p.onNewFrame && <>
      <button id="btnFrame" class="tool" disabled={p.readOnly || p.framePending} onClick={p.onNewFrame}>New frame</button>
      <button id="btnFrameUndo" class="tool" disabled={p.readOnly || p.framePending || !p.undoFrame || !!p.undoFrame.blockedReason}
        title={p.undoFrame?.blockedReason || p.undoFrame?.label || 'No frame history'} onClick={p.onUndoFrame}>Undo frame</button>
      <button id="btnFrameRedo" class="tool" disabled={p.readOnly || p.framePending || !p.redoFrame || !!p.redoFrame.blockedReason}
        title={p.redoFrame?.blockedReason || p.redoFrame?.label || 'No frame redo'} onClick={p.onRedoFrame}>Redo frame</button>
    </>}
    <button id="btnArrange" class="tool" title="Lay unplaced cards out in status lanes" disabled={p.readOnly || p.framePending} onClick={p.onArrange}>Arrange</button>
    <button id="btnFit" class="tool" title="Fit all cards in view" onClick={p.onFit}>Fit</button>
    <button id="btnNew" class="tool primary" title="New ticket (double-click the canvas)" disabled={p.readOnly} onClick={p.onNew}>New ticket</button>
  </div>
}
