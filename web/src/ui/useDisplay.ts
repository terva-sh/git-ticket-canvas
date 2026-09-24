import { useEffect, useState } from 'preact/hooks'
import { applyOverrides, chooseDisplay, DEFAULT_TOOLBAR_SCALE, fitFloor } from '../platform/canvas/viewport'
import type { DisplayChoices, DisplayOverrides, ToolbarScale, ViewportFacts } from '../platform/canvas/viewport'
import { recall, remember } from './displayPreferences'
import type { StoredDisplay } from './displayPreferences'

/** A viewport nothing has measured yet. Server rendering and a test that never
 * touches a window both land here, and both want the settings a desk monitor
 * gets rather than a phone's. */
const ASSUMED: ViewportFacts = { width: 1440, height: 900, coarse: false }

function measure(): ViewportFacts {
  if (typeof window === 'undefined') return ASSUMED
  let coarse = false
  try {
    coarse = !!window.matchMedia?.('(pointer: coarse)').matches
  } catch {
    // A browser without matchMedia is a browser with a mouse.
  }
  return { width: window.innerWidth || ASSUMED.width, height: window.innerHeight || ASSUMED.height, coarse }
}

export interface Display {
  facts: ViewportFacts
  /** What the viewport asked for, before anybody disagreed. Shown beside each
   * control so the choice is legible rather than mysterious. */
  automatic: DisplayChoices
  /** Only the settings the window chose and somebody disagreed with. */
  overrides: DisplayOverrides
  /** What is actually in force. */
  settings: DisplayChoices
  /** How big the header bar is. A preference with a default rather than one of
   * the automatic choices, because nothing about a window suggests an answer. */
  toolbar: ToolbarScale
  /** Whether the phone's first-visit tip has been closed. Not a display
   * choice, but remembered with them so it does not come back. */
  tipClosed: boolean
  /** How far the opening fit may shrink the board. */
  floor: number
  /** Set one setting, or hand it back to the viewport with null. */
  choose<K extends keyof DisplayChoices>(key: K, value: DisplayChoices[K] | null): void
  chooseToolbar(scale: ToolbarScale): void
  closeTip(): void
  /** Hand every automatic setting back to the viewport. The toolbar size is
   * not one of them and is left alone, and neither is a closed tip. */
  reset(): void
}

/**
 * The display settings in force: chosen from the window, overridden by whoever
 * disagreed, and recomputed when the window changes shape.
 *
 * The measurement lives here rather than in `platform/canvas/viewport.ts`
 * because it needs a DOM and that file may not have one. The rules live there
 * because they are worth reading without one.
 */
export function useDisplay(): Display {
  const [facts, setFacts] = useState<ViewportFacts>(measure)
  const [stored, setStored] = useState<StoredDisplay>(recall)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Rotating a tablet changes the aspect ratio without changing the area, and
    // that is exactly the case the inspector placement turns on.
    const remeasure = () => setFacts(current => {
      const next = measure()
      return next.width === current.width && next.height === current.height && next.coarse === current.coarse
        ? current : next
    })
    window.addEventListener('resize', remeasure)
    let pointer: MediaQueryList | undefined
    try { pointer = window.matchMedia?.('(pointer: coarse)') } catch { pointer = undefined }
    pointer?.addEventListener?.('change', remeasure)
    return () => {
      window.removeEventListener('resize', remeasure)
      pointer?.removeEventListener?.('change', remeasure)
    }
  }, [])

  const { toolbar, tipClosed, ...overrides } = stored
  const automatic = chooseDisplay(facts)
  const settings = applyOverrides(automatic, overrides)
  const write = (next: StoredDisplay) => { remember(next); setStored(next) }
  return {
    facts, automatic, overrides, settings,
    toolbar: toolbar ?? DEFAULT_TOOLBAR_SCALE,
    tipClosed: !!tipClosed,
    floor: fitFloor(facts, settings),
    choose(key, value) {
      const next = { ...stored }
      if (value === null) delete next[key]
      else next[key] = value
      write(next)
    },
    chooseToolbar(scale) {
      const next = { ...stored }
      // The default is the absence of a record, so somebody who tries a larger
      // toolbar and goes back leaves nothing behind.
      if (scale === DEFAULT_TOOLBAR_SCALE) delete next.toolbar
      else next.toolbar = scale
      write(next)
    },
    closeTip() { if (!tipClosed) write({ ...stored, tipClosed: true }) },
    // Only the automatic choices. A toolbar size is not something the window
    // asked for, so there is nothing to hand back to it, and asking for the
    // automatic settings is not asking to see the tip again.
    reset() { write({ ...(toolbar ? { toolbar } : {}), ...(tipClosed ? { tipClosed } : {}) }) },
  }
}
