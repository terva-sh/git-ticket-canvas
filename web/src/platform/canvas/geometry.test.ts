import { describe, expect, it } from 'vitest';
import {
  CARD_WIDTH, COMPACT_CARD_WIDTH, autoPlace, cardWidthFor, fitView, isPinned,
  posOf, toClient, toScene, zoomAt,
} from './geometry';

describe('cardWidthFor', () => {
  it('maps each density to its width', () => {
    expect(cardWidthFor('full')).toBe(CARD_WIDTH);
    expect(cardWidthFor('compact')).toBe(COMPACT_CARD_WIDTH);
  });

  it('bounds a fit by the width each card carries, not by the full width', () => {
    // `fitView` falls back to `CARD_WIDTH` per card, so a compact board fits
    // correctly only when the caller stamps the active width on each card.
    const cards = [{ x: 0, y: 0, height: 100 }, { x: 600, y: 0, height: 100 }];
    const compact = cards.map(card => ({ ...card, width: cardWidthFor('compact') }));
    const stage = { width: 1200, height: 800 };
    expect(fitView(compact, stage)?.k).toBeGreaterThan(fitView(cards, stage)!.k);
  });
});

describe('autoPlace', () => {
  it('sorts IDs and stacks each configured status lane independently', () => {
    const items = Object.freeze([
      { id: 'd', status: 'ready' },
      { id: 'c', status: 'done' },
      { id: 'b', status: 'draft' },
      { id: 'a', status: 'ready' },
    ]);
    expect([...autoPlace(items, {}, ['draft', 'ready', 'done'])]).toEqual([
      ['a', { x: 322, y: 0 }],
      ['b', { x: 0, y: 0 }],
      ['c', { x: 644, y: 0 }],
      ['d', { x: 322, y: 340 }],
    ]);
    expect(items.map(({ id }) => id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('reserves pinned slots without changing saved or unrelated automatic positions', () => {
    const pinned = Object.freeze({ a: Object.freeze({ x: 0, y: 0 }) });
    const items = [{ id: 'a', status: 'ready' }, { id: 'b', status: 'ready' }];
    expect([...autoPlace(items, pinned, ['ready'])]).toEqual([
      ['b', { x: 0, y: 340 }],
    ]);
    expect(pinned).toEqual({ a: { x: 0, y: 0 } });
    expect([...autoPlace(items, {}, ['ready'])]).toEqual([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 0, y: 340 }],
    ]);
  });

  it('puts unknown statuses in lane zero alongside the first configured status', () => {
    const items = [{ id: 'b', status: 'draft' }, { id: 'a', status: 'custom' }];
    expect([...autoPlace(items, {}, ['draft', 'ready']).values()]).toEqual([
      { x: 0, y: 0 }, { x: 0, y: 340 },
    ]);
  });

  it('uses a single lane without configured statuses and accepts iterators', () => {
    const items = new Map([
      ['b', { id: 'b', status: 'ready' }],
      ['a', { id: 'a', status: 'draft' }],
    ]);
    expect([...autoPlace(items.values(), {}, [])]).toEqual([
      ['a', { x: 0, y: 0 }], ['b', { x: 0, y: 340 }],
    ]);
  });

  it('returns a fresh empty map for an empty board', () => {
    const first = autoPlace([], {}, []);
    expect(first.size).toBe(0);
    expect(autoPlace([], {}, []) === first).toBe(false);
  });
});

describe('position lookup', () => {
  it('prefers pinned placement, including the origin, then automatic, then zero', () => {
    const pinned = { saved: { x: 0, y: 0 }, missing: undefined };
    const automatic = new Map([
      ['saved', { x: 322, y: 132 }], ['auto', { x: -40, y: 132 }],
    ]);
    expect(isPinned('saved', pinned)).toBe(true);
    expect(isPinned('auto', pinned)).toBe(false);
    expect(isPinned('missing', pinned)).toBe(false);
    expect(posOf('saved', pinned, automatic)).toEqual({ x: 0, y: 0 });
    expect(posOf('auto', pinned, automatic)).toEqual({ x: -40, y: 132 });
    expect(posOf('missing', pinned, automatic)).toEqual({ x: 0, y: 0 });
  });
});

describe('coordinate conversion', () => {
  const origin = Object.freeze({ left: 50, top: 30 });

  it('subtracts the stage origin and view translation before scaling', () => {
    expect(toScene({ x: 230, y: 100 }, { x: 120, y: 90, k: 2 }, origin))
      .toEqual({ x: 30, y: -10 });
  });

  it.each([0.1, 0.75, 1, 2.5])('round-trips client and scene points at scale %s', (k) => {
    const view = Object.freeze({ x: -120, y: 90, k });
    const scene = Object.freeze({ x: -45, y: 123 });
    const client = toClient(scene, view, origin);
    expect(client).toEqual({ x: scene.x * k - 70, y: scene.y * k + 120 });
    const result = toScene(client, view, origin);
    expect(result.x).toBeCloseTo(scene.x);
    expect(result.y).toBeCloseTo(scene.y);
  });
});

describe('zoomAt', () => {
  const view = Object.freeze({ x: -120, y: 90, k: 0.8 });
  const client = Object.freeze({ x: 427, y: 315 });
  const origin = Object.freeze({ left: 37, top: 55 });

  it.each([-120, 120, -1e6, 1e6])('anchors the cursor for deltaY %s, including clamps', (deltaY) => {
    const before = toScene(client, view, origin);
    const zoomed = zoomAt(view, client, origin, deltaY);
    const after = toScene(client, zoomed, origin);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(zoomed.k).toBeCloseTo(Math.min(2.5, Math.max(0.1, 0.8 * Math.exp(-deltaY * 0.0015))));
    expect(view).toEqual({ x: -120, y: 90, k: 0.8 });
  });

  it('leaves the view unchanged for zero wheel delta', () => {
    expect(zoomAt(view, client, origin, 0)).toEqual(view);
  });

  it.each([{ k: 0.1, deltaY: 100 }, { k: 2.5, deltaY: -100 }])(
    'does not pan when already at scale $k and zooming past the limit', ({ k, deltaY }) => {
      const atLimit = { x: 10, y: -20, k };
      expect(zoomAt(atLimit, client, origin, deltaY)).toEqual(atLimit);
    },
  );
});

describe('fitView', () => {
  it('returns null for an empty board', () => {
    expect(fitView([], { width: 1000, height: 800 })).toBeNull();
  });

  it('uses fixed card width, fallback height, inspector allowance, and padding', () => {
    // Available area 400x240 equals the padded 280 px card bounds at scale 1.
    expect(fitView([{ x: 0, y: 0 }], { width: 780, height: 280 }))
      .toEqual({ x: 80, y: 80, k: 1 });
  });

  it('unions negative positions and measured heights without mutating inputs', () => {
    const cards = Object.freeze([
      Object.freeze({ x: -100, y: -50, height: 200 }),
      Object.freeze({ x: 200, y: 250, height: 300 }),
    ]);
    // Bounds [-100, -50]..[480, 550], padded size 700x720.
    expect(fitView(cards.values(), Object.freeze({ width: 1080, height: 760 })))
      .toEqual({ x: 180, y: 130, k: 1 });
  });

  it('uses the tighter height constraint and preserves a measured zero height', () => {
    expect(fitView([{ x: 0, y: 0, height: 0 }], { width: 1380, height: 160 }))
      .toEqual({ x: 380, y: 80, k: 1 });
  });

  it('caps fit zoom at 2 rather than the wheel limit of 2.5', () => {
    expect(fitView([{ x: 0, y: 0 }], { width: 2380, height: 2040 }))
      .toEqual({ x: 740, y: 900, k: 2 });
  });

  it('clamps oversized bounds to the legacy minimum scale', () => {
    const result = fitView([{ x: 0, y: 0, height: 10000 }], { width: 1000, height: 800 });
    expect(result?.k).toBe(0.15);
    expect(result?.x).toBeCloseTo(309);
    expect(result?.y).toBe(-350);
  });

  it('retains finite legacy fit math when the stage is smaller than its allowances', () => {
    expect(fitView([{ x: 0, y: 0 }], { width: 100, height: 20 }))
      .toEqual({ x: -141, y: 1, k: 0.15 });
  });
});
