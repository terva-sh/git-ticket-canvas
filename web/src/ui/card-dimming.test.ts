import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

/**
 * Filtering a card out is two halves that meet nowhere in the code: `Canvas`
 * puts a `dimmed` class on it, and the stylesheet decides what that looks like.
 * Nothing type-checks across that seam, so when another rule set `opacity` on a
 * card at the same specificity and happened to sit lower in the file, a
 * filtered-out card that was done, archived or blocked kept its own opacity and
 * stayed on the board. Every test passed, because the class was still there.
 *
 * The browser test in `tests/browser/label-filters.spec.ts` asks a real browser
 * what it painted, which is the honest check. This one is here because it needs
 * no browser and cannot be flaky: it reads the cascade the same way the browser
 * resolves it, and fails on the ordering itself rather than on a consequence.
 */
// Comments are stripped rather than skipped. A comment sits between a rule and
// the one before it, and a selector pattern that tolerates newlines will happily
// swallow one and take the first selector after it with it.
const sheet = readFileSync('web/index.html', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

interface Rule { selector: string; order: number; opacity: number }

/** Every rule that sets opacity on a card, in source order. */
function opacityRules(): Rule[] {
  const found: Rule[] = []
  for (const match of sheet.matchAll(/^([^{}@\n][^{}]*)\{([^}]*)\}/gm)) {
    const [, selectors, body] = match
    const opacity = body.match(/(?:^|;)\s*opacity:\s*([\d.]+)/)
    if (!opacity) continue
    for (const selector of selectors.split(',').map(s => s.trim())) {
      // The card itself, not something inside it: no descendant or sibling
      // combinator, so `.card:hover .handle` is somebody else's opacity.
      if (/^\.card[.:a-z-]*$/.test(selector)) {
        found.push({ selector, order: match.index!, opacity: Number(opacity[1]) })
      }
    }
  }
  return found
}

/** Classes and pseudo-classes both count in the same column, which is why
 * `.card.done:hover` outranks `.card.dimmed` and had to be named explicitly. */
function specificity(selector: string): number {
  return (selector.match(/\.[a-z-]+/g)?.length ?? 0) + (selector.match(/:[a-z-]+/g)?.length ?? 0)
}

/** How the cascade resolves two rules that both apply: higher specificity wins,
 * and equal specificity goes to whichever is written last. */
function beats(a: Rule, b: Rule): boolean {
  const [x, y] = [specificity(a.selector), specificity(b.selector)]
  return x === y ? a.order > b.order : x > y
}

it('the stylesheet still sets a dimmed opacity at all', () => {
  const dimmed = opacityRules().filter(rule => rule.selector.includes('.dimmed'))
  expect(dimmed.length).toBeGreaterThan(0)
  for (const rule of dimmed) expect(rule.opacity).toBeCloseTo(0.18, 3)
})

// The regression itself. A card can be filtered out and done, or filtered out
// and blocked, or filtered out and hovered, and the filter has to be what shows.
it('dimming wins over every other opacity a card can be given', () => {
  const rules = opacityRules()
  const dimmed = rules.filter(rule => rule.selector.includes('.dimmed'))
  const others = rules.filter(rule => !rule.selector.includes('.dimmed'))
  expect(others.length, 'no competing rules found, so this test proves nothing')
    .toBeGreaterThan(0)

  for (const other of others) {
    // A rule only competes where both can match the same card, which means
    // every class and pseudo-class the dimmed rule names is also on that card.
    const applicable = dimmed.filter(rule =>
      (rule.selector.match(/[.:][a-z-]+/g) ?? [])
        .every(part => part === '.card' || part === '.dimmed' || other.selector.includes(part)))
    expect(applicable.some(rule => beats(rule, other)),
      `"${other.selector}" sets opacity ${other.opacity} and no dimmed rule beats it, `
      + 'so a filtered-out card in that state keeps its place on the board')
      .toBe(true)
  }
})
