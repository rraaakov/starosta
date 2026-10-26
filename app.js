/* Роутинг, защита, экраны-заглушки */
const routes = {
  dashboard: { title: 'Главная' },
  students:  { title: 'Студенты' },
  calendar:  { title: 'Календарь' },
  tasks:     { title: 'Задачи' },
  settings:  { title: 'Ещё' },
};

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return document.querySelectorAll(sel); }

/* ---------- Показ экранов ---------- */
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function showAuthScreens() {
  hide($('#app'));
  const auth = Auth.getAuth();
  if (!auth) {
    show($('#onboarding'));
    hide($('#login'));
  } else {
    hide($('#onboarding'));
    show($('#login'));
  }
}

function showApp() {
  hide($('#onboarding'));
  hide($('#login'));
  show($('#app'));
}

/* ---------- Роутинг ---------- */
function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  return hash.split('/')[0] || 'dashboard';
}

function render() {
  const session = Auth.getSession();
  if (!session) {
    showAuthScreens();
    return;
  }
  showApp();

  const route = currentRoute();
  const meta = routes[route] || routes.dashboard;

  $('#app-title').textContent = meta.title;

  // Активная вкладка
  $all('.bottom-nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.route === route);
  });

  // Заглушки (Этап 1)
  const view = $('#view');
  const placeholders = {
    dashboard: 'Дашборд: статистика, ближайшие события, дни рождения, задачи. Появится на этапе 6.',
    students:  'Список студентов, поиск, сортировка, добавление и редактирование. Появится на этапе 2.',
    calendar:  'Календарь событий с месячной сеткой и экспортом .ics. Появится на этапе 3.',
    tasks:     'Список задач с дедлайнами и приоритетами. Появится на этапе 5.',
    settings:  'Настройки: тема, экспорт/импорт JSON, смена пароля, выход. Появится на этапе 6.',
  };
  view.innerHTML = `<div class="placeholder">${placeholders[route] || 'Скоро здесь что-то будет.'}</div>`;

  // Кнопка выхода — временно в настройках
  if (route === 'settings') {
    view.innerHTML += `
      <div style="margin-top:16px">
        <button id="logout-btn" class="btn-primary" style="background:var(--danger)">Выйти</button>
      </div>`;
    $('#logout-btn').addEventListener('click', () => {
      Auth.endSession();
      location.hash = '#/login';
      render();
    });
  }
}

/* ---------- Онбординг ---------- */
function initOnboarding() {
  const form = $('#onboarding-form');
  form.addEventListener('submit', async (e) => {
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

/* ---------- Вход ---------- */
function initLogin() {
  const form = $('#login-form');
  form.addEventListener('submit', async (e) => {
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

  // тема из настроек (пока просто системная)
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.body.classList.add('dark');
  }

  // Регистрация service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

  // Стартовый роут
  if (!location.hash) location.hash = '#/dashboard';
  render();
}

document.addEventListener('DOMContentLoaded', boot);
