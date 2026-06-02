const classes = {
  c1: { name: 'S2 Digital Tech', color: 'rgb(100,160,190)', bg: 'rgb(173,216,230)' },
  c2: { name: 'S2 Game Design',  color: 'rgb(150,110,150)', bg: 'rgb(216,191,216)' },
  c3: { name: 'S1 Digital Tech', color: 'rgb(200,120,50)',  bg: 'rgb(255,204,153)' },
  c4: { name: 'S1 Game Design',  color: 'rgb(150,110,150)', bg: 'rgb(216,191,216)' },
  c5: { name: 'Y9 Digital Tech', color: 'rgb(60,160,60)',   bg: 'rgb(144,238,144)' },
  c6: { name: 'Y8 Digital Tech', color: 'rgb(200,100,120)', bg: 'rgb(255,182,193)' },
};

const hiddenClasses = new Set();
const today = new Date(); today.setHours(0,0,0,0);
let allEvents = [];
let editingId = null;
let drawerOpen = false;

// ── API ──────────────────────────────────────────────
async function loadEvents() {
  const res = await fetch('/api/events');
  allEvents = await res.json();
  render();
}

async function saveEvent() {
  const payload = {
    date:  document.getElementById('fDate').value,
    title: document.getElementById('fTitle').value.trim(),
    cls:   document.getElementById('fCls').value,
    type:  document.getElementById('fType').value,
  };
  if (!payload.date || !payload.title) { alert('Please fill in date and title.'); return; }
  if (editingId) {
    await fetch(`/api/events/${editingId}`, {
      method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
    });
  } else {
    await fetch('/api/events', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
    });
  }
  closeModal();
  await loadEvents();
}

async function deleteEvent() {
  if (!editingId || !confirm('Delete this event?')) return;
  await fetch(`/api/events/${editingId}`, { method: 'DELETE' });
  closeModal();
  await loadEvents();
}

// ── Modal ────────────────────────────────────────────
function openModal(prefillDate='', event=null) {
  editingId = event ? event.id : null;
  document.getElementById('modalTitle').textContent = event ? 'Edit Event' : 'Add Event';
  document.getElementById('fDate').value  = event ? event.date : prefillDate;
  document.getElementById('fTitle').value = event ? event.title : '';
  document.getElementById('fCls').value   = event ? event.cls  : 'c1';
  document.getElementById('fType').value  = event ? event.type : 'assignment';
  document.getElementById('deleteBtn').style.display = event ? 'inline-block' : 'none';
  document.getElementById('modalBackdrop').classList.remove('hidden');
}
function closeModal() { document.getElementById('modalBackdrop').classList.add('hidden'); }
function closeModalOnBackdrop(e) {
  if (e.target === document.getElementById('modalBackdrop')) closeModal();
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
  Object.entries(classes).forEach(([cls, info]) => {
    const upcoming = allEvents
      .filter(e => e.cls === cls && new Date(e.date) >= today)
      .sort((a,b) => a.date.localeCompare(b.date))[0];

    const card = document.createElement('div');
    card.className = 'upcoming-card';

    const hdr = document.createElement('div');
    hdr.className = 'upcoming-card-header';
    hdr.style.background = info.bg;
    hdr.style.color = info.color;
    hdr.innerHTML = `<span class="dot" style="background:${info.color}"></span><span>${info.name}</span>`;
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

// ── Render ───────────────────────────────────────────
function render() {
  document.getElementById('months').innerHTML = '';
  document.getElementById('listBody').innerHTML = '';
  buildCalendar();
  buildList();
  buildDrawer();
  hiddenClasses.forEach(cls => {
    document.querySelectorAll('.event.' + cls).forEach(e => e.classList.add('hidden'));
    document.querySelectorAll(`tr[data-cls="${cls}"]`).forEach(r => r.classList.add('hidden'));
  });
  scrollToCurrentMonth();
}

function scrollToCurrentMonth() {
  const blocks = document.querySelectorAll('.month-block');
  const monthIndex = today.getMonth();
  if (blocks[monthIndex]) {
    setTimeout(() => blocks[monthIndex].scrollIntoView({ behavior:'smooth', block:'start' }), 150);
  }
}

function toggleClass(cls, el) {
  if (hiddenClasses.has(cls)) { hiddenClasses.delete(cls); el.classList.remove('dimmed'); }
  else { hiddenClasses.add(cls); el.classList.add('dimmed'); }
  document.querySelectorAll('.event.' + cls).forEach(e => e.classList.toggle('hidden', hiddenClasses.has(cls)));
  document.querySelectorAll(`tr[data-cls="${cls}"]`).forEach(r => r.classList.toggle('hidden', hiddenClasses.has(cls)));
}

function setView(v) {
  document.getElementById('viewCal').style.display  = v === 'cal'  ? 'block' : 'none';
  document.getElementById('viewList').style.display = v === 'list' ? 'block' : 'none';
  document.getElementById('btnCal').classList.toggle('active', v === 'cal');
  document.getElementById('btnList').classList.toggle('active', v === 'list');
  if (v === 'cal') scrollToCurrentMonth();
}

// ── Term helpers ─────────────────────────────────────
const terms = [
  { name:'Term 1', start:new Date(2026,0,27), end:new Date(2026,3,10) },
  { name:'Term 2', start:new Date(2026,3,27), end:new Date(2026,6,3) },
  { name:'Term 3', start:new Date(2026,6,20), end:new Date(2026,8,25) },
  { name:'Term 4', start:new Date(2026,9,12), end:new Date(2026,11,11) },
];

function getTermInfo(date) {
  for (const t of terms) {
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
  const months = [
    [2026,0,'January'],[2026,1,'February'],[2026,2,'March'],[2026,3,'April'],
    [2026,4,'May'],[2026,5,'June'],[2026,6,'July'],[2026,7,'August'],
    [2026,8,'September'],[2026,9,'October'],[2026,10,'November'],
  ];

  months.forEach(([yr, mo, name]) => {
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
      const isToday = thisDate.getTime() === today.getTime();

      const cell = document.createElement('div');
      let cellClass = 'day-cell';
      if (isWeekend) cellClass += ' weekend';
      if (isToday)   cellClass += ' today-cell';
      cell.className = cellClass;

      const dateStr = `${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

      cell.onclick = (e) => {
        if (e.target === cell || e.target.classList.contains('day-num') ||
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

      if (thisDate.getDay() === 1) {
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
        const evEl = document.createElement('div');
        evEl.className = `event ${ev.cls}${ev.type === 'formative' ? ' formative' : ''}`;
        evEl.textContent = ev.title;
        evEl.title = `${classes[ev.cls].name} — ${ev.type} (click to edit)`;
        evEl.onclick = (e) => { e.stopPropagation(); openModal('', ev); };
        cell.appendChild(evEl);
      });

      grid.appendChild(cell);
    }

    block.appendChild(grid);
    monthsEl.appendChild(block);
  });
}

// ── List builder ─────────────────────────────────────
function buildList() {
  const tbody = document.getElementById('listBody');
  [...allEvents].sort((a,b) => a.date.localeCompare(b.date)).forEach(ev => {
    const d = new Date(ev.date);
    const tr = document.createElement('tr');
    tr.dataset.cls = ev.cls;
    if (d < today) tr.className = 'past-row';
    const dateStr = d.toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' });
    tr.innerHTML = `
      <td><span style="font-family:'DM Mono',monospace;font-size:0.8rem;">${dateStr}</span></td>
      <td>${ev.title}</td>
      <td><span class="pill ${ev.cls}">${classes[ev.cls].name}</span></td>
      <td><span class="type-tag">${ev.type}</span></td>
      <td class="no-print">
        <button class="btn" style="padding:0.2rem 0.6rem;font-size:0.72rem;"
          onclick="openModal('',${JSON.stringify(ev).replace(/"/g,'&quot;')})">Edit</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ── Init ─────────────────────────────────────────────
loadEvents();
