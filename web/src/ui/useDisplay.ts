import { useEffect, useState } from 'preact/hooks'
import { applyOverrides, chooseDisplay, fitFloor } from '../platform/canvas/viewport'
import type { DisplayChoices, DisplayOverrides, ViewportFacts } from '../platform/canvas/viewport'
import { recall, remember } from './displayPreferences'

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
  overrides: DisplayOverrides
  /** What is actually in force. */
  settings: DisplayChoices
  /** How far the opening fit may shrink the board. */
  floor: number
  /** Set one setting, or hand it back to the viewport with null. */
  choose<K extends keyof DisplayChoices>(key: K, value: DisplayChoices[K] | null): void
  /** Hand every setting back to the viewport. */
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
  const [overrides, setOverrides] = useState<DisplayOverrides>(recall)

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

  const automatic = chooseDisplay(facts)
  const settings = applyOverrides(automatic, overrides)
  const write = (next: DisplayOverrides) => { remember(next); setOverrides(next) }
  return {
    facts, automatic, overrides, settings,
    floor: fitFloor(facts, settings),
    choose(key, value) {
      const next = { ...overrides }
      if (value === null) delete next[key]
      else next[key] = value
      write(next)
    },
    reset() { write({}) },
  }
}
