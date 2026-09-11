/** Pure placement and view calculations extracted from web/app.js. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface View extends Point {
  /** Positive scene-to-client scale. */
  readonly k: number;
}

export interface StageOrigin {
  readonly left: number;
  readonly top: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Placement needs no other ticket fields. */
export interface PlacementItem {
  readonly id: string;
  readonly status: string;
}

export type PinnedPositions = Readonly<Record<string, Point | undefined>>;

export interface FitCard extends Point {
  /** Frame bounds may be wider than a ticket card. */
  readonly width?: number;
  /** Scene-space height. Omit when no measurement is available. */
  readonly height?: number;
}

export const CARD_WIDTH = 280;
/** The compact density width. Placement, edges and the stylesheet all read a
 * width rather than this constant, so the two densities share one code path. */
export const COMPACT_CARD_WIDTH = 180;

/** How much of a card the canvas shows. The setting is session state, so a
 * reload returns to `full`. */
export type Density = 'full' | 'compact';

/**
 * The card width a density renders at. Every consumer of the width goes
 * through here rather than choosing between the two constants itself, so the
 * stylesheet, the edge anchors and the fit bounds cannot disagree.
 *
 * Automatic placement is deliberately not one of those consumers. `autoPlace`
 * lanes off `LANE_W`, so switching density leaves every automatic card where
 * it is and compact simply opens space between them.
 */
export function cardWidthFor(density: Density): number {
  return density === 'compact' ? COMPACT_CARD_WIDTH : CARD_WIDTH;
}
const LANE_W = 300;
const LANE_GAP = 22;

/**
 * What a status with no tickets occupies, against the 322 px an occupied lane
 * takes. It buys back the boundary between one status and the next, which
 * vanished when empty lanes were dropped entirely.
 *
 * Free on this board, and only because of what binds. Measured with the row
 * pitch at 269: every gap from 0 to 120 px fits at 0.605 at full and 0.614 at
 * compact, because height binds and the width a gap spends is width nobody is
 * waiting on. A full 322 px column costs 18%. Shorten the board enough that
 * width binds again and this gap starts costing what a column costs today.
 */
const EMPTY_LANE_GAP = 80;

/**
 * How far down one row sits from the one above it. The tallest card on the
 * reference board is 249 px at full density and 220 px at compact, so 269 is
 * the tallest observed card plus 20.
 *
 * One number for both densities, because a pitch that varied with density
 * would make placement vary with density, and derived positions recompute on
 * every accepted store update. The board would sit still on the toggle and
 * reflow at the next unrelated update.
 *
 * This spends most of the clearance the old 340 carried, from 91 px above the
 * tallest card to 20. A card taller than 269 overlaps the row below it, and
 * the reference board's tallest card is not the tallest card that can exist: a
 * long title with many labels and a blocker line will beat it. The overlap
 * check in `canvas-arrange.spec.ts` is what stands between that and a board
 * nobody can read, and it first fires at a pitch of 230 on this board.
 */
const ROW_PITCH = 269;

/**
 * How deep one column of a status lane goes before the next ticket starts a
 * new column to its right. A lane of 25 tickets is otherwise 8409 px tall
 * against 1890 px wide, and a viewport is the other way round.
 *
 * Six is a count, so it reads neither card width nor card height. That is the
 * point: derived positions recompute on every accepted store update, so a cap
 * that varied with density would leave the board alone on a density toggle and
 * then reflow it at the next unrelated update.
 *
 * Measured on the 30-card reference board, 25 `done` and 5 `draft`, at the
 * 2048x1152 reference viewport: wrapping alone took the fit scale from 0.120
 * to 0.500 and the span from 1890x8409 to 3178x1926. With empty lanes dropped
 * and the tighter row pitch it reaches 0.605, at 1890x1571.
 *
 * A cap of 7 was measured as well and it does not combine: at pitch 269 it
 * reaches 0.522, and dropping empty lanes on top adds nothing, because cap 7
 * is bound by height.
 *
 * One board shape backs that, and this store puts 25 of 30 tickets in a single
 * status. A store spread evenly across seven statuses is nearly square before
 * wrapping and could be made worse by this cap. Measure a second shape before
 * treating 6 as settled.
 */
const LANE_CAP = 6;

/**
 * Lay every ticket out in status lanes, wrapping a lane deeper than `LANE_CAP`
 * into further columns. Fill order is column-major: down to the cap, then
 * right. A status stays readable top to bottom, and the id sort keeps it
 * deterministic.
 *
 * Two passes, because a lane's width is known only after every ticket is seen
 * and the origin of each lane is the accumulated width of the lanes before it.
 *
 * A status with no tickets gets `EMPTY_LANE_GAP` rather than a column, and a
 * leading empty status gets nothing, so the first occupied lane sits at x 0.
 * Paying a gap for a lane nobody can see would otherwise move the whole board
 * right by a margin that changes as the earliest statuses fill.
 *
 * A full column for an empty lane was what this did first, and it cost 18% of
 * the fit scale on the reference board. No lane at all was next, and it cost
 * the boundary between one status and the next: the render read as a single
 * block of cards. The gap keeps the boundary, and it is free while the board
 * is bound by height, which it is once the row pitch tightens.
 *
 * Reserve a stable lane slot per ticket, even when it has a manual position.
 * Pinning a frame's members must not relocate unrelated automatic cards, and
 * that has to hold across a column boundary too.
 */
export function autoPlace(
  items: Iterable<PlacementItem>,
  pinned: PinnedPositions,
  statuses: readonly string[],
): Map<string, Point> {
  const positions = new Map<string, Point>();
  const sorted = [...items].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const laneOf = (item: PlacementItem) => Math.max(0, statuses.indexOf(item.status));

  const occupancy = new Map<number, number>();
  for (const item of sorted) {
    const lane = laneOf(item);
    occupancy.set(lane, (occupancy.get(lane) ?? 0) + 1);
  }
  const origins = new Map<number, number>();
  let x = 0;
  for (let lane = 0; lane <= Math.max(-1, ...occupancy.keys()); lane++) {
    const count = occupancy.get(lane) ?? 0;
    // `origins.size` is how this knows it is past the first occupied lane.
    if (!count) { if (origins.size) x += EMPTY_LANE_GAP; continue; }
    origins.set(lane, x);
    x += Math.ceil(count / LANE_CAP) * (LANE_W + LANE_GAP);
  }

  const filled = new Map<number, number>();
  for (const item of sorted) {
    const lane = laneOf(item);
    const slot = filled.get(lane) ?? 0;
    filled.set(lane, slot + 1);
    if (isPinned(item.id, pinned)) continue;
    positions.set(item.id, {
      x: origins.get(lane)! + Math.floor(slot / LANE_CAP) * (LANE_W + LANE_GAP),
      y: (slot % LANE_CAP) * ROW_PITCH,
    });
  }
  return positions;
}

export function isPinned(id: string, pinned: PinnedPositions): boolean {
  return !!pinned[id];
}

/** Saved placement wins over automatic placement; missing IDs use the origin. */
export function posOf(
  id: string,
  pinned: PinnedPositions,
  automatic: ReadonlyMap<string, Point>,
): Point {
  return pinned[id] || automatic.get(id) || { x: 0, y: 0 };
}

/** Convert client coordinates using the stage's client-space origin. */
export function toScene(client: Point, view: View, origin: StageOrigin): Point {
  return {
    x: (client.x - origin.left - view.x) / view.k,
    y: (client.y - origin.top - view.y) / view.k,
  };
}

export function toClient(scene: Point, view: View, origin: StageOrigin): Point {
  return {
    x: scene.x * view.k + view.x + origin.left,
    y: scene.y * view.k + view.y + origin.top,
  };
}

/** Apply the legacy wheel curve while keeping the scene point under the cursor. */
export function zoomAt(
  view: View,
  client: Point,
  origin: StageOrigin,
  deltaY: number,
): View {
  const before = toScene(client, view, origin);
  const k = Math.min(2.5, Math.max(0.1, view.k * Math.exp(-deltaY * 0.0015)));
  return {
    x: client.x - origin.left - before.x * k,
    y: client.y - origin.top - before.y * k,
    k,
  };
}

/**
 * Fit fixed-width cards with an optional inspector allowance and padding.
 * Returns null for an empty board so the caller can leave its view unchanged.
 */
export function fitView(cards: Iterable<FitCard>, stage: Size, inspectorWidth = 380): View | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let count = 0;
  for (const card of cards) {
    count++;
    x0 = Math.min(x0, card.x);
    y0 = Math.min(y0, card.y);
    x1 = Math.max(x1, card.x + (card.width ?? CARD_WIDTH));
    y1 = Math.max(y1, card.y + (card.height ?? 120));
  }
  if (!count) return null;
  const pad = 60;
  const w = stage.width - inspectorWidth, h = stage.height - 40;
  const k = Math.min(2, Math.max(0.15, Math.min(
    w / (x1 - x0 + pad * 2),
    h / (y1 - y0 + pad * 2),
  )));
  return {
    x: (w - (x1 - x0) * k) / 2 - x0 * k + 20,
    y: (h - (y1 - y0) * k) / 2 - y0 * k + 20,
    k,
  };
}
