/* Роутинг, защита, экраны */
const routes = {
  dashboard: { title: 'Главная' },
  students:  { title: 'Студенты' },
  calendar:  { title: 'Календарь' },
  tasks:     { title: 'Задачи' },
  settings:  { title: 'Ещё' },
};

const STATUS_LABELS = {
  ACTIVE: 'Активен',
  ACADEMIC: 'Академ. отпуск',
  EXPELLED: 'Отчислен',
};

let db = null;

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return document.querySelectorAll(sel); }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* ---------- Показ экранов ---------- */
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function showAuthScreens() {
  hide($('#app'));
  const auth = Auth.getAuth();
  if (!auth) { show($('#onboarding')); hide($('#login')); }
  else { hide($('#onboarding')); show($('#login')); }
}

function showApp() {
  hide($('#onboarding'));
  hide($('#login'));
  show($('#app'));
}

/* ---------- Модальное окно ---------- */
function openModal(html) {
  $('#modal-content').innerHTML = html;
  show($('#modal'));
}

function closeModal() {
  hide($('#modal'));
  $('#modal-content').innerHTML = '';
}

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
  const meta = routes[route] || routes.dashboard;
  $('#app-title').textContent = meta.title;

  $all('.bottom-nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.route === route);
  });

  db = Store.loadDB();

  const view = $('#view');
  if (route === 'students') renderStudents(view);
  else if (route === 'settings') renderSettings(view);
  else {
    const placeholders = {
      dashboard: 'Дашборд: статистика, ближайшие события, ДР, задачи. Появится на этапе 6.',
      calendar:  'Календарь событий с месячной сеткой и экспортом .ics. Появится на этапе 3.',
      tasks:     'Список задач с дедлайнами и приоритетами. Появится на этапе 5.',
    };
    view.innerHTML = `<div class="placeholder">${placeholders[route] || 'Скоро здесь что-то будет.'}</div>`;
  }
}

/* ============================================================
   СТУДЕНТЫ
   ============================================================ */

let studentFilters = { q: '', status: '', sort: 'listNumber' };

function renderStudents(view) {
  const { q, status, sort } = studentFilters;

  let list = [...db.students];

  if (q.trim()) {
    const needle = q.trim().toLowerCase();
    list = list.filter(s => s.fullName.toLowerCase().includes(needle));
  }
  if (status) list = list.filter(s => s.status === status);

  if (sort === 'name') {
    list.sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
  } else {
    list.sort((a, b) => {
      const an = a.listNumber ?? 9999;
      const bn = b.listNumber ?? 9999;
      return an - bn;
    });
  }

  const rows = list.map(s => `
    <div class="student-card" data-id="${s.id}">
      <div class="info">
        <div class="name">${escapeHtml(s.fullName)}</div>
        <div class="meta">
          №${s.listNumber ?? '—'} · <span class="badge ${s.status}">${STATUS_LABELS[s.status]}</span>
          ${s.phone ? ' · ' + escapeHtml(s.phone) : ''}
        </div>
      </div>
      <div class="student-actions">
        ${s.phone ? `<button class="icon-btn" data-call="${escapeHtml(s.phone)}" title="Позвонить">📞</button>` : ''}
        ${s.telegram ? `<button class="icon-btn" data-tg="${escapeHtml(s.telegram)}" title="Telegram">✈️</button>` : ''}
        <button class="icon-btn" data-edit="${s.id}" title="Редактировать">✏️</button>
      </div>
    </div>
  `).join('');

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
    <div class="list" id="st-list">
      ${rows || '<div class="empty">Студентов пока нет. Нажмите «+», чтобы добавить.</div>'}
    </div>
    <button class="fab" id="st-add" title="Добавить">+</button>
  `;

  // Поиск и фильтры
  $('#st-q').addEventListener('input', (e) => { studentFilters.q = e.target.value; renderStudents(view); });
  $('#st-status').addEventListener('change', (e) => { studentFilters.status = e.target.value; renderStudents(view); });
  $('#st-sort').addEventListener('change', (e) => { studentFilters.sort = e.target.value; renderStudents(view); });

  $('#st-add').addEventListener('click', () => openStudentForm(null));
  $('#st-export').addEventListener('click', exportStudentsCsv);

  // Действия
  $all('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.edit;
    const s = db.students.find(x => x.id === id);
    if (s) openStudentForm(s);
  }));
  $all('[data-call]').forEach(btn => btn.addEventListener('click', () => {
    location.href = 'tel:' + btn.dataset.call.replace(/[^\d+]/g, '');
  }));
  $all('[data-tg]').forEach(btn => btn.addEventListener('click', () => {
    let u = btn.dataset.tg.trim().replace(/^@/, '');
    if (u.startsWith('http')) location.href = u;
    else location.href = 'https://t.me/' + u;
  }));
}

function openStudentForm(student) {
  const isEdit = !!student;
  const s = student || {
    id: crypto.randomUUID(),
    fullName: '', phone: '', email: '', telegram: '',
    listNumber: '', status: 'ACTIVE', birthDate: '', note: ''
  };

  openModal(`
    <h3>${isEdit ? 'Редактировать студента' : 'Новый студент'}</h3>
    <form id="st-form">
      <div class="form-row">
        <label>ФИО *</label>
        <input type="text" id="f-fullName" required value="${escapeHtml(s.fullName)}" />
      </div>
      <div class="form-row">
        <label>Номер по списку</label>
        <input type="number" id="f-listNumber" value="${s.listNumber ?? ''}" />
      </div>
      <div class="form-row">
        <label>Статус</label>
        <select id="f-status">
          <option value="ACTIVE" ${s.status==='ACTIVE'?'selected':''}>Активен</option>
          <option value="ACADEMIC" ${s.status==='ACADEMIC'?'selected':''}>Академ. отпуск</option>
          <option value="EXPELLED" ${s.status==='EXPELLED'?'selected':''}>Отчислен</option>
        </select>
      </div>
      <div class="form-row">
        <label>Телефон</label>
        <input type="tel" id="f-phone" value="${escapeHtml(s.phone)}" />
      </div>
      <div class="form-row">
        <label>Email</label>
        <input type="email" id="f-email" value="${escapeHtml(s.email)}" />
      </div>
      <div class="form-row">
        <label>Telegram (ник или ссылка)</label>
        <input type="text" id="f-telegram" value="${escapeHtml(s.telegram)}" />
      </div>
      <div class="form-row">
        <label>Дата рождения</label>
        <input type="date" id="f-birthDate" value="${s.birthDate || ''}" />
      </div>
      <div class="form-row">
        <label>Заметка</label>
        <textarea id="f-note">${escapeHtml(s.note)}</textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" data-close-modal>Отмена</button>
        ${isEdit ? `<button type="button" class="btn-danger" id="f-delete">Удалить</button>` : ''}
        <button type="submit" class="btn-primary compact">Сохранить</button>
      </div>
    </form>
  `);

  $('#st-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fullName = $('#f-fullName').value.trim();
    if (!fullName) return;

    const data = {
      id: s.id,
      fullName,
      listNumber: $('#f-listNumber').value ? Number($('#f-listNumber').value) : null,
      status: $('#f-status').value,
      phone: $('#f-phone').value.trim(),
      email: $('#f-email').value.trim(),
      telegram: $('#f-telegram').value.trim(),
      birthDate: $('#f-birthDate').value,
      note: $('#f-note').value.trim(),
    };

    if (isEdit) {
      const idx = db.students.findIndex(x => x.id === s.id);
      db.students[idx] = data;
    } else {
      db.students.push(data);
    }
    Store.saveDB(db);
    closeModal();
    render();
  });

  if (isEdit) {
    $('#f-delete').addEventListener('click', () => {
      if (!confirm(`Удалить студента «${s.fullName}»?`)) return;
      db.students = db.students.filter(x => x.id !== s.id);
      // заодно почистим посещаемость
      db.attendance = db.attendance.filter(a => a.studentId !== s.id);
      Store.saveDB(db);
      closeModal();
      render();
    });
  }
}

function exportStudentsCsv() {
  const header = ['№', 'ФИО', 'Статус', 'Телефон', 'Email', 'Telegram', 'Дата рождения', 'Заметка'];
  const rows = db.students
    .slice()
    .sort((a, b) => (a.listNumber ?? 9999) - (b.listNumber ?? 9999))
    .map(s => [
      s.listNumber ?? '',
      s.fullName,
      STATUS_LABELS[s.status] || '',
      s.phone || '',
      s.email || '',
      s.telegram || '',
      s.birthDate || '',
      s.note || '',
    ]);

  const csv = [header, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `students-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ============================================================
   НАСТРОЙКИ (пока базово: выход)
   ============================================================ */
function renderSettings(view) {
  view.innerHTML = `
    <div class="placeholder" style="text-align:left">
      Настройки появятся полностью на этапе 6: тема, экспорт/импорт JSON, смена пароля.
    </div>
    <div style="margin-top:16px">
      <button id="logout-btn" class="btn-danger" style="width:100%">Выйти</button>
    </div>
  `;
  $('#logout-btn').addEventListener('click', () => {
    Auth.endSession();
    location.hash = '#/login';
    render();
  });
}

/* ---------- Онбординг и вход (без изменений) ---------- */
function initOnboarding() {
  $('#onboarding-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('#ob-username').value.trim();
    const pwd1 = $('#ob-password').value;
    const pwd2 = $('#ob-password2').value;
    const err = $('#ob-error');
    err.textContent = '';
    if (username.length < 3) { err.textContent = 'Логин слишком короткий'; return; }
    if (pwd1.length < 6) { err.textContent = 'Пароль минимум 6 символов'; return; }
    if (pwd1 !== pwd2) { err.textContent = 'Пароли не совпадают'; return; }
    await Auth.createAccount(username, pwd1);
    Auth.startSession(username, true);
    location.hash = '#/dashboard';
    render();
  });
}

function initLogin() {
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-error');
    err.textContent = '';
    const lock = Auth.isLocked();
    if (lock.locked) {
      err.textContent = `Слишком много попыток. Подождите ${lock.secondsLeft} сек.`;
      return;
    }
    const username = $('#login-username').value;
    const password = $('#login-password').value;
    const remember = $('#login-remember').checked;
    const ok = await Auth.verifyCredentials(username, password);
    if (!ok) {
      Auth.registerFailedAttempt();
      err.textContent = 'Неверный логин или пароль';
      return;
    }
    Auth.clearFailedAttempts();
    const auth = Auth.getAuth();
    Auth.startSession(auth.username, remember);
    location.hash = '#/dashboard';
    render();
  });
}

/* ---------- Старт ---------- */
function boot() {
  initOnboarding();
  initLogin();

  window.addEventListener('hashchange', render);

  // Закрытие модалки
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-close-modal]')) closeModal();
  });

  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.body.classList.add('dark');
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

  if (!location.hash) location.hash = '#/dashboard';
  render();
}

document.addEventListener('DOMContentLoaded', boot);
