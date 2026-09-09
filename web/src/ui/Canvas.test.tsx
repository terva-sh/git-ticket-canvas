// @vitest-environment jsdom
import { createRef, render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { Canvas, type CanvasHandle, type CanvasProps } from './Canvas'

vi.mock('./canvas/grid', () => ({ drawGrid: vi.fn() }))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('unmount cancels queued frames, capture, resize observers and pointer listeners without saving', () => {
  const frames = new Map<number, FrameRequestCallback>()
  let next = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++next, callback); return next })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id) })
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class { observe() {}; unobserve() {}; disconnect = disconnect })
  const root = document.createElement('div'); document.body.append(root)
  const busy = vi.fn(), save = vi.fn()
  const props: CanvasProps = { board: 'default', tickets: new Map(), cards: {}, statuses: [], selection: new Set(),
    query: '', filters: new Set(), readOnly: false, onSelect: vi.fn(), onLayout: save, onLink: vi.fn(),
    onCompose: vi.fn(), onError: vi.fn(), onBusy: busy }
  const handle = createRef<CanvasHandle>()
  act(() => render(<Canvas {...props} ref={handle} />, root))
  const stage = root.querySelector<HTMLDivElement>('#stage')!
  const scene = root.querySelector<HTMLDivElement>('#scene')!
  const beforeZoom = scene.style.transform
  act(() => {
    stage.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -200, clientX: 60, clientY: 40 }))
    handle.current!.cancel()
  })
  expect(scene.style.transform).not.toBe(beforeZoom)
  let captured = false
  stage.setPointerCapture = () => { captured = true }
  stage.hasPointerCapture = () => captured
  stage.releasePointerCapture = () => { captured = false }
  const pointer = (type: string, id = 1, primary = true) => new PointerEvent(type,
    { bubbles: true, pointerId: id, isPrimary: primary, button: 0, buttons: 1, clientX: 60, clientY: 40 })
  act(() => { stage.dispatchEvent(pointer('pointerdown', 2, false)) })
  expect(busy).not.toHaveBeenCalled()
  act(() => { stage.dispatchEvent(pointer('pointerdown')) })
  expect(captured).toBe(true); expect(busy).toHaveBeenLastCalledWith(true)
  act(() => { stage.dispatchEvent(pointer('pointermove')) })
  expect(frames.size).toBeGreaterThan(0)
  act(() => render(null, root))
  expect(frames.size).toBe(0); expect(captured).toBe(false)
  expect(disconnect).toHaveBeenCalledTimes(1)
  expect(busy.mock.calls).toEqual([[true], [false]])
  stage.dispatchEvent(pointer('pointerdown')); stage.dispatchEvent(pointer('pointerup'))
  expect(busy).toHaveBeenCalledTimes(2); expect(save).not.toHaveBeenCalled()
  root.remove()
})
