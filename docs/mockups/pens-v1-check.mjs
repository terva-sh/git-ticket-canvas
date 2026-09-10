import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1536, height: 1100 } });
const errors = [], remoteRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/^https?:/.test(request.url())) remoteRequests.push(request.url()); });
const snapshot = () => page.evaluate(() => window.mockupSnapshot());
const settle = () => page.waitForFunction(() => !window.mockupSnapshot().pending);
const clickSave = async id => { await page.locator('#' + id).click(); await settle(); };
const reset = () => page.locator('#reset').click();
const card = (s, id = 'a') => s.state.cards.find(c => c.id === id);
const xy = p => ({ x: p.x, y: p.y });
const preview = async op => { await page.locator('#operation').selectOption(op); await page.locator('#preview').click(); };
function noAutoCollisions(s, projected = false) {
  const state = projected ? s.draft.state : s.state;
  const positions = projected ? s.draft.positions : s.positions;
  for (const a of state.cards.filter(c => !c.manual)) {
    for (const b of state.cards.filter(c => c.id !== a.id)) {
      const p = positions[a.id], q = positions[b.id];
      assert.ok(p.x + 240 <= q.x || q.x + 240 <= p.x || p.y + 132 <= q.y || q.y + 132 <= p.y, `${a.id} overlaps ${b.id}`);
    }
  }
}
try {
  await page.goto(pathToFileURL(resolve('docs/mockups/pens-v1.html')).href);
  const initial = await snapshot();
  assert.match(await page.locator('#counts').innerText(), /4 automatic · 2 overflow/);
  assert.equal(await page.locator('.card.highlight').count(), 4);
  assert.equal(await page.locator('[data-card="m"].highlight').count(), 0);
  noAutoCollisions(initial);
  await page.locator('#filter').check();
  assert.deepEqual((await snapshot()).positions, initial.positions);
  assert.match(await page.locator('#counts').innerText(), /4 automatic · 2 overflow · 1 hidden/);
  assert.equal(await page.locator('.card.highlight').count(), 3);
  await page.locator('#filter').uncheck();

  // The required six-step walkthrough preserves membership independently of routing.
  await clickSave('membership');
  let s = await snapshot();
  assert.equal(card(s).member, true);
  assert.equal(card(s).manual, null);
  assert.deepEqual(s.positions, initial.positions);
  await clickSave('labels');
  s = await snapshot();
  assert.ok(s.positions.a.x >= s.state.inbox.x);
  assert.equal(card(s).member, true);
  assert.equal(card(s).manual, null);
  assert.deepEqual(s.positions.b, initial.positions.b, 'Unrelated automatic slots stay stable');
  const inboxPosition = xy(s.positions.a);
  await clickSave('move-frame');
  s = await snapshot();
  assert.deepEqual(card(s).manual, { x: inboxPosition.x + 40, y: inboxPosition.y });
  assert.equal(card(s, 'm').manual.x, card(initial, 'm').manual.x + 40);
  const manual = card(s).manual;
  await clickSave('labels');
  assert.deepEqual(card(await snapshot()).manual, manual);
  await page.locator('#fail').check();
  const beforeFailure = await snapshot();
  await clickSave('automatic');
  assert.deepEqual((await snapshot()).state, beforeFailure.state);
  assert.match(await page.locator('#status').innerText(), /Save failed/);
  await clickSave('automatic');
  s = await snapshot();
  assert.equal(card(s).manual, null);
  assert.equal(card(s).member, true);
  assert.ok(s.positions.a.x < s.state.inbox.x);
  noAutoCollisions(s);
  await page.locator('#select-frame').click();
  assert.equal(await page.locator('.card.member').count(), 2);

  // Undo uses current labels, and later member placement blocks undo atomically.
  await reset();
  await clickSave('membership');
  await clickSave('move-frame');
  await clickSave('labels');
  await clickSave('undo');
  s = await snapshot();
  assert.equal(card(s).manual, null);
  assert.equal(card(s).member, true);
  assert.ok(s.positions.a.x >= s.state.inbox.x);
  assert.deepEqual(s.state.frame, initial.state.frame);
  await clickSave('move-frame');
  await page.locator('#external').click();
  assert.equal(await page.locator('#undo').isDisabled(), true);
  assert.match(await page.locator('#history').innerText(), /Undo blocked/);

  await reset();
  await clickSave('move-frame');
  await clickSave('membership');
  assert.equal(await page.locator('#undo').isDisabled(), true, 'Adding a new member also blocks older frame undo');

  // Hidden outside members still move with their frame and become manual.
  await reset();
  await page.locator('#ticket').selectOption('d');
  await clickSave('membership');
  await page.locator('#filter').check();
  const beforeHidden = await snapshot();
  await clickSave('move-frame');
  s = await snapshot();
  assert.deepEqual(card(s, 'd').manual, { x: beforeHidden.positions.d.x + 40, y: beforeHidden.positions.d.y });
  assert.equal(await page.locator('[data-card="d"]').count(), 0);

  // Every edit is previewed; cancellation and failures retain accepted state.
  for (const operation of ['move', 'resize', 'pin', 'rule', 'delete', 'inbox']) {
    await reset();
    await clickSave('membership');
    const before = await snapshot();
    await preview(operation);
    s = await snapshot();
    assert.deepEqual(s.state, before.state);
    assert.equal(card({ state: s.draft.state }, 'm').manual.x, card(before, 'm').manual.x);
    assert.equal(card({ state: s.draft.state }).member, true);
    noAutoCollisions(s, true);
    await page.keyboard.press('Escape');
    assert.equal((await snapshot()).draft, null);
    assert.deepEqual((await snapshot()).state, before.state);
    await preview(operation);
    await page.locator('#fail').check();
    await clickSave('apply');
    assert.deepEqual((await snapshot()).state, before.state);
    assert.equal((await snapshot()).draft, null);
    await preview(operation);
    const projected = (await snapshot()).draft;
    await clickSave('apply');
    s = await snapshot();
    assert.deepEqual(s.state, projected.state);
    assert.deepEqual(s.positions, projected.positions);
    assert.equal(s.history, null, 'Pen edits never enter Undo frame');
    noAutoCollisions(s);
    if (operation === 'delete') {
      assert.equal(s.state.pen, null);
      assert.equal(card(s).member, true);
      assert.equal(await page.locator('.pen').count(), 0);
      await page.locator('#select-inbox').click();
      assert.equal(await page.locator('.card.highlight').count(), 5);
      assert.match(await page.locator('#counts').innerText(), /5 automatic in Inbox/);
    }
    if (operation === 'rule') {
      await page.locator('#select-pen').click();
      assert.equal(await page.locator('.card.highlight').count(), 1);
      assert.equal(await page.locator('[data-card="c"].highlight').count(), 1);
    }
  }

  // Closing a submitted save never cancels it; closing an unsubmitted preview does.
  await reset();
  await preview('delete');
  await page.locator('#close-editor').click();
  assert.equal((await snapshot()).draft, null);
  await page.locator('#open-editor').click();
  await preview('move');
  await page.locator('#apply').click();
  assert.equal((await snapshot()).pending, true);
  await page.locator('#close-editor').click();
  await page.keyboard.press('Escape');
  assert.match(await page.locator('#status').innerText(), /already submitted/);
  await settle();
  assert.equal((await snapshot()).state.pen.x, initial.state.pen.x + 40);
  assert.equal(await page.locator('#editor').isHidden(), true);

  // Keyboard controls, read-only guard, themes, narrow viewport, and no network.
  await reset();
  await page.locator('#membership').focus();
  await page.keyboard.press('Enter');
  await settle();
  assert.equal(card(await snapshot()).member, true);
  await preview('move');
  await page.locator('#readonly').check();
  assert.equal((await snapshot()).draft, null);
  for (const id of ['membership', 'labels', 'manual', 'automatic', 'move-frame', 'undo', 'preview', 'apply']) {
    assert.equal(await page.locator('#' + id).isDisabled(), true, id);
  }
  await reset();
  if (process.env.MOCKUP_SCREENSHOT_DIR) {
    await mkdir(process.env.MOCKUP_SCREENSHOT_DIR, { recursive: true });
    await page.locator('.inspector').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: join(process.env.MOCKUP_SCREENSHOT_DIR, 'pens-v1-dark.png'), fullPage: true });
  }
  await page.locator('#theme').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  if (process.env.MOCKUP_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.MOCKUP_SCREENSHOT_DIR, 'pens-v1-light.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#open-editor').click();
  await page.locator('#operation').selectOption('move');
  await page.locator('#preview').focus();
  await page.keyboard.press('Enter');
  assert.ok((await snapshot()).draft);
  await page.keyboard.press('Escape');
  assert.equal((await snapshot()).draft, null);
  assert.deepEqual(errors, []);
  assert.deepEqual(remoteRequests, []);
  console.log('PASS: one-pen walkthrough, stable slots, overflow/filter counts, frame undo/conflicts, hidden members, six previews, rollback, pending close, read-only, keyboard, themes, narrow viewport, and no remote requests.');
} finally {
  await browser.close();
}
