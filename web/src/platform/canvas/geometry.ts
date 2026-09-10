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
const LANE_W = 300;
const LANE_GAP = 22;

/** Reserve a stable lane slot per ticket, even when it has a manual position.
 * Pinning a frame's members must not relocate unrelated automatic cards. */
export function autoPlace(
  items: Iterable<PlacementItem>,
  pinned: PinnedPositions,
  statuses: readonly string[],
): Map<string, Point> {
  const positions = new Map<string, Point>();
  const lanes = new Map<number, number>();
  const sorted = [...items].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const item of sorted) {
    const lane = Math.max(0, statuses.indexOf(item.status));
    const row = lanes.get(lane) ?? 0;
    lanes.set(lane, row + 1);
    if (isPinned(item.id, pinned)) continue;
    positions.set(item.id, { x: lane * (LANE_W + LANE_GAP), y: row * 340 });
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
