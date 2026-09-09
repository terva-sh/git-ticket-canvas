import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { commandEnvironment, test, expect } from './fixtures'

for (const viaGit of [false, true]) {
  test(`installed command works ${viaGit ? 'through Git discovery' : 'directly'}`, async ({ page, request, app }) => {
    const command = viaGit ? 'git' : join(process.env.GIT_TICKET_CANVAS_BROWSER_BIN!, 'git-ticket-canvas')
    const help = spawnSync(command, [...(viaGit ? ['ticket-canvas'] : []), '-h'], {
      cwd: app.root, env: commandEnvironment(), encoding: 'utf8', timeout: 10_000,
    })
    expect(help.status, help.stderr).toBe(0)
    expect(help.stderr).toContain('git-ticket-canvas')
    expect(help.stderr).toContain('-store')
    expect(help.stderr).toContain('-read-only')

    const ticket = await app.create('Installed command ticket')
    const before = await app.snapshot()
    const url = await app.readOnlyURL(viaGit)
    await page.goto(url)
    await expect(page.locator('#roBadge')).toBeVisible()
    await expect(page.locator(`.card[data-id="${ticket.id}"]`)).toContainText('Installed command ticket')
    const refused = await request.post(`${url}/api/tickets`, { data: { title: 'Must not persist' } })
    expect(refused.status()).toBe(403)
    expect(await app.snapshot()).toEqual(before)
  })
}
