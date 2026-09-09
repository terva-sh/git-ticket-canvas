import type { Point } from '../../platform/canvas/geometry'
import type { Ticket } from '../../platform/tickets/types'

export const CARD_WIDTH = 248
export interface Placement extends Point { pinned: boolean; z: number }
interface Box extends Point { height: number }

function curve(a: Box, b: Box): string {
  const rightward = b.x >= a.x
  const x1 = rightward ? a.x + CARD_WIDTH : a.x, y1 = a.y + a.height / 2
  const x2 = rightward ? b.x : b.x + CARD_WIDTH, y2 = b.y + b.height / 2
  const distance = Math.max(40, Math.abs(x2 - x1) * 0.45)
  const c1 = rightward ? x1 + distance : x1 - distance
  const c2 = rightward ? x2 - distance : x2 + distance
  return `M${x1},${y1} C${c1},${y1} ${c2},${y2} ${x2},${y2}`
}

interface EdgesProps {
  tickets: ReadonlyMap<string, Ticket>
  positions: ReadonlyMap<string, Placement>
  heights: ReadonlyMap<string, number>
  matching: ReadonlySet<string>
  ghost: { from: string; point: Point } | null
}

export function Edges({ tickets, positions, heights, matching, ghost }: EdgesProps) {
  const box = (id: string): Box => ({ ...positions.get(id)!, height: heights.get(id) ?? 110 })
  const edge = (from: string, to: string, parent: boolean, key: string) => {
    if (!positions.has(from) || !positions.has(to)) return null
    const dim = !matching.has(from) || !matching.has(to)
    return <path key={key} d={curve(box(from), box(to))} fill="none"
      stroke={parent ? 'var(--accent)' : 'var(--edge)'} stroke-width={parent ? 1.2 : 2}
      opacity={parent ? (dim ? 0.05 : 0.2) : (dim ? 0.1 : 0.9)}
      stroke-dasharray={parent ? '5 5' : undefined} marker-end={parent ? undefined : 'url(#arrow)'} />
  }
  const source = ghost && positions.has(ghost.from) ? box(ghost.from) : null
  return <svg id="edges"><g id="edgeLayer">
    <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="var(--edge)" />
    </marker></defs>
    {[...tickets.values()].map(t => t.parent && tickets.has(t.parent) ? edge(t.parent, t.id, true, `parent:${t.id}`) : null)}
    {[...tickets.values()].flatMap(t => (t.dependencies || []).map(dep => tickets.has(dep) ? edge(dep, t.id, false, `dep:${dep}:${t.id}`) : null))}
    {ghost && source && <path id="ghost" d={`M${source.x + CARD_WIDTH},${source.y + source.height / 2} L${ghost.point.x},${ghost.point.y}`}
      stroke="var(--accent)" stroke-width="1.6" stroke-dasharray="4 4" fill="none" />}
  </g></svg>
}
