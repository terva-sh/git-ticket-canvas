import type { Ticket } from './types'

/** Which relationship is being added. `dependency` means `ticket` would wait on
 * `target`; `parent` means `target` would become `ticket`'s parent. */
export type RelationKind = 'dependency' | 'parent'

/** The fields the walk reads, so a caller can hand it partial tickets. */
export type RelationTicket = Pick<Ticket, 'id' | 'dependencies' | 'parent' | 'blocksOn'>

/** Answers, for one ticket set, whether adding an edge would close a cycle,
 * and names the tickets in it. The result lists IDs in edge order starting at
 * `ticket`, so the edge from the last one leads back to `ticket`. A
 * self-reference answers `[ticket]`, and an edge that closes nothing answers
 * `null`. */
export type CycleFinder = (kind: RelationKind, ticket: string, target: string) => string[] | null

/** Builds the graphs once and answers any number of edges against them. The
 * inspector's picker asks about every ticket in the store each time it opens,
 * and rebuilding the child index for each one would make that quadratic in
 * the edges as well as the tickets.
 *
 * `git-ticket` refuses only a self-reference when it writes. Anything longer is
 * accepted and reported afterwards by `git ticket check`, by which time every
 * ticket in the loop is unready for good. So this refuses exactly what check
 * would report, over the same three graphs it builds in `ticket/check.go`:
 *
 * - dependencies (`dependency_cycle`),
 * - parents (`parent_cycle`), and
 * - the blocking graph (`blocking_cycle`), which is what readiness waits on:
 *   dependencies, plus the children of any ticket whose blocks_on is children.
 *   A loop can alternate the two edge kinds while each kind alone stays
 *   acyclic. An epic blocking on its children and a child depending on that
 *   epic is the smallest one.
 *
 * Every ticket in the set takes part whatever its status, as it does in check,
 * so a loop through a done or archived ticket is still a loop. An edge to a
 * ticket not in the set is skipped, as check skips it: that is reported as
 * missing rather than as a cycle. */
export function cycleFinder(tickets: ReadonlyMap<string, RelationTicket>): CycleFinder {
  // Built lazily: a parent change that the target's blocks_on cannot affect
  // never needs the blocking graph at all.
  let blocking: Map<string, string[]> | undefined
  const blockingGraph = () => {
    if (blocking) return blocking
    blocking = new Map()
    for (const t of tickets.values()) {
      blocking.set(t.id, (t.dependencies || []).filter(id => tickets.has(id)))
    }
    for (const t of tickets.values()) {
      const parent = t.parent && tickets.get(t.parent)
      if (parent && parent.blocksOn === 'children') blocking.get(parent.id)!.push(t.id)
    }
    return blocking
  }

  return (kind, ticket, target) => {
    if (ticket === target) return [ticket]
    if (!tickets.has(ticket) || !tickets.has(target)) return null

    if (kind === 'dependency') {
      // The new edge runs ticket -> target in both the dependency and the
      // blocking graph. The blocking graph contains every dependency edge, so
      // one walk from the target back to the ticket finds either kind of loop.
      const path = shortestPath(blockingGraph(), target, ticket)
      return path ? [ticket, ...path.slice(0, -1)] : null
    }

    // A parent loop is a chain, so it needs no search: follow the target's
    // parents and see whether the ticket is among them. The seen set only
    // guards against a loop the store already holds.
    const chain = [ticket]
    const seen = new Set(chain)
    for (let id: string | undefined = target; id && tickets.has(id) && !seen.has(id); id = tickets.get(id)!.parent) {
      chain.push(id)
      seen.add(id)
      if (tickets.get(id)!.parent === ticket) return chain
    }

    // A target that blocks on its children gains a blocking edge to its new
    // child, so the change closes a loop if the ticket already reaches the
    // target. The walk may start through the edge from the ticket's current
    // parent, which this change removes, but a shortest path from the ticket
    // never passes back through the ticket, so that edge cannot be on it.
    if (tickets.get(target)!.blocksOn !== 'children') return null
    return shortestPath(blockingGraph(), ticket, target)
  }
}

/** One edge on its own. Callers asking about many edges over the same tickets
 * should build a finder once with `cycleFinder`. */
export function closingCycle(tickets: ReadonlyMap<string, RelationTicket>,
  kind: RelationKind, ticket: string, target: string): string[] | null {
  return cycleFinder(tickets)(kind, ticket, target)
}

/** Breadth-first, so the cycle a caller names is a shortest one rather than
 * whichever the walk happened to meet first. Returns `from` through `to`. */
function shortestPath(edges: ReadonlyMap<string, readonly string[]>, from: string, to: string): string[] | null {
  const previous = new Map<string, string>([[from, from]])
  const queue = [from]
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i]
    if (at === to) {
      const path = [at]
      for (let step = at; step !== from;) path.unshift(step = previous.get(step)!)
      return path
    }
    for (const next of edges.get(at) || []) {
      if (previous.has(next)) continue
      previous.set(next, at)
      queue.push(next)
    }
  }
  return null
}
