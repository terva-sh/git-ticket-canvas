import type { Schema, VersionInfo } from '../platform/tickets/types'
import type { RelationshipMode } from './canvas/Edges'

export interface ToolbarProps {
  storePath: string; readOnly: boolean; boards: string[]; board: string; query: string
  /** undefined while GET /api/version is in flight, null when it failed. */
  version?: VersionInfo | null
  config: Schema | null; filters: ReadonlySet<string>; counts: string
  onQuery(value: string): void; onFilter(value: string): void; onBoard(value: string): void
  onNewBoard(): void; onArrange(): void; onFit(): void; onNew(): void
  relationships?: RelationshipMode; onRelationships?(mode: RelationshipMode): void
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
    <div class="spacer" /><span class="badge" id="counts">{p.counts}</span>
    <span class="badge warn" id="roBadge" hidden={!p.readOnly}>read-only</span>
    <label class="relationship-control">Relationships <select id="relationshipMode" class="tool" value={p.relationships || 'selected'}
      onChange={event => p.onRelationships?.(event.currentTarget.value as RelationshipMode)}>
      <option value="all">All</option><option value="selected">Selected</option><option value="none">None</option>
    </select></label>
    <button id="btnArrange" class="tool" title="Lay unplaced cards out in status lanes" disabled={p.readOnly} onClick={p.onArrange}>Arrange</button>
    <button id="btnFit" class="tool" title="Fit all cards in view" onClick={p.onFit}>Fit</button>
    <button id="btnNew" class="tool primary" title="New ticket (double-click the canvas)" disabled={p.readOnly} onClick={p.onNew}>New ticket</button>
  </div>
}
