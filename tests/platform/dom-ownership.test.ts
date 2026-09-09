import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { expect, it } from 'vitest'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(path) && !path.includes('.test.') ? [path] : []
  })
}
it('removes the legacy renderer, mount bridge and duplicate canvas state', () => {
  for (const path of ['web/app.js', 'web/src/ui/mount.tsx', 'web/src/platform/canvas/state.ts']) expect(existsSync(path), path).toBe(false)
  const entry = readFileSync('web/src/main.ts', 'utf8')
  expect(entry).toContain("'./ui/App'")
})
it('keeps DOM composition in JSX instead of manual HTML builders', () => {
  for (const path of sourceFiles('web/src/ui')) {
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
    function visit(node: ts.Node) {
      if (ts.isPropertyAccessExpression(node)) expect(['innerHTML', 'insertAdjacentHTML', 'createElement'].includes(node.name.text), `${path}: ${node.name.text}`).toBe(false)
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
})
it('leaves all application markup out of the static shell', () => {
  const html = readFileSync('web/index.html', 'utf8')
  for (const id of ['stage', 'scene', 'cards', 'inspector', 'toolbar', 'composer', 'toast']) expect(html).not.toContain(`id="${id}"`)
  expect(html).toContain('<div id="app"></div>')
})
