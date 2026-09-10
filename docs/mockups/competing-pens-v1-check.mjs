import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const errors = [], requests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
const snapshot = () => page.evaluate(() => window.mockupSnapshot());
const settle = () => page.waitForFunction(() => !window.mockupSnapshot().pending);
const click = id => page.locator('#' + id).click();
const save = async id => { await click(id); await settle(); };
const rule = id => page.locator('#rule').selectOption(id);
const ticket = id => page.locator('#ticket').selectOption(id);
const winner = (s, id) => s.evaluations[id].winner?.id || 'inbox';
const card = (s, id) => s.state.cards.find(c => c.id === id);
const promoteUrgent = async () => { await rule('urgent'); await click('earlier'); };
function collisionCheck(s) {
  const state = s.draft?.state || s.state, positions = s.draft?.positions || s.positions;
  for (const a of state.cards.filter(c => !c.manual)) for (const b of state.cards.filter(c => c.id !== a.id)) {
    const p = positions[a.id], q = positions[b.id];
    assert.ok(p.x + 246 <= q.x || q.x + 246 <= p.x || p.y + 132 <= q.y || q.y + 132 <= p.y, `${a.id}/${b.id} overlap`);
  }
}
try {
  await page.goto(pathToFileURL(resolve('docs/mockups/competing-pens-v1.html')).href);
  const initial = await snapshot();
  assert.equal(winner(initial, 'a'), 'bugs');
  assert.equal(winner(initial, 's'), 'security');
  assert.equal(winner(initial, 'e'), 'inbox');
  assert.equal(winner(initial, 'd'), 'general');
  assert.match(await page.locator('#winner').innerText(), /explicit order #2/);
  assert.match(await page.locator('[data-candidate="general"]').innerText(), /loses on specificity/);
  assert.match(await page.locator('[data-candidate="urgent"]').innerText(), /loses the tie on order/);
  assert.match(await page.locator('[data-candidate="security"]').innerText(), /Missing: security/);
  assert.match(await page.locator('#overlaps').innerText(), /4 current cards match both · 2 automatic top-specificity ties · 1 manual · 1 outranked/);
  collisionCheck(initial);

  await page.locator('#filter').check();
  assert.deepEqual((await snapshot()).positions, initial.positions);
  assert.match(await page.locator('#overlaps').innerText(), /4 current cards match both/);
  await promoteUrgent();
  let s = await snapshot();
  assert.deepEqual(s.state, initial.state);
  assert.equal(winner(s, 'a'), 'urgent');
  assert.equal(winner(s, 'h'), 'urgent');
  assert.equal(winner(s, 's'), 'security');
  assert.deepEqual(s.draft.positions.s, initial.positions.s);
  assert.deepEqual(s.draft.positions.m, initial.positions.m);
  assert.match(await page.locator('#impact').innerText(), /2 automatic transfers \(1 hidden\). 1 manual/);
  assert.match(await page.locator('#overlaps').innerText(), /Frontend urgent is earlier \(#2 before #3\)/);
  collisionCheck(s);
  await click('cancel');
  assert.deepEqual((await snapshot()).state, initial.state);
  assert.equal(winner(await snapshot(), 'a'), 'bugs');
  await promoteUrgent();
  await page.locator('#fail').check();
  await save('apply');
  assert.deepEqual((await snapshot()).state, initial.state);
  assert.deepEqual((await snapshot()).positions, initial.positions);
  assert.match(await page.locator('#status').innerText(), /Save failed/);
  await promoteUrgent();
  const proposed = (await snapshot()).draft;
  await save('apply');
  s = await snapshot();
  assert.deepEqual(s.state, proposed.state);
  assert.deepEqual(s.positions, proposed.positions);
  assert.equal(card(s, 'a').member, true);
  assert.deepEqual(card(s, 'm').manual, card(initial, 'm').manual);
  collisionCheck(s);

  // Earlier broad rules cannot defeat specificity; repeated labels count once.
  await rule('general');
  await click('later');
  assert.equal(winner(await snapshot(), 'a'), 'urgent');
  assert.equal(winner(await snapshot(), 's'), 'security');
  await page.keyboard.press('Escape');
  await rule('bugs');
  await click('duplicate');
  s = await snapshot();
  assert.equal(s.draft.state.rules.find(r => r.id === 'bugs').labels.length, 3);
  assert.equal(s.evaluations.a.candidates.find(r => r.id === 'bugs').size, 2);
  assert.equal(winner(s, 'a'), 'urgent');
  assert.match(await page.locator('[data-rule="bugs"]').innerText(), /Repeated requirements count once/);
  await save('apply');

  // Manual routing explanation changes without moving the card; failed unpin retains it.
  await ticket('m');
  assert.match(await page.locator('#winner').innerText(), /Manual position overrides placement.*Frontend urgent wins/s);
  await page.locator('#fail').check();
  await save('automatic');
  assert.deepEqual(card(await snapshot(), 'm').manual, card(initial, 'm').manual);
  await save('automatic');
  s = await snapshot();
  assert.equal(card(s, 'm').manual, null);
  assert.equal(card(s, 'm').member, true);
  assert.equal(winner(s, 'm'), 'urgent');
  await save('manual');
  const manual = card(await snapshot(), 'm').manual;
  await save('toggle');
  assert.equal(winner(await snapshot(), 'm'), 'bugs');
  assert.deepEqual(card(await snapshot(), 'm').manual, manual);

  // Removal evaluates remaining rules before falling back to Inbox.
  await click('reset');
  await rule('bugs');
  await click('remove');
  assert.equal(winner(await snapshot(), 'a'), 'urgent');
  assert.equal(winner(await snapshot(), 'b'), 'general');
  await rule('urgent');
  await click('remove');
  assert.equal(winner(await snapshot(), 'a'), 'general');
  await rule('general');
  await click('remove');
  assert.equal(winner(await snapshot(), 'a'), 'inbox');
  await rule('security');
  await click('remove');
  assert.equal((await snapshot()).draft.state.rules.length, 0);
  assert.equal(winner(await snapshot(), 's'), 'inbox');
  assert.match(await page.locator('#overlaps').innerText(), /No equal-specificity pairs/);
  collisionCheck(await snapshot());
  await save('apply');
  assert.equal(await page.locator('#earlier').isDisabled(), true);
  await ticket('e');
  assert.match(await page.locator('#winner').innerText(), /Inbox: no rule/);

  // Potential overlap warning remains even if no automatic card has a decisive tie.
  await click('reset');
  for (const id of ['a', 'h']) { await ticket(id); await save('toggle'); }
  assert.match(await page.locator('#overlaps').innerText(), /0 automatic top-specificity ties/);
  assert.match(await page.locator('#overlaps').innerText(), /Frontend bugs overlaps Frontend urgent/);

  // Closing discards unsubmitted preview, but never cancels submitted saves.
  await click('reset');
  await promoteUrgent();
  await click('close');
  assert.equal((await snapshot()).draft, null);
  await click('show-editor');
  await promoteUrgent();
  await click('apply');
  await click('close');
  await page.keyboard.press('Escape');
  assert.match(await page.locator('#status').innerText(), /already submitted/);
  await settle();
  assert.equal(winner(await snapshot(), 'a'), 'urgent');
  assert.equal(await page.locator('[aria-label="Rule ordering"]').isHidden(), true);
  await click('show-editor');
  await rule('bugs');
  await click('earlier');
  await page.locator('#readonly').check();
  assert.equal((await snapshot()).draft, null);
  for (const id of ['earlier', 'later', 'remove', 'duplicate', 'apply', 'manual', 'automatic', 'toggle']) assert.equal(await page.locator('#' + id).isDisabled(), true, id);

  await click('reset');
  await rule('urgent');
  await page.locator('#earlier').focus();
  await page.keyboard.press('Enter');
  assert.equal(winner(await snapshot(), 'a'), 'urgent');
  await page.keyboard.press('Escape');
  assert.equal((await snapshot()).draft, null);
  if (process.env.MOCKUP_SCREENSHOT_DIR) {
    await mkdir(process.env.MOCKUP_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.MOCKUP_SCREENSHOT_DIR, 'competing-pens-v1-dark.png'), fullPage: true });
    await promoteUrgent();
    await page.screenshot({ path: join(process.env.MOCKUP_SCREENSHOT_DIR, 'competing-pens-v1-preview.png'), fullPage: true });
    await click('cancel');
  }
  await click('theme');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  if (process.env.MOCKUP_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.MOCKUP_SCREENSHOT_DIR, 'competing-pens-v1-light.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await promoteUrgent();
  assert.equal(winner(await snapshot(), 'a'), 'urgent');
  await click('cancel');
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  console.log('PASS: specificity, explicit tie order, overlap explanations, hidden/manual counts, duplicate labels, reorder previews, cancellation/rollback, manual override/unpin, removal fallback, pending close, read-only, keyboard, themes, narrow viewport, and no remote requests.');
} finally { await browser.close(); }
