// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
let allEvents    = [];
let allClasses   = [];
let allNotes     = [];
let allTemplates = [];
let theme        = {};
let hiddenClasses    = new Set();
let drawerOpen       = false;
let gradingOpen      = false;
let drawerOverlay    = null;
let editingId        = null;
let editingNoteId    = null;
let listFilter       = 'all';
let searchQuery      = '';
let currentWeekStart = getMonday(new Date());
let selectedIds      = new Set();
const undoStack      = [];
const MAX_UNDO       = 10;
let dragEventId      = null;

const today = new Date(); today.setHours(0,0,0,0);

const MONTHS = [];
const TERMS  = [];

const THEME_PRESETS = [
  { label:'☀️ Warm Paper', values:{ '--bg':'#f4f1eb','--surface':'#fffef9','--border':'#ddd8cc','--text':'#1a1612','--muted':'#7a7060' } },
  { label:'🌙 Dark Mode',  values:{ '--bg':'#1a1a2e','--surface':'#16213e','--border':'#0f3460','--text':'#e0e0e0','--muted':'#888' } },
  { label:'🌿 Forest',     values:{ '--bg':'#e8f0e9','--surface':'#f4faf4','--border':'#b5cbb7','--text':'#1c2e1c','--muted':'#5a7a5a' } },
  { label:'🌊 Ocean',      values:{ '--bg':'#e8f4f8','--surface':'#f4fbff','--border':'#b5d5e5','--text':'#0d2b3e','--muted':'#4a7a9b' } },
  { label:'🌸 Rose',       values:{ '--bg':'#fdf0f3','--surface':'#fff8f9','--border':'#f0c8d0','--text':'#3a1020','--muted':'#9a5060' } },
  { label:'📄 Clean White', values:{ '--bg':'#f5f5f5','--surface':'#ffffff','--border':'#e0e0e0','--text':'#111111','--muted':'#777777' } },
];

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
async function init() {
  await Promise.all([loadClasses(), loadTheme(), loadNotes(), loadTemplates()]);
  await loadEvents();
  applyTheme();
  applyYearSettings();
  buildLegend();
  buildDrawer();
  buildGradingPanel();
  render();
  buildThemePresets();
  setupOverlay();
  setupKeyboardShortcuts();
}

function setupOverlay() {
  drawerOverlay = document.createElement('div');
  drawerOverlay.id = 'drawerOverlay';
  drawerOverlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:49;';
  drawerOverlay.onclick = () => {
    if (drawerOpen)  toggleDrawer();
    if (gradingOpen) toggleGrading();
  };
  document.body.appendChild(drawerOverlay);
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      undoLast();
    }
    if (e.key === 'Escape') {
      clearSelection();
    }
  });
}

// ══════════════════════════════════════════
// API LOADERS
// ══════════════════════════════════════════
async function loadClasses()   { const r = await fetch('/api/classes');   allClasses   = await r.json(); }
async function loadEvents()    { const r = await fetch('/api/events');    allEvents    = await r.json(); }
async function loadNotes()     { const r = await fetch('/api/notes');     allNotes     = await r.json(); }
async function loadTemplates() { const r = await fetch('/api/templates'); allTemplates = await r.json(); }
async function loadTheme()     { const r = await fetch('/api/theme');     theme        = await r.json(); }

function getClass(id) {
  return allClasses.find(c => c.id === id) || { name:'Unknown', color:'#aaa', bg:'#eee' };
}

// ══════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════
function render() {
  document.getElementById('months').innerHTML   = '';
  document.getElementById('listBody').innerHTML = '';
  buildCalendar();
  buildList();
  buildWeek();
  buildDrawer();
  buildGradingPanel();
  applyHiddenClasses();
  applySearch();
  attachDropHandlers();
}

function applyHiddenClasses() {
  hiddenClasses.forEach(id => {
    document.querySelectorAll(`.event[data-cls="${id}"]`).forEach(e => e.classList.add('hidden'));
    document.querySelectorAll(`tr[data-cls="${id}"]`).forEach(r => r.classList.add('hidden'));
  });
}

// ══════════════════════════════════════════
// LEGEND
// ══════════════════════════════════════════
function buildLegend() {
  const el = document.getElementById('legend');
  el.innerHTML = '<span style="font-size:0.7rem;font-weight:600;letter-spacing:0.07em;text-transform:uppercase;color:var(--muted);margin-right:0.25rem;">Filter:</span>';
  allClasses.filter(c => !c.archived).forEach(c => {
    const item = document.createElement('div');
    item.className = 'legend-item' + (hiddenClasses.has(c.id) ? ' dimmed' : '');
    item.dataset.id = c.id;
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

// ══════════════════════════════════════════
// VIEWS
// ══════════════════════════════════════════
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
  const year = parseInt(theme['cal-year'] || '2026');
  const blocks = document.querySelectorAll('.month-block');
  if (year === today.getFullYear()) {
    const idx = today.getMonth();
    if (blocks[idx]) setTimeout(() => blocks[idx].scrollIntoView({ behavior:'smooth', block:'start' }), 150);
  } else {
    if (blocks[0]) setTimeout(() => blocks[0].scrollIntoView({ behavior:'smooth', block:'start' }), 150);
  }
}

// ══════════════════════════════════════════
// SEARCH
// ══════════════════════════════════════════
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
  document.querySelectorAll('.event').forEach(el => {
    if (!searchQuery) { el.classList.remove('search-hidden'); return; }
    el.classList.toggle('search-hidden', !el.textContent.toLowerCase().includes(searchQuery));
  });
  document.querySelectorAll('#listBody tr').forEach(tr => {
    if (!searchQuery) { tr.classList.remove('search-hidden'); return; }
    tr.classList.toggle('search-hidden', !tr.textContent.toLowerCase().includes(searchQuery));
  });
}

// ══════════════════════════════════════════
// LIST FILTER
// ══════════════════════════════════════════
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

// ══════════════════════════════════════════
// TERM HELPERS
// ══════════════════════════════════════════
function getTermInfo(date) {
  for (const t of TERMS) {
    if (date >= t.start && date <= t.end) {
      const off = t.start.getDay() === 0 ? -6 : 1 - t.start.getDay();
      const mon = new Date(t.start.getTime() + off * 86400000);
      return { term: t.name, week: Math.floor((date - mon) / (7*86400000)) + 1 };
    }
  }
  // Holidays between terms
  for (let i = 0; i < TERMS.length - 1; i++) {
    if (date > TERMS[i].end && date < TERMS[i+1].start) {
      return { holiday: 'School Holidays' };
    }
  }
  return null;
}

function fmtDate(y, m, d) {
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

// ══════════════════════════════════════════
// EVENT CHIP
// ══════════════════════════════════════════
function makeEventChip(ev) {
  const cls = getClass(ev.cls);
  const el  = document.createElement('div');
  el.className = 'event' +
    (ev.type === 'formative' ? ' formative' : '') +
    (ev.completed ? ' completed-event' : '') +
    (selectedIds.has(ev.id) ? ' selected' : '');
  el.dataset.cls = ev.cls;
  el.style.background = cls.bg;
  el.style.color = cls.color;
  el.textContent = ev.title;
  el.title = `${cls.name} — ${ev.type}${ev.completed ? ' ✓' : ''} (click to edit)`;
  el.draggable = true;

  el.addEventListener('dragstart', (e) => {
    dragEventId = ev.id;
    el.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
  });
  el.addEventListener('dragend', () => {
    el.style.opacity = '';
    dragEventId = null;
    document.querySelectorAll('.day-cell').forEach(c => c.classList.remove('drag-over'));
  });

  el.onclick = (e) => {
    e.stopPropagation();
    if (e.shiftKey || selectedIds.size > 0) {
      toggleSelectEvent(ev.id, el);
    } else {
      openModal('', ev);
    }
  };
  return el;
}

function makeNoteChip(note) {
  const el = document.createElement('button');
  el.className = 'grading-note' + (note.completed ? ' note-done' : '');
  el.innerHTML = `<span class="note-icon">📋</span>${note.text}`;
  el.title = 'Grading note (click to edit)';
  el.onclick = (e) => { e.stopPropagation(); openNoteModal(note.date, note); };
  return el;
}

// ══════════════════════════════════════════
// CALENDAR BUILDER
// ══════════════════════════════════════════
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
      <span class="month-count">${monthEvents.length} due date${monthEvents.length !== 1 ? 's' : ''}</span>`;
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
      const thisDate  = new Date(yr, mo, d);
      const dow       = thisDate.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const isToday   = thisDate.getTime() === today.getTime();
      const dateStr   = fmtDate(yr, mo+1, d);

      const cell = document.createElement('div');
      cell.className = 'day-cell' + (isWeekend ? ' weekend' : '') + (isToday ? ' today-cell' : '');
      cell.dataset.date = dateStr;

      cell.onclick = (e) => {
        if (e.target === cell ||
            e.target.classList.contains('day-num') ||
            e.target.classList.contains('day-num-inner') ||
            e.target.classList.contains('add-hint') ||
            e.target.classList.contains('week-tag')) {
          if (selectedIds.size > 0) clearSelection();
          else openModal(dateStr);
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

      allEvents.filter(e => e.date === dateStr).forEach(ev => cell.appendChild(makeEventChip(ev)));
      allNotes.filter(n => n.date === dateStr).forEach(note => cell.appendChild(makeNoteChip(note)));

      grid.appendChild(cell);
    }

    block.appendChild(grid);
    monthsEl.appendChild(block);
  });

  buildPrintLegend();
}

function buildPrintLegend() {
  const el = document.getElementById('printLegend');
  if (!el) return;
  el.innerHTML = '';
  allClasses.filter(c => !c.archived).forEach(c => {
    el.innerHTML += `<div class="print-legend-item"><div class="print-legend-dot" style="background:${c.bg};-webkit-print-color-adjust:exact;print-color-adjust:exact;"></div>${c.name}</div>`;
  });
}

// ══════════════════════════════════════════
// WEEK VIEW
// ══════════════════════════════════════════
function getMonday(d) {
  const dt = new Date(d); dt.setHours(0,0,0,0);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return dt;
}

function buildWeek() {
  const grid = document.getElementById('weekGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  for (let i = 0; i < 7; i++) {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    const dateStr   = fmtDate(d.getFullYear(), d.getMonth()+1, d.getDate());
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
    allEvents.filter(e => e.date === dateStr).forEach(ev => body.appendChild(makeEventChip(ev)));
    allNotes.filter(n => n.date === dateStr).forEach(note => body.appendChild(makeNoteChip(note)));
    col.appendChild(body);
    grid.appendChild(col);
  }

  const end = new Date(currentWeekStart);
  end.setDate(end.getDate() + 6);
  const titleEl = document.getElementById('weekTitle');
  if (titleEl) titleEl.textContent =
    currentWeekStart.toLocaleDateString('en-AU', { day:'numeric', month:'short' }) + ' – ' +
    end.toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' });
}

function prevWeek() { currentWeekStart.setDate(currentWeekStart.getDate() - 7); buildWeek(); }
function nextWeek() { currentWeekStart.setDate(currentWeekStart.getDate() + 7); buildWeek(); }
function goToday()  { currentWeekStart = getMonday(new Date()); buildWeek(); }

// ══════════════════════════════════════════
// LIST BUILDER
// ══════════════════════════════════════════
function buildList() {
  const tbody = document.getElementById('listBody');
  tbody.innerHTML = '';
  [...allEvents].sort((a,b) => a.date.localeCompare(b.date)).forEach(ev => {
    const d   = new Date(ev.date);
    const cls = getClass(ev.cls);
    const tr  = document.createElement('tr');
    tr.dataset.cls = ev.cls;
    if (ev.completed) tr.className = 'completed-row';
    else if (d < today) tr.className = 'past-row';
    const dateStr = d.toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' });
    tr.innerHTML = `
      <td><span style="font-family:var(--font-mono),monospace;font-size:0.8rem;">${dateStr}</span></td>
      <td>${ev.title}${ev.notes ? `<br><span style="font-size:0.7rem;color:var(--muted);">${ev.notes}</span>` : ''}</td>
      <td><span class="pill" style="background:${cls.bg};color:${cls.color};">${cls.name}</span></td>
      <td><span class="type-tag">${ev.type}</span></td>
      <td><span style="font-size:0.75rem;">${ev.completed ? '✓' : ''}</span></td>
      <td class="no-print">
        <button class="btn" style="padding:0.2rem 0.6rem;font-size:0.72rem;"
          onclick="openModal('',${JSON.stringify(ev).replace(/"/g,'&quot;')})">Edit</button>
      </td>`;
    tbody.appendChild(tr);
  });
  applyListFilter();
}

// ══════════════════════════════════════════
// DRAWERS
// ══════════════════════════════════════════
function toggleDrawer() {
  drawerOpen = !drawerOpen;
  document.getElementById('drawer').classList.toggle('open', drawerOpen);
  document.getElementById('mainContent').classList.toggle('drawer-open', drawerOpen);
  const toggle = document.getElementById('drawerToggle');
  toggle.classList.toggle('open', drawerOpen);
  toggle.textContent = drawerOpen ? '⟶ Upcoming' : '⟵ Upcoming';
  if (drawerOverlay) drawerOverlay.style.display = (drawerOpen || gradingOpen) ? 'block' : 'none';
}

function toggleGrading() {
  gradingOpen = !gradingOpen;
  document.getElementById('gradingDrawer').classList.toggle('open', gradingOpen);
  if (drawerOverlay) drawerOverlay.style.display = (drawerOpen || gradingOpen) ? 'block' : 'none';
}

function buildDrawer() {
  const body = document.getElementById('drawerBody');
  if (!body) return;
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
        </div>`;
      cardBody.onclick = () => openModal('', upcoming);
      card.appendChild(cardBody);
    }
    body.appendChild(card);
  });
}

// ══════════════════════════════════════════
// GRADING PANEL
// ══════════════════════════════════════════
function buildGradingPanel() {
  const body = document.getElementById('gradingBody');
  if (!body) return;
  body.innerHTML = '';

  const todayStr = fmtDate(today.getFullYear(), today.getMonth()+1, today.getDate());
  const upcoming = allNotes.filter(n => !n.completed && n.date >= todayStr);
  const past     = allNotes.filter(n => !n.completed && n.date <  todayStr);
  const done     = allNotes.filter(n => n.completed);

  if (!allNotes.length) {
    body.innerHTML = '<p class="grading-empty">No grading notes yet. Use the 📋 Add Grading Note button.</p>';
    return;
  }

  function renderGroup(label, notes, isPast) {
    if (!notes.length) return;
    const byDate = {};
    notes.forEach(n => { if (!byDate[n.date]) byDate[n.date] = []; byDate[n.date].push(n); });

    const sec = document.createElement('div');
    sec.style.marginBottom = '1.25rem';
    const secLabel = document.createElement('p');
    secLabel.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted);margin-bottom:0.5rem;';
    secLabel.textContent = label;
    sec.appendChild(secLabel);

    Object.keys(byDate).sort().forEach(date => {
      const group = document.createElement('div');
      group.className = 'grading-date-group';

      const dateLabel = document.createElement('div');
      dateLabel.className = 'grading-date-label' + (isPast ? ' past-label' : '');
      dateLabel.textContent = new Date(date).toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' });
      group.appendChild(dateLabel);

      byDate[date].forEach(note => {
        const item = document.createElement('div');
        item.className = 'grading-item' + (note.completed ? ' done-item' : '');

        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = note.completed;
        cb.onclick = async (e) => {
          e.stopPropagation();
          await fetch(`/api/notes/${note.id}`, {
            method:'PUT', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ completed: cb.checked })
          });
          await loadNotes(); buildGradingPanel(); buildCalendar();
          applyHiddenClasses(); applySearch();
        };

        const text = document.createElement('span');
        text.className = 'grading-item-text';
        text.textContent = note.text;

        const editBtn = document.createElement('span');
        editBtn.className = 'grading-item-edit';
        editBtn.textContent = '✏️';
        editBtn.onclick = () => openNoteModal(note.date, note);

        item.appendChild(cb); item.appendChild(text); item.appendChild(editBtn);
        group.appendChild(item);
      });
      sec.appendChild(group);
    });
    body.appendChild(sec);
  }

  renderGroup('Upcoming', upcoming, false);
  renderGroup('Overdue', past, true);
  renderGroup('Completed', done, false);
}

// ══════════════════════════════════════════
// EVENT MODAL
// ══════════════════════════════════════════
function openModal(prefillDate='', event=null) {
  editingId = event ? event.id : null;
  document.getElementById('modalTitle').textContent = event ? 'Edit Event' : 'Add Event';
  document.getElementById('fDate').value  = event ? event.date  : prefillDate;
  document.getElementById('fTitle').value = event ? event.title : '';
  document.getElementById('fType').value  = event ? event.type  : 'assignment';
  document.getElementById('fNotes').value = event ? (event.notes || '') : '';
  document.getElementById('fRecur').value = 'none';
  document.getElementById('fRecurEnd').value = '';
  toggleRecurEnd();

  const fCls = document.getElementById('fCls');
  fCls.innerHTML = '';
  allClasses.filter(c => !c.archived).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id; opt.textContent = c.name;
    if (event && event.cls === c.id) opt.selected = true;
    fCls.appendChild(opt);
  });
  if (!event && allClasses.length) fCls.value = allClasses.find(c => !c.archived)?.id;

  document.getElementById('deleteBtn').style.display    = event ? 'inline-block' : 'none';
  document.getElementById('duplicateBtn').style.display = event ? 'inline-block' : 'none';
  document.getElementById('completeBtn').style.display  = event ? 'inline-block' : 'none';
  if (event) document.getElementById('completeBtn').textContent = event.completed ? '↩ Undo Done' : '✓ Done';

  populateTemplatePicker();
  document.getElementById('templatePicker').value = '';
  document.getElementById('modalBackdrop').classList.remove('hidden');
}

function closeModal() { document.getElementById('modalBackdrop').classList.add('hidden'); }
function closeModalOnBackdrop(e) { if (e.target === document.getElementById('modalBackdrop')) closeModal(); }

function toggleRecurEnd() {
  document.getElementById('recurEndField').style.display =
    document.getElementById('fRecur').value === 'none' ? 'none' : 'block';
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
    const ev = allEvents.find(e => e.id === editingId);
    if (ev) pushUndo({ type:'edit', snapshot:{ ...ev } });
    await fetch(`/api/events/${editingId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
  } else {
    await fetch('/api/events', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
  }
  closeModal(); await loadEvents(); render();
}

async function deleteEvent() {
  if (!editingId || !confirm('Delete this event?')) return;
  const ev = allEvents.find(e => e.id === editingId);
  if (ev) pushUndo({ type:'delete_single', snapshot:{ ...ev } });
  await fetch(`/api/events/${editingId}`, { method:'DELETE' });
  closeModal(); await loadEvents(); render();
}

async function duplicateEvent() {
  if (!editingId) return;
  await fetch(`/api/events/${editingId}/duplicate`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ date: document.getElementById('fDate').value })
  });
  closeModal(); await loadEvents(); render();
}

async function toggleComplete() {
  if (!editingId) return;
  const ev = allEvents.find(e => e.id === editingId);
  if (!ev) return;
  pushUndo({ type:'edit', snapshot:{ ...ev } });
  await fetch(`/api/events/${editingId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...ev, completed:!ev.completed }) });
  closeModal(); await loadEvents(); render();
}

// ══════════════════════════════════════════
// NOTE MODAL
// ══════════════════════════════════════════
function openNoteModal(prefillDate='', note=null) {
  editingNoteId = note ? note.id : null;
  document.getElementById('noteModalTitle').textContent = note ? 'Edit Grading Note' : 'Add Grading Note';
  document.getElementById('nDate').value = note ? note.date : prefillDate;
  document.getElementById('nText').value = note ? note.text : '';
  document.getElementById('noteDeleteBtn').style.display = note ? 'inline-block' : 'none';
  document.getElementById('noteModalBackdrop').classList.remove('hidden');
}
function closeNoteModal() { document.getElementById('noteModalBackdrop').classList.add('hidden'); }
function closeNoteModalOnBackdrop(e) { if (e.target === document.getElementById('noteModalBackdrop')) closeNoteModal(); }

async function saveNote() {
  const date = document.getElementById('nDate').value;
  const text = document.getElementById('nText').value.trim();
  if (!date || !text) { alert('Please fill in date and note.'); return; }
  if (editingNoteId) {
    await fetch(`/api/notes/${editingNoteId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ date, text }) });
  } else {
    await fetch('/api/notes', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ date, text }) });
  }
  closeNoteModal(); await loadNotes(); render();
}

async function deleteNote() {
  if (!editingNoteId || !confirm('Delete this grading note?')) return;
  await fetch(`/api/notes/${editingNoteId}`, { method:'DELETE' });
  closeNoteModal(); await loadNotes(); render();
}

// ══════════════════════════════════════════
// CLASS MANAGER
// ══════════════════════════════════════════
function openClassModal() { buildClassList(); document.getElementById('classModalBackdrop').classList.remove('hidden'); }
function closeClassModal() { document.getElementById('classModalBackdrop').classList.add('hidden'); buildLegend(); render(); }
function closeClassModalOnBackdrop(e) { if (e.target === document.getElementById('classModalBackdrop')) closeClassModal(); }

function buildClassList() {
  const el = document.getElementById('classListEl');
  el.innerHTML = '';
  allClasses.forEach(c => {
    const row = document.createElement('div');
    row.className = 'class-row' + (c.archived ? ' archived-row' : '');
    row.innerHTML = `
      <span class="dot" style="background:${c.color};width:12px;height:12px;border-radius:50%;flex-shrink:0;"></span>
      <input type="text" value="${c.name}" id="cname-${c.id}">
      <input type="color" value="${rgbToHex(c.color)}" id="ccolor-${c.id}" title="Text colour">
      <input type="color" value="${rgbToHex(c.bg)}" id="cbg-${c.id}" title="Background colour">
      <button class="btn" onclick="saveClassRow(${c.id})" style="padding:0.2rem 0.5rem;font-size:0.72rem;">Save</button>
      <button class="btn" onclick="archiveClass(${c.id})" style="padding:0.2rem 0.5rem;font-size:0.72rem;" title="${c.archived?'Restore':'Archive'}">${c.archived?'↩':'📦'}</button>
      <button class="btn danger" onclick="deleteClass(${c.id})" style="padding:0.2rem 0.5rem;font-size:0.72rem;">🗑</button>`;
    el.appendChild(row);
  });
}

async function saveClassRow(id) {
  const name  = document.getElementById(`cname-${id}`).value.trim();
  const color = hexToRgb(document.getElementById(`ccolor-${id}`).value);
  const bg    = hexToRgb(document.getElementById(`cbg-${id}`).value);
  await fetch(`/api/classes/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name, color, bg }) });
  await loadClasses(); buildClassList();
}

async function archiveClass(id) {
  const c = allClasses.find(x => x.id === id);
  await fetch(`/api/classes/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ archived:!c.archived }) });
  await loadClasses(); buildClassList();
}

async function deleteClass(id) {
  if (!confirm('Delete this class and ALL its events?')) return;
  await fetch(`/api/classes/${id}`, { method:'DELETE' });
  await loadClasses(); await loadEvents(); buildClassList();
}

async function addClass() {
  const name  = document.getElementById('newClassName').value.trim();
  const color = hexToRgb(document.getElementById('newClassColor').value);
  const bg    = hexToRgb(document.getElementById('newClassBg').value);
  if (!name) { alert('Please enter a class name.'); return; }
  await fetch('/api/classes', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name, color, bg }) });
  document.getElementById('newClassName').value = '';
  await loadClasses(); buildClassList();
}

// ══════════════════════════════════════════
// THEME
// ══════════════════════════════════════════
function openThemeModal() {
  ['--bg','--surface','--border','--text','--muted'].forEach(k => {
    const el = document.getElementById('t'+k);
    if (el) el.value = rgbOrHexToHex(theme[k] || '');
  });
  ['--font-body','--font-heading','--font-mono'].forEach(k => {
    const el = document.getElementById('t'+k);
    if (el) el.value = (theme[k] || '').trim().replace(/'/g,'');
  });
  document.getElementById('themeModalBackdrop').classList.remove('hidden');
}
function closeThemeModal() { document.getElementById('themeModalBackdrop').classList.add('hidden'); applyTheme(); }
function closeThemeModalOnBackdrop(e) { if (e.target === document.getElementById('themeModalBackdrop')) closeThemeModal(); }

function liveTheme(key, value) { document.documentElement.style.setProperty(key, value); }

async function saveTheme() {
  const updates = {};
  ['--bg','--surface','--border','--text','--muted'].forEach(k => { const el = document.getElementById('t'+k); if (el) updates[k] = el.value; });
  ['--font-body','--font-heading','--font-mono'].forEach(k => { const el = document.getElementById('t'+k); if (el) updates[k] = el.value; });
  await fetch('/api/theme', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(updates) });
  await loadTheme(); applyTheme(); closeThemeModal();
}

async function resetTheme() {
  if (!confirm('Reset to default theme?')) return;
  const defaults = { '--bg':'#f4f1eb','--surface':'#fffef9','--border':'#ddd8cc','--text':'#1a1612','--muted':'#7a7060','--font-body':'DM Sans','--font-heading':'DM Serif Display','--font-mono':'DM Mono' };
  await fetch('/api/theme', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(defaults) });
  await loadTheme(); applyTheme(); openThemeModal();
}

function applyTheme() {
  Object.entries(theme).forEach(([k, v]) => { if (k.startsWith('--')) document.documentElement.style.setProperty(k, v); });
}

function buildThemePresets() {
  const el = document.getElementById('themePresets');
  if (!el) return;
  THEME_PRESETS.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'theme-preset'; btn.textContent = p.label;
    btn.onclick = () => {
      Object.entries(p.values).forEach(([k,v]) => {
        document.documentElement.style.setProperty(k, v);
        const inp = document.getElementById('t'+k);
        if (inp) inp.value = rgbOrHexToHex(v);
      });
    };
    el.appendChild(btn);
  });
}

// ══════════════════════════════════════════
// YEAR SETTINGS
// ══════════════════════════════════════════
function applyYearSettings() {
  const year = parseInt(theme['cal-year'] || '2026');
  const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  MONTHS.length = 0;
  names.forEach((name, i) => MONTHS.push([year, i, name]));
  TERMS.length = 0;
  if (theme['term1-start']) {
      [1,2,3,4].forEach(n => {
        const s = theme[`term${n}-start`]; const e = theme[`term${n}-end`];
        if (s && e) {
          // Parse as local date (not UTC) to avoid timezone shift
          const [sy,sm,sd] = s.split('-').map(Number);
          const [ey,em,ed] = e.split('-').map(Number);
          TERMS.push({ name:`Term ${n}`, start:new Date(sy,sm-1,sd), end:new Date(ey,em-1,ed) });
        }
    });
  } else {
    TERMS.push(
      { name:'Term 1', start:new Date(2026,0,27), end:new Date(2026,3,10) },
      { name:'Term 2', start:new Date(2026,3,27), end:new Date(2026,6,3) },
      { name:'Term 3', start:new Date(2026,6,20), end:new Date(2026,8,25) },
      { name:'Term 4', start:new Date(2026,9,12), end:new Date(2026,11,11) }
    );
  }
  const subEl = document.getElementById('subtitleEl');
  if (subEl) subEl.textContent = theme['cal-subtitle'] || `${year} — All Due Dates`;
  document.title = `Class Calendar ${year}`;
}

function openYearModal() {
  document.getElementById('yYear').value     = theme['cal-year'] || '2026';
  document.getElementById('ySubtitle').value = theme['cal-subtitle'] || '';
  [1,2,3,4].forEach(n => {
    document.getElementById(`yT${n}s`).value = theme[`term${n}-start`] || '';
    document.getElementById(`yT${n}e`).value = theme[`term${n}-end`]   || '';
  });
  document.getElementById('yearModalBackdrop').classList.remove('hidden');
}
function closeYearModal() { document.getElementById('yearModalBackdrop').classList.add('hidden'); }
function closeYearModalOnBackdrop(e) { if (e.target === document.getElementById('yearModalBackdrop')) closeYearModal(); }

async function saveYearSettings() {
  const year = document.getElementById('yYear').value;
  if (!year) { alert('Please enter a year.'); return; }
  const subtitle = document.getElementById('ySubtitle').value.trim() || `${year} — All Due Dates`;
  const updates = { 'cal-year':year, 'cal-subtitle':subtitle };
  [1,2,3,4].forEach(n => {
    updates[`term${n}-start`] = document.getElementById(`yT${n}s`).value;
    updates[`term${n}-end`]   = document.getElementById(`yT${n}e`).value;
  });
  await fetch('/api/theme', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(updates) });
  await loadTheme(); applyYearSettings(); closeYearModal(); render(); scrollToCurrentMonth();
}

// ══════════════════════════════════════════
// TEMPLATES
// ══════════════════════════════════════════
function openTemplateModal() { buildTemplateList(); populateTemplateCls(); document.getElementById('templateModalBackdrop').classList.remove('hidden'); }
function closeTemplateModal() { document.getElementById('templateModalBackdrop').classList.add('hidden'); }
function closeTemplateModalOnBackdrop(e) { if (e.target === document.getElementById('templateModalBackdrop')) closeTemplateModal(); }

function buildTemplateList() {
  const el = document.getElementById('templateListEl');
  el.innerHTML = '';
  if (!allTemplates.length) { el.innerHTML = '<p style="font-size:0.78rem;color:var(--muted);font-style:italic;">No templates yet.</p>'; return; }
  allTemplates.forEach(t => {
    const cls = allClasses.find(c => c.id === t.cls);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.75rem;border:1.5px solid var(--border);border-radius:8px;background:var(--bg);';
    row.innerHTML = `
      <span style="flex:1;font-size:0.85rem;">${t.title}</span>
      ${cls ? `<span class="pill" style="background:${cls.bg};color:${cls.color};">${cls.name}</span>` : ''}
      <span style="font-size:0.72rem;color:var(--muted);font-family:var(--font-mono),monospace;">${t.type}</span>
      <button class="btn danger" onclick="deleteTemplate(${t.id})" style="padding:0.2rem 0.5rem;font-size:0.72rem;">🗑</button>`;
    el.appendChild(row);
  });
}

function populateTemplateCls() {
  const sel = document.getElementById('tmplCls');
  if (!sel) return;
  sel.innerHTML = '<option value="">No default</option>';
  allClasses.filter(c => !c.archived).forEach(c => { sel.innerHTML += `<option value="${c.id}">${c.name}</option>`; });
}

function populateTemplatePicker() {
  const sel = document.getElementById('templatePicker');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Start from scratch —</option>';
  allTemplates.forEach(t => { sel.innerHTML += `<option value="${t.id}">${t.title}</option>`; });
  const field = document.getElementById('templatePickerField');
  if (field) field.style.display = allTemplates.length ? 'block' : 'none';
}

function applyTemplate(tmplId) {
  if (!tmplId) return;
  const t = allTemplates.find(t => t.id === parseInt(tmplId));
  if (!t) return;
  document.getElementById('fTitle').value = t.title;
  document.getElementById('fType').value  = t.type;
  document.getElementById('fNotes').value = t.notes || '';
  if (t.cls) document.getElementById('fCls').value = t.cls;
}

async function saveTemplate() {
  const title = document.getElementById('tmplTitle').value.trim();
  if (!title) { alert('Please enter a title.'); return; }
  const cls   = document.getElementById('tmplCls').value;
  const type  = document.getElementById('tmplType').value;
  const notes = document.getElementById('tmplNotes').value.trim();
  await fetch('/api/templates', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ title, cls:cls?parseInt(cls):null, type, notes }) });
  document.getElementById('tmplTitle').value = '';
  document.getElementById('tmplNotes').value = '';
  await loadTemplates(); buildTemplateList(); populateTemplatePicker();
}

async function deleteTemplate(id) {
  if (!confirm('Delete this template?')) return;
  await fetch(`/api/templates/${id}`, { method:'DELETE' });
  await loadTemplates(); buildTemplateList(); populateTemplatePicker();
}

// ══════════════════════════════════════════
// UNDO
// ══════════════════════════════════════════
function pushUndo(action) {
  undoStack.push(action);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  document.getElementById('undoBtn').style.display = 'inline-block';
}

async function undoLast() {
  if (!undoStack.length) return;
  const action = undoStack.pop();
  if (!undoStack.length) document.getElementById('undoBtn').style.display = 'none';
  const snapshots = action.snapshot ? [action.snapshot] : action.snapshots;
  if (action.type === 'delete_single' || action.type === 'bulk') {
    await fetch('/api/events/restore', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ snapshots }) });
  } else if (action.type === 'edit') {
    await fetch(`/api/events/${action.snapshot.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(action.snapshot) });
  }
  await loadEvents(); render();
}

// ══════════════════════════════════════════
// BULK SELECT
// ══════════════════════════════════════════
function toggleSelectEvent(id, el) {
  if (selectedIds.has(id)) { selectedIds.delete(id); el.classList.remove('selected'); }
  else { selectedIds.add(id); el.classList.add('selected'); }
  updateBulkBar();
}

function updateBulkBar() {
  const bar = document.getElementById('bulkBar');
  const count = document.getElementById('bulkCount');
  if (selectedIds.size > 0) {
    bar.classList.remove('hidden');
    count.textContent = `${selectedIds.size} selected`;
    document.body.classList.add('bulk-mode');
  } else {
    bar.classList.add('hidden');
    document.body.classList.remove('bulk-mode');
  }
}

function clearSelection() {
  selectedIds.clear();
  document.querySelectorAll('.event.selected').forEach(el => el.classList.remove('selected'));
  updateBulkBar();
}

async function bulkDelete() {
  if (!selectedIds.size || !confirm(`Delete ${selectedIds.size} events?`)) return;
  const ids = [...selectedIds];
  const snapshots = allEvents.filter(e => ids.includes(e.id)).map(e => ({ ...e }));
  await fetch('/api/events/bulk', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'delete', ids }) });
  pushUndo({ type:'bulk', snapshots });
  clearSelection(); await loadEvents(); render();
}

async function bulkComplete() {
  if (!selectedIds.size) return;
  const ids = [...selectedIds];
  const snapshots = allEvents.filter(e => ids.includes(e.id)).map(e => ({ ...e }));
  await fetch('/api/events/bulk', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'complete', ids }) });
  pushUndo({ type:'bulk', snapshots });
  clearSelection(); await loadEvents(); render();
}

function openBulkMove() {
  document.getElementById('bulkMoveDate').value = '';
  document.getElementById('bulkMoveBackdrop').classList.remove('hidden');
}
function closeBulkMove(e) {
  if (!e || e.target === document.getElementById('bulkMoveBackdrop'))
    document.getElementById('bulkMoveBackdrop').classList.add('hidden');
}

async function bulkMove() {
  const newDate = document.getElementById('bulkMoveDate').value;
  if (!newDate) { alert('Please pick a date.'); return; }
  const ids = [...selectedIds];
  const snapshots = allEvents.filter(e => ids.includes(e.id)).map(e => ({ ...e }));
  await fetch('/api/events/bulk', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'move', ids, date:newDate }) });
  pushUndo({ type:'bulk', snapshots });
  document.getElementById('bulkMoveBackdrop').classList.add('hidden');
  clearSelection(); await loadEvents(); render();
}

// ══════════════════════════════════════════
// DRAG AND DROP
// ══════════════════════════════════════════
function attachDropHandlers() {
  document.querySelectorAll('.day-cell:not(.empty)').forEach(cell => {
    const dateStr = cell.dataset.date;
    if (!dateStr) return;
    cell.addEventListener('dragover', (e) => {
      if (dragEventId === null) return;
      e.preventDefault();
      cell.classList.add('drag-over');
    });
    cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
    cell.addEventListener('drop', async (e) => {
      e.preventDefault();
      cell.classList.remove('drag-over');
      if (dragEventId === null) return;
      const ev = allEvents.find(e => e.id === dragEventId);
      if (!ev || ev.date === dateStr) return;
      pushUndo({ type:'edit', snapshot:{ ...ev } });
      await fetch(`/api/events/${dragEventId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...ev, date:dateStr }) });
      await loadEvents(); render();
    });
  });
}

// ══════════════════════════════════════════
// EMAIL DIGEST
// ══════════════════════════════════════════
async function sendDigest() {
  if (!confirm('Send the weekly digest email now?')) return;
  const res = await fetch('/api/send-digest', { method:'POST' });
  alert(res.ok ? '✅ Digest sent! Check your inbox.' : '❌ Failed to send. Check your SMTP settings.');
}

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════
function rgbToHex(rgb) {
  if (!rgb) return '#000000';
  if (rgb.startsWith('#')) return rgb;
  const m = rgb.match(/\d+/g);
  if (!m || m.length < 3) return '#000000';
  return '#' + m.slice(0,3).map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
}
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgb(${r},${g},${b})`;
}
function rgbOrHexToHex(val) { return rgbToHex((val||'').trim()); }

// ══════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════
init();
