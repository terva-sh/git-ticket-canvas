// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { expect, it } from 'vitest'
import { SampledFrame } from './SampledFrame'
import { ControlMeasurements } from './controlMeasurements'

it('keeps title and resize registration owners across filter/selection changes and removes read-only handle', () => {
  const root = document.createElement('div'); document.body.append(root)
  const controls = new ControlMeasurements(), changed = () => {}
  const frame = { title: 'Wrapped frame title', x: 10, y: 20, w: 100, h: 200, color: 'blue', members: ['a', 'b'] }
  const show = (dimmed: number, selected = false, readOnly = false) => act(() => render(<SampledFrame id="f" frame={frame}
    dimmed={dimmed} selected={selected} readOnly={readOnly} controls={controls} changed={changed} />, root))
  show(0)
  const first = controls.sample()
  expect(first.map(item => item.id)).toEqual(['title:f', 'resize:f'])
  expect(root.querySelector('.sampling-frame-count')?.textContent).toBe('0 filtered')
  expect(root.querySelector('[aria-hidden="true"]')?.textContent).toBe('2 filtered')
  show(2, true)
  expect(controls.sample().map(item => item.owner)).toEqual(first.map(item => item.owner))
  expect(root.querySelector('.sampling-frame-count')?.textContent).toBe('2 filtered')
  show(1, false, true)
  expect(controls.sample().map(item => item.id)).toEqual(['title:f'])
  expect(controls.sample()[0]!.owner).toBe(first[0]!.owner)
  act(() => render(null, root)); expect(controls.sample()).toEqual([]); root.remove()
})
