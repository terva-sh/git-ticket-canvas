import type { Schema, VersionInfo } from '../platform/tickets/types'
import type { LabelFilters, LabelMatch, LabelState } from '../platform/tickets/filters'
import type { Density } from '../platform/canvas/geometry'
import { MAX_ZOOM, MIN_ZOOM } from '../platform/canvas/geometry'
import type { RelationshipMode } from './canvas/Edges'
import { StorePicker, type StorePickerProps } from './StorePicker'

export interface ToolbarProps {
  storePath: string; readOnly: boolean; boards: string[]; board: string; query: string
  /** undefined while GET /api/version is in flight, null when it failed. */
  version?: VersionInfo | null
  config: Schema | null; filters: ReadonlySet<string>; counts: string
  onQuery(value: string): void; onFilter(value: string): void; onBoard(value: string): void
  onNewBoard(): void; onArrange(): void; onFit(): void; onNew(): void
  onNewFrame?(): void; onUndoFrame?(): void; onRedoFrame?(): void
  /** Opens the rules panel. Offered read-only too: the rules are worth reading anywhere. */
  onPens?(): void; pensPending?: boolean
  framePending?: boolean; undoFrame?: { label: string; blockedReason?: string }; redoFrame?: { label: string; blockedReason?: string }
  relationships?: RelationshipMode; onRelationships?(mode: RelationshipMode): void
  /** The density in force. `densityAutomatic` is what the viewport asked for,
   * and `densityChosen` says whether somebody overrode it, so the select can
   * offer `Automatic` as a value rather than only as a starting state. */
  density?: Density; densityAutomatic?: Density; densityChosen?: boolean
  onDensity?(density: Density | null): void
  /** Opens the panel that explains every automatic display choice. */
  onDisplay?(): void
  /** Every label the store offers, configured or carried by a ticket. */
  labels?: readonly string[]; labelFilters?: LabelFilters
  /** How the required labels combine. Absent reads as `all`. */
  labelMatch?: LabelMatch
  onLabelFilter?(label: string): void; onClearLabelFilters?(): void
  onLabelMatch?(match: LabelMatch): void
  /** Absent on a canvas serving one store, which needs no picker. */
  stores?: StorePickerProps
  /** Absent on a desk canvas, which has no session to describe or to end. */
  account?: { name: string; onOpen(): void }
  /** The magnification, as a scale where 1 is 1:1. */
  zoom?: number
  onZoomIn?(): void; onZoomOut?(): void; onZoomReset?(): void
}

const stateWords: Record<LabelState | 'off', string> = {
  include: 'included', exclude: 'excluded', off: 'not filtered',
}
/** What the button says with the popover shut, so the active filters are
 * readable without opening it.
 *
 * From two required labels up this names the mode, because `3 in` was true of
 * both and told nobody which one was in force. At one required label it does
 * not: `all` and `any` select exactly the same tickets there, so `all 1` would
 * assert a difference the board cannot demonstrate. */
export function labelSummary(filters: LabelFilters | undefined, match: LabelMatch = 'all'): string {
  let include = 0, exclude = 0
  for (const state of filters?.values() || []) if (state === 'include') include++; else exclude++
  if (!include && !exclude) return 'Labels'
  const parts = []
  if (include === 1) parts.push('1 in')
  else if (include) parts.push(match === 'any' ? `any of ${include}` : `all ${include}`)
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
  const match = p.labelMatch || 'all'
  const summary = labelSummary(filters, match)
  // The toggle sits in the popover rather than on the toolbar row. The row
  // already overflowed once, on TKT-01M2NHFKX, and this body is absolutely
  // positioned, so it costs the row no width at any window size.
  const mode = (value: LabelMatch, text: string) =>
    <button key={value} type="button" class="chip" id={`labelMatch-${value}`} data-match={value}
      aria-pressed={match === value} onClick={() => p.onLabelMatch?.(value)}>{text}</button>
  return <details class="label-filter" id="labelFilter">
    <summary class="tool" aria-label={`Filter by label. ${summary}`}>{summary}</summary>
    <div class="label-filter-body">
      <div class="label-filter-head">
        <span class="badge">Click to filter by a label, again to exclude it</span>
        <button type="button" class="tool" id="clearLabelFilters" disabled={!active}
          onClick={() => p.onClearLabelFilters?.()}>Clear</button>
      </div>
      {/* Spelled out rather than left to the words `all` and `any`, because
          which one a board is on is exactly what was never visible before. */}
      <div class="label-filter-mode" id="labelMatchMode" role="group" aria-label="How required labels combine">
        <span class="badge">Match</span>{mode('all', 'all')}{mode('any', 'any')}
        <span class="badge" id="labelMatchHint">{match === 'any'
          ? 'a ticket needs at least one of them'
          : 'a ticket needs every one of them'}</span>
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
  // Two rows on purpose. One wrapping row let the browser decide which control
  // fell off the end, and that answer changed with the length of the store path
  // and the number of statuses a store defines. Placement now follows what a
  // control is about:
  //
  //   context   what you are looking at  |  who you are, and what this window is
  //   working   finding things           |  changing the view, and making things
  return <div id="toolbar">
    <div class="toolbar-row" data-row="context">
      <div class="toolbar-side">
        <div class="brand">git-ticket <span id="storePath">{p.storePath}</span></div>
        <Version version={p.version} />
        {p.stores && <StorePicker {...p.stores} />}
        <select id="boardSelect" class="tool" title="Board" value={p.board} onChange={e => p.onBoard(e.currentTarget.value)}>
          {[...new Set([...p.boards, p.board])].map(board => <option key={board} value={board}>{board}</option>)}
        </select>
        <button id="newBoard" class="tool" title="New board" disabled={p.readOnly} onClick={p.onNewBoard}>+</button>
      </div>
      <div class="toolbar-side right">
        {/* A property of the store rather than of the filters, so it sits with
            the store rather than with the counts. */}
        <span class="badge warn" id="roBadge" hidden={!p.readOnly}>read-only</span>
        {p.onDisplay && <button id="btnDisplay" class="tool"
          title="What this canvas chose from the size and shape of this window"
          onClick={p.onDisplay}>Display</button>}
        {p.account && <button id="btnAccount" class="tool" title="Your account, groups and actor"
          onClick={p.account.onOpen}>{p.account.name}</button>}
      </div>
    </div>

    <div class="toolbar-row" data-row="working">
      <div class="toolbar-side">
        <input id="search" class="tool" type="search" placeholder="Filter  /" autoComplete="off" value={p.query} onInput={e => p.onQuery(e.currentTarget.value)} />
        <div class="chip-row" id="statusFilters">{p.config?.statuses.map(status =>
          <button key={status} class="chip" style={{ color: `var(--s-${status})` }} aria-pressed={p.filters.has(status)} onClick={() => p.onFilter(status)}><i class="dot" />{status}</button>)}</div>
        <LabelFilter {...p} />
        {/* What the filters to its left left behind, so it reads as their
            result rather than as a fact about the store. */}
        <span class="badge" id="counts">{p.counts}</span>
      </div>
      <div class="toolbar-side right">
        <label class="relationship-control">Relationships <select id="relationshipMode" class="tool" value={p.relationships || 'selected'}
          onChange={event => p.onRelationships?.(event.currentTarget.value as RelationshipMode)}>
          <option value="all">All</option><option value="selected">Selected</option><option value="none">None</option>
        </select></label>
        {/* Density has a control here as well as in the display panel,
            deliberately: it is the one display setting somebody changes while
            reading a board, and the panel is where you go to understand the
            choice rather than to make it. Both write the same preference, so
            they cannot disagree. */}
        {p.onDensity && <label class="relationship-control">Cards <select id="cardDensity" class="tool"
          title="Compact narrows cards to fit more of the board on screen"
          value={p.densityChosen ? p.density || 'full' : ''}
          onChange={event => p.onDensity?.((event.currentTarget.value || null) as Density | null)}>
          <option value="">Automatic{p.densityAutomatic ? ` — ${p.densityAutomatic === 'compact' ? 'Compact' : 'Full'}` : ''}</option>
          <option value="full">Full</option><option value="compact">Compact</option>
        </select></label>}
        {p.onPens && <button id="btnPens" class="tool" title="The board's rules: which cards go to which pen"
          disabled={p.pensPending || p.framePending} onClick={p.onPens}>Pens</button>}
        {p.onNewFrame && <>
          <button id="btnFrame" class="tool" disabled={p.readOnly || p.framePending} onClick={p.onNewFrame}>New frame</button>
          <button id="btnFrameUndo" class="tool" disabled={p.readOnly || p.framePending || !p.undoFrame || !!p.undoFrame.blockedReason}
            title={p.undoFrame?.blockedReason || p.undoFrame?.label || 'No frame history'} onClick={p.onUndoFrame}>Undo frame</button>
          <button id="btnFrameRedo" class="tool" disabled={p.readOnly || p.framePending || !p.redoFrame || !!p.redoFrame.blockedReason}
            title={p.redoFrame?.blockedReason || p.redoFrame?.label || 'No frame redo'} onClick={p.onRedoFrame}>Redo frame</button>
        </>}
        <button id="btnArrange" class="tool" title="Lay unplaced cards out in status lanes" disabled={p.readOnly || p.framePending} onClick={p.onArrange}>Arrange</button>
        {p.zoom !== undefined && <div class="zoom" role="group" aria-label="Zoom">
          <button id="btnZoomOut" class="tool" title="Zoom out" aria-label="Zoom out"
            disabled={p.zoom <= MIN_ZOOM + 0.001} onClick={p.onZoomOut}>&minus;</button>
          {/* The level is the reset. A separate button for something you press
              rarely costs a slot in a row that is already the longer of the two. */}
          <button id="btnZoomReset" class="tool zoom-level" onClick={p.onZoomReset}
            title="Reset to 1:1. Fit is the other one — it frames every card instead.">
            {Math.round(p.zoom * 100)}%</button>
          <button id="btnZoomIn" class="tool" title="Zoom in" aria-label="Zoom in"
            disabled={p.zoom >= MAX_ZOOM - 0.001} onClick={p.onZoomIn}>+</button>
        </div>}
        <button id="btnFit" class="tool" title="Fit all cards in view" onClick={p.onFit}>Fit</button>
        {/* Last, where a primary action belongs. The wrapping row used to leave
            it alone on a line of its own at the far left. */}
        <button id="btnNew" class="tool primary" title="New ticket (double-click the canvas)" disabled={p.readOnly} onClick={p.onNew}>New ticket</button>
      </div>
    </div>
  </div>
}
