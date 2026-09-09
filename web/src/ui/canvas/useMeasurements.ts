import type { RefObject } from 'preact'
import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks'

/** One observer measures border-box card heights in scene units, never zoomed client bounds. */
export function useMeasurements(stage: RefObject<HTMLDivElement>) {
  const elements = useRef(new Map<string, HTMLDivElement>())
  const heights = useRef(new Map<string, number>())
  const observer = useRef<ResizeObserver | null>(null)
  const frame = useRef<number | null>(null)
  const mounted = useRef(false)
  const [revision, setRevision] = useState(0)
  const schedule = useCallback(() => {
    if (!mounted.current || frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      if (mounted.current) setRevision(n => n + 1)
    })
  }, [])
  const register = useCallback((id: string, element: HTMLDivElement | null) => {
    const previous = elements.current.get(id)
    if (previous) observer.current?.unobserve(previous)
    if (element) {
      elements.current.set(id, element)
      heights.current.set(id, element.offsetHeight)
      observer.current?.observe(element)
    } else {
      elements.current.delete(id)
      heights.current.delete(id)
    }
    schedule()
  }, [schedule])

  useLayoutEffect(() => {
    mounted.current = true
    const measure = () => {
      for (const [id, element] of elements.current) heights.current.set(id, element.offsetHeight)
      schedule()
    }
    if (typeof ResizeObserver !== 'undefined') {
      observer.current = new ResizeObserver(measure)
      if (stage.current) observer.current.observe(stage.current)
      for (const element of elements.current.values()) observer.current.observe(element)
    }
    // Also redraw for viewport / device-pixel-ratio changes when CSS size stays fixed.
    window.addEventListener('resize', measure)
    measure()
    return () => {
      mounted.current = false
      observer.current?.disconnect()
      observer.current = null
      window.removeEventListener('resize', measure)
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }, [stage, schedule])

  return { heights: heights.current, elements: elements.current, register, revision }
}
