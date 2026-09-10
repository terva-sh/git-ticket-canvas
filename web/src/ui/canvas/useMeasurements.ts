import type { RefObject } from 'preact'
import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks'

export interface MeasurementSnapshot {
  readonly revision: number
  readonly heights: ReadonlyMap<string, number>
  /** Element-registration lifetimes, not ticket incarnations or board baselines. */
  readonly registrations: ReadonlyMap<string, symbol>
}
interface Registration { id: string; element: HTMLDivElement; owner: symbol; incarnation?: symbol }

// Frozen facades prevent mutation, including through forEach's third argument.
// Snapshots wrap copies; imperative consumers wrap the live maps instead.
function view<K, V>(data: Map<K, V>): ReadonlyMap<K, V> {
  const result: ReadonlyMap<K, V> = {
    get size() { return data.size }, get: key => data.get(key), has: key => data.has(key),
    entries: () => data.entries(), keys: () => data.keys(), values: () => data.values(),
    [Symbol.iterator]: () => data[Symbol.iterator](),
    forEach(callback, thisArg) { data.forEach((value, key) => callback.call(thisArg, value, key, result)) },
  }
  return Object.freeze(result)
}
function same<K, V>(a: ReadonlyMap<K, V>, b: ReadonlyMap<K, V>): boolean {
  return a.size === b.size && [...a].every(([key, value]) => b.has(key) && b.get(key) === value)
}

/** One observer reads current border-box heights in scene units, never zoomed bounds.
 * Size publications and viewport redraws share a RAF, not a revision. Rendering
 * reads cached data only; current fit/focus/capture consumers retain live views.
 */
export function useMeasurements(stage: RefObject<HTMLDivElement>) {
  const [data] = useState(() => {
    const elements = new Map<string, HTMLDivElement>(), heights = new Map<string, number>()
    return { elements, heights, elementView: view(elements), heightView: view(heights),
      registrations: new Map<string, Registration>(), targets: new WeakMap<Element, Registration>() }
  })
  const observer = useRef<ResizeObserver | null>(null)
  const frame = useRef<number | null>(null)
  const mounted = useRef(false), disposed = useRef(false), viewportDirty = useRef(false)
  const [state, setState] = useState(() => ({ viewportRevision: 0,
    sizes: Object.freeze<MeasurementSnapshot>({ revision: 0, heights: view(new Map<string, number>()), registrations: view(new Map<string, symbol>()) }) }))
  const published = useRef(state)

  const schedule = useCallback(() => {
    if (!mounted.current || frame.current !== null) return
    const request = requestAnimationFrame(() => {
      if (!mounted.current || frame.current !== request) return
      frame.current = null
      const previous = published.current
      const owners = new Map([...data.registrations].map(([id, registration]) => [id, registration.owner]))
      const changed = !same(previous.sizes.heights, data.heights) || !same(previous.sizes.registrations, owners)
      const viewport = viewportDirty.current
      viewportDirty.current = false
      if (!changed && !viewport) return
      const sizes = changed ? Object.freeze<MeasurementSnapshot>({ revision: previous.sizes.revision + 1,
        heights: view(new Map(data.heights)), registrations: view(owners) }) : previous.sizes
      const next = { sizes, viewportRevision: previous.viewportRevision + Number(viewport) }
      published.current = next
      setState(next)
    })
    frame.current = request
  }, [data])
  const measure = useCallback((registration: Registration) => {
    if (data.registrations.get(registration.id) !== registration) return
    const height = registration.element.offsetHeight
    const next = Number.isFinite(height) && height > 0 ? height : undefined
    if (data.heights.get(registration.id) === next) return
    if (next === undefined) data.heights.delete(registration.id)
    else data.heights.set(registration.id, next)
    schedule()
  }, [data, schedule])
  // Call only after commit. Equal values still come from a fresh DOM read.
  const sample = useCallback(<T,>(token: T) => {
    if (!mounted.current || disposed.current) return null
    for (const registration of data.registrations.values()) measure(registration)
    return Object.freeze({ token, heights: view(new Map(data.heights)),
      registrations: view(new Map([...data.registrations].map(([id, registration]) => [id, registration.owner]))) })
  }, [data, measure])
  const sampleCards = useCallback(() => {
    if (!mounted.current || disposed.current) return null
    return [...data.registrations.values()].map(registration => ({
      id: registration.id, incarnation: registration.incarnation, owner: registration.owner,
      height: registration.element.offsetHeight, connected: registration.element.isConnected,
    }))
  }, [data])
  const register = useCallback((id: string, element: HTMLDivElement, incarnation?: symbol): (() => void) => {
    if (disposed.current) return () => {}
    const previous = data.registrations.get(id)
    if (previous) { observer.current?.unobserve(previous.element); data.targets.delete(previous.element) }
    const registration: Registration = { id, element, owner: Symbol(id), incarnation }
    data.registrations.set(id, registration); data.targets.set(element, registration); data.elements.set(id, element)
    measure(registration)
    observer.current?.observe(element, { box: 'border-box' })
    schedule()
    return () => {
      if (disposed.current || data.registrations.get(id) !== registration) return
      observer.current?.unobserve(element)
      data.targets.delete(element); data.registrations.delete(id); data.elements.delete(id); data.heights.delete(id)
      schedule()
    }
  }, [data, measure, schedule])

  useLayoutEffect(() => {
    mounted.current = true; disposed.current = false
    let active = true
    const viewport = () => {
      if (!active) return
      // Window/stage changes may also change wrapping and therefore card heights.
      for (const registration of data.registrations.values()) measure(registration)
      viewportDirty.current = true
      schedule()
    }
    const stageElement = stage.current
    if (typeof ResizeObserver !== 'undefined') {
      observer.current = new ResizeObserver(entries => {
        if (!active) return
        if (entries.some(entry => entry.target === stageElement)) { viewport(); return }
        for (const entry of entries) {
          const registration = data.targets.get(entry.target)
          // A queued old-element entry cannot measure its replacement. For a
          // reused element, read today's height, never the queued entry's size.
          if (registration) measure(registration)
        }
      })
      if (stageElement) observer.current.observe(stageElement, { box: 'border-box' })
      for (const element of data.elements.values()) observer.current.observe(element, { box: 'border-box' })
    }
    window.addEventListener('resize', viewport)
    viewport()
    return () => {
      active = false; mounted.current = false; disposed.current = true
      observer.current?.disconnect(); observer.current = null
      window.removeEventListener('resize', viewport)
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null; viewportDirty.current = false
      for (const element of data.elements.values()) data.targets.delete(element)
      data.registrations.clear(); data.elements.clear(); data.heights.clear()
    }
  }, [stage, data, measure, schedule])

  return { heights: data.heightView, elements: data.elementView, register, sample, sampleCards, sizes: state.sizes, viewportRevision: state.viewportRevision }
}
