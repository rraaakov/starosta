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
  const pct = total > 0 ? Math.min(100, Math.round((collected / total) * 100)) :
