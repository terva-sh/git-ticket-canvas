import { cardWidthFor, FIT_FLOOR } from './geometry'
import type { Density } from './geometry'

/**
 * What the canvas chooses from the shape of the window, and how.
 *
 * Pure, and in platform, so the rules can be read and tested as a table
 * rather than through a browser. `matchMedia`, `innerWidth` and the resize
 * listener live in the UI layer, which is the only part that needs a DOM.
 */

/** Everything the choices are made from. Nothing else is consulted. */
export interface ViewportFacts {
  width: number
  height: number
  /** A finger or a stylus rather than a mouse. */
  coarse: boolean
}

/** Where the inspector sits relative to the board. */
export type InspectorPlacement = 'beside' | 'bottom' | 'over'

/** How big the things you have to hit are. */
export type TargetSize = 'fine' | 'coarse'

/**
 * How big the header bar is.
 *
 * Not part of `DisplayChoices`, because nothing about a window suggests an
 * answer. Physical screen size is not observable: CSS pixels already account
 * for device pixel ratio, so a 27-inch 4K monitor and a 24-inch 1440p one
 * report the same width. This is a preference with a default rather than an
 * automatic choice, and it is presented that way rather than offering an
 * `Automatic` that means `whatever we picked`.
 */
export type ToolbarScale = 'standard' | 'large' | 'larger'

export const TOOLBAR_SCALES: readonly ToolbarScale[] = ['standard', 'large', 'larger']
export const DEFAULT_TOOLBAR_SCALE: ToolbarScale = 'standard'

/**
 * What kind of device the canvas is laid out for.
 *
 * It decides what is offered rather than how big anything is: the other three
 * choices already size a phone's cards, panel and targets on their own rules.
 * Nothing reads it yet beyond the Display panel and the `data-layout` attribute
 * on the document; later work keys on it.
 */
export type Layout = 'phone' | 'tablet' | 'desk'

export const LAYOUTS: readonly Layout[] = ['phone', 'tablet', 'desk']

export interface DisplayChoices {
  layout: Layout
  density: Density
  inspector: InspectorPlacement
  targets: TargetSize
}

/** An override is per setting, so somebody who disagrees about one keeps the
 * automatic answer for the others, and a later change to these rules still
 * reaches them. */
export type DisplayOverrides = Partial<DisplayChoices>

/** Below this the card head and the identity rows cost more than they tell. */
const COMPACT_BELOW = 900

/** A 360px panel beside the board needs a board left over to sit beside. */
const INSPECTOR_BESIDE_FROM = 1120

/** The narrowest a card can render and still be read rather than recognised. */
const LEGIBLE_CARD = 150

/**
 * A window whose short side is under this is a phone.
 *
 * The short side rather than the width, because turning a phone does not make
 * it a desk. A phone held landscape is about 844×390: its width is past the
 * compact threshold, and a rule on width would hand it the desk layout the
 * moment somebody rotated it. The short side stays 390 either way. A desktop
 * window dragged narrow keeps its height, so its short side is usually well
 * over this and it stays a desk; one squeezed under 600 in both directions has
 * a phone's room and is offered a phone's layout.
 */
const PHONE_BELOW = 600

/** Phone on the short side alone, whatever the pointer, since a phone is too
 * small for the desk layout with a mouse or without. Tablet on a coarse
 * pointer that is not a phone, since a finger cannot hover or drag precisely
 * however large the screen. Desk for everything else. */
function chooseLayout(facts: ViewportFacts): Layout {
  if (Math.min(facts.width, facts.height) < PHONE_BELOW) return 'phone'
  return facts.coarse ? 'tablet' : 'desk'
}

/**
 * The settings this viewport asks for.
 *
 * Aspect ratio earns its place on the inspector alone. A wide short window and
 * a tall narrow one of the same area want different answers there and the same
 * answer everywhere else: a side panel on a portrait screen leaves a sliver of
 * board, while the same panel on a landscape screen leaves a board. The layout
 * is deliberately the opposite, the same in both orientations.
 */
export function chooseDisplay(facts: ViewportFacts): DisplayChoices {
  return {
    layout: chooseLayout(facts),
    density: facts.width < COMPACT_BELOW ? 'compact' : 'full',
    inspector: facts.width >= INSPECTOR_BESIDE_FROM ? 'beside'
      : facts.height > facts.width ? 'bottom'
      : 'over',
    targets: facts.coarse ? 'coarse' : 'fine',
  }
}

/** The automatic choices with anybody's overrides laid over them. */
export function applyOverrides(chosen: DisplayChoices, overrides: DisplayOverrides): DisplayChoices {
  return { ...chosen, ...overrides }
}

/**
 * How far the opening fit may shrink the board.
 *
 * `fitView` otherwise bottoms out at `FIT_FLOOR`, which on a small screen
 * renders a card forty pixels wide: a picture of a board rather than a board.
 * Below this the fit stops shrinking and shows a corner instead, which is the
 * better half of a bad choice when there is no room for the whole thing.
 *
 * Derived from the two settings that are already overridable rather than being
 * a fourth setting of its own. It applies only where the viewport is small or
 * the pointer is coarse: on a wide mouse-driven screen you can hover to read a
 * card and scroll to reach one, so the whole board is worth more than a legible
 * corner of it.
 */
export function fitFloor(facts: ViewportFacts, choices: DisplayChoices): number {
  if (!facts.coarse && facts.width >= COMPACT_BELOW) return FIT_FLOOR
  return Math.max(FIT_FLOOR, LEGIBLE_CARD / cardWidthFor(choices.density))
}
