import { mountForms } from './src/ui/mount.tsx';
import { TicketClient } from './src/platform/tickets/client.ts';
import { TicketStore, LayoutWriter } from './src/platform/tickets/store.ts';
import { createCanvasState } from './src/platform/canvas/state.ts';
import { autoPlace as place, toScene as scenePoint, zoomAt, fitView } from './src/platform/canvas/geometry.ts';

// tkcanvas — an infinite canvas over a git-ticket store.
//
// The store is the source of truth for everything except where a card sits.
// Every edit here is a named op sent to the server, which turns it into one of
// the library's typed mutations; nothing is applied locally and reconciled
// later. That costs a round trip per edit and buys the property that matters:
// what you see is what is on disk, and a refused write stays refused instead of
// lingering as optimistic state the next reload silently drops.

// ---------------------------------------------------------------- state

const store = new TicketStore(new TicketClient());
const layoutWriter = new LayoutWriter((board, cards) => store.saveLayout(board, cards));
let placementVersion = 0;
let composer = null, composerKey = 0, feedback = null, feedbackId = 0;
const S = {
  ...createCanvasState(),
  get tickets() { return store.state.tickets; },
  get cards() { return store.state.cards; },
  get boards() { return store.state.boards; },
  get board() { return store.state.board; },
  set board(name) {
    store.selectBoard(name);
    S.previews = {};
    composer = null;
    placementVersion++;
  },
  get config() { return store.state.config; },
  get storePath() { return store.state.storePath; },
  get readOnly() { return store.state.readOnly; },
  els: new Map(), // DOM handles belong only to the renderer.
};

const CARD_W = 248;

const $ = (id) => document.getElementById(id);
const stage = $('stage'), scene = $('scene'), cardsEl = $('cards'),
      edgeLayer = $('edgeLayer'), grid = $('grid');

const updateForms = mountForms($('toolbarRoot'), $('formsRoot'), {
  patch: (ticket, ops) => patch(ticket.id, ops, ticket.revision),
  closeInspector,
  navigate: (id) => { select(id); focusOn(id); },
  remove: (ticket) => removeTicket(ticket.id, ticket),
  create: createTicket,
  closeComposer,
});
function syncForms(counts = `${[...S.tickets.values()].filter(matches).length} of ${S.tickets.size}`) {
  updateForms({
    toolbar: {
      storePath: S.storePath, readOnly: S.readOnly, boards: S.boards, board: S.board,
      query: S.query, filters: S.statusFilter, config: S.config, counts,
      onQuery: (value) => { S.query = value; render(); },
      onFilter: (value) => { S.statusFilter.has(value) ? S.statusFilter.delete(value) : S.statusFilter.add(value); render(); },
      onBoard: (name) => changeBoard(name).catch(e => toast(e.message, true)),
      onNewBoard: () => newBoard().catch(e => toast(e.message, true)),
      onArrange: arrange, onFit: fit, onNew: newTicketCentre,
    },
    ticket: S.tickets.get(S.selected) || null, tickets: S.tickets,
    composer, composerKey, feedback,
  });
}

// ---------------------------------------------------------------- server

// patch sends ops for one ticket and folds the answer back into state.
//
// A stale_revision means somebody else — the CLI, an agent, another tab —
// wrote the ticket since this page read it. Reloading the board is the honest
// response: the edit did not happen, and showing it as though it had is how a
// canvas starts lying about a repository.
async function patch(id, ops, revision = S.tickets.get(id)?.revision || '') {
  try {
    const ticket = await store.patch(id, ops, revision);
    render();
    if (S.selected === ticket.id) renderInspector();
    return ticket;
  } catch (e) {
    if (e.code === 'stale_revision') {
      toast('That ticket changed on disk since this page read it — reloading.', true);
      paintBoard();
    } else {
      if (ops.length > 1) paintBoard();
      toast(e.message, true);
    }
    throw e;
  }
}

async function load() {
  if (await store.load()) paintBoard();
}

function paintBoard() {
  autoPlace();
  chrome();
  render();
  if (S.selected && !S.tickets.has(S.selected)) closeInspector();
  else if (S.selected) renderInspector(true);
}

// saveCards persists placements. Positions are the one thing this app owns, so
// they are written straight through rather than batched into a session: a drag
// you made is a decision, and losing it to a crashed tab would be the same
// failure as losing a ticket.
function saveCards(map) {
  const board = S.board, version = placementVersion;
  const previews = Object.fromEntries(Object.keys(map).map(id => [id, S.previews[id]]));
  layoutWriter.enqueue(board, map).catch((e) => toast(e.message, true)).finally(() => {
    if (S.board !== board || version !== placementVersion) return;
    // Clear only this save's previews. A later drag owns different objects.
    for (const [id, preview] of Object.entries(previews)) {
      if (S.previews[id] === preview) delete S.previews[id];
    }
    autoPlace();
    render();
  });
}

// ------------------------------------------------------------- placement

// autoPlace gives every ticket without a saved card a position, laid out in
// lanes by status.
//
// It is deliberately not persisted. A ticket filed from the CLI has to appear
// somewhere the moment it exists, but writing that guess to the board would
// make the layout file churn on every create and would claim a placement
// nobody chose. Dragging a card is what pins it, which is also what makes the
// distinction visible: dashed means "nobody put this here yet".
function autoPlace() {
  S.auto = place(S.tickets.values(), { ...S.cards, ...S.previews }, S.config?.statuses || []);
}

const posOf = (id) => S.previews[id] || S.cards[id] || S.auto.get(id) || { x: 0, y: 0 };
const isPinned = (id) => !!(S.previews[id] || S.cards[id]);

// ---------------------------------------------------------------- view

function applyView() {
  const { x, y, k } = S.view;
  scene.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
  drawGrid();
}

function drawGrid() {
  const dpr = window.devicePixelRatio || 1;
  const w = stage.clientWidth, h = stage.clientHeight;
  if (grid.width !== w * dpr || grid.height !== h * dpr) {
    grid.width = w * dpr; grid.height = h * dpr;
    grid.style.width = w + 'px'; grid.style.height = h + 'px';
  }
  const ctx = grid.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const css = getComputedStyle(document.documentElement);
  const { x, y, k } = S.view;
  const step = 24 * k;
  if (step < 6) return;
  const draw = (spacing, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
    for (let px = ((x % spacing) + spacing) % spacing; px < w; px += spacing) {
      ctx.moveTo(Math.round(px) + 0.5, 0); ctx.lineTo(Math.round(px) + 0.5, h);
    }
    for (let py = ((y % spacing) + spacing) % spacing; py < h; py += spacing) {
      ctx.moveTo(0, Math.round(py) + 0.5); ctx.lineTo(w, Math.round(py) + 0.5);
    }
    ctx.stroke();
  };
  draw(step, css.getPropertyValue('--grid').trim());
  if (step * 5 > 40) draw(step * 5, css.getPropertyValue('--grid-strong').trim());
}

const toScene = (cx, cy) => {
  const r = stage.getBoundingClientRect();
  return scenePoint({ x: cx, y: cy }, S.view, r);
};

function fit() {
  const view = fitView(visibleIds().map(id => ({ ...posOf(id), height: S.els.get(id)?.offsetHeight })),
    { width: stage.clientWidth, height: stage.clientHeight });
  if (view) { S.view = view; applyView(); }
}

// ---------------------------------------------------------------- render

function matches(t) {
  if (S.statusFilter.size && !S.statusFilter.has(t.status)) return false;
  const q = S.query.trim().toLowerCase();
  if (!q) return true;
  const hay = [t.id, t.title, t.type, t.status, t.priority, t.milestone,
               ...(t.labels || []), ...(t.assignees || []),
               t.body && t.body.description].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

const visibleIds = () => [...S.tickets.keys()];

function render() {
  const seen = new Set();
  for (const [id, t] of S.tickets) {
    seen.add(id);
    let el = S.els.get(id);
    if (!el) { el = cardEl(id); S.els.set(id, el); cardsEl.appendChild(el); }
    paintCard(el, t);
  }
  for (const [id, el] of S.els) {
    if (!seen.has(id)) { el.remove(); S.els.delete(id); }
  }
  drawEdges();
  const shown = [...S.tickets.values()].filter(matches).length;
  syncForms(`${shown} of ${S.tickets.size}`);
}

function cardEl(id) {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = id;
  el.innerHTML = `
    <div class="card-head"><span class="card-id"></span><span class="card-type"></span></div>
    <div class="card-title"></div>
    <div class="card-meta"></div>
    <div class="progress" hidden><i></i></div>
    <div class="handle" title="Drag to another card to add a dependency"></div>`;
  return el;
}

function paintCard(el, t) {
  const p = posOf(t.id);
  el.style.transform = `translate(${p.x}px, ${p.y}px)`;
  el.style.zIndex = String((S.cards[t.id] && S.cards[t.id].z) || 1);
  el.style.setProperty('--status', `var(--s-${t.status})`);
  el.classList.toggle('unpinned', !isPinned(t.id));
  el.classList.toggle('selected', S.selection.has(t.id));
  el.classList.toggle('dimmed', !matches(t));
  el.classList.toggle('done', t.status === 'done');
  el.classList.toggle('archived', t.status === 'archived');

  el.querySelector('.card-id').textContent = t.short || t.id;
  el.querySelector('.card-type').textContent = t.type;
  el.querySelector('.card-title').textContent = t.title;

  const meta = el.querySelector('.card-meta');
  meta.textContent = '';
  const pill = (text, cls) => {
    const s = document.createElement('span');
    s.className = 'pill ' + (cls || '');
    s.textContent = text;
    meta.appendChild(s);
  };
  // The status pill and the readiness pill say different things and often
  // agree, so the readiness one is drawn only where it adds something: a
  // ticket whose status is already "ready" and which really is startable
  // would otherwise wear the word twice.
  pill(t.status, 'status');
  if (t.priority && t.priority !== 'normal') pill(t.priority, 'prio-' + t.priority);
  if (t.readiness && t.readiness.ready) { if (t.status !== 'ready') pill('startable', 'ready'); }
  else if (t.readiness && t.readiness.blocked) {
    const n = (t.readiness.blocking || []).length + (t.readiness.blockingChildren || []).length
            + (t.readiness.missing || []).length;
    pill(n ? `blocked ×${n}` : 'blocked', 'blocked');
  }
  if (t.claim) pill('◆ ' + t.claim.actor, 'claim');
  if (t.dueOn) {
    const late = t.dueOn < new Date().toISOString().slice(0, 10) && t.status !== 'done';
    pill(t.dueOn, 'due' + (late ? ' late' : ''));
  }
  for (const l of t.labels || []) pill(l);
  if (t.milestone) pill('◇ ' + t.milestone);

  const ac = (t.body && t.body.acceptanceCriteria) || [];
  const bar = el.querySelector('.progress');
  if (ac.length) {
    const done = ac.filter((i) => i.checked).length;
    bar.hidden = false;
    bar.firstElementChild.style.width = `${(done / ac.length) * 100}%`;
    bar.title = `acceptance criteria ${done}/${ac.length}`;
  } else bar.hidden = true;
}

// drawEdges renders the two relations the format defines between tickets:
// a dependency (this waits on that) and a parent (this belongs to that).
// They are drawn differently because they mean different things — one gates
// work, one groups it — and a single line style for both would make an epic
// look like a blocker.
function drawEdges() {
  const parts = [`<defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="var(--edge)"/>
    </marker></defs>`];
  const box = (id) => {
    const p = posOf(id), el = S.els.get(id);
    return { x: p.x, y: p.y, w: CARD_W, h: el ? el.offsetHeight : 110 };
  };
  const dim = (a, b) => !matches(S.tickets.get(a)) || !matches(S.tickets.get(b));

  // Parent edges are drawn first and faintly. An epic is the parent of
  // everything under it, so its edges are the densest thing on the canvas
  // while being the least urgent: grouping is context, gating is the work.
  for (const [id, t] of S.tickets) {
    if (t.parent && S.tickets.has(t.parent)) {
      parts.push(curve(box(t.parent), box(id), 'var(--accent)', dim(id, t.parent) ? 0.05 : 0.2, true, 1.2));
    }
  }
  for (const [id, t] of S.tickets) {
    for (const dep of t.dependencies || []) {
      if (!S.tickets.has(dep)) continue;
      parts.push(curve(box(dep), box(id), 'var(--edge)', dim(id, dep) ? 0.1 : 0.9, false, 2));
    }
  }
  edgeLayer.innerHTML = parts.join('');
}

function curve(a, b, color, opacity, dashed, width) {
  // Anchor on the facing sides so an edge reads as flowing between two cards
  // rather than emerging from their centres.
  const rightward = b.x >= a.x;
  const x1 = rightward ? a.x + a.w : a.x, y1 = a.y + a.h / 2;
  const x2 = rightward ? b.x : b.x + b.w, y2 = b.y + b.h / 2;
  const d = Math.max(40, Math.abs(x2 - x1) * 0.45);
  const c1 = rightward ? x1 + d : x1 - d, c2 = rightward ? x2 - d : x2 + d;
  return `<path d="M${x1},${y1} C${c1},${y1} ${c2},${y2} ${x2},${y2}"
    fill="none" stroke="${color}" stroke-width="${width || 1.6}" opacity="${opacity}"
    ${dashed ? 'stroke-dasharray="5 5"' : 'marker-end="url(#arrow)"'} />`;
}

// ---------------------------------------------------------------- chrome

function chrome() { syncForms(); }
function renderInspector() { syncForms(); }
function toast(message, error = false) {
  feedback = { id: ++feedbackId, message, error };
  syncForms();
}

function select(id, additive) {
  if (!additive) S.selection.clear();
  if (id) S.selection.add(id);
  S.selected = id;
  render();
}
function openInspector() { syncForms(); }
function closeInspector() {
  S.selected = null; S.selection.clear(); render();
}

function focusOn(id) {
  const p = posOf(id);
  S.view.x = stage.clientWidth / 2 - 380 / 2 - (p.x + CARD_W / 2) * S.view.k;
  S.view.y = stage.clientHeight / 2 - (p.y + 60) * S.view.k;
  applyView();
}

async function removeTicket(id, t = S.tickets.get(id)) {
  if (S.readOnly) { toast('read-only', true); return; }
  const version = placementVersion;
  if (!confirm(`Delete ${t.short} "${t.title}"? The file is removed from disk.`)) return;
  let response;
  try {
    response = await store.remove(id, t.revision);
  } catch (e) {
    if (e.code !== 'ticket_referenced' || version !== placementVersion) { toast(e.message, true); return; }
    if (!confirm(`${e.message}\n\nRemove anyway and leave the references dangling?`)) return;
    try { response = await store.remove(id, t.revision, true); }
    catch (error) { toast(error.message, true); return; }
  }
  if (version === placementVersion && S.selected === id) closeInspector();
  await load();
  toast(response.layoutError ? `Deleted; placement cleanup failed: ${response.layoutError}` : 'Deleted.', !!response.layoutError);
}

// ------------------------------------------------------------- gestures

let drag = null;

stage.addEventListener('pointerdown', (e) => {
  if (e.target.closest('#inspector, #composer, #toolbar')) return;
  const handle = e.target.closest('.handle');
  const card = e.target.closest('.card');

  if (handle && card) {
    drag = { kind: 'link', from: card.dataset.id, to: null };
    stage.classList.add('linking');
    stage.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }

  if (card) {
    const id = card.dataset.id;
    if (!S.selection.has(id)) select(id, e.shiftKey);
    else { S.selected = id; openInspector(); }
    const ids = [...S.selection];
    drag = {
      kind: 'card', moved: false, pointer: { x: e.clientX, y: e.clientY },
      start: Object.fromEntries(ids.map((i) => [i, { ...posOf(i) }])),
      ids,
    };
    stage.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }

  drag = { kind: 'pan', pointer: { x: e.clientX, y: e.clientY }, start: { ...S.view } };
  stage.classList.add('panning');
  stage.setPointerCapture(e.pointerId);
});

stage.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (drag.kind === 'pan') {
    S.view.x = drag.start.x + (e.clientX - drag.pointer.x);
    S.view.y = drag.start.y + (e.clientY - drag.pointer.y);
    applyView();
    return;
  }
  if (drag.kind === 'card') {
    const dx = (e.clientX - drag.pointer.x) / S.view.k;
    const dy = (e.clientY - drag.pointer.y) / S.view.k;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.moved = true;
    if (!drag.moved) return;
    for (const id of drag.ids) {
      const s = drag.start[id];
      const el = S.els.get(id);
      if (el) el.style.transform = `translate(${s.x + dx}px, ${s.y + dy}px)`;
      // Keep the model in step so edges follow the card as it moves.
      S.previews[id] = { x: s.x + dx, y: s.y + dy };
    }
    drawEdges();
    return;
  }
  if (drag.kind === 'link') {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const card = el && el.closest('.card');
    const id = card && card.dataset.id !== drag.from ? card.dataset.id : null;
    if (id !== drag.to) {
      if (drag.to) S.els.get(drag.to)?.classList.remove('link-target');
      drag.to = id;
      if (id) S.els.get(id)?.classList.add('link-target');
    }
    const from = posOf(drag.from), p = toScene(e.clientX, e.clientY);
    const fh = S.els.get(drag.from)?.offsetHeight || 110;
    edgeLayer.insertAdjacentHTML('beforeend',
      `<path id="ghost" d="M${from.x + CARD_W},${from.y + fh / 2} L${p.x},${p.y}"
        stroke="var(--accent)" stroke-width="1.6" stroke-dasharray="4 4" fill="none"/>`);
    const ghosts = edgeLayer.querySelectorAll('#ghost');
    for (let i = 0; i < ghosts.length - 1; i++) ghosts[i].remove();
  }
});

stage.addEventListener('pointerup', async (e) => {
  if (!drag) return;
  const d = drag; drag = null;
  stage.classList.remove('panning', 'linking');

  if (d.kind === 'card' && d.moved) {
    if (S.readOnly) { S.previews = {}; toast('read-only', true); await load(); return; }
    // Dragging is what pins a card: an auto-placed guess becomes a decision
    // only when somebody makes it one.
    const cards = {};
    for (const id of d.ids) {
      const p = posOf(id);
      cards[id] = { x: Math.round(p.x), y: Math.round(p.y) };
      S.previews[id] = cards[id];
      S.auto.delete(id);
    }
    saveCards(cards);
    render();
  }

  if (d.kind === 'link') {
    edgeLayer.querySelector('#ghost')?.remove();
    if (d.to) {
      S.els.get(d.to)?.classList.remove('link-target');
      // The card you dragged from is the one that waits: dropping A onto B
      // reads as "A then B", so B depends on A.
      try {
        await patch(d.to, [{ op: 'addDependency', id: d.from }]);
        toast(`${S.tickets.get(d.to).short} now waits on ${S.tickets.get(d.from).short}`);
      } catch { /* patch reported it */ }
    } else drawEdges();
  }
});

stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = stage.getBoundingClientRect();
  S.view = zoomAt(S.view, { x: e.clientX, y: e.clientY }, r, e.deltaY);
  applyView();
}, { passive: false });

stage.addEventListener('dblclick', (e) => {
  if (e.target.closest('#inspector, #composer')) return;
  if (e.target.closest('.card')) return;
  openComposer(e.clientX, e.clientY);
});

// ------------------------------------------------------------- composer

function openComposer(clientX, clientY) {
  if (S.readOnly) { toast('read-only', true); return; }
  const r = stage.getBoundingClientRect(), at = toScene(clientX, clientY);
  composer = { x: clientX - r.left, y: clientY - r.top, sceneX: at.x, sceneY: at.y,
    board: S.board, generation: placementVersion };
  composerKey++;
  syncForms();
}
function closeComposer(position = composer) {
  if (position !== composer) return;
  composer = null; syncForms();
}
async function createTicket(title, at) {
  try {
    const res = await store.create({ title, board: at.board,
      card: { x: Math.round(at.sceneX), y: Math.round(at.sceneY) } });
    if (at.generation === placementVersion) { autoPlace(); render(); select(res.ticket.id); }
    toast(res.layoutError ? 'Ticket filed; placement failed: ' + res.layoutError :
      'Filed ' + (res.ticket.short || res.ticket.id) + ' as draft.', !!res.layoutError);
    return res;
  } catch (error) { toast(error.message, true); throw error; }
}

// ------------------------------------------------------------- keyboard

document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (e.key === 'Escape') {
    if (composer) return closeComposer();
    if (typing) return e.target.blur();
    return closeInspector();
  }
  if (typing) return;
  if (e.key === '/') { e.preventDefault(); $('search').focus(); return; }
  if (e.key === 'n') { e.preventDefault(); newTicketCentre(); return; }
  if (e.key === 'f') { e.preventDefault(); fit(); return; }
  if ((e.key === 'Backspace' || e.key === 'Delete') && S.selected) {
    e.preventDefault(); removeTicket(S.selected);
  }
});

function newTicketCentre() {
  const r = stage.getBoundingClientRect();
  openComposer(r.left + (stage.clientWidth - 360) / 2, r.top + stage.clientHeight / 2);
}

// --------------------------------------------------------------- wiring


// Arrange writes the auto-layout down as real placements, which is the one
// place a guess becomes a decision without a drag. It is a button rather than
// a startup behaviour because it overwrites arrangements somebody made.
function arrange() {
  if (S.readOnly) return;
  if (!confirm('Lay every card out in status lanes? This replaces the positions on this board.')) return;
  const cards = {};
  for (const [id, position] of place(S.tickets.values(), {}, S.config.statuses)) {
    cards[id] = position;
    S.previews[id] = cards[id];
    S.auto.delete(id);
  }
  saveCards(cards);
  render();
  fit();
};

async function changeBoard(name) {
  S.board = name;
  await load();
  fit();
};

async function newBoard() {
  if (S.readOnly) return;
  const name = (prompt('New board name (letters, digits, - and _):') || '').trim();
  if (!name) return;
  S.board = name;
  await store.saveLayout(name, {}).catch((e) => toast(e.message, true));
  await load();
};

window.addEventListener('resize', drawGrid);

// A store is edited from a terminal and by agents while this page is open, so
// the canvas re-reads it on a timer and whenever the tab regains focus. It is
// a poll rather than a watch because the server holds no state to push from;
// a file watcher is the obvious next step and changes nothing on this side.
let idle = 0;
setInterval(() => { if (!drag && ++idle >= 3) { idle = 0; load().catch(() => {}); } }, 4000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) load().catch(() => {});
});

syncForms();
load().then(fit).catch((e) => toast('Could not load the store: ' + e.message, true));
