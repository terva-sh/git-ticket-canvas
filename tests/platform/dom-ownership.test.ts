import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { expect, it } from 'vitest'

it('restricts the legacy adapter to canvas nodes, mount roots and the search focus shortcut', () => {
  const source = ts.createSourceFile('app.js', readFileSync('web/app.js', 'utf8'), ts.ScriptTarget.Latest, true)
  const allowed = new Set(['stage', 'scene', 'cards', 'edgeLayer', 'grid', 'toolbarRoot', 'formsRoot', 'search'])
  const lookups: string[] = []
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === '$') {
      const arg = node.arguments[0]
      expect(arg && ts.isStringLiteral(arg), 'DOM lookups must name their owner').toBe(true)
      if (arg && ts.isStringLiteral(arg)) { lookups.push(arg.text); expect(allowed.has(arg.text), arg.text).toBe(true) }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  expect(lookups).toContain('toolbarRoot'); expect(lookups).toContain('formsRoot')
})
it('leaves form markup out of the static canvas shell', () => {
  const html = readFileSync('web/index.html', 'utf8')
  for (const id of ['inspector', 'toolbar', 'composer', 'toast']) expect(html).not.toContain(`id="${id}"`)
  expect(html).toContain('id="formsRoot"'); expect(html).toContain('id="toolbarRoot"')
})
