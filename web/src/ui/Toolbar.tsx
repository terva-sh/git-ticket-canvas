import type { Schema } from '../platform/tickets/types'

export interface ToolbarProps {
  storePath: string; readOnly: boolean; boards: string[]; board: string; query: string
  config: Schema | null; filters: ReadonlySet<string>; counts: string
  onQuery(value: string): void; onFilter(value: string): void; onBoard(value: string): void
  onNewBoard(): void; onArrange(): void; onFit(): void; onNew(): void
}
export function Toolbar(p: ToolbarProps) {
  return <div id="toolbar">
    <div class="brand">git-ticket <span id="storePath">{p.storePath}</span></div>
    <select id="boardSelect" class="tool" title="Board" value={p.board} onChange={e => p.onBoard(e.currentTarget.value)}>
      {[...new Set([...p.boards, p.board])].map(board => <option key={board} value={board}>{board}</option>)}
    </select>
    <button id="newBoard" class="tool" title="New board" disabled={p.readOnly} onClick={p.onNewBoard}>+</button>
    <input id="search" class="tool" type="search" placeholder="Filter  /" autoComplete="off" value={p.query} onInput={e => p.onQuery(e.currentTarget.value)} />
    <div class="chip-row" id="statusFilters">{p.config?.statuses.map(status =>
      <button key={status} class="chip" style={{ color: `var(--s-${status})` }} aria-pressed={p.filters.has(status)} onClick={() => p.onFilter(status)}><i class="dot" />{status}</button>)}</div>
    <div class="spacer" /><span class="badge" id="counts">{p.counts}</span>
    <span class="badge warn" id="roBadge" hidden={!p.readOnly}>read-only</span>
    <button id="btnArrange" class="tool" title="Lay unplaced cards out in status lanes" disabled={p.readOnly} onClick={p.onArrange}>Arrange</button>
    <button id="btnFit" class="tool" title="Fit all cards in view" onClick={p.onFit}>Fit</button>
    <button id="btnNew" class="tool primary" title="New ticket (double-click the canvas)" disabled={p.readOnly} onClick={p.onNew}>New ticket</button>
  </div>
}
