// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { ControlMeasurements } from './controlMeasurements'

function elements() {
  const frame = document.createElement('div'), button = document.createElement('button')
  frame.append(button); document.body.append(frame)
  for (const [element, values] of [[frame, { clientLeft: 2, clientTop: 3 }], [button, { offsetLeft: -9, offsetTop: -18, offsetWidth: 26, offsetHeight: 30 }]] as const) {
    for (const [key, value] of Object.entries(values)) Object.defineProperty(element, key, { configurable: true, value })
  }
  Object.defineProperty(button, 'offsetParent', { configurable: true, value: frame })
  return { frame, button }
}
describe('ordinary frame control registrations', () => {
  it('includes parent borders and external portions without transformed client bounds', () => {
    const { frame, button } = elements(), registry = new ControlMeasurements()
    registry.register('resize:f', button, frame, () => ({ x: 100, y: 200 }))
    expect(registry.sample()[0]!.rect).toEqual({ x: 93, y: 185, w: 26, h: 30 })
    frame.style.transform = 'translate(100px, 200px) scale(3)'
    expect(registry.sample()[0]!.rect).toEqual({ x: 93, y: 185, w: 26, h: 30 })
    frame.remove()
    expect(registry.sample()[0]!.connected).toBe(false)
  })
  it('fences replacement cleanup and rejects wrong offset owners', () => {
    const { frame, button } = elements(), registry = new ControlMeasurements()
    const old = registry.register('title:f', button, frame, () => ({ x: 0, y: 0 }))
    registry.register('title:f', button, frame, () => ({ x: 50, y: 50 }))
    const owner = registry.sample()[0]!.owner
    old()
    expect(registry.sample()[0]!.owner).toBe(owner)
    Object.defineProperty(button, 'offsetParent', { value: document.body })
    expect(registry.sample()[0]!.connected).toBe(false)
    registry.clear()
    expect(registry.sample()).toEqual([])
    frame.remove()
  })
})
