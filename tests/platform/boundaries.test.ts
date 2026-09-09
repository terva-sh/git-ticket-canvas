import { readdirSync, readFileSync } from 'node:fs'
import { resolve, relative, dirname, sep } from 'node:path'
import ts from 'typescript'
import { expect, it } from 'vitest'

const root = resolve('web/src/platform')
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name)
    return entry.isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : []
  })
}
function violations(path: string, source: string) {
  const errors: string[] = []
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
  const checkImport = (name: string) => {
    const target = resolve(dirname(path), name)
    if (!name.startsWith('.') || relative(root, target).startsWith(`..${sep}`)) errors.push(`import ${name}`)
  }
  const forbidden = /^(document|window|HTMLElement|Element|Node|navigator|localStorage|sessionStorage|globalThis|self|eval|Function)$/
  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) checkImport(node.moduleSpecifier.text)
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
      const arg = node.arguments[0]
      if (arg && ts.isStringLiteral(arg)) checkImport(arg.text)
      else errors.push('dynamic import')
    }
    if (ts.isIdentifier(node) && forbidden.test(node.text)) errors.push(`DOM/global ${node.text}`)
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return errors
}
it('keeps platform imports inside platform and rejects DOM composition', () => {
  const production = files(root).filter(path => !path.endsWith('.test.ts'))
  expect(production.length).toBeGreaterThan(0)
  for (const path of production) expect(violations(path, readFileSync(path, 'utf8')), relative(root, path)).toEqual([])
})
it('detects static, re-exported and dynamic forbidden dependencies and DOM globals', () => {
  for (const source of ["import { h } from 'preact'", "export * from '../../app'", "import('preact/hooks')", 'document.createElement("div")', 'globalThis["document"]']) {
    expect(violations(resolve(root, 'probe.ts'), source).length, source).toBeGreaterThan(0)
  }
})
