import { expect, it } from 'vitest'
import { applyOverrides, chooseDisplay, fitFloor } from './viewport'
import type { Layout, ViewportFacts } from './viewport'
import { CARD_WIDTH, COMPACT_CARD_WIDTH, FIT_FLOOR } from './geometry'

function facts(over: Partial<ViewportFacts> = {}): ViewportFacts {
  return { width: 1440, height: 900, coarse: false, ...over }
}

// The rules as a table, because they are the kind of thing somebody will want
// to argue with and a table is what you argue with.
it('chooses from the size and the shape', () => {
  const rows: [string, ViewportFacts, ReturnType<typeof chooseDisplay>][] = [
    ['desk monitor', facts({ width: 2560, height: 1440 }),
      { layout: 'desk', density: 'full', inspector: 'beside', targets: 'fine' }],
    ['laptop', facts({ width: 1440, height: 900 }),
      { layout: 'desk', density: 'full', inspector: 'beside', targets: 'fine' }],
    // Wide enough for the board beside the panel, narrow enough that the rows
    // identifying a ticket cost more than they tell.
    ['narrow window', facts({ width: 860, height: 900 }),
      { layout: 'desk', density: 'compact', inspector: 'bottom', targets: 'fine' }],
    ['tablet, portrait', facts({ width: 820, height: 1180, coarse: true }),
      { layout: 'tablet', density: 'compact', inspector: 'bottom', targets: 'coarse' }],
    ['tablet, landscape', facts({ width: 1180, height: 820, coarse: true }),
      { layout: 'tablet', density: 'full', inspector: 'beside', targets: 'coarse' }],
    ['phone', facts({ width: 390, height: 844, coarse: true }),
      { layout: 'phone', density: 'compact', inspector: 'bottom', targets: 'coarse' }],
    ['phone, landscape', facts({ width: 844, height: 390, coarse: true }),
      { layout: 'phone', density: 'compact', inspector: 'over', targets: 'coarse' }],
  ]
  for (const [name, given, want] of rows) expect(chooseDisplay(given), name).toEqual(want)
})

// The layout on its own, because it is the one rule here that has to give the
// same answer whichever way the window is turned.
it('chooses the layout from the short side and the pointer', () => {
  const rows: [string, ViewportFacts, Layout][] = [
    ['phone, portrait', facts({ width: 390, height: 844, coarse: true }), 'phone'],
    // The case the short side is for: its width alone would make it a desk.
    ['phone, landscape', facts({ width: 844, height: 390, coarse: true }), 'phone'],
    // A window with a phone's room is offered a phone's layout, mouse or not.
    ['tiny desk window', facts({ width: 500, height: 560 }), 'phone'],
    ['short side just under', facts({ width: 1024, height: 599 }), 'phone'],
    ['short side exactly at', facts({ width: 1024, height: 600 }), 'desk'],
    // Narrow enough for compact cards and a bottom panel, and still a desk,
    // because dragging a window narrow does not take its height away.
    ['narrow desk window', facts({ width: 640, height: 900 }), 'desk'],
    ['laptop', facts({ width: 1440, height: 900 }), 'desk'],
    ['tablet, portrait', facts({ width: 820, height: 1180, coarse: true }), 'tablet'],
    ['tablet, landscape', facts({ width: 1180, height: 820, coarse: true }), 'tablet'],
    // A touch monitor cannot hover either. Somebody who wants desk sets it.
    ['touch monitor', facts({ width: 1920, height: 1080, coarse: true }), 'tablet'],
  ]
  for (const [name, given, want] of rows) expect(chooseDisplay(given).layout, name).toBe(want)
})

// The one choice where a wide short window and a tall narrow one of the same
// area want different answers. Without this the rule would just be width.
it('sends the inspector to the bottom on a taller-than-wide window, and over on a short one', () => {
  expect(chooseDisplay(facts({ width: 900, height: 1200 })).inspector).toBe('bottom')
  expect(chooseDisplay(facts({ width: 1000, height: 600 })).inspector).toBe('over')
  // Wide enough and the shape stops mattering.
  expect(chooseDisplay(facts({ width: 1200, height: 1600 })).inspector).toBe('beside')
})

it('lays an override over one setting and leaves the rest automatic', () => {
  const chosen = chooseDisplay(facts({ width: 390, height: 844, coarse: true }))
  expect(applyOverrides(chosen, { density: 'full' }))
    .toEqual({ layout: 'phone', density: 'full', inspector: 'bottom', targets: 'coarse' })
  expect(applyOverrides(chosen, {})).toEqual(chosen)
  // A phone somebody wants to edit on.
  expect(applyOverrides(chosen, { layout: 'tablet' })).toEqual({ ...chosen, layout: 'tablet' })
})

// A fit that shrinks a large board to fit a phone renders a card too small to
// read. Below the floor it shows a corner instead, which is the better half of
// a bad choice.
it('floors the fit where a card would stop being readable', () => {
  // A desk monitor keeps today's behaviour: you can hover to read and scroll to
  // reach, so the whole board is worth more than a legible corner.
  expect(fitFloor(facts(), chooseDisplay(facts()))).toBe(FIT_FLOOR)

  const phone = facts({ width: 390, height: 844, coarse: true })
  expect(fitFloor(phone, chooseDisplay(phone))).toBeCloseTo(150 / COMPACT_CARD_WIDTH)
  // The floor follows the density, which is one of the settings somebody can
  // override, rather than being a fourth setting they have to know about.
  expect(fitFloor(phone, applyOverrides(chooseDisplay(phone), { density: 'full' })))
    .toBeCloseTo(150 / CARD_WIDTH)
})

// A touch screen the size of a desk monitor still cannot hover.
it('floors the fit on a coarse pointer whatever the size', () => {
  const kiosk = facts({ width: 1920, height: 1080, coarse: true })
  expect(fitFloor(kiosk, chooseDisplay(kiosk))).toBeGreaterThan(FIT_FLOOR)
})
