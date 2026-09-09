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
const S = {
  ...createCanvasState(),
  get tickets() { return store.state.tickets; },
  get cards() { return store.state.cards; },
  get boards() { return store.state.boards; },
  get board() { return store.state.board; },
  set board(name) {
    store.selectBoard(name);
    S.previews = {};
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
  $('counts').textContent = `${shown} of ${S.tickets.size}`;
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

function chrome() {
  $('storePath').textContent = S.storePath;
  $('roBadge').hidden = !S.readOnly;
  for (const b of ['btnNew', 'btnArrange']) $(b).disabled = S.readOnly;

  const sel = $('boardSelect');
  sel.textContent = '';
  for (const b of S.boards) {
    const o = document.createElement('option');
    o.value = b; o.textContent = b; o.selected = b === S.board;
    sel.appendChild(o);
  }

  const row = $('statusFilters');
  if (row.childElementCount) return;
  for (const st of S.config.statuses) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.style.color = `var(--s-${st})`;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<i class="dot"></i>${st}`;
    b.onclick = () => {
      S.statusFilter.has(st) ? S.statusFilter.delete(st) : S.statusFilter.add(st);
      b.setAttribute('aria-pressed', String(S.statusFilter.has(st)));
      render();
    };
    row.appendChild(b);
  }
}

let toastTimer;
function toast(msg, isErr) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, isErr ? 5200 : 2600);
}

// ------------------------------------------------------------ inspector

function select(id, additive) {
  if (!additive) S.selection.clear();
  if (id) S.selection.add(id);
  S.selected = id;
  render();
  id ? openInspector() : closeInspector();
}

// Inspector controls edit the snapshot they display, not a newer poll result.
function commitTicket(t, ops) {
  return patch(t.id, ops, t.revision).catch(() => {}); // patch reports refusals
}

let inspectorTicket = null, replacingInspector = false;

function openInspector() { $('inspector').classList.add('open'); renderInspector(); }
function closeInspector() {
  $('inspector').classList.remove('open');
  S.selected = null; S.selection.clear(); render();
}

function field(label, control) {
  const d = document.createElement('div');
  d.className = 'field';
  const l = document.createElement('label');
  l.textContent = label;
  d.append(l, control);
  return d;
}

function selectControl(value, options, onChange, blank) {
  const s = document.createElement('select');
  s.className = 'control';
  if (blank) s.appendChild(new Option(blank, ''));
  for (const o of options) s.appendChild(new Option(o, o, false, o === value));
  s.value = value || '';
  s.onchange = () => onChange(s.value);
  s.disabled = S.readOnly;
  return s;
}

function textControl(value, onCommit, multiline) {
  const el = document.createElement(multiline ? 'textarea' : 'input');
  el.className = 'control';
  el.value = value || '';
  el.disabled = S.readOnly;
  // Commit on blur rather than on each keystroke: every write is a file write
  // and a revision bump, and a per-character PATCH would turn one sentence
  // into forty entries of churn in git log.
  el.onblur = () => {
    if (!replacingInspector && el.value !== (value || '')) onCommit(el.value);
  };
  if (!multiline) el.onkeydown = (e) => { if (e.key === 'Enter') el.blur(); };
  return el;
}

function renderInspector(preserveFocus = false) {
  const t = S.tickets.get(S.selected);
  if (!t) return;
  // Refresh the board, but leave the active editor and its revision alone.
  // Removing a focused textarea fires blur and would submit unfinished text.
  const active = document.activeElement;
  if (preserveFocus && inspectorTicket === t.id && $('inspector').contains(active) &&
      active.matches('input:not([type="checkbox"]), textarea')) return;
  inspectorTicket = t.id;
  const body = $('inspBody');
  replacingInspector = true;
  body.textContent = '';
  replacingInspector = false;

  const title = $('fTitle');
  if (document.activeElement !== title) title.value = t.title;
  title.disabled = S.readOnly;
  title.onblur = () => { if (title.value !== t.title) commitTicket(t, [{ op: 'setTitle', title: title.value }]); };

  $('fMeta').textContent =
    `${t.id}  ·  updated ${t.updatedAt.slice(0, 16).replace('T', ' ')}` +
    (t.updatedBy ? ` by ${t.updatedBy}` : '');

  // --- status, with the reason the format requires where it requires one
  const statusRow = document.createElement('div');
  statusRow.className = 'row';
  const allowed = [t.status, ...(S.config.transitions[t.status] || [])];
  statusRow.appendChild(selectControl(t.status, allowed, async (v) => {
    if (v === t.status) return;
    let reason = '';
    if ((S.config.reasonRequired[t.status] || []).includes(v)) {
      reason = prompt(`Moving ${t.short} to ${v} needs a reason:`) || '';
      if (!reason.trim()) { renderInspector(); return; }
    }
    commitTicket(t, [{ op: 'setStatus', status: v, reason }]);
  }));
  body.appendChild(field('Status', statusRow));
  if (t.statusReason) {
    const p = document.createElement('div');
    p.className = 'muted';
    p.textContent = t.statusReason;
    body.lastChild.appendChild(p);
  }

  body.appendChild(field('Type', selectControl(t.type, S.config.types,
    (v) => commitTicket(t, [{ op: 'setType', type: v }]))));
  body.appendChild(field('Priority', selectControl(t.priority, S.config.priorities,
    (v) => commitTicket(t, [{ op: 'setPriority', priority: v }]))));

  body.appendChild(field('Due on', textControl(t.dueOn, (v) =>
    commitTicket(t, [{ op: 'setDueOn', dueOn: v.trim() ? v.trim() : null }]))));

  if (S.config.milestones.length) {
    body.appendChild(field('Milestone', selectControl(t.milestone, S.config.milestones,
      (v) => commitTicket(t, [{ op: 'setMilestone', milestone: v || null }]), '— none —')));
  }

  // --- labels
  const labels = document.createElement('div');
  labels.className = 'row';
  for (const l of t.labels) {
    const b = document.createElement('button');
    b.className = 'chip'; b.style.color = 'var(--ink-dim)';
    b.textContent = l + ' ×';
    b.onclick = () => commitTicket(t, [{ op: 'removeLabel', label: l }]);
    labels.appendChild(b);
  }
  const addLabel = document.createElement('input');
  addLabel.className = 'control'; addLabel.placeholder = 'add label…';
  addLabel.disabled = S.readOnly;
  addLabel.setAttribute('list', 'labelList');
  addLabel.onkeydown = (e) => {
    if (e.key === 'Enter' && addLabel.value.trim()) {
      commitTicket(t, [{ op: 'addLabel', label: addLabel.value.trim() }]);
    }
  };
  labels.appendChild(addLabel);
  const dl = document.createElement('datalist');
  dl.id = 'labelList';
  for (const l of S.config.labels) dl.appendChild(new Option(l, l));
  labels.appendChild(dl);
  body.appendChild(field('Labels', labels));

  // --- assignees
  const who = document.createElement('div');
  who.className = 'row';
  for (const a of t.assignees) {
    const b = document.createElement('button');
    b.className = 'chip'; b.style.color = 'var(--ink-dim)';
    b.textContent = a + ' ×';
    b.onclick = () => commitTicket(t, [{ op: 'unassign', actor: a }]);
    who.appendChild(b);
  }
  const addWho = document.createElement('input');
  addWho.className = 'control'; addWho.placeholder = 'assign…';
  addWho.disabled = S.readOnly;
  addWho.onkeydown = (e) => {
    if (e.key === 'Enter' && addWho.value.trim()) {
      commitTicket(t, [{ op: 'assign', actor: addWho.value.trim() }]);
    }
  };
  who.appendChild(addWho);
  body.appendChild(field('Assignees', who));

  // --- relations
  const rel = document.createElement('div');
  const line = (label, id, onRemove) => {
    const d = document.createElement('div');
    d.className = 'linkline';
    const other = S.tickets.get(id);
    const a = document.createElement('a');
    a.textContent = other ? (other.short || id) : id;
    a.title = id;
    a.onclick = () => { if (other) { select(id); focusOn(id); } };
    const t2 = document.createElement('span');
    t2.className = 't';
    t2.textContent = other ? other.title : '(not in this store)';
    d.append(a, t2);
    if (onRemove && !S.readOnly) {
      const x = document.createElement('button');
      x.textContent = '×'; x.title = `remove ${label}`; x.onclick = onRemove;
      d.appendChild(x);
    }
    return d;
  };

  if (t.parent) rel.appendChild(line('parent', t.parent, () => commitTicket(t, [{ op: 'setParent', parent: null }])));
  else {
    const p = document.createElement('div');
    p.className = 'muted'; p.textContent = 'no parent';
    rel.appendChild(p);
  }
  body.appendChild(field('Parent', rel));

  const deps = document.createElement('div');
  for (const d of t.dependencies) {
    deps.appendChild(line('dependency', d, () => commitTicket(t, [{ op: 'removeDependency', id: d }])));
  }
  if (!t.dependencies.length) {
    const p = document.createElement('div');
    p.className = 'muted';
    p.textContent = 'none — drag a card’s right handle onto another to add one';
    deps.appendChild(p);
  }
  const r = t.readiness || {};
  if (r.missing && r.missing.length) {
    const p = document.createElement('div');
    p.className = 'muted';
    p.style.color = 'var(--danger)';
    p.textContent = 'missing: ' + r.missing.join(', ');
    deps.appendChild(p);
  }
  body.appendChild(field('Depends on', deps));

  if (t.type === 'epic' || t.blocksOn === 'children') {
    body.appendChild(field('Blocks on', selectControl(t.blocksOn, S.config.blocksOn,
      (v) => commitTicket(t, [{ op: 'setBlocksOn', blocksOn: v }]))));
  }

  // --- prose
  body.appendChild(field('Description', textControl(t.body.description,
    (v) => commitTicket(t, [{ op: 'setDescription', text: v }]), true)));
  body.appendChild(field('Implementation plan', textControl(t.body.plan,
    (v) => commitTicket(t, [{ op: 'setPlan', text: v }]), true)));

  body.appendChild(checklist('Acceptance criteria', 'ac', t, t.body.acceptanceCriteria));
  body.appendChild(checklist('Definition of done', 'dod', t, t.body.definitionOfDone));

  body.appendChild(logSection('Notes', t.body.notes, (text) =>
    commitTicket(t, [{ op: 'appendNote', text }])));
  body.appendChild(logSection('Comments', t.body.comments, (text) =>
    commitTicket(t, [{ op: 'appendComment', text }])));

  if (t.body.summary) {
    body.appendChild(field('Summary', textControl(t.body.summary,
      (v) => commitTicket(t, [{ op: 'setSummary', text: v }]), true)));
  }

  const claimBtn = $('btnClaim');
  claimBtn.textContent = t.claim ? 'Release' : 'Claim';
  claimBtn.disabled = S.readOnly;
  claimBtn.onclick = () => commitTicket(t, [t.claim ? { op: 'release' } : { op: 'claim' }]);

  const arch = $('btnArchive');
  arch.textContent = t.archived ? 'Unarchive' : 'Archive';
  arch.disabled = S.readOnly;
  arch.onclick = () => {
    if (t.archived) return commitTicket(t, [{ op: 'unarchive' }]);
    const reason = prompt('Archiving is recorded with a reason:') || '';
    commitTicket(t, [{ op: 'archive', reason }]);
  };
  $('btnDelete').disabled = S.readOnly;
  $('btnDelete').onclick = () => removeTicket(t.id);
}

function checklist(label, section, t, items) {
  const wrap = document.createElement('div');
  items.forEach((it) => {
    const row = document.createElement('div');
    row.className = 'checkitem' + (it.checked ? ' done' : '');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = it.checked; cb.disabled = S.readOnly;
    cb.onchange = () => commitTicket(t, [{ op: 'setChecklistItem', section, index: it.index, checked: cb.checked }]);
    const s = document.createElement('span');
    s.textContent = it.text;
    const x = document.createElement('button');
    x.textContent = '×';
    x.onclick = () => commitTicket(t, [{ op: 'removeChecklistItem', section, index: it.index }]);
    row.append(cb, s);
    if (!S.readOnly) row.appendChild(x);
    wrap.appendChild(row);
  });
  const add = document.createElement('input');
  add.className = 'control';
  add.placeholder = 'add item…';
  add.disabled = S.readOnly;
  add.onkeydown = (e) => {
    if (e.key === 'Enter' && add.value.trim()) {
      commitTicket(t, [{ op: 'addChecklistItem', section, text: add.value.trim() }]);
    }
  };
  wrap.appendChild(add);
  return field(label, wrap);
}

function logSection(label, entries, onAdd) {
  const wrap = document.createElement('div');
  for (const e of entries) {
    const d = document.createElement('div');
    d.className = 'entry';
    const who = document.createElement('div');
    who.className = 'who';
    who.textContent = [e.actor, e.at && e.at.slice(0, 16).replace('T', ' ')].filter(Boolean).join(' · ');
    const what = document.createElement('div');
    what.className = 'what';
    what.textContent = e.text;
    if (who.textContent) d.appendChild(who);
    d.appendChild(what);
    wrap.appendChild(d);
  }
  const add = document.createElement('textarea');
  add.className = 'control';
  add.placeholder = 'add…  (⌘/Ctrl+Enter)';
  add.style.minHeight = '46px';
  add.disabled = S.readOnly;
  add.onkeydown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && add.value.trim()) {
      onAdd(add.value.trim());
      add.value = '';
    }
  };
  wrap.appendChild(add);
  return field(label, wrap);
}

function focusOn(id) {
  const p = posOf(id);
  S.view.x = stage.clientWidth / 2 - 380 / 2 - (p.x + CARD_W / 2) * S.view.k;
  S.view.y = stage.clientHeight / 2 - (p.y + 60) * S.view.k;
  applyView();
}

async function removeTicket(id) {
  const t = S.tickets.get(id), version = placementVersion;
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

let composeAt = null;
function openComposer(clientX, clientY) {
  if (S.readOnly) { toast('read-only', true); return; }
  const r = stage.getBoundingClientRect();
  composeAt = toScene(clientX, clientY);
  const c = $('composer');
  c.hidden = false;
  c.style.left = (clientX - r.left) + 'px';
  c.style.top = (clientY - r.top) + 'px';
  const input = $('composerInput');
  input.value = '';
  input.focus();
}
function closeComposer() { $('composer').hidden = true; composeAt = null; }

$('composerInput').onkeydown = async (e) => {
  if (e.key === 'Escape') return closeComposer();
  if (e.key !== 'Enter') return;
  const title = e.target.value.trim();
  if (!title) return closeComposer();
  const at = composeAt;
  closeComposer();
  try {
    const version = placementVersion;
    const res = await store.create({
      title,
      board: S.board,
      card: { x: Math.round(at.x), y: Math.round(at.y) },
    });
    if (version === placementVersion) { autoPlace(); render(); select(res.ticket.id); }
    toast(res.layoutError ? `Ticket filed; placement failed: ${res.layoutError}` :
      `Filed ${res.ticket.short || res.ticket.id} as draft.`, !!res.layoutError);
  } catch (e) { toast(e.message, true); }
};

// ------------------------------------------------------------- keyboard

document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (e.key === 'Escape') {
    if (!$('composer').hidden) return closeComposer();
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

$('search').oninput = (e) => { S.query = e.target.value; render(); };
$('btnFit').onclick = fit;
$('btnNew').onclick = newTicketCentre;
$('inspClose').onclick = closeInspector;

// Arrange writes the auto-layout down as real placements, which is the one
// place a guess becomes a decision without a drag. It is a button rather than
// a startup behaviour because it overwrites arrangements somebody made.
$('btnArrange').onclick = () => {
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

$('boardSelect').onchange = async (e) => {
  S.board = e.target.value;
  await load();
  fit();
};

$('newBoard').onclick = async () => {
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

load().then(fit).catch((e) => toast('Could not load the store: ' + e.message, true));
