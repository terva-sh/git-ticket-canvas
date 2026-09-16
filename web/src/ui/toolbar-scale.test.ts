import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

/**
 * The toolbar sizes are hand-picked numbers in a stylesheet, and the rule they
 * have to obey is not visible from any one of them: turning the toolbar up on a
 * tablet must never make a target smaller than leaving it alone would. Nothing
 * else notices if somebody later lowers one.
 */
const sheet = readFileSync('web/index.html', 'utf8')

function variables(selector: string): Record<string, number> {
  const start = sheet.indexOf(selector)
  expect(start, `${selector} is not in the stylesheet`).toBeGreaterThan(-1)
  const block = sheet.slice(start, sheet.indexOf('}', start))
  const found: Record<string, number> = {}
  for (const [, name, value] of block.matchAll(/(--[a-z-]+):\s*(\d+)px/g)) found[name] = Number(value)
  return found
}

it('never sizes a toolbar control below what a coarse pointer already gets', () => {
  const coarse = variables('html[data-targets="coarse"] {')
  expect(Object.keys(coarse).sort()).toEqual(['--chip-x', '--chip-y', '--tool-x', '--tool-y'])
  for (const selector of ['html[data-toolbar="large"] #toolbar {', 'html[data-toolbar="larger"] #toolbar {']) {
    const scaled = variables(selector)
    for (const [name, floor] of Object.entries(coarse)) {
      expect(scaled[name], `${selector} ${name}`).toBeGreaterThanOrEqual(floor)
    }
  }
})

it('makes each size larger than the one before it', () => {
  const large = variables('html[data-toolbar="large"] #toolbar {')
  const larger = variables('html[data-toolbar="larger"] #toolbar {')
  for (const name of Object.keys(large)) {
    expect(larger[name], name).toBeGreaterThan(large[name])
  }
})

// The whole point is changing the header bar without changing the board, which
// is what zooming the browser cannot do. Every rule is scoped to `#toolbar`.
it('scopes every toolbar size rule to the header bar', () => {
  for (const [, selector] of sheet.matchAll(/^(html\[data-toolbar=[^{]*)\{/gm)) {
    expect(selector, selector).toContain('#toolbar')
  }
})
