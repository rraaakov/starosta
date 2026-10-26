/* ============================================================
   СТАРОСТА — полная версия
   ============================================================ */
const routes = {
  dashboard: { title: 'Главная' },
  students:  { title: 'Студенты' },
  calendar:  { title: 'Календарь' },
  tasks:     { title: 'Задачи' },
  settings:  { title: 'Ещё' },
};

const STATUS_LABELS = { ACTIVE: 'Активен', ACADEMIC: 'Академ. отпуск', EXPELLED: 'Отчислен' };
const EVENT_TYPE_LABELS = { EXAM: 'Экзамен', CREDIT: 'Зачёт', DEADLINE: 'Дедлайн', MEETING: 'Собрание', OTHER: 'Другое' };
const PRIORITY_LABELS = { HIGH: 'Высокий', NORMAL: 'Обычный', LOW: 'Низкий' };

let db = null;

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return document.querySelectorAll(sel); }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtDate(ms) { return new Date(ms).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function dateToISO(ms) { return new Date(ms).toISOString().slice(0, 10); }
function isoToMs(iso) { return new Date(iso + 'T00:00:00').getTime(); }

/* ---------- Экраны ---------- */
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function showAuthScreens() {
  hide($('#app'));
  const auth = Auth.getAuth();
  if (!auth) { show($('#onboarding')); hide($('#login')); }
  else { hide($('#onboarding')); show($('#login')); }
}
function showApp() { hide($('#onboarding')); hide($('#login')); show($('#app')); }

function openModal(html) { $('#modal-content').innerHTML = html; show($('#modal')); }
function closeModal() { hide($('#modal')); $('#modal-content').innerHTML = ''; }

/* ---------- Роутинг ---------- */
function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  return hash.split('/')[0] || 'dashboard';
}

function render() {
  const session = Auth.getSession();
  if (!session) { showAuthScreens(); return; }
  showApp();

  const route = currentRoute();
  $('#app-title').textContent = (routes[route] || routes.dashboard).title;
  $all('.bottom-nav a').forEach(a => a.classList.toggle('active', a.dataset.route === route));

  db = Store.loadDB();
  const view = $('#view');

  if (route === 'students') renderStudents(view);
  else if (route === 'calendar') renderCalendar(view);
  else if (route === 'tasks') renderTasks(view);
  else if (route === 'settings') renderSettings(view);
  else renderDashboard(view);
}

/* ============================================================
   ДАШБОРД
   ============================================================ */
function renderDashboard(view) {
  const today = isoToMs(todayISO());
  const upcoming = db.events
    .filter(e => e.date >= todayISO())
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .slice(0, 5);

  const activeStudents = db.students.filter(s => s.status === 'ACTIVE').length;

  // Средний % посещаемости
  let totalMarks = 0, presentMarks = 0;
  db.attendance.forEach(a => {
    totalMarks++;
    if (a.status === 'PRESENT') presentMarks++;
  });
  const avgAtt = totalMarks ? Math.round((presentMarks / totalMarks) * 100) : 0;

  const openTasks = db.tasks.filter(t => !t.done).length;

  // Ближайшие ДР (в пределах 30 дней)
  const now = new Date();
  const bdays = [];
  db.students.forEach(s => {
    if (!s.birthDate) return;
    const bd = new Date(s.birthDate);
    const next = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
    if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next.setFullYear(now.getFullYear() + 1);
    const days = Math.ceil((next - now) / 86400000);
    if (days <= 30) bdays.push({ name: s.fullName, days, date: next });
  });
  bdays.sort((a, b) => a.days - b.days);

  const upcomingHtml = upcoming.length
    ? upcoming.map(e => `
        <div class="event-item">
          <div>
            <div class="event-title">${escapeHtml(e.title)}</div>
            <div class="event-meta">${fmtDate(isoToMs(e.date))}${e.time ? ', ' + e.time : ''}${e.place ? ' · ' + escapeHtml(e.place) : ''}</div>
          </div>
          <span class="event-type-badge ${e.type}">${EVENT_TYPE_LABELS[e.type]}</span>
        </div>`).join('')
    : '<div class="empty" style="padding:12px">Нет предстоящих событий</div>';

  const bdayHtml = bdays.length
    ? bdays.map(b => `<div class="event-item"><div><div class="event-title">${escapeHtml(b.name)}</div><div class="event-meta">${b.days === 0 ? 'Сегодня!' : 'через ' + b.days + ' дн.'}</div></div><span style="font-size:20px">🎂</span></div>`).join('')
    : '<div class="empty" style="padding:12px">Нет ближайших ДР</div>';

  view.innerHTML = `
    <div class="dash-grid">
      <div class="dash-card"><div class="num">${activeStudents}</div><div class="label">Активных студентов</div></div>
      <div class="dash-card"><div class="num">${avgAtt}%</div><div class="label">Средняя посещаемость</div></div>
      <div class="dash-card"><div class="num">${openTasks}</div><div class="label">Невыполненных задач</div></div>
      <div class="dash-card"><div class="num">${db.events.length}</div><div class="label">Всего событий</div></div>
    </div>
    <div class="section-title">Ближайшие события</div>
    ${upcomingHtml}
    <div class="section-title">Дни рождения (30 дней)</div>
    ${bdayHtml}
  `;
}

/* ============================================================
   СТУДЕНТЫ
   ============================================================ */
let studentFilters = { q: '', status: '', sort: 'listNumber' };

function renderStudents(view) {
  const { q, status, sort } = studentFilters;
  let list = [...db.students];
  if (q.trim()) { const n = q.trim().toLowerCase(); list = list.filter(s => s.fullName.toLowerCase().includes(n)); }
  if (status) list = list.filter(s => s.status === status);
  if (sort === 'name') list.sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
  else list.sort((a, b) => (a.listNumber ?? 9999) - (b.listNumber ?? 9999));

  const rows = list.map(s => `
    <div class="student-card" data-id="${s.id}">
      <div class="info">
        <div class="name">${escapeHtml(s.fullName)}</div>
        <div class="meta">№${s.listNumber ?? '—'} · <span class="badge ${s.status}">${STATUS_LABELS[s.status]}</span>${s.phone ? ' · ' + escapeHtml(s.phone) : ''}</div>
      </div>
      <div class="student-actions">
        ${s.phone ? `<button class="icon-btn" data-call="${escapeHtml(s.phone)}" title="Позвонить">📞</button>` : ''}
        ${s.telegram ? `<button class="icon-btn" data-tg="${escapeHtml(s.telegram)}" title="Telegram">✈️</button>` : ''}
        <button class="icon-btn" data-edit="${s.id}" title="Редактировать">✏️</button>
      </div>
    </div>`).join('');

  view.innerHTML = `
    <div class="toolbar">
      <input type="text" id="st-q" placeholder="Поиск по ФИО" value="${escapeHtml(q)}" />
      <select id="st-status">
        <option value="">Все статусы</option>
        <option value="ACTIVE" ${status==='ACTIVE'?'selected':''}>Активен</option>
        <option value="ACADEMIC" ${status==='ACADEMIC'?'selected':''}>Академ. отпуск</option>
        <option value="EXPELLED" ${status==='EXPELLED'?'selected':''}>Отчислен</option>
      </select>
      <select id="st-sort">
        <option value="listNumber" ${sort==='listNumber'?'selected':''}>По номеру</option>
        <option value="name" ${sort==='name'?'selected':''}>По алфавиту</option>
      </select>
    </div>
    <div class="toolbar" style="margin-top:-4px">
      <button class="btn-secondary" id="st-export" style="flex:1">Экспорт CSV</button>
    </div>
    <div class="list">${rows || '<div class="empty">Студентов пока нет. Нажмите «+».</div>'}</div>
    <button class="fab" id="st-add">+</button>
  `;

  $('#st-q').addEventListener('input', e => { studentFilters.q = e.target.value; renderStudents(view); });
  $('#st-status').addEventListener('change', e => { studentFilters.status = e.target.value; renderStudents(view); });
  $('#st-sort').addEventListener('change', e => { studentFilters.sort = e.target.value; renderStudents(view); });
  $('#st-add').addEventListener('click', () => openStudentForm(null));
  $('#st-export').addEventListener('click', exportStudentsCsv);

  $all('[data-edit]').forEach(b => b.addEventListener('click', () => {
    const s = db.students.find(x => x.id === b.dataset.edit); if (s) openStudentForm(s);
  }));
  $all('[data-call]').forEach(b => b.addEventListener('click', () => { location.href = 'tel:' + b.dataset.call.replace(/[^\d+]/g, ''); }));
  $all('[data-tg]').forEach(b => b.addEventListener('click', () => {
    let u = b.dataset.tg.trim().replace(/^@/, '');
    location.href = u.startsWith('http') ? u : 'https://t.me/' + u;
  }));
}

function openStudentForm(student) {
  const isEdit = !!student;
  const s = student || { id: crypto.randomUUID(), fullName: '', phone: '', email: '', telegram: '', listNumber: '', status: 'ACTIVE', birthDate: '', note: '' };
  openModal(`
    <h3>${isEdit ? 'Редактировать студента' : 'Новый студент'}</h3>
    <form id="st-form">
      <div class="form-row"><label>ФИО *</label><input type="text" id="f-fullName" required value="${escapeHtml(s.fullName)}" /></div>
      <div class="form-row"><label>Номер по списку</label><input type="number" id="f-listNumber" value="${s.listNumber ?? ''}" /></div>
      <div class="form-row"><label>Статус</label>
        <select id="f-status">
          <option value="ACTIVE" ${s.status==='ACTIVE'?'selected':''}>Активен</option>
          <option value="ACADEMIC" ${s.status==='ACADEMIC'?'selected':''}>Академ. отпуск</option>
          <option value="EXPELLED" ${s.status==='EXPELLED'?'selected':''}>Отчислен</option>
        </select>
      </div>
      <div class="form-row"><label>Телефон</label><input type="tel" id="f-phone" value="${escapeHtml(s.phone)}" /></div>
      <div class="form-row"><label>Email</label><input type="email" id="f-email" value="${escapeHtml(s.email)}" /></div>
      <div class="form-row"><label>Telegram</label><input type="text" id="f-telegram" value="${escapeHtml(s.telegram)}" /></div>
      <div class="form-row"><label>Дата рождения</label><input type="date" id="f-birthDate" value="${s.birthDate || ''}" /></div>
      <div class="form-row"><label>Заметка</label><textarea id="f-note">${escapeHtml(s.note)}</textarea></div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" data-close-modal>Отмена</button>
        ${isEdit ? '<button type="button" class="btn-danger" id="f-delete">Удалить</button>' : ''}
        <button type="submit" class="btn-primary compact">Сохранить</button>
      </div>
    </form>`);

  $('#st-form').addEventListener('submit', e => {
    e.preventDefault();
    const fullName = $('#f-fullName').value.trim(); if (!fullName) return;
    const data = {
      id: s.id, fullName,
      listNumber: $('#f-listNumber').value ? Number($('#f-listNumber').value) : null,
      status: $('#f-status').value,
      phone: $('#f-phone').value.trim(),
      email: $('#f-email').value.trim(),
      telegram: $('#f-telegram').value.trim(),
      birthDate: $('#f-birthDate').value,
      note: $('#f-note').value.trim(),
    };
    if (isEdit) { const i = db.students.findIndex(x => x.id === s.id); db.students[i] = data; }
    else db.students.push(data);
    Store.saveDB(db); closeModal(); render();
  });

  if (isEdit) $('#f-delete').addEventListener('click', () => {
    if (!confirm(`Удалить студента «${s.fullName}»?`)) return;
    db.students = db.students.filter(x => x.id !== s.id);
    db.attendance = db.attendance.filter(a => a.studentId !== s.id);
    Store.saveDB(db); closeModal(); render();
  });
}

function exportStudentsCsv() {
  const header = ['№', 'ФИО', 'Статус', 'Телефон', 'Email', 'Telegram', 'Дата рождения', 'Заметка'];
  const rows = db.students.slice().sort((a, b) => (a.listNumber ?? 9999) - (b.listNumber ?? 9999))
    .map(s => [s.listNumber ?? '', s.fullName, STATUS_LABELS[s.status] || '', s.phone || '', s.email || '', s.telegram || '', s.birthDate || '', s.note || '']);
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `students-${todayISO()}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

/* ============================================================
   КАЛЕНДАРЬ
   ============================================================ */
let calState = { year: new Date().getFullYear(), month: new Date().getMonth(), selectedDate: todayISO(), filterType: '' };

function renderCalendar(view) {
  const { year, month, selectedDate, filterType } = calState;
  const firstDay = new Date(year, month, 1);
  const startDow = (firstDay.getDay() + 6) % 7; // Пн=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const dows = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

  let cells = '';
  dows.forEach(d => cells += `<div class="cal-dow">${d}</div>`);

  // предыдущий месяц
  for (let i = startDow - 1; i >= 0; i--) {
    const d = prevDays - i;
    cells += `<div class="cal-cell other">${d}</div>`;
  }
  // текущий
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = iso === todayISO();
    const isSel = iso === selectedDate;
    const events = db.events.filter(e => e.date === iso && (!filterType || e.type === filterType));
    const dots = events.slice(0, 3).map(e => `<div class="cal-dot ${e.type}"></div>`).join('');
    cells += `<div class="cal-cell ${isToday?'today':''} ${isSel?'selected':''}" data-date="${iso}">${d}${dots ? '<div style="display:flex;gap:2px;margin-top:2px">'+dots+'</div>' : ''}</div>`;
  }
  // следующий месяц
  const totalCells = startDow + daysInMonth;
  const tail = (7 - (totalCells % 7)) % 7;
  for (let d = 1; d <= tail; d++) cells += `<div class="cal-cell other">${d}</div>`;

  const dayEvents = db.events
    .filter(e => e.date === selectedDate && (!filterType || e.type === filterType))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const eventsHtml = dayEvents.length ? dayEvents.map(e => `
    <div class="event-item" data-event-id="${e.id}">
      <div style="flex:1">
        <div class="event-title">${escapeHtml(e.title)}</div>
        <div class="event-meta">${e.time || 'весь день'}${e.place ? ' · ' + escapeHtml(e.place) : ''}${e.description ? ' · ' + escapeHtml(e.description) : ''}</div>
      </div>
      <span class="event-type-badge ${e.type}">${EVENT_TYPE_LABELS[e.type]}</span>
    </div>`).join('') : '<div class="empty">Нет событий на этот день</div>';

  view.innerHTML = `
    <div class="cal-header">
      <button id="cal-prev">←</button>
      <div class="cal-title">${monthNames[month]} ${year}</div>
      <button id="cal-next">→</button>
    </div>
    <div class="toolbar">
      <select id="cal-filter">
        <option value="">Все типы</option>
        ${Object.entries(EVENT_TYPE_LABELS).map(([k,v]) => `<option value="${k}" ${filterType===k?'selected':''}>${v}</option>`).join('')}
      </select>
    </div>
    <div class="cal-grid">${cells}</div>
    <div class="section-title">События на ${fmtDate(isoToMs(selectedDate))}</div>
    ${eventsHtml}
    <button class="fab" id="cal-add">+</button>
  `;

  $('#cal-prev').addEventListener('click', () => { calState.month--; if (calState.month < 0) { calState.month = 11; calState.year--; } renderCalendar(view); });
  $('#cal-next').addEventListener('click', () => { calState.month++; if (calState.month > 11) { calState.month = 0; calState.year++; } renderCalendar(view); });
  $('#cal-filter').addEventListener('change', e => { calState.filterType = e.target.value; renderCalendar(view); });
  $('#cal-add').addEventListener('click', () => openEventForm(null, selectedDate));

  $all('[data-date]').forEach(c => c.addEventListener('click', () => { calState.selectedDate = c.dataset.date; renderCalendar(view); }));
  $all('[data-event-id]').forEach(el => el.addEventListener('click', () => {
    const e = db.events.find(x => x.id === el.dataset.eventId); if (e) openEventForm(e, e.date);
  }));
}

function openEventForm(event, defaultDate) {
  const isEdit = !!event;
  const e = event || { id: crypto.randomUUID(), title: '', type: 'OTHER', date: defaultDate || todayISO(), time: '', place: '', description: '' };
  openModal(`
    <h3>${isEdit ? 'Редактировать событие' : 'Новое событие'}</h3>
    <form id="ev-form">
      <div class="form-row"><label>Название *</label><input type="text" id="ef-title" required value="${escapeHtml(e.title)}" /></div>
      <div class="form-row"><label>Тип</label>
        <select id="ef-type">
          ${Object.entries(EVENT_TYPE_LABELS).map(([k,v]) => `<option value="${k}" ${e.type===k?'selected':''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="form-row"><label>Дата</label><input type="date" id="ef-date" required value="${e.date}" /></div>
      <div class="form-row"><label>Время</label><input type="time" id="ef-time" value="${e.time || ''}" /></div>
      <div class="form-row"><label>Место</label><input type="text" id="ef-place" value="${escapeHtml(e.place)}" /></div>
      <div class="form-row"><label>Описание</label><textarea id="ef-desc">${escapeHtml(e.description)}</textarea></div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" data-close-modal>Отмена</button>
        ${isEdit ? '<button type="button" class="btn-danger" id="ef-delete">Удалить</button><button type="button" class="btn-secondary" id="ef-ics">.ics</button>' : ''}
        <button type="submit" class="btn-primary compact">Сохранить</button>
      </div>
    </form>`);

  $('#ev-form').addEventListener('submit', ev => {
    ev.preventDefault();
    const title = $('#ef-title').value.trim(); if (!title) return;
    const data = {
      id: e.id, title, type: $('#ef-type').value, date: $('#ef-date').value,
      time: $('#ef-time').value, place: $('#ef-place').value.trim(), description: $('#ef-desc').value.trim(),
    };
    if (isEdit) { const i = db.events.findIndex(x => x.id === e.id); db.events[i] = data; }
    else db.events.push(data);
    Store.saveDB(db); closeModal(); render();
  });

  if (isEdit) {
    $('#ef-delete').addEventListener('click', () => {
      if (!confirm('Удалить событие?')) return;
      db.events = db.events.filter(x => x.id !== e.id);
      Store.saveDB(db); closeModal(); render();
    });
    $('#ef-ics').addEventListener('click', () => exportEventIcs(e));
  }
}

function exportEventIcs(e) {
  const dateOnly = e.date.replace(/-/g, '');
  let dtStart, dtEnd;
  if (e.time) {
    const [hh, mm] = e.time.split(':');
    dtStart = `${dateOnly}T${hh}${mm}00`;
    dtEnd = `${dateOnly}T${String(Number(hh)+1).padStart(2,'0')}${mm}00`;
  } else {
    dtStart = dateOnly; dtEnd = dateOnly;
  }
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Starosta//RU',
    'BEGIN:VEVENT',
    `UID:${e.id}@starosta`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').slice(0,15)}Z`,
    e.time ? `DTSTART:${dtStart}` : `DTSTART;VALUE=DATE:${dtStart}`,
    e.time ? `DTEND:${dtEnd}` : `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${e.title}`,
    e.description ? `DESCRIPTION:${e.description.replace(/\n/g,'\\n')}` : '',
    e.place ? `LOCATION:${e.place}` : '',
    'END:VEVENT', 'END:VCALENDAR'
  ].filter(Boolean);
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${e.title.replace(/[^\wа-яА-Я]/g,'_')}.ics`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

/* ============================================================
   ЗАДАЧИ
   ============================================================ */
let taskFilter = 'active';

function renderTasks(view) {
  let list = [...db.tasks];
  if (taskFilter === 'active') list = list.filter(t => !t.done);
  else if (taskFilter === 'done') list = list.filter(t => t.done);
  list.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (a.deadline || '9999').localeCompare(b.deadline || '9999');
  });

  const rows = list.map(t => `
    <div class="task-item ${t.done ? 'done' : ''}">
      <input type="checkbox" data-toggle="${t.id}" ${t.done ? 'checked' : ''} />
      <div class="task-body" data-edit="${t.id}">
        <div class="task-title">${escapeHtml(t.title)}</div>
        <div class="task-meta">
          <span class="priority-${t.priority}">${PRIORITY_LABELS[t.priority]}</span>
          ${t.deadline ? ' · до ' + fmtDate(isoToMs(t.deadline)) : ''}
        </div>
      </div>
    </div>`).join('');

  view.innerHTML = `
    <div class="toolbar">
      <select id="tk-filter">
        <option value="active" ${taskFilter==='active'?'selected':''}>Активные</option>
        <option value="done" ${taskFilter==='done'?'selected':''}>Выполненные</option>
        <option value="all" ${taskFilter==='all'?'selected':''}>Все</option>
      </select>
    </div>
    <div>${rows || '<div class="empty">Задач нет</div>'}</div>
    <button class="fab" id="tk-add">+</button>
  `;

  $('#tk-filter').addEventListener('change', e => { taskFilter = e.target.value; renderTasks(view); });
  $('#tk-add').addEventListener('click', () => openTaskForm(null));
  $all('[data-toggle]').forEach(cb => cb.addEventListener('change', () => {
    const t = db.tasks.find(x => x.id === cb.dataset.toggle);
    if (t) { t.done = cb.checked; Store.saveDB(db); renderTasks(view); }
  }));
  $all('[data-edit]').forEach(el => el.addEventListener('click', () => {
    const t = db.tasks.find(x => x.id === el.dataset.edit); if (t) openTaskForm(t);
  }));
}

function openTaskForm(task) {
  const isEdit = !!task;
  const t = task || { id: crypto.randomUUID(), title: '', deadline: '', priority: 'NORMAL', done: false };
  openModal(`
    <h3>${isEdit ? 'Редактировать задачу' : 'Новая задача'}</h3>
    <form id="tk-form">
      <div class="form-row"><label>Название *</label><input type="text" id="tf-title" required value="${escapeHtml(t.title)}" /></div>
      <div class="form-row"><label>Дедлайн</label><input type="date" id="tf-deadline" value="${t.deadline || ''}" /></div>
      <div class="form-row"><label>Приоритет</label>
        <select id="tf-priority">
          ${Object.entries(PRIORITY_LABELS).map(([k,v]) => `<option value="${k}" ${t.priority===k?'selected':''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" data-close-modal>Отмена</button>
        ${isEdit ? '<button type="button" class="btn-danger" id="tf-delete">Удалить</button>' : ''}
        <button type="submit" class="btn-primary compact">Сохранить</button>
      </div>
    </form>`);

  $('#tk-form').addEventListener('submit', e => {
    e.preventDefault();
    const title = $('#tf-title').value.trim(); if (!title) return;
    const data = { id: t.id, title, deadline: $('#tf-deadline').value, priority: $('#tf-priority').value, done: t.done };
    if (isEdit) { const i = db.tasks.findIndex(x => x.id === t.id); db.tasks[i] = data; }
    else db.tasks.push(data);
    Store.saveDB(db); closeModal(); render();
  });

  if (isEdit) $('#tf-delete').addEventListener('click', () => {
    if (!confirm('Удалить задачу?')) return;
    db.tasks = db.tasks.filter(x => x.id !== t.id);
    Store.saveDB(db); closeModal(); render();
  });
}

/* ============================================================
   НАСТРОЙКИ
   ============================================================ */
function renderSettings(view) {
  const theme = localStorage.getItem('starosta_theme') || 'system';

  view.innerHTML = `
    <div class="settings-section">
      <h4>Внешний вид</h4>
      <div class="settings-row">
        <span>Тема</span>
        <select id="set-theme">
          <option value="system" ${theme==='system'?'selected':''}>Системная</option>
          <option value="light" ${theme==='light'?'selected':''}>Светлая</option>
          <option value="dark" ${theme==='dark'?'selected':''}>Тёмная</option>
        </select>
      </div>
    </div>

    <div class="settings-section">
      <h4>Данные</h4>
      <button class="settings-btn" id="set-export">Экспорт JSON (бэкап)</button>
      <button class="settings-btn" id="set-import">Импорт JSON</button>
      <input type="file" id="set-import-file" accept="application/json" class="hidden" />
      <button class="settings-btn danger" id="set-reset">Сбросить все данные</button>
    </div>

    <div class="settings-section">
      <h4>Посещаемость</h4>
      <button class="settings-btn" id="set-attendance">Отметить посещаемость</button>
    </div>

    <div class="settings-section">
      <h4>Генератор объявления</h4>
      <div class="form-row">
        <label>Выберите событие</label>
        <select id="set-ann-event">
          <option value="">— выберите —</option>
          ${db.events.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(e => `<option value="${e.id}">${fmtDate(isoToMs(e.date))} — ${escapeHtml(e.title)}</option>`).join('')}
        </select>
      </div>
      <button class="settings-btn" id="set-ann-gen">Сгенерировать текст</button>
      <div class="form-row" style="margin-top:8px">
        <textarea id="set-ann-text" rows="5" placeholder="Текст появится здесь..."></textarea>
      </div>
      <button class="settings-btn" id="set-ann-copy">Скопировать</button>
      <button class="settings-btn" id="set-ann-share">Поделиться</button>
    </div>

    <div class="settings-section">
      <h4>Аккаунт</h4>
      <button class="settings-btn" id="set-logout">Выйти</button>
    </div>
  `;

  $('#set-theme').addEventListener('change', e => {
    const t = e.target.value;
    localStorage.setItem('starosta_theme', t);
    applyTheme();
  });

  $('#set-export').addEventListener('click', () => Store.exportDB());
  $('#set-import').addEventListener('click', () => $('#set-import-file').click());
  $('#set-import-file').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { await Store.importDB(f); alert('Импорт успешен'); render(); }
    catch { alert('Ошибка импорта: неверный файл'); }
  });
  $('#set-reset').addEventListener('click', () => {
    if (!confirm('Удалить ВСЕ данные (студенты, события, задачи, посещаемость)?')) return;
    Store.resetDB(); render();
  });

  $('#set-attendance').addEventListener('click', () => openAttendanceForm());

  $('#set-ann-gen').addEventListener('click', () => {
    const id = $('#set-ann-event').value;
    if (!id) return;
    const e = db.events.find(x => x.id === id);
    if (!e) return;
    const text = `📌 ${e.title}\n📅 ${fmtDate(isoToMs(e.date))}${e.time ? ', ' + e.time : ''}${e.place ? '\n📍 ' + e.place : ''}${e.description ? '\n\n' + e.description : ''}`;
    $('#set-ann-text').value = text;
  });
  $('#set-ann-copy').addEventListener('click', () => {
    const t = $('#set-ann-text').value; if (!t) return;
    navigator.clipboard.writeText(t).then(() => alert('Скопировано')).catch(() => alert('Не удалось скопировать'));
  });
  $('#set-ann-share').addEventListener('click', () => {
    const t = $('#set-ann-text').value; if (!t) return;
    if (navigator.share) navigator.share({ text: t }).catch(()=>{});
    else { navigator.clipboard.writeText(t); alert('Скопировано (share недоступен)'); }
  });

  $('#set-logout').addEventListener('click', () => {
    Auth.endSession(); location.hash = '#/login'; render();
  });
}

/* ============================================================
   ПОСЕЩАЕМОСТЬ
   ============================================================ */
function openAttendanceForm() {
  const students = db.students.filter(s => s.status === 'ACTIVE').sort((a,b)=>(a.listNumber??9999)-(b.listNumber??9999));
  const date = todayISO();

  if (!students.length) { alert('Сначала добавьте студентов'); return; }

  const existing = db.attendance.filter(a => a.date === date);
  const existingMap = {}; existing.forEach(a => existingMap[a.studentId] = a.status);

  const rows = students.map(s => `
    <div class="att-row" data-sid="${s.id}">
      <div class="att-name">${escapeHtml(s.fullName)}</div>
      <div class="att-radios">
        <label><input type="radio" name="att-${s.id}" value="PRESENT" ${existingMap[s.id]==='PRESENT'?'checked':''} />Был</label>
        <label><input type="radio" name="att-${s.id}" value="ABSENT" ${existingMap[s.id]==='ABSENT'?'checked':''} />Нет</label>
        <label><input type="radio" name="att-${s.id}" value="EXCUSED" ${existingMap[s.id]==='EXCUSED'?'checked':''} />Уваж.</label>
      </div>
    </div>`).join('');

  openModal(`
    <h3>Посещаемость</h3>
    <div class="form-row"><label>Дата</label><input type="date" id="att-date" value="${date}" /></div>
    <div id="att-list" style="max-height:50vh;overflow-y:auto;margin:8px 0">${rows}</div>
    <div class="modal-actions">
      <button type="button" class="btn-secondary" data-close-modal>Отмена</button>
      <button type="button" class="btn-primary compact" id="att-save">Сохранить</button>
    </div>
  `);

  $('#att-date').addEventListener('change', () => {
    const d = $('#att-date').value;
    const ex = db.attendance.filter(a => a.date === d);
    const m = {}; ex.forEach(a => m[a.studentId] = a.status);
    students.forEach(s => {
      const radios = document.querySelectorAll(`input[name="att-${s.id}"]`);
      radios.forEach(r => r.checked = (m[s.id] === r.value));
    });
  });

  $('#att-save').addEventListener('click', () => {
    const d = $('#att-date').value;
    // удалить старые записи на эту дату
    db.attendance = db.attendance.filter(a => a.date !== d);
    students.forEach(s => {
      const checked = document.querySelector(`input[name="att-${s.id}"]:checked`);
      if (checked) db.attendance.push({ id: crypto.randomUUID(), studentId: s.id, date: d, status: checked.value });
    });
    Store.saveDB(db); closeModal(); alert('Сохранено'); render();
  });
}

/* ============================================================
   ТЕМА
   ============================================================ */
function applyTheme() {
  const t = localStorage.getItem('starosta_theme') || 'system';
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.body.classList.toggle('dark', dark);
}

/* ============================================================
   АВТОРИЗАЦИЯ
   ============================================================ */
function initOnboarding() {
  $('#onboarding-form').addEventListener('submit', async e => {
    e.preventDefault();
    const username = $('#ob-username').value.trim();
    const pwd1 = $('#ob-password').value, pwd2 = $('#ob-password2').value;
    const err = $('#ob-error'); err.textContent = '';
    if (username.length < 3) { err.textContent = 'Логин слишком короткий'; return; }
    if (pwd1.length < 6) { err.textContent = 'Пароль минимум 6 символов'; return; }
    if (pwd1 !== pwd2) { err.textContent = 'Пароли не совпадают'; return; }
    await Auth.createAccount(username, pwd1);
    Auth.startSession(username, true);
    location.hash = '#/dashboard'; render();
  });
}

function initLogin() {
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#login-error'); err.textContent = '';
    const lock = Auth.isLocked();
    if (lock.locked) { err.textContent = `Подождите ${lock.secondsLeft} сек.`; return; }
    const username = $('#login-username').value, password = $('#login-password').value;
    const remember = $('#login-remember').checked;
    const ok = await Auth.verifyCredentials(username, password);
    if (!ok) { Auth.registerFailedAttempt(); err.textContent = 'Неверный логин или пароль'; return; }
    Auth.clearFailedAttempts();
    Auth.startSession(Auth.getAuth().username, remember);
    location.hash = '#/dashboard'; render();
  });
}

/* ============================================================
   СТАРТ
   ============================================================ */
function boot() {
  initOnboarding();
  initLogin();
  applyTheme();
  window.addEventListener('hashchange', render);
  document.addEventListener('click', e => { if (e.target.matches('[data-close-modal]')) closeModal(); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
  if (!location.hash) location.hash = '#/dashboard';
  render();
}

document.addEventListener('DOMContentLoaded', boot);
