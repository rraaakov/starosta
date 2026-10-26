/* ============================================================
   СТАРОСТА v2 — полная версия
   ============================================================ */
const routes = {
  dashboard: { title: 'Главная' },
  students:  { title: 'Студенты' },
  calendar:  { title: 'Календарь' },
  tasks:     { title: 'Задачи' },
  more:      { title: 'Ещё' },
  funds:     { title: 'Взносы' },
  schedule:  { title: 'Расписание' },
  settings:  { title: 'Настройки' },
};

const STATUS_LABELS = { ACTIVE: 'Активен', ACADEMIC: 'Академ. отпуск', EXPELLED: 'Отчислен' };
const EVENT_TYPE_LABELS = { EXAM: 'Экзамен', CREDIT: 'Зачёт', DEADLINE: 'Дедлайн', MEETING: 'Собрание', OTHER: 'Другое' };
const PRIORITY_LABELS = { HIGH: 'Высокий', NORMAL: 'Обычный', LOW: 'Низкий' };
const DAYS = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];

let db = null;

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return document.querySelectorAll(sel); }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtDate(ms) { return new Date(ms).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function isoToMs(iso) { return new Date(iso + 'T00:00:00').getTime(); }
function uid() { return crypto.randomUUID(); }

/* аватар по инициалам: детерминированный цвет из имени */
function avatarColor(name) {
  const palette = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f59e0b','#10b981','#0ea5e9','#14b8a6','#d946ef','#ef4444'];
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
function initials(name) {
  const p = name.trim().split(/\s+/);
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0].slice(0,2).toUpperCase();
  return (p[0][0] + p[1][0]).toUpperCase();
}
function avatarHtml(name) {
  return `<div class="avatar" style="background:linear-gradient(135deg, ${avatarColor(name)}, ${avatarColor(name)}dd)">${escapeHtml(initials(name))}</div>`;
}

/* ---------- Экраны ---------- */
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function showAuth() {
  hide($('#app'));
  if (!Auth.getAuth()) { show($('#onboarding')); hide($('#login')); }
  else { hide($('#onboarding')); show($('#login')); }
}
function showApp() { hide($('#onboarding')); hide($('#login')); show($('#app')); }

function openModal(html) {
  $('#modal-content').innerHTML = html;
  show($('#modal'));
}
function closeModal() { hide($('#modal')); $('#modal-content').innerHTML = ''; }

/* ---------- Роутинг ---------- */
function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  return hash.split('/')[0] || 'dashboard';
}

function setTitle(t) { $('#app-title').textContent = t; }

function render() {
  if (!Auth.getSession()) { showAuth(); return; }
  showApp();

  const route = currentRoute();
  setTitle((routes[route] || routes.dashboard).title);
  $all('.bottom-nav a').forEach(a => a.classList.toggle('active', a.dataset.route === route));

  db = Store.loadDB();

  // бейдж невыполненных задач
  const openTasks = db.tasks.filter(t => !t.done).length;
  const badge = $('#tasks-badge');
  if (badge) {
    badge.textContent = openTasks;
    badge.classList.toggle('hidden', openTasks === 0);
  }

  const view = $('#view');
  view.innerHTML = '<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>';

  // лёгкая задержка чтобы показать скелетон (20мс)
  setTimeout(() => {
    if (route === 'students') renderStudents(view);
    else if (route === 'calendar') renderCalendar(view);
    else if (route === 'tasks') renderTasks(view);
    else if (route === 'more') renderMore(view);
    else if (route === 'funds') renderFunds(view);
    else if (route === 'schedule') renderSchedule(view);
    else if (route === 'settings') renderSettings(view);
    else renderDashboard(view);
  }, 30);
}

/* ============================================================
   ДАШБОРД
   ============================================================ */
function renderDashboard(view) {
  const now = new Date();
  const today = todayISO();
  const hour = now.getHours();
  const greet = hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';

  const activeStudents = db.students.filter(s => s.status === 'ACTIVE').length;

  // ДР в ближайшие 30 дней
  const bdays = [];
  db.students.forEach(s => {
    if (!s.birthDate) return;
    const bd = new Date(s.birthDate + 'T00:00:00');
    const next = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
    if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next.setFullYear(now.getFullYear() + 1);
    const days = Math.ceil((next - now) / 86400000);
    if (days <= 30) bdays.push({ name: s.fullName, days, id: s.id });
  });
  bdays.sort((a, b) => a.days - b.days);

  // ближайшие события
  const upcoming = db.events.filter(e => e.date >= today).sort((a,b) => a.date.localeCompare(b.date)).slice(0, 5);

  // ближайшая пара сегодня
  const dow = (now.getDay() + 6) % 7; // Пн=0
  const todayLessons = db.schedule.filter(x => x.day === dow).sort((a,b) => a.time.localeCompare(b.time));
  const nowTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const nextLesson = todayLessons.find(x => x.time >= nowTime);

  const bdaysHtml = bdays.length ? bdays.slice(0, 5).map(b => `
    <div class="bday-item">
      ${avatarHtml(b.name)}
      <div class="bday-info">
        <div class="bday-name">${escapeHtml(b.name)}</div>
        <div class="bday-when">${b.days === 0 ? '🎉 Сегодня!' : 'через ' + b.days + ' дн.'}</div>
      </div>
      <div class="bday-emoji">🎂</div>
    </div>`).join('') : '<div class="empty" style="padding:20px"><span class="empty-emoji">🎈</span>Нет ближайших ДР</div>';

  const eventsHtml = upcoming.length ? upcoming.map(e => `
    <div class="event-item">
      <div style="flex:1;min-width:0">
        <div class="event-title">${escapeHtml(e.title)}</div>
        <div class="event-meta">${fmtDate(isoToMs(e.date))}${e.time ? ', ' + e.time : ''}${e.place ? ' · ' + escapeHtml(e.place) : ''}</div>
      </div>
      <span class="event-type-badge ${e.type}">${EVENT_TYPE_LABELS[e.type]}</span>
    </div>`).join('') : '<div class="empty" style="padding:20px"><span class="empty-emoji">📅</span>Событий нет</div>';

  const lessonHtml = nextLesson
    ? `<div class="sched-item"><div class="sched-time">${nextLesson.time}</div><div class="sched-body"><div class="sched-subject">${escapeHtml(nextLesson.subject)}</div><div class="sched-teacher">${escapeHtml(nextLesson.teacher || '')}</div></div></div>`
    : '<div class="empty" style="padding:12px;font-size:13px">На сегодня пар больше нет</div>';

  view.innerHTML = `
    <div class="dash-hero slide-up">
      <h1>${greet} 👋</h1>
      <p>У вас ${activeStudents} студентов${bdays.length ? ' · ' + bdays.filter(b=>b.days===0).length + ' ДР сегодня' : ''}</p>
    </div>

    <div class="dash-grid">
      <div class="stat-card accent">
        <div class="num">${activeStudents}</div>
        <div class="label">Активных</div>
      </div>
      <div class="stat-card">
        <div class="num">${db.tasks.filter(t=>!t.done).length}</div>
        <div class="label">Задач</div>
      </div>
      <div class="stat-card">
        <div class="num">${db.events.filter(e=>e.date>=today).length}</div>
        <div class="label">Событий</div>
      </div>
      <div class="stat-card">
        <div class="num">${db.funds.totalAmount > 0 ? Math.round((db.funds.payments.filter(p=>p.paid).reduce((s,p)=>s+p.amount,0) / db.funds.totalAmount) * 100) : 0}%</div>
        <div class="label">Собрано взносов</div>
      </div>
    </div>

    <div class="section-title">Ближайшие пары сегодня</div>
    ${lessonHtml}

    <div class="section-title">Ближайшие ДР</div>
    ${bdaysHtml}

    <div class="section-title">Ближайшие события</div>
    ${eventsHtml}
  `;
}

/* ============================================================
   СТУДЕНТЫ (с группировкой по букве)
   ============================================================ */
let studentFilters = { q: '', status: '', sort: 'name' };

function renderStudents(view) {
  const { q, status, sort } = studentFilters;
  let list = [...db.students];
  if (q.trim()) { const n = q.trim().toLowerCase(); list = list.filter(s => s.fullName.toLowerCase().includes(n)); }
  if (status) list = list.filter(s => s.status === status);

  // Сортировка: сначала по ролям (староста, бригадир), потом по алфавиту
  list.sort((a, b) => {
    const roleOrder = { starosta: 0, brigadier: 1, none: 2 };
    const ra = roleOrder[a.role || 'none'];
    const rb = roleOrder[b.role || 'none'];
    if (ra !== rb) return ra - rb;
    return a.fullName.localeCompare(b.fullName, 'ru');
  });

  // Группировка по первой букве фамилии
  const groups = {};
  list.forEach(s => {
    const letter = (s.fullName[0] || '?').toUpperCase();
    if (!groups[letter]) groups[letter] = [];
    groups[letter].push(s);
  });

  const groupsHtml = Object.keys(groups).sort((a,b) => a.localeCompare(b, 'ru')).map(letter => {
    const rows = groups[letter].map(s => {
      const roleBadge = s.role === 'starosta' ? '<span class="role-badge starosta">Староста</span>' :
                        s.role === 'brigadier' ? '<span class="role-badge brigadier">Бригадир</span>' : '';
      return `
        <div class="card student-card">
          ${avatarHtml(s.fullName)}
          <div class="student-info">
            <div class="student-name">${escapeHtml(s.fullName)} ${roleBadge}</div>
            <div class="student-meta">№${s.listNumber ?? '—'} · <span class="badge ${s.status}">${STATUS_LABELS[s.status]}</span>${s.birthDate ? ' · 🎂 ' + fmtDate(isoToMs(s.birthDate)) : ''}</div>
          </div>
          <div class="student-actions">
            ${s.phone ? `<button class="icon-btn" data-call="${escapeHtml(s.phone)}">📞</button>` : ''}
            ${s.telegram ? `<button class="icon-btn" data-tg="${escapeHtml(s.telegram)}">✈️</button>` : ''}
            <button class="icon-btn" data-edit="${s.id}">✏️</button>
          </div>
        </div>`;
    }).join('');
    return `<div class="letter-group"><div class="letter-header">${letter}</div>${rows}</div>`;
  }).join('');

  view.innerHTML = `
    <div class="toolbar">
      <input type="text" id="st-q" placeholder="Поиск по ФИО" value="${escapeHtml(q)}" />
      <select id="st-status">
        <option value="">Все</option>
        <option value="ACTIVE" ${status==='ACTIVE'?'selected':''}>Активные</option>
        <option value="ACADEMIC" ${status==='ACADEMIC'?'selected':''}>Академические</option>
        <option value="EXPELLED" ${status==='EXPELLED'?'selected':''}>Отчисленные</option>
      </select>
    </div>
    <div class="toolbar" style="margin-top:-4px">
      <button class="btn-secondary" id="st-export" style="flex:1">Экспорт CSV</button>
    </div>
    ${groupsHtml || '<div class="empty"><span class="empty-emoji">👥</span>Студентов нет. Нажмите «+» или импортируйте TXT в «Ещё».</div>'}
    <button class="fab" id="st-add">+</button>
  `;

  $('#st-q').addEventListener('input', e => { studentFilters.q = e.target.value; renderStudents(view); });
  $('#st-status').addEventListener('change', e => { studentFilters.status = e.target.value; renderStudents(view); });
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
  const s = student || { id: uid(), fullName: '', phone: '', email: '', telegram: '', listNumber: '', status: 'ACTIVE', birthDate: '', note: '', role: 'none' };
  openModal(`
    <h3>${isEdit ? 'Редактировать студента' : 'Новый студент'}</h3>
    <form id="st-form">
      <div class="form-row"><label>ФИО *</label><input type="text" id="f-fullName" required value="${escapeHtml(s.fullName)}" /></div>
      <div class="form-row"><label>Роль</label>
        <select id="f-role">
          <option value="none" ${s.role==='none'?'selected':''}>— нет —</option>
          <option value="starosta" ${s.role==='starosta'?'selected':''}>Староста</option>
          <option value="brigadier" ${s.role==='brigadier'?'selected':''}>Бригадир</option>
        </select>
      </div>
      <div class="form-row"><label>Номер по списку</label><input type="number" id="f-listNumber" value="${s.listNumber ?? ''}" /></div>
      <div class="form-row"><label>Статус</label>
        <select id="f-status">
          <option value="ACTIVE" ${s.status==='ACTIVE'?'selected':''}>Активен</option>
          <option value="ACADEMIC" ${s.status==='ACADEMIC'?'selected':''}>Академический отпуск</option>
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
      role: $('#f-role').value,
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
    // синхронизируем payments с новыми студентами
    syncPayments();
    Store.saveDB(db); closeModal(); render();
  });

  if (isEdit) $('#f-delete').addEventListener('click', () => {
    if (!confirm(`Удалить студента «${s.fullName}»?`)) return;
    db.students = db.students.filter(x => x.id !== s.id);
    db.attendance = db.attendance.filter(a => a.studentId !== s.id);
    db.funds.payments = db.funds.payments.filter(p => p.studentId !== s.id);
    Store.saveDB(db); closeModal(); render();
  });
}

function syncPayments() {
  const existingIds = new Set(db.funds.payments.map(p => p.studentId));
  db.students.forEach(s => {
    if (!existingIds.has(s.id)) {
      db.funds.payments.push({ id: uid(), studentId: s.id, paid: false, amount: 0, date: null });
    }
  });
  // Удаляем payments для несуществующих
  const studentIds = new Set(db.students.map(s => s.id));
  db.funds.payments = db.funds.payments.filter(p => studentIds.has(p.studentId));
}

function exportStudentsCsv() {
  const header = ['ФИО','Роль','№','Статус','Телефон','Email','Telegram','Дата рождения','Заметка'];
  const rows = db.students.slice().sort((a,b) => a.fullName.localeCompare(b.fullName, 'ru'))
    .map(s => [s.fullName, s.role || 'none', s.listNumber ?? '', STATUS_LABELS[s.status] || '', s.phone || '', s.email || '', s.telegram || '', s.birthDate || '', s.note || '']);
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `students-${todayISO()}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

/* ---------- Импорт TXT ---------- */
function parseBirthDate(raw) {
  const s = raw.trim();
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) {
    const d = +m[1], mo = +m[2], y = +m[3];
    if (d>=1&&d<=31&&mo>=1&&mo<=12&&y>=1900&&y<=2100) return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    return null;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  return null;
}

function importStudentsFromTxt(text) {
  const lines = text.split(/\r?\n/);
  let added = 0, skipped = 0, errors = 0;
  const normalizeName = s => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const existingNames = new Set(db.students.map(s => normalizeName(s.fullName)));

  lines.forEach(rawLine => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const parts = line.split(/\s*[;|\t]\s*/);
    if (parts.length < 2) { errors++; return; }
    const fullName = parts[0].trim().replace(/\s+/g, ' ');
    const birthDate = parseBirthDate(parts[1].trim());
    if (!fullName || !birthDate) { errors++; return; }
    const key = normalizeName(fullName);
    if (existingNames.has(key)) { skipped++; return; }
    db.students.push({
      id: uid(), fullName, phone: '', email: '', telegram: '',
      listNumber: null, status: 'ACTIVE', birthDate, note: '', role: 'none',
    });
    existingNames.add(key);
    added++;
  });

  db.students.forEach((s,i) => { if (s.listNumber == null) s.listNumber = i + 1; });
  syncPayments();
  Store.saveDB(db);
  return { added, skipped, errors };
}

/* ============================================================
   ВЗНОСЫ
   ============================================================ */
function renderFunds(view) {
  const total = db.funds.totalAmount || 0;
  const activePayments = db.funds.payments.filter(p => {
    const st = db.students.find(s => s.id === p.studentId);
    return st && st.status === 'ACTIVE';
  });
  const collected = activePayments.filter(p => p.paid).reduce((s,p) => s + (p.amount || 0), 0);
  const pct = total > 0 ? Math.min(100, Math.round((collected / total) * 100)) : 0;

  const paidCount = activePayments.filter(p => p.paid).length;
  const totalCount = activePayments.length;

  const rowsHtml = activePayments.map(p => {
    const st = db.students.find(s => s.id === p.studentId);
    if (!st) return '';
    return `
      <div class="pay-row">
        ${avatarHtml(st.fullName)}
        <div class="pay-name">${escapeHtml(st.fullName)}</div>
        <button class="pay-status ${p.paid ? 'paid' : 'unpaid'}" data-toggle-pay="${p.id}">
          ${p.paid ? '✓ Сдал' : '✗ Не сдал'}
        </button>
      </div>`;
  }).join('');

  view.innerHTML = `
    <div class="fund-hero slide-up">
      <div class="fund-sub">Собрано взносов</div>
      <div class="fund-amount">${collected.toLocaleString('ru-RU')} / ${total.toLocaleString('ru-RU')} ₽</div>
      <div class="fund-sub">${paidCount} из ${totalCount} сдали</div>
      <div class="fund-progress"><div style="width:${pct}%"></div></div>
    </div>
    <div class="toolbar">
      <button class="btn-secondary" id="fund-set-total" style="flex:1">Изменить сумму сбора</button>
    </div>
    <div class="section-title">Кто сдал</div>
    ${rowsHtml || '<div class="empty"><span class="empty-emoji">💸</span>Добавьте студентов</div>'}
  `;

  $('#fund-set-total').addEventListener('click', () => {
    const current = db.funds.totalAmount || 0;
    const v = prompt('Сумма сбора с каждого (₽):', current);
    if (v === null) return;
    const num = Number(v);
    if (isNaN(num) || num < 0) { alert('Некорректная сумма'); return; }
    db.funds.totalAmount = num;
    db.funds.payments.forEach(p => { if (p.amount !== num) { p.amount = num; } });
    Store.saveDB(db); renderFunds(view);
  });

  $all('[data-toggle-pay]').forEach(btn => btn.addEventListener('click', () => {
    const p = db.funds.payments.find(x => x.id === btn.dataset.togglePay);
    if (!p) return;
    p.paid = !p.paid;
    p.date = p.paid ? todayISO() : null;
    p.amount = db.funds.totalAmount || 0;
    Store.saveDB(db); renderFunds(view);
  }));
}

/* ============================================================
   РАСПИСАНИЕ
   ============================================================ */
function renderSchedule(view) {
  const todayDow = (new Date().getDay() + 6) % 7;
  const sorted = [...db.schedule].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));

  const byDay = {};
  sorted.forEach(x => { if (!byDay[x.day]) byDay[x.day] = []; byDay[x.day].push(x); });

  const daysHtml = Object.keys(byDay).map(d => {
    const items = byDay[d].map(x => `
      <div class="sched-item" data-edit-sched="${x.id}">
        <div class="sched-time">${x.time}</div>
        <div class="sched-body">
          <div class="sched-subject">${escapeHtml(x.subject)}</div>
          <div class="sched-teacher">${escapeHtml(x.teacher || '')}${x.room ? ' · ' + escapeHtml(x.room) : ''}</div>
        </div>
      </div>
    `).join('');
    return `<div class="sched-day ${Number(d) === todayDow ? 'today' : ''}">
      <div class="sched-day-title">${DAYS[d]}</div>
      ${items}
    </div>`;
  }).join('');

  view.innerHTML = `
    ${daysHtml || '<div class="empty"><span class="empty-emoji">📚</span>Расписание пустое. Нажмите «+», чтобы добавить пару.</div>'}
    <button class="fab" id="sched-add">+</button>
  `;

  $('#sched-add').addEventListener('click', () => openSchedForm(null));
  $all('[data-edit-sched]').forEach(el => el.addEventListener('click', () => {
    const s = db.schedule.find(x => x.id === el.dataset.editSched); if (s) openSchedForm(s);
  }));
}

function openSchedForm(item) {
  const isEdit = !!item;
  const s = item || { id: uid(), day: 0, time: '09:00', subject: '', teacher: '', room: '' };
  openModal(`
    <h3>${isEdit ? 'Редактировать пару' : 'Новая пара'}</h3>
    <form id="sched-form">
      <div class="form-row"><label>День недели</label>
        <select id="sf-day">
          ${DAYS.map((d,i) => `<option value="${i}" ${s.day===i?'selected':''}>${d}</option>`).join('')}
        </select>
      </div>
      <div class="form-row"><label>Время</label><input type="time" id="sf-time" required value="${s.time}" /></div>
      <div class="form-row"><label>Предмет *</label><input type="text" id="sf-subject" required value="${escapeHtml(s.subject)}" /></div>
      <div class="form-row"><label>Преподаватель</label><input type="text" id="sf-teacher" value="${escapeHtml(s.teacher)}" /></div>
      <div class="form-row"><label>Аудитория</label><input type="text" id="sf-room" value="${escapeHtml(s.room)}" /></div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" data-close-modal>Отмена</button>
        ${isEdit ? '<button type="button" class="btn-danger" id="sf-delete">Удалить</button>' : ''}
        <button type="submit" class="btn-primary compact">Сохранить</button>
      </div>
    </form>`);

  $('#sched-form').addEventListener('submit', e => {
    e.preventDefault();
    const subject = $('#sf-subject').value.trim(); if (!subject) return;
    const data = {
      id: s.id, day: +$('#sf-day').value, time: $('#sf-time').value,
      subject, teacher: $('#sf-teacher').value.trim(), room: $('#sf-room').value.trim(),
    };
    if (isEdit) { const i = db.schedule.findIndex(x => x.id === s.id); db.schedule[i] = data; }
    else db.schedule.push(data);
    Store.saveDB(db); closeModal(); render();
  });

  if (isEdit) $('#sf-delete').addEventListener('click', () => {
    if (!confirm('Удалить пару?')) return;
    db.schedule = db.schedule.filter(x => x.id !== s.id);
    Store.saveDB(db); closeModal(); render();
  });
}

/* ============================================================
   КАЛЕНДАРЬ
   ============================================================ */
let calState = { year: new Date().getFullYear(), month: new Date().getMonth(), selectedDate: todayISO(), filterType: '' };

function renderCalendar(view) {
  const { year, month, selectedDate, filterType } = calState;
  const firstDay = new Date(year, month, 1);
  const startDow = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const dows = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

  let cells = '';
  dows.forEach(d => cells += `<div class="cal-dow">${d}</div>`);
  for (let i = startDow - 1; i >= 0; i--) cells += `<div class="cal-cell other">${prevDays - i}</div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = iso === todayISO();
    const isSel = iso === selectedDate;
    const events = db.events.filter(e => e.date === iso && (!filterType || e.type === filterType));
    const dots = events.slice(0,3).map(e => `<div class="cal-dot ${e.type}"></div>`).join('');
    cells += `<div class="cal-cell ${isToday?'today':''} ${isSel?'selected':''}" data-date="${iso}">${d}${dots ? '<div style="display:flex;gap:2px;margin-top:2px">'+dots+'</div>' : ''}</div>`;
  }
  const totalCells = startDow + daysInMonth;
  const tail = (7 - (totalCells % 7)) % 7;
  for (let d = 1; d <= tail; d++) cells += `<div class="cal-cell other">${d}</div>`;

  const dayEvents = db.events.filter(e => e.date === selectedDate && (!filterType || e.type === filterType)).sort((a,b) => (a.time||'').localeCompare(b.time||''));
  const eventsHtml = dayEvents.length ? dayEvents.map(e => `
    <div class="event-item" data-event-id="${e.id}">
      <div style="flex:1;min-width:0">
        <div class="event-title">${escapeHtml(e.title)}</div>
        <div class="event-meta">${e.time || 'весь день'}${e.place ? ' · ' + escapeHtml(e.place) : ''}</div>
      </div>
      <span class="event-type-badge ${e.type}">${EVENT_TYPE_LABELS[e.type]}</span>
    </div>`).join('') : '<div class="empty" style="padding:20px">Нет событий на этот день</div>';

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
    <div class="section-title">${fmtDate(isoToMs(selectedDate))}</div>
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
  const e = event || { id: uid(), title: '', type: 'OTHER', date: defaultDate || todayISO(), time: '', place: '', description: '' };
  openModal(`
    <h3>${isEdit ? 'Редактировать' : 'Новое событие'}</h3>
    <form id="ev-form">
      <div class="form-row"><label>Название *</label><input type="text" id="ef-title" required value="${escapeHtml(e.title)}" /></div>
      <div class="form-row"><label>Тип</label>
        <select id="ef-type">${Object.entries(EVENT_TYPE_LABELS).map(([k,v]) => `<option value="${k}" ${e.type===k?'selected':''}>${v}</option>`).join('')}</select>
      </div>
      <div class="form-row"><label>Дата</label><input type="date" id="ef-date" required value="${e.date}" /></div>
      <div class="form-row"><label>Время</label><input type="time" id="ef-time" value="${e.time||''}" /></div>
      <div class="form-row"><label>Место</label><input type="text" id="ef-place" value="${escapeHtml(e.place)}" /></div>
      <div class="form-row"><label>Описание</label><textarea id="ef-desc">${escapeHtml(e.description)}</textarea></div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" data-close-modal>Отмена</button>
        ${isEdit ? '<button type="button" class="btn-danger" id="ef-delete">Удалить</button>' : ''}
        <button type="submit" class="btn-primary compact">Сохранить</button>
      </div>
    </form>`);

  $('#ev-form').addEventListener('submit', ev => {
    ev.preventDefault();
    const title = $('#ef-title').value.trim(); if (!title) return;
    const data = { id: e.id, title, type: $('#ef-type').value, date: $('#ef-date').value, time: $('#ef-time').value, place: $('#ef-place').value.trim(), description: $('#ef-desc').value.trim() };
    if (isEdit) { const i = db.events.findIndex(x => x.id === e.id); db.events[i] = data; }
    else db.events.push(data);
    Store.saveDB(db); closeModal(); render();
  });

  if (isEdit) $('#ef-delete').addEventListener('click', () => {
    if (!confirm('Удалить событие?')) return;
    db.events = db.events.filter(x => x.id !== e.id);
    Store.saveDB(db); closeModal(); render();
  });
}

/* ============================================================
   ЗАДАЧИ
   ============================================================ */
let taskFilter = 'active';

function renderTasks(view) {
  let list = [...db.tasks];
  if (taskFilter === 'active') list = list.filter(t => !t.done);
  else if (taskFilter === 'done') list = list.filter(t => t.done);
  list.sort((a,b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (a.deadline || '9999').localeCompare(b.deadline || '9999');
  });

  const rows = list.map(t => `
    <div class="task-item ${t.done?'done':''}">
      <input type="checkbox" data-toggle="${t.id}" ${t.done?'checked':''} />
      <div class="task-body" data-edit="${t.id}">
        <div class="task-title">${escapeHtml(t.title)}</div>
        <div class="task-meta"><span class="priority-${t.priority}">${PRIORITY_LABELS[t.priority]}</span>${t.deadline ? ' · до ' + fmtDate(isoToMs(t.deadline)) : ''}</div>
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
    ${rows || '<div class="empty"><span class="empty-emoji">✅</span>Задач нет. Добавьте первую!</div>'}
    <button class="fab" id="tk-add">+</button>
  `;

  $('#tk-filter').addEventListener('change', e => { taskFilter = e.target.value; renderTasks(view); });
  $('#tk-add').addEventListener('click', () => openTaskForm(null));
  $all('[data-toggle]').forEach(cb => cb.addEventListener('change', () => {
    const t = db.tasks.find(x => x.id === cb.dataset.toggle);
    if (t) { t.done = cb.checked; Store.saveDB(db); renderTasks(view); renderTasksBadge(); }
  }));
  $all('[data-edit]').forEach(el => el.addEventListener('click', () => {
    const t = db.tasks.find(x => x.id === el.dataset.edit); if (t) openTaskForm(t);
  }));
}

function renderTasksBadge() {
  const open = db.tasks.filter(t => !t.done).length;
  const badge = $('#tasks-badge');
  if (badge) { badge.textContent = open; badge.classList.toggle('hidden', open === 0); }
}

function openTaskForm(task) {
  const isEdit = !!task;
  const t = task || { id: uid(), title: '', deadline: '', priority: 'NORMAL', done: false };
  openModal(`
    <h3>${isEdit ? 'Редактировать задачу' : 'Новая задача'}</h3>
    <form id="tk-form">
      <div class="form-row"><label>Название *</label><input type="text" id="tf-title" required value="${escapeHtml(t.title)}" /></div>
      <div class="form-row"><label>Дедлайн</label><input type="date" id="tf-deadline" value="${t.deadline||''}" /></div>
      <div class="form-row"><label>Приоритет</label>
        <select id="tf-priority">${Object.entries(PRIORITY_LABELS).map(([k,v]) => `<option value="${k}" ${t.priority===k?'selected':''}>${v}</option>`).join('')}</select>
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
   "ЕЩЁ"
   ============================================================ */
function renderMore(view) {
  view.innerHTML = `
    <div class="more-grid">
      <div class="more-tile" data-goto="funds">
        <span class="more-icon">💸</span>
        <div class="more-label">Взносы</div>
      </div>
      <div class="more-tile" data-goto="schedule">
        <span class="more-icon">📚</span>
        <div class="more-label">Расписание</div>
      </div>
      <div class="more-tile" data-goto="settings">
        <span class="more-icon">⚙️</span>
        <div class="more-label">Настройки</div>
      </div>
      <div class="more-tile" data-goto="attendance">
        <span class="more-icon">✔️</span>
        <div class="more-label">Посещаемость</div>
      </div>
    </div>
  `;
  $all('[data-goto]').forEach(el => el.addEventListener('click', () => {
    const g = el.dataset.goto;
    if (g === 'attendance') openAttendanceForm();
    else location.hash = '#/' + g;
  }));
}

/* ============================================================
   ПОСЕЩАЕМОСТЬ
   ============================================================ */
function openAttendanceForm() {
  const students = db.students.filter(s => s.status === 'ACTIVE').sort((a,b) => a.fullName.localeCompare(b.fullName, 'ru'));
  if (!students.length) { alert('Сначала добавьте студентов'); return; }
  const date = todayISO();
  const existing = db.attendance.filter(a => a.date === date);
  const m = {}; existing.forEach(a => m[a.studentId] = a.status);

  const rows = students.map(s => `
    <div class="att-row" data-sid="${s.id}" style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);gap:10px">
      <div style="flex:1;font-size:14px">${escapeHtml(s.fullName)}</div>
      <div style="display:flex;gap:8px;font-size:12px">
        <label style="display:flex;align-items:center;gap:4px"><input type="radio" name="att-${s.id}" value="PRESENT" ${m[s.id]==='PRESENT'?'checked':''} /> Был</label>
        <label style="display:flex;align-items:center;gap:4px"><input type="radio" name="att-${s.id}" value="ABSENT" ${m[s.id]==='ABSENT'?'checked':''} /> Нет</label>
        <label style="display:flex;align-items:center;gap:4px"><input type="radio" name="att-${s.id}" value="EXCUSED" ${m[s.id]==='EXCUSED'?'checked':''} /> Уваж.</label>
      </div>
    </div>`).join('');

  openModal(`
    <h3>Посещаемость</h3>
    <div class="form-row"><label>Дата</label><input type="date" id="att-date" value="${date}" /></div>
    <div style="max-height:50vh;overflow-y:auto">${rows}</div>
    <div class="modal-actions">
      <button type="button" class="btn-secondary" data-close-modal>Отмена</button>
      <button type="button" class="btn-primary compact" id="att-save">Сохранить</button>
    </div>`);

  $('#att-save').addEventListener('click', () => {
    const d = $('#att-date').value;
    db.attendance = db.attendance.filter(a => a.date !== d);
    students.forEach(s => {
      const checked = document.querySelector(`input[name="att-${s.id}"]:checked`);
      if (checked) db.attendance.push({ id: uid(), studentId: s.id, date: d, status: checked.value });
    });
    Store.saveDB(db); closeModal(); alert('Сохранено'); render();
  });
}

/* ============================================================
   НАСТРОЙКИ
   ============================================================ */
function renderSettings(view) {
  const theme = localStorage.getItem('starosta_theme') || 'system';
  const accent = localStorage.getItem('starosta_accent') || 'indigo';
  const accents = ['indigo','violet','emerald','rose','amber','sky'];
  const accentColors = { indigo:'#6366f1', violet:'#8b5cf6', emerald:'#10b981', rose:'#f43f5e', amber:'#f59e0b', sky:'#0ea5e9' };

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
      <div style="margin-top:12px">
        <div style="font-size:13px;color:var(--muted);margin-bottom:8px;font-weight:600">Акцентный цвет</div>
        <div class="accent-picker">
          ${accents.map(a => `<div class="accent-dot ${accent===a?'selected':''}" data-accent="${a}" style="background:${accentColors[a]}"></div>`).join('')}
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h4>Студенты</h4>
      <button class="settings-btn" id="set-import-txt">Импорт студентов из TXT</button>
      <input type="file" id="set-import-txt-file" accept=".txt,text/plain" class="hidden" />
      <p style="font-size:12px;color:var(--muted);margin:8px 0 0">Формат: <b>ФИО;ДД.ММ.ГГГГ</b> на каждой строке</p>
    </div>

    <div class="settings-section">
      <h4>Данные</h4>
      <button class="settings-btn" id="set-export">Экспорт JSON (бэкап)</button>
      <button class="settings-btn" id="set-import">Импорт JSON</button>
      <input type="file" id="set-import-file" accept="application/json" class="hidden" />
      <button class="settings-btn danger" id="set-reset">Сбросить все данные</button>
    </div>

    <div class="settings-section">
      <h4>Аккаунт</h4>
      <button class="settings-btn" id="set-logout">Выйти</button>
    </div>
  `;

  $('#set-theme').addEventListener('change', e => { localStorage.setItem('starosta_theme', e.target.value); applyTheme(); });
  $all('[data-accent]').forEach(el => el.addEventListener('click', () => {
    const a = el.dataset.accent;
    localStorage.setItem('starosta_accent', a);
    applyAccent();
    renderSettings(view);
  }));

  $('#set-import-txt').addEventListener('click', () => $('#set-import-txt-file').click());
  $('#set-import-txt-file').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const text = await f.text();
      const r = importStudentsFromTxt(text);
      alert(`Добавлено: ${r.added}\nПропущено: ${r.skipped}\nОшибок: ${r.errors}`);
      e.target.value = ''; render();
    } catch (err) { alert('Ошибка: ' + err.message); }
  });

  $('#set-export').addEventListener('click', () => Store.exportDB());
  $('#set-import').addEventListener('click', () => $('#set-import-file').click());
  $('#set-import-file').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { await Store.importDB(f); alert('Импорт успешен'); render(); }
    catch { alert('Ошибка импорта'); }
  });
  $('#set-reset').addEventListener('click', () => {
    if (!confirm('Удалить ВСЕ данные?')) return;
    Store.resetDB(); render();
  });
  $('#set-logout').addEventListener('click', () => {
    Auth.endSession(); location.hash = '#/login'; render();
  });
}

/* ============================================================
   ТЕМА / АКЦЕНТ
   ============================================================ */
function applyTheme() {
  const t = localStorage.getItem('starosta_theme') || 'system';
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.body.classList.toggle('dark', dark);
}
function applyAccent() {
  const a = localStorage.getItem('starosta_accent') || 'indigo';
  document.body.dataset.accent = a;
}

/* ============================================================
   АВТОРИЗАЦИЯ
   ============================================================ */
function initOnboarding() {
  $('#onboarding-form').addEventListener('submit', async e => {
    e.preventDefault();
    const u = $('#ob-username').value.trim();
    const p1 = $('#ob-password').value, p2 = $('#ob-password2').value;
    const err = $('#ob-error'); err.textContent = '';
    if (u.length < 3) { err.textContent = 'Логин слишком короткий'; return; }
    if (p1.length < 6) { err.textContent = 'Пароль минимум 6 символов'; return; }
    if (p1 !== p2) { err.textContent = 'Пароли не совпадают'; return; }
    await Auth.createAccount(u, p1);
    Auth.startSession(u, true);
    location.hash = '#/dashboard'; render();
  });
}

function initLogin() {
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#login-error'); err.textContent = '';
    const lock = Auth.isLocked();
    if (lock.locked) { err.textContent = `Подождите ${lock.secondsLeft} сек.`; return; }
    const u = $('#login-username').value, p = $('#login-password').value;
    const ok = await Auth.verifyCredentials(u, p);
    if (!ok) { Auth.registerFailedAttempt(); err.textContent = 'Неверный логин или пароль'; return; }
    Auth.clearFailedAttempts();
    Auth.startSession(Auth.getAuth().username, $('#login-remember').checked);
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
  applyAccent();

  window.addEventListener('hashchange', render);
  document.addEventListener('click', e => { if (e.target.matches('[data-close-modal]')) closeModal(); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
  if (!location.hash) location.hash = '#/dashboard';
  render();
}

document.addEventListener('DOMContentLoaded', boot);
