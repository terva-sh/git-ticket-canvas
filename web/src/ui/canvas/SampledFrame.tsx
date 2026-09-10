import { useLayoutEffect, useRef } from 'preact/hooks'
import type { Frame } from '../../platform/tickets/types'
import type { ControlMeasurements } from './controlMeasurements'

/** Only the injected sampling path uses these count-stable controls. */
export function SampledFrame({ id, frame, dimmed, selected, readOnly, busy, controls, changed, onSelect }: {
  id: string; frame: Frame; dimmed: number; selected: boolean; readOnly: boolean; busy?: boolean
  controls: ControlMeasurements; changed: () => void; onSelect?: (id: string) => void
}) {
  const parent = useRef<HTMLDivElement>(null), title = useRef<HTMLButtonElement>(null), resize = useRef<HTMLButtonElement>(null)
  const latest = useRef(frame); latest.current = frame
  useLayoutEffect(() => {
    const element = title.current!, owner = parent.current!
    const cleanup = controls.register(`title:${id}`, element, owner, () => latest.current)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(changed)
    observer?.observe(element, { box: 'border-box' })
    // Parent border changes can move controls without resizing their boxes.
    // Observe its content box as well as the control's border box.
    observer?.observe(owner)
    return () => { observer?.disconnect(); cleanup() }
  }, [id, controls, changed])
  useLayoutEffect(() => {
    if (readOnly) return
    const element = resize.current!, owner = parent.current!
    const cleanup = controls.register(`resize:${id}`, element, owner, () => latest.current)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(changed)
    observer?.observe(element, { box: 'border-box' })
    return () => { observer?.disconnect(); cleanup() }
  }, [id, controls, readOnly, changed])
  return <div ref={parent} class={`canvas-frame ${selected ? 'selected' : ''}`} data-frame-id={id}
    style={{ transform: `translate(${frame.x}px, ${frame.y}px)`, width: `${frame.w}px`, height: `${frame.h}px`, '--frame-color': frame.color }}>
    <button ref={title} class="canvas-frame-title sampling-frame-title" data-frame-id={id} data-frame-gesture="move" onClick={() => onSelect?.(id)}>
      <span>{frame.title} · {frame.members.length} members</span>
      <span class="sampling-frame-count-slot"><span aria-hidden="true">{frame.members.length} filtered</span>
        <span class="sampling-frame-count">{dimmed} filtered</span></span>
    </button>
    {!readOnly && <button ref={resize} class="canvas-frame-resize" data-frame-id={id} data-frame-gesture="resize"
      disabled={busy} aria-label={`Resize ${frame.title} boundary only`} onClick={() => onSelect?.(id)}>↘</button>}
  </div>
}
