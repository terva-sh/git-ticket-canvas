// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DisplayDialog } from './DisplayDialog'
import { useDisplay } from './useDisplay'
import { recall, remember } from './displayPreferences'
import { Toolbar, type ToolbarProps } from './Toolbar'

let root: HTMLDivElement
beforeEach(() => {
  localStorage.clear()
  root = document.createElement('div'); document.body.append(root)
})
afterEach(() => { act(() => render(null, root)); root.remove(); vi.restoreAllMocks() })

function sizeWindow(width: number, height: number, coarse = false) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
  window.matchMedia = ((query: string) => ({
    matches: coarse && query.includes('coarse'), media: query,
    addEventListener() {}, removeEventListener() {},
  })) as unknown as typeof window.matchMedia
}

/** The dialog over a live useDisplay, so a press goes all the way to storage
 * and back rather than through a stub that cannot disagree with it. */
function Harness() {
  const display = useDisplay()
  return <DisplayDialog display={display} onClose={() => {}} />
}
function show() { act(() => render(<Harness />, root)) }
function control(setting: string) {
  return root.querySelector<HTMLSelectElement>(`#display-${setting}`)!
}
function choose(setting: string, value: string) {
  const select = control(setting)
  select.value = value
  act(() => { select.dispatchEvent(new Event('change', { bubbles: true })) })
}

// The criterion this dialog exists for: what was chosen automatically has to be
// visible, or somebody who dislikes it has nothing to look for.
it('names what the window is and what was chosen from it', () => {
  sizeWindow(390, 844, true)
  show()
  expect(root.querySelector('.display-facts')!.textContent).toContain('390 × 844')
  expect(root.querySelector('.display-facts')!.textContent).toContain('touch')
  expect(control('density').querySelector('option')!.textContent).toBe('Automatic — Compact')
  expect(control('inspector').querySelector('option')!.textContent).toBe('Automatic — Along the bottom')
  expect(control('targets').querySelector('option')!.textContent).toBe('Automatic — Sized for a finger')
  expect(control('layout').querySelector('option')!.textContent).toBe('Automatic — Phone')
})

// Turning a phone must not make it a desk, and the panel is where somebody
// would go to check.
it('calls a landscape phone a phone and a touch screen a tablet', () => {
  sizeWindow(844, 390, true)
  show()
  expect(control('layout').querySelector('option')!.textContent).toBe('Automatic — Phone')
  act(() => render(null, root))
  sizeWindow(1180, 820, true)
  show()
  expect(control('layout').querySelector('option')!.textContent).toBe('Automatic — Tablet')
})

// The layout is a fourth row of the same kind as the other three, not a
// section of its own like the toolbar size.
it('lists the layout first among the automatic settings', () => {
  sizeWindow(1440, 900)
  show()
  expect([...root.querySelectorAll<HTMLElement>('.display-choice')].map(row => row.dataset.setting))
    .toEqual(['layout', 'density', 'inspector', 'targets'])
})

it('takes a layout override and still has it after a reload', () => {
  sizeWindow(390, 844, true)
  show()
  choose('layout', 'tablet')
  expect(recall()).toEqual({ layout: 'tablet' })
  act(() => render(null, root))
  show()
  expect(control('layout').value).toBe('tablet')
  expect(control('layout').querySelector('option')!.textContent).toBe('Automatic — Phone')
})

it('says what a desk monitor was given', () => {
  sizeWindow(2560, 1440)
  show()
  expect(control('layout').querySelector('option')!.textContent).toBe('Automatic — Desk')
  expect(control('density').querySelector('option')!.textContent).toBe('Automatic — Full')
  expect(control('inspector').querySelector('option')!.textContent).toBe('Automatic — Beside the board')
  expect(control('targets').querySelector('option')!.textContent).toBe('Automatic — Sized for a mouse')
})

it('takes an override and writes it to this browser only', () => {
  sizeWindow(390, 844, true)
  show()
  choose('density', 'full')
  expect(control('density').value).toBe('full')
  expect(recall()).toEqual({ density: 'full' })
  // And the others stay automatic rather than being frozen at today's answer.
  expect(recall().inspector).toBeUndefined()
})

it('hands a setting back to the window', () => {
  sizeWindow(390, 844, true)
  show()
  choose('density', 'full')
  choose('density', '')
  expect(recall()).toEqual({})
  expect(control('density').value).toBe('')
})

it('puts everything back at once, and says how much is set by hand', () => {
  sizeWindow(390, 844, true)
  show()
  const reset = () => root.querySelector<HTMLButtonElement>('#displayReset')!
  expect(reset().disabled).toBe(true)
  expect(reset().textContent).toBe('All automatic')
  choose('density', 'full')
  choose('inspector', 'over')
  expect(reset().textContent).toContain('2 set by hand')
  act(() => reset().click())
  expect(recall()).toEqual({})
  expect(reset().disabled).toBe(true)
})

// A desk canvas has no session and therefore no account dialog, and needs this
// just as much as a served one, so the control that opens it is unconditional.
it('the toolbar offers the display panel with or without a session', () => {
  const props: ToolbarProps = {
    storePath: '/ws/one/.tickets', readOnly: false, boards: ['default'], board: 'default', query: '',
    config: null, filters: new Set<string>(), counts: '0 of 0',
    onQuery: () => {}, onFilter: () => {}, onBoard: () => {}, onNewBoard: () => {},
    onArrange: () => {}, onFit: () => {}, onNew: () => {}, onDisplay: () => {},
  }
  act(() => render(<Toolbar {...props} />, root))
  expect(root.querySelector('#btnDisplay')).not.toBeNull()
  expect(root.querySelector('#btnAccount')).toBeNull()
})

// Two controls for density, one preference. The toolbar is where you change it
// while reading a board; the panel is where you go to understand it.
it('lets the toolbar density control say automatic too', () => {
  const chosen: (string | null)[] = []
  const props: ToolbarProps = {
    storePath: '/ws/one/.tickets', readOnly: false, boards: ['default'], board: 'default', query: '',
    config: null, filters: new Set<string>(), counts: '0 of 0',
    onQuery: () => {}, onFilter: () => {}, onBoard: () => {}, onNewBoard: () => {},
    onArrange: () => {}, onFit: () => {}, onNew: () => {},
    density: 'compact', densityAutomatic: 'compact', densityChosen: false,
    onDensity: value => chosen.push(value),
  }
  act(() => render(<Toolbar {...props} />, root))
  const select = root.querySelector<HTMLSelectElement>('#cardDensity')!
  expect(select.value).toBe('')
  expect(select.querySelector('option')!.textContent).toBe('Automatic — Compact')
  select.value = 'full'
  act(() => { select.dispatchEvent(new Event('change', { bubbles: true })) })
  select.value = ''
  act(() => { select.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(chosen).toEqual(['full', null])
})

// The toolbar size is a different kind of setting from the three above: nothing
// about a window suggests an answer, so it has a default rather than an
// automatic choice, and the panel has to say so rather than offering an
// `Automatic` that means `whatever we picked`.
it('offers the toolbar its current size and two larger ones, with no automatic', () => {
  sizeWindow(1440, 900)
  show()
  const sizes = [...root.querySelectorAll<HTMLButtonElement>('.display-scale button')]
  expect(sizes.map(button => button.textContent)).toEqual(['Standard', 'Large', 'Larger'])
  expect(sizes.map(button => button.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])
  expect(root.querySelector('.display-scale option')).toBeNull()
  // Nothing written until somebody chooses, and the default leaves no record.
  expect(recall().toolbar).toBeUndefined()
})

it('remembers a larger toolbar, and leaves nothing behind on the way back', () => {
  sizeWindow(1440, 900)
  show()
  const size = (name: string) => root.querySelector<HTMLButtonElement>(`#display-toolbar-${name}`)!
  act(() => size('larger').click())
  expect(recall().toolbar).toBe('larger')
  expect(size('larger').getAttribute('aria-pressed')).toBe('true')
  act(() => size('standard').click())
  expect(recall().toolbar).toBeUndefined()
  expect(localStorage.getItem('git-ticket-canvas.display')).toBeNull()
})

// `Use automatic for all` is about the settings the window chose. A toolbar
// size is not one of them, so there is nothing to hand back to it.
it('does not count or clear the toolbar size with the automatic settings', () => {
  sizeWindow(1440, 900)
  show()
  act(() => root.querySelector<HTMLButtonElement>('#display-toolbar-large')!.click())
  const reset = () => root.querySelector<HTMLButtonElement>('#displayReset')!
  expect(reset().disabled).toBe(true)
  expect(reset().textContent).toBe('All automatic')
  choose('density', 'compact')
  expect(reset().textContent).toContain('1 set by hand')
  act(() => reset().click())
  expect(recall()).toEqual({ toolbar: 'large' })
})

// A closed tip lives in the same record and is not a display choice either.
// Counting it would make the reset button offer to undo something nobody set
// in this panel, and clearing it would bring the tip back.
it('does not count or clear a closed phone tip with the automatic settings', () => {
  remember({ tipClosed: true })
  sizeWindow(390, 844, true)
  show()
  const reset = () => root.querySelector<HTMLButtonElement>('#displayReset')!
  expect(reset().disabled).toBe(true)
  choose('density', 'full')
  expect(reset().textContent).toContain('1 set by hand')
  act(() => reset().click())
  expect(recall()).toEqual({ tipClosed: true })
})
