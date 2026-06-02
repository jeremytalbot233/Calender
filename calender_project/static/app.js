// ── State ────────────────────────────────────────────
let allEvents  = [];
let allClasses = [];
let theme      = {};
let hiddenClasses = new Set();
let drawerOpen    = false;
let editingId     = null;
let listFilter    = 'all';
let searchQuery   = '';
let currentWeekStart = getMonday(new Date());

const today = new Date(); today.setHours(0,0,0,0);

const MONTHS = [
  [2026,0,'January'],[2026,1,'February'],[2026,2,'March'],[2026,3,'April'],
  [2026,4,'May'],[2026,5,'June'],[2026,6,'July'],[2026,7,'August'],
  [2026,8,'September'],[2026,9,'October'],[2026,10,'November'],
];

const TERMS = [
  { name:'Term 1', start:new Date(2026,0,27), end:new Date(2026,3,10) },
  { name:'Term 2', start:new Date(2026,3,27), end:new Date(2026,6,3) },
  { name:'Term 3', start:new Date(2026,6,20), end:new Date(2026,8,25) },
  { name:'Term 4', start:new Date(2026,9,12), end:new Date(2026,11,11) },
];

const THEME_PRESETS = [
  { label:'☀️ Warm Paper', values:{ '--bg':'#f4f1eb','--surface':'#fffef9','--border':'#ddd8cc','--text':'#1a1612','--muted':'#7a7060' } },
  { label:'🌙 Dark Mode',  values:{ '--bg':'#1a1a2e','--surface':'#16213e','--border':'#0f3460','--text':'#e0e0e0','--muted':'#888' } },
  { label:'🌿 Forest',     values:{ '--bg':'#e8f0e9','--surface':'#f4faf4','--border':'#b5cbb7','--text':'#1c2e1c','--muted':'#5a7a5a' } },
  { label:'🌊 Ocean',      values:{ '--bg':'#e8f4f8','--surface':'#f4fbff','--border':'#b5d5e5','--text':'#0d2b3e','--muted':'#4a7a9b' } },
  { label:'🌸 Rose',       values:{ '--bg':'#fdf0f3','--surface':'#fff8f9','--border':'#f0c8d0','--text':'#3a1020','--muted':'#9a5060' } },
  { label:'📄 Clean White', values:{ '--bg':'#f5f5f5','--surface':'#ffffff','--border':'#e0e0e0','--text':'#111111','--muted':'#777777' } },
];

// ── Init ─────────────────────────────────────────────
async function init() {
  await Promise.all([loadClasses(), loadTheme()]);
  await loadEvents();
  applyTheme();
  buildLegend();
  buildDrawer();
  render();
  buildThemePresets();
}

// ── API ──────────────────────────────────────────────
async function loadClasses() {
  const res = await fetch('/api/classes');
  allClasses = await res.json();
}

async function loadEvents() {
  const res = await fetch('/api/events');
  allEvents = await res.json();
}

async function loadTheme() {
  const res = await fetch('/api/theme');
  theme = await res.json();
}

function getClass(id) {
  return allClasses.find(c => c.id === id) || { name:'Unknown', color:'#aaa', bg:'#eee' };
}

// ── Render ───────────────────────────────────────────
function render() {
  buildCalendar();
  buildList();
  buildWeek();
  buildDrawer();
  applyHiddenClasses();
  applySearch();
}

function applyHiddenClasses() {
  hiddenClasses.forEach(id => {
    document.querySelectorAll(`.event[data-cls="${id}"]`).forEach(e => e.classList.add('hidden'));
    document.querySelectorAll(`tr[data-cls="${id}"]`).forEach(r => r.classList.add('hidden'));
  });
}

// ── Legend ───────────────────────────────────────────
function buildLegend() {
  const el = document.getElementById('legend');
  el.innerHTML = '<span style="font-size:0.7rem;font-weight:600;letter-spacing:0.07em;text-transform:uppercase;color:var(--muted);margin-right:0.25rem;">Filter:</span>';
  allClasses.filter(c => !c.archived).forEach(c => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.dataset.id = c.id;
    if (hiddenClasses.has(c.id)) item.classList.add('dimmed');
    item.innerHTML = `<span class="dot" style="background:${c.color}"></span>${c.name}`;
    item.onclick = () => toggleClass(c.id, item);
    el.appendChild(item);
  });
}

function toggleClass(id, el) {
  if (hiddenClasses.has(id)) { hiddenClasses.delete(id); el.classList.remove('dimmed'); }
  else { hiddenClasses.add(id); el.classList.add('dimmed'); }
  document.querySelectorAll(`.event[data-cls="${id}"]`).forEach(e => e.classList.toggle('hidden', hiddenClasses.has(id)));
  document.querySelectorAll(`tr[data-cls="${id}"]`).forEach(r => r.classList.toggle('hidden', hiddenClasses.has(id)));
}

// ── Views ────────────────────────────────────────────
function setView(v) {
  document.getElementById('viewCal').style.display  = v === 'cal'  ? 'block' : 'none';
  document.getElementById('viewList').style.display = v === 'list' ? 'block' : 'none';
  document.getElementById('viewWeek').style.display = v === 'week' ? 'block' : 'none';
  document.getElementById('btnCal').classList.toggle('active',  v === 'cal');
  document.getElementById('btnList').classList.toggle('active', v === 'list');
  document.getElementById('btnWeek').classList.toggle('active', v === 'week');
  if (v === 'cal') scrollToCurrentMonth();
}

function scrollToCurrentMonth() {
  const blocks = document.querySelectorAll('.month-block');
  const idx = today.getMonth();
  if (blocks[idx]) setTimeout(() => blocks[idx].scrollIntoView({ behavior:'smooth', block:'start' }), 150);
}

// ── List filter ──────────────────────────────────────
function setListFilter(f) {
  listFilter = f;
  ['All','Upcoming','Past','Done'].forEach(n => {
    document.getElementById('filter'+n).classList.toggle('active', f === n.toLowerCase());
  });
  applyListFilter();
}

function applyListFilter() {
  document.querySelectorAll('#listBody tr').forEach(tr => {
    if (tr.classList.contains('hidden')) return;
    const isPast      = tr.classList.contains('past-row');
    const isCompleted = tr.classList.contains('completed-row');
    let show = true;
    if (listFilter === 'upcoming') show = !isPast && !isCompleted;
    if (listFilter === 'past')     show = isPast;
    if (listFilter === 'done')     show = isCompleted;
    tr.style.display = show ? '' : 'none';
  });
}

// ── Search ───────────────────────────────────────────
function onSearch(val) {
  searchQuery = val.trim().toLowerCase();
  document.getElementById('clearSearch').style.display = searchQuery ? 'inline-block' : 'none';
  applySearch();
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  onSearch('');
}

function applySearch() {
  // Calendar events
  document.querySelectorAll('.event').forEach(el => {
    if (!searchQuery) { el.classList.remove('search-hidden'); return; }
    const matches = el.textContent.toLowerCase().includes(searchQuery);
    el.classList.toggle('search-hidden', !matches);
  });
  // List rows
  document.querySelectorAll('#listBody tr').forEach(tr => {
    if (!searchQuery) { tr.classList.remove('search-hidden'); return; }
    const text = tr.textContent.toLowerCase();
    tr.classList.toggle('search-hidden', !text.includes(searchQuery));
  });
}

// ── Term helpers ─────────────────────────────────────
function getTermInfo(date) {
  for (const t of TERMS) {
    if (date >= t.start && date <= t.end) {
      const off = t.start.getDay() === 0 ? -6 : 1 - t.start.getDay();
      const mon = new Date(t.start.getTime() + off * 86400000);
      return { term: t.name, week: Math.floor((date - mon) / (7*86400000)) + 1 };
    }
  }
  if (date > new Date(2026,3,10) && date < new Date(2026,3,27)) return { holiday:'Autumn Holidays' };
  if (date > new Date(2026,6,3)  && date < new Date(2026,6,20)) return { holiday:'Winter Holidays' };
  if (date > new Date(2026,8,25) && date < new Date(2026,9,12)) return { holiday:'Spring Holidays' };
  return null;
}

// ── Calendar builder ─────────────────────────────────
function buildCalendar() {
  const monthsEl = document.getElementById('months');
  monthsEl.innerHTML = '';

  MONTHS.forEach(([yr, mo, name]) => {
    const monthEvents = allEvents.filter(e => {
      const d = new Date(e.date);
      return d.getFullYear() === yr && d.getMonth() === mo;
    });

    const block = document.createElement('div');
    block.className = 'month-block';

    const watermark = document.createElement('div');
    watermark.className = 'month-name-watermark';
    watermark.textContent = name;
    block.appendChild(watermark);

    const hdr = document.createElement('div');
    hdr.className = 'month-header';
    hdr.innerHTML = `
      <span class="month-name">${name}</span>
      <span class="month-yr">${yr}</span>
      <span class="month-count">${monthEvents.length} due date${monthEvents.length !== 1 ? 's' : ''}</span>
    `;
    block.appendChild(hdr);

    // Term banner
    const termSet = new Map();
    for (let d2 = 1; d2 <= new Date(yr, mo+1, 0).getDate(); d2++) {
      const dd = new Date(yr, mo, d2);
      const info = getTermInfo(dd);
      if (info?.term    && !termSet.has(info.term))    termSet.set(info.term, info);
      if (info?.holiday && !termSet.has(info.holiday)) termSet.set(info.holiday, info);
    }
    if (termSet.size > 0) {
      const banner = document.createElement('div');
      const isHolOnly = [...termSet.values()].every(v => v.holiday);
      banner.className = 'term-banner' + (isHolOnly ? ' holiday' : '');
      banner.innerHTML = [...termSet.keys()].map(k => `<span>${k}</span>`).join(' · ');
      block.appendChild(banner);
    }

    const grid = document.createElement('div');
    grid.className = 'cal-grid';

    ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(d => {
      const lbl = document.createElement('div');
      lbl.className = 'day-label';
      lbl.textContent = d;
      grid.appendChild(lbl);
    });

    let startOffset = new Date(yr, mo, 1).getDay() - 1;
    if (startOffset < 0) startOffset = 6;
    for (let i = 0; i < startOffset; i++) {
      const empty = document.createElement('div');
      empty.className = 'day-cell empty';
      grid.appendChild(empty);
    }

    const daysInMonth = new Date(yr, mo+1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const thisDate = new Date(yr, mo, d);
      const dow = thisDate.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const isToday   = thisDate.getTime() === today.getTime();
      const dateStr   = fmtDate(yr, mo+1, d);

      const cell = document.createElement('div');
      cell.className = 'day-cell' + (isWeekend ? ' weekend' : '') + (isToday ? ' today-cell' : '');
      cell.onclick = (e) => {
        if (e.target === cell ||
            e.target.classList.contains('day-num') ||
            e.target.classList.contains('day-num-inner') ||
            e.target.classList.contains('add-hint') ||
            e.target.classList.contains('week-tag')) {
          openModal(dateStr);
        }
      };

      const numRow = document.createElement('div');
      numRow.className = 'day-num';
      const inner = document.createElement('span');
      inner.className = 'day-num-inner';
      inner.textContent = d;
      const hint = document.createElement('span');
      hint.className = 'add-hint';
      hint.textContent = '+ add';
      numRow.appendChild(inner);
      numRow.appendChild(hint);
      cell.appendChild(numRow);

      if (dow === 1) {
        const info = getTermInfo(thisDate);
        if (info?.term || info?.holiday) {
          const wk = document.createElement('span');
          wk.className = 'week-tag';
          wk.style.fontStyle = info.holiday ? 'italic' : '';
          wk.textContent = info.term ? `${info.term} Wk ${info.week}` : info.holiday;
          cell.appendChild(wk);
        }
      }

      allEvents.filter(e => e.date === dateStr).forEach(ev => {
        cell.appendChild(makeEventChip(ev));
      });

      grid.appendChild(cell);
    }

    block.appendChild(grid);
    monthsEl.appendChild(block);
  });

  // Print legend
  buildPrintLegend();
}

function makeEventChip(ev) {
  const cls = getClass(ev.cls);
  const el = document.createElement('div');
  el.className = 'event' + (ev.type === 'formative' ? ' formative' : '') + (ev.completed ? ' completed-event' : '');
  el.dataset.cls = ev.cls;
  el.style.background = cls.bg;
  el.style.color = cls.color;
  el.textContent = ev.title;
  el.title = `${cls.name} — ${ev.type}${ev.completed ? ' ✓' : ''} (click to edit)`;
  el.onclick = (e) => { e.stopPropagation(); openModal('', ev); };
  return el;
}

function buildPrintLegend() {
  const el = document.getElementById('printLegend');
  el.innerHTML = '';
  allClasses.filter(c => !c.archived).forEach(c => {
    el.innerHTML += `<div class="print-legend-item"><div class="print-legend-dot" style="background:${c.bg};-webkit-print-color-adjust:exact;print-color-adjust:exact;"></div>${c.name}</div>`;
  });
}

// ── Week view ────────────────────────────────────────
function getMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0,0,0,0);
  return dt;
}

function buildWeek() {
  const grid = document.getElementById('weekGrid');
  grid.innerHTML = '';
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  for (let i = 0; i < 7; i++) {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    const dateStr = fmtDate(d.getFullYear(), d.getMonth()+1, d.getDate());
    const isToday   = d.getTime() === today.getTime();
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;

    const col = document.createElement('div');
    col.className = 'week-col';

    const hdr = document.createElement('div');
    hdr.className = 'week-col-header' + (isToday ? ' today-col' : '') + (isWeekend ? ' weekend-col' : '');
    hdr.innerHTML = `<div>${days[i]}</div><div style="font-size:1rem;font-weight:700;">${d.getDate()}</div>`;
    hdr.style.cursor = 'pointer';
    hdr.onclick = () => openModal(dateStr);
    col.appendChild(hdr);

    const body = document.createElement('div');
    body.className = 'week-col-body';

    allEvents.filter(e => e.date === dateStr).forEach(ev => {
      body.appendChild(makeEventChip(ev));
    });

    col.appendChild(body);
    grid.appendChild(col);
  }

  // Update week title
  const end = new Date(currentWeekStart);
  end.setDate(end.getDate() + 6);
  document.getElementById('weekTitle').textContent =
    currentWeekStart.toLocaleDateString('en-AU', { day:'numeric', month:'short' }) + ' – ' +
    end.toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' });
}

function prevWeek() { currentWeekStart.setDate(currentWeekStart.getDate() - 7); buildWeek(); }
function nextWeek() { currentWeekStart.setDate(currentWeekStart.getDate() + 7); buildWeek(); }
function goToday()  { currentWeekStart = getMonday(new Date()); buildWeek(); }

// ── List builder ─────────────────────────────────────
function buildList() {
  const tbody = document.getElementById('listBody');
  tbody.innerHTML = '';
  [...allEvents].sort((a,b) => a.date.localeCompare(b.date)).forEach(ev => {
    const d = new Date(ev.date);
    const cls = getClass(ev.cls);
    const tr = document.createElement('tr');
    tr.dataset.cls = ev.cls;
    const isPast = d < today && !ev.completed;
    if (ev.completed) tr.className = 'completed-row';
    else if (isPast)  tr.className = 'past-row';
    const dateStr = d.toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' });
    tr.innerHTML = `
      <td><span style="font-family:var(--font-mono),monospace;font-size:0.8rem;">${dateStr}</span></td>
      <td>${ev.title}${ev.notes ? `<br><span style="font-size:0.7rem;color:var(--muted);">${ev.notes}</span>` : ''}</td>
      <td><span class="pill" style="background:${cls.bg};color:${cls.color};">${cls.name}</span></td>
      <td><span class="type-tag">${ev.type}</span></td>
      <td><span style="font-size:0.75rem;">${ev.completed ? '✓ Done' : ''}</span></td>
      <td class="no-print">
        <button class="btn" style="padding:0.2rem 0.6rem;font-size:0.72rem;"
          onclick="openModal('',${JSON.stringify(ev).replace(/"/g,'&quot;')})">Edit</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  applyListFilter();
}

// ── Drawer ───────────────────────────────────────────
function toggleDrawer() {
  drawerOpen = !drawerOpen;
  document.getElementById('drawer').classList.toggle('open', drawerOpen);
  document.getElementById('mainContent').classList.toggle('drawer-open', drawerOpen);
  const toggle = document.getElementById('drawerToggle');
  toggle.classList.toggle('open', drawerOpen);
  toggle.textContent = drawerOpen ? '⟶ Upcoming' : '⟵ Upcoming';
}

function buildDrawer() {
  const body = document.getElementById('drawerBody');
  body.innerHTML = '';
  allClasses.filter(c => !c.archived).forEach(c => {
    const upcoming = allEvents
      .filter(e => e.cls === c.id && !e.completed && new Date(e.date) >= today)
      .sort((a,b) => a.date.localeCompare(b.date))[0];

    const card = document.createElement('div');
    card.className = 'upcoming-card';

    const hdr = document.createElement('div');
    hdr.className = 'upcoming-card-header';
    hdr.style.background = c.bg;
    hdr.style.color = c.color;
    hdr.innerHTML = `<span class="dot" style="background:${c.color}"></span><span>${c.name}</span>`;
    card.appendChild(hdr);

    if (!upcoming) {
      const none = document.createElement('div');
      none.className = 'upcoming-none';
      none.textContent = 'No upcoming events';
      card.appendChild(none);
    } else {
      const daysUntil = Math.round((new Date(upcoming.date) - today) / 86400000);
      const daysLabel = daysUntil === 0 ? 'Today!' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil}d away`;
      const daysClass = daysUntil <= 3 ? 'very-soon' : daysUntil <= 7 ? 'soon' : 'ok';
      const dateFormatted = new Date(upcoming.date).toLocaleDateString('en-AU', { day:'numeric', month:'short' });
      const cardBody = document.createElement('div');
      cardBody.className = 'upcoming-card-body';
      cardBody.innerHTML = `
        <div class="upcoming-title">${upcoming.title}</div>
        <div class="upcoming-meta">
          <span class="upcoming-date">${dateFormatted}</span>
          <span class="upcoming-days ${daysClass}">${daysLabel}</span>
          <span class="upcoming-type">${upcoming.type}</span>
        </div>
      `;
      cardBody.onclick = () => openModal('', upcoming);
      card.appendChild(cardBody);
    }
    body.appendChild(card);
  });
}

// ── Event Modal ──────────────────────────────────────
function openModal(prefillDate='', event=null) {
  editingId = event ? event.id : null;
  document.getElementById('modalTitle').textContent = event ? 'Edit Event' : 'Add Event';
  document.getElementById('fDate').value    = event ? event.date  : prefillDate;
  document.getElementById('fTitle').value   = event ? event.title : '';
  document.getElementById('fType').value    = event ? event.type  : 'assignment';
  document.getElementById('fNotes').value   = event ? (event.notes || '') : '';
  document.getElementById('fRecur').value   = 'none';
  document.getElementById('fRecurEnd').value = '';
  toggleRecurEnd();

  // Populate class dropdown
  const fCls = document.getElementById('fCls');
  fCls.innerHTML = '';
  allClasses.filter(c => !c.archived).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    if (event && event.cls === c.id) opt.selected = true;
    fCls.appendChild(opt);
  });
  if (!event && allClasses.length) fCls.value = allClasses.find(c => !c.archived)?.id;

  document.getElementById('deleteBtn').style.display    = event ? 'inline-block' : 'none';
  document.getElementById('duplicateBtn').style.display = event ? 'inline-block' : 'none';
  document.getElementById('completeBtn').style.display  = event ? 'inline-block' : 'none';
  if (event) {
    document.getElementById('completeBtn').textContent = event.completed ? '↩ Undo Done' : '✓ Done';
  }

  document.getElementById('modalBackdrop').classList.remove('hidden');
}

function closeModal() { document.getElementById('modalBackdrop').classList.add('hidden'); }
function closeModalOnBackdrop(e) { if (e.target === document.getElementById('modalBackdrop')) closeModal(); }

function toggleRecurEnd() {
  const val = document.getElementById('fRecur').value;
  document.getElementById('recurEndField').style.display = val === 'none' ? 'none' : 'block';
}

async function saveEvent() {
  const payload = {
    date:      document.getElementById('fDate').value,
    title:     document.getElementById('fTitle').value.trim(),
    cls:       parseInt(document.getElementById('fCls').value),
    type:      document.getElementById('fType').value,
    notes:     document.getElementById('fNotes').value.trim(),
    recur:     document.getElementById('fRecur').value,
    recur_end: document.getElementById('fRecurEnd').value,
  };
  if (!payload.date || !payload.title) { alert('Please fill in date and title.'); return; }
  if (editingId) {
    await fetch(`/api/events/${editingId}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
    });
  } else {
    await fetch('/api/events', {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
    });
  }
  closeModal();
  await loadEvents();
  render();
}

async function deleteEvent() {
  if (!editingId || !confirm('Delete this event?')) return;
  await fetch(`/api/events/${editingId}`, { method:'DELETE' });
  closeModal();
  await loadEvents();
  render();
}

async function duplicateEvent() {
  if (!editingId) return;
  await fetch(`/api/events/${editingId}/duplicate`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ date: document.getElementById('fDate').value })
  });
  closeModal();
  await loadEvents();
  render();
}

async function toggleComplete() {
  if (!editingId) return;
  const ev = allEvents.find(e => e.id === editingId);
  if (!ev) return;
  await fetch(`/api/events/${editingId}`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ ...ev, completed: !ev.completed })
  });
  closeModal();
  await loadEvents();
  render();
}

// ── Class Manager ─────────────────────────────────────
function openClassModal() {
  buildClassList();
  document.getElementById('classModalBackdrop').classList.remove('hidden');
}
function closeClassModal() {
  document.getElementById('classModalBackdrop').classList.add('hidden');
  buildLegend();
  render();
}
function closeClassModalOnBackdrop(e) { if (e.target === document.getElementById('classModalBackdrop')) closeClassModal(); }

function buildClassList() {
  const el = document.getElementById('classListEl');
  el.innerHTML = '';
  allClasses.forEach(c => {
    const row = document.createElement('div');
    row.className = 'class-row' + (c.archived ? ' archived-row' : '');
    row.innerHTML = `
      <span class="dot" style="background:${c.color};width:12px;height:12px;border-radius:50%;flex-shrink:0;"></span>
      <input type="text" value="${c.name}" id="cname-${c.id}" style="flex:1;">
      <input type="color" value="${rgbToHex(c.color)}" id="ccolor-${c.id}" title="Text colour">
      <input type="color" value="${rgbToHex(c.bg)}" id="cbg-${c.id}" title="Background colour">
      <button class="btn" onclick="saveClassRow(${c.id})" style="padding:0.2rem 0.5rem;font-size:0.72rem;">Save</button>
      <button class="btn" onclick="archiveClass(${c.id})" style="padding:0.2rem 0.5rem;font-size:0.72rem;" title="${c.archived ? 'Restore' : 'Archive'}">${c.archived ? '↩' : '📦'}</button>
      <button class="btn danger" onclick="deleteClass(${c.id})" style="padding:0.2rem 0.5rem;font-size:0.72rem;" title="Delete class">🗑</button>
    `;
    el.appendChild(row);
  });
}

async function saveClassRow(id) {
  const name  = document.getElementById(`cname-${id}`).value.trim();
  const color = hexToRgb(document.getElementById(`ccolor-${id}`).value);
  const bg    = hexToRgb(document.getElementById(`cbg-${id}`).value);
  await fetch(`/api/classes/${id}`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ name, color, bg })
  });
  await loadClasses();
  buildClassList();
}

async function archiveClass(id) {
  const c = allClasses.find(x => x.id === id);
  await fetch(`/api/classes/${id}`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ archived: !c.archived })
  });
  await loadClasses();
  buildClassList();
}

async function deleteClass(id) {
  if (!confirm('Delete this class and ALL its events? This cannot be undone.')) return;
  await fetch(`/api/classes/${id}`, { method:'DELETE' });
  await loadClasses();
  await loadEvents();
  buildClassList();
}

async function addClass() {
  const name  = document.getElementById('newClassName').value.trim();
  const color = hexToRgb(document.getElementById('newClassColor').value);
  const bg    = hexToRgb(document.getElementById('newClassBg').value);
  if (!name) { alert('Please enter a class name.'); return; }
  await fetch('/api/classes', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ name, color, bg })
  });
  document.getElementById('newClassName').value = '';
  await loadClasses();
  buildClassList();
}

// ── Theme ────────────────────────────────────────────
function openThemeModal() {
  // Set colour pickers to current values
  ['--bg','--surface','--border','--text','--muted'].forEach(k => {
    const el = document.getElementById('t'+k);
    if (el) el.value = rgbOrHexToHex(theme[k] || getComputedStyle(document.documentElement).getPropertyValue(k).trim());
  });
  ['--font-body','--font-heading','--font-mono'].forEach(k => {
    const el = document.getElementById('t'+k);
    if (el) el.value = (theme[k] || '').trim().replace(/'/g,'');
  });
  document.getElementById('themeModalBackdrop').classList.remove('hidden');
}

function closeThemeModal() {
  document.getElementById('themeModalBackdrop').classList.add('hidden');
  applyTheme(); // revert any unsaved live changes
}

function closeThemeModalOnBackdrop(e) { if (e.target === document.getElementById('themeModalBackdrop')) closeThemeModal(); }

function liveTheme(key, value) {
  if (key.startsWith('--font')) {
    document.documentElement.style.setProperty(key, value);
  } else {
    document.documentElement.style.setProperty(key, value);
  }
}

async function saveTheme() {
  const updates = {};
  ['--bg','--surface','--border','--text','--muted'].forEach(k => {
    const el = document.getElementById('t'+k);
    if (el) updates[k] = el.value;
  });
  ['--font-body','--font-heading','--font-mono'].forEach(k => {
    const el = document.getElementById('t'+k);
    if (el) updates[k] = el.value;
  });
  await fetch('/api/theme', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(updates)
  });
  await loadTheme();
  applyTheme();
  closeThemeModal();
}

async function resetTheme() {
  if (!confirm('Reset to default theme?')) return;
  const defaults = {
    '--bg':'#f4f1eb','--surface':'#fffef9','--border':'#ddd8cc',
    '--text':'#1a1612','--muted':'#7a7060',
    '--font-body':'DM Sans','--font-heading':'DM Serif Display','--font-mono':'DM Mono'
  };
  await fetch('/api/theme', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(defaults)
  });
  await loadTheme();
  applyTheme();
  openThemeModal();
}

function applyTheme() {
  Object.entries(theme).forEach(([k, v]) => {
    document.documentElement.style.setProperty(k, v);
  });
}

function buildThemePresets() {
  const el = document.getElementById('themePresets');
  if (!el) return;
  THEME_PRESETS.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'theme-preset';
    btn.textContent = p.label;
    btn.onclick = () => {
      Object.entries(p.values).forEach(([k, v]) => {
        document.documentElement.style.setProperty(k, v);
        const input = document.getElementById('t'+k);
        if (input) input.value = rgbOrHexToHex(v);
      });
    };
    el.appendChild(btn);
  });
}

// ── Helpers ──────────────────────────────────────────
function fmtDate(y, m, d) {
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function rgbToHex(rgb) {
  if (!rgb) return '#000000';
  if (rgb.startsWith('#')) return rgb;
  const m = rgb.match(/\d+/g);
  if (!m || m.length < 3) return '#000000';
  return '#' + m.slice(0,3).map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgb(${r},${g},${b})`;
}

function rgbOrHexToHex(val) {
  if (!val) return '#000000';
  return rgbToHex(val.trim());
}

// ── Boot ─────────────────────────────────────────────
init();
