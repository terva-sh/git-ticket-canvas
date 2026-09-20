import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { test, expect, commandEnvironment } from './fixtures'

const layoutFile = (root: string) => join(root, '.tickets', 'canvas', 'default.yml')
const panel = (page: Page) => page.locator('#pensPanel')
const rules = (page: Page) => page.locator('#pensPanel .pen-rules li')

/** The desk side of the same board: git ticket canvas, at the version go.mod
 * names, run against the store the server is serving. */
function cli(root: string, ...args: string[]) {
  return execFileSync(join(process.env.GIT_TICKET_CANVAS_BROWSER_BIN!, 'git-ticket'),
    ['canvas', ...args, '--actor', 'agent:playwright/baseline'], { cwd: root, env: commandEnvironment(), encoding: 'utf8' })
}

/** The server reconciles an outside write after a settling interval and
 * serves the previous image until then, so a file the CLI just wrote is not
 * always what the next request returns. A test that opens the panel over the
 * old image begins its draft over old rules, and Apply is then rightly
 * refused. Wait until the served board shows the CLI's write before loading
 * the page. */
async function served(app: { url: string }, request: import('@playwright/test').APIRequestContext, ready: (layout: { ruleOrder: string[]; inbox: { x: number; y: number } }) => boolean) {
  await expect.poll(async () => {
    const response = await request.get(`${app.url}/api/board?board=default`)
    return ready((await response.json()).layout)
  }, { timeout: 15_000 }).toBe(true)
}

async function addPenInBrowser(page: Page, title: string, label: string) {
  await page.locator('#btnAddPen').click()
  await page.getByLabel('Title').fill(title)
  const entry = page.getByRole('combobox', { name: 'Add a required label' })
  await entry.fill(label)
  await entry.press('Enter')
  await expect(page.locator('#pensPanel .pen-tokens li', { hasText: label })).toBeVisible()
  await page.locator('#btnPenDone').click()
}

// The browser and the CLI write one file. A pen authored here, applied, and
// then authored again by the CLI from the same starting file has to come out
// byte for byte the same, or the two are not writing the same board.
test('a pen authored in the browser is the pen the CLI would have written', async ({ page, app, request }) => {
  const ui = await app.create('Interface work')
  await app.patch(ui, [{ op: 'addLabel', label: 'ui' }])
  await app.create('Something else')
  // Start from a board the CLI has written, so both sides begin at one file.
  cli(app.root, 'inbox', '--at', '-400,0')
  const before = await readFile(layoutFile(app.root), 'utf8')
  await served(app, request, layout => layout.inbox.x === -400)

  await page.goto(app.url)
  await page.locator('#btnPens').click()
  await expect(panel(page)).toBeVisible()
  await expect(rules(page)).toHaveCount(0)
  await addPenInBrowser(page, 'Interface', 'ui')
  await expect(rules(page)).toHaveCount(1)
  await expect(page.locator('#btnPenApply')).toBeDisabled()
  await page.locator('#btnPenPreview').click()
  await expect(panel(page)).toContainText('1 automatic card changes destination')
  await expect(panel(page)).toContainText(`${ui.title}: the inbox → Interface (interface)`)
  // The canvas draws the preview: the pen is on the board before anything is written.
  await expect(page.locator('.canvas-pen[data-pen-id="interface"]')).toBeVisible()
  expect(await readFile(layoutFile(app.root), 'utf8')).toBe(before)
  await page.locator('#btnPenApply').click()
  await expect(panel(page)).toContainText('Rules saved.')
  const byBrowser = await readFile(layoutFile(app.root), 'utf8')
  expect(byBrowser).not.toBe(before)
  expect(byBrowser).toContain('interface')

  // The same pen from the desk, from the same starting file.
  await writeFile(layoutFile(app.root), before)
  cli(app.root, 'pen', 'add', 'interface', '--title', 'Interface', '--label', 'ui', '--at', '0,0', '--size', '1000,400')
  const byCLI = await readFile(layoutFile(app.root), 'utf8')
  expect(byCLI).toBe(byBrowser)
  // And the CLI reads the browser's pen back as its own.
  await writeFile(layoutFile(app.root), byBrowser)
  expect(cli(app.root, 'explain', ui.id)).toContain('goes to pen interface (Interface): labels ui')
})

// A preview is a claim about the rules as they were read. When the CLI
// changes them underneath, Apply is refused and the preview withdrawn, and
// so is the draft: a rules write replaces the whole record, and a draft begun
// over the old rules would drop what the CLI added.
test('Apply after a CLI write to the same board is refused with layout_conflict', async ({ page, app, request }) => {
  const t = await app.create('Interface work')
  await app.patch(t, [{ op: 'addLabel', label: 'ui' }])
  cli(app.root, 'inbox', '--at', '-400,0')
  await served(app, request, layout => layout.inbox.x === -400)
  await page.goto(app.url)
  await page.locator('#btnPens').click()
  await addPenInBrowser(page, 'Interface', 'ui')
  await page.locator('#btnPenPreview').click()
  await expect(page.locator('#btnPenApply')).toBeEnabled()
  cli(app.root, 'pen', 'add', 'docs', '--title', 'Documentation', '--label', 'docs', '--at', '0,600', '--size', '1000,400')
  await page.locator('#btnPenApply').click()
  const alert = panel(page).locator('[role="alert"]')
  await expect(alert).toHaveCount(1)
  await expect(alert).toContainText('layout_conflict')
  await expect(alert).toContainText('The preview and the draft were discarded')
  await expect(page.locator('#btnPenApply')).toBeDisabled()
  // The panel now shows the CLI's rules; the file holds only those.
  await expect(rules(page)).toHaveCount(1)
  await expect(rules(page).first()).toContainText('Documentation')
  const file = await readFile(layoutFile(app.root), 'utf8')
  expect(file).toContain('docs')
  expect(file).not.toContain('interface')
  // Made again against the current rules, the change lands beside the CLI's.
  await addPenInBrowser(page, 'Interface', 'ui')
  await page.locator('#btnPenPreview').click()
  await page.locator('#btnPenApply').click()
  await expect(panel(page)).toContainText('Rules saved.')
  const after = await readFile(layoutFile(app.root), 'utf8')
  expect(after).toContain('interface')
  expect(after).toContain('docs')
  expect(cli(app.root, 'pens')).toMatch(/1\s+docs[\s\S]*2\s+interface/)
})

test('rules can be reordered and removed as one draft, and Cancel returns to the board', async ({ page, app, request }) => {
  cli(app.root, 'pen', 'add', 'fe', '--title', 'Frontend', '--label', 'frontend', '--at', '0,0', '--size', '1000,300')
  cli(app.root, 'pen', 'add', 'bugs', '--title', 'Bugs', '--label', 'bug', '--at', '0,400', '--size', '1000,300')
  await served(app, request, layout => layout.ruleOrder.length === 2)
  await page.goto(app.url)
  await page.locator('#btnPens').click()
  await expect(rules(page)).toHaveCount(2)
  await page.getByRole('button', { name: 'Move Bugs earlier' }).click()
  await expect(rules(page).first()).toContainText('Bugs')
  await page.getByRole('button', { name: 'Remove Frontend' }).click()
  await expect(rules(page)).toHaveCount(1)
  await page.locator('#btnPenCancel').click()
  await expect(rules(page)).toHaveCount(2)
  await expect(rules(page).first()).toContainText('Frontend')
  await page.getByRole('button', { name: 'Move Bugs earlier' }).click()
  await page.locator('#btnPenPreview').click()
  await page.locator('#btnPenApply').click()
  await expect(panel(page)).toContainText('Rules saved.')
  expect(cli(app.root, 'pens')).toMatch(/1\s+bugs[\s\S]*2\s+fe/)
})

test('a read-only canvas shows the rules with every authoring control disabled', async ({ page, app }) => {
  cli(app.root, 'pen', 'add', 'fe', '--title', 'Frontend', '--label', 'frontend', '--at', '0,0', '--size', '1000,300')
  const before = await readFile(layoutFile(app.root), 'utf8')
  await page.goto(await app.readOnlyURL())
  await page.locator('#btnPens').click()
  await expect(panel(page)).toContainText('Read-only. Rules can be read here and changed with git ticket canvas on the desk.')
  await expect(rules(page)).toHaveCount(1)
  for (const id of ['btnAddPen', 'btnPenPreview', 'btnPenApply', 'btnPenCancel']) await expect(page.locator(`#${id}`)).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Edit Frontend' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Remove Frontend' })).toBeDisabled()
  expect(await readFile(layoutFile(app.root), 'utf8')).toBe(before)
})
