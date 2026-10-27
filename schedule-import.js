/* ============================================================
   ИМПОРТ РАСПИСАНИЯ ИЗ ТЕКСТА
   Формат: дата, день, "N пара", время "ЧЧ:ММ-ЧЧ:ММ",
   опционально подгруппы (1)/(2) с преподавателем, предметом, аудиторией.
   ============================================================ */
(function () {
  const DAYS_FULL = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
  const DAYS_SHORT = ['пн','вт','ср','чт','пт','сб','вс'];

  // ---------- Вспомогательные ----------
  function normalizeDay(str) {
    const s = str.trim().toLowerCase();
    for (let i = 0; i < DAYS_FULL.length; i++) {
      if (s === DAYS_FULL[i].toLowerCase() || s === DAYS_SHORT[i]) return i;
    }
    return null;
  }

  function parseDate(str) {
    // ДД.ММ.ГГГГ / ДД/ММ/ГГГГ / ДД-ММ-ГГГГ
    const m = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (!m) return null;
    const d = +m[1], mo = +m[2], y = +m[3];
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }

  function parseTimeRange(str) {
    // "10:00-11:30" / "8:00 - 9:30"
    const m = str.match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const start = `${String(m[1]).padStart(2,'0')}:${m[2]}`;
    const end = `${String(m[3]).padStart(2,'0')}:${m[4]}`;
    return { start, end };
  }

  function parsePairNumber(str) {
    // "2 пара" / "Пара 2" / "3-я пара"
    const m = str.match(/(\d+)\s*-?\s*(?:я\s+)?пара/i) || str.match(/пара\s*(\d+)/i);
    return m ? Number(m[1]) : null;
  }

  // ---------- Основной парсер ----------
  function parseScheduleText(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim());
    const entries = [];

    // Состояние
    let currentDate = null;       // "YYYY-MM-DD"
    let currentDay = null;        // 0..6
    let currentPair = null;       // номер пары
    let currentTime = null;       // {start, end}
    let currentSubgroups = [];    // [{ num, teacher, subject, room }]

    // Что «собираем» прямо сейчас в подгруппе
    let sub = null;

    const flushSubgroup = () => {
      if (!sub) return;
      // Дочищаем
      sub.teacher = (sub.teacher || '').replace(/\s+/g, ' ').trim();
      sub.subject = (sub.subject || '').replace(/\s+/g, ' ').trim();
      sub.room = (sub.room || '').replace(/\s+/g, ' ').trim();
      if (sub.subject || sub.teacher) currentSubgroups.push(sub);
      sub = null;
    };

    const flushPair = () => {
      flushSubgroup();
      if (currentPair === null || !currentTime || currentDay === null) {
        currentSubgroups = [];
        return;
      }
      // Если подгрупп не было, но есть «общая» пара — она сюда не попадёт (см. ниже)
      currentSubgroups.forEach(sg => {
        entries.push({
          date: currentDate,          // может быть null для недельного формата
          day: currentDay,
          pair: currentPair,
          timeStart: currentTime.start,
          timeEnd: currentTime.end,
          subgroup: sg.num || null,
          teacher: sg.teacher,
          subject: sg.subject,
          room: sg.room,
        });
      });
      currentSubgroups = [];
    };

    for (const line of lines) {
      if (!line) continue;

      // 1) Дата
      const dateIso = parseDate(line);
      if (dateIso) {
        flushPair();
        currentDate = dateIso;
        // определим день недели из даты
        const dow = (new Date(dateIso + 'T00:00:00').getDay() + 6) % 7;
        currentDay = dow;
        currentPair = null;
        currentTime = null;
        continue;
      }

      // 2) День недели отдельной строкой
      const d = normalizeDay(line);
      if (d !== null) {
        flushPair();
        currentDay = d;
        currentPair = null;
        currentTime = null;
        continue;
      }

      // 3) «N пара»
      const pn = parsePairNumber(line);
      if (pn !== null && /пара/i.test(line)) {
        flushPair();
        currentPair = pn;
        currentTime = null;
        continue;
      }

      // 4) Время
      const tr = parseTimeRange(line);
      if (tr) {
        currentTime = tr;
        continue;
      }

      // 5) Подгруппа «(1)» / «(2)» отдельной строкой
      const sgMatch = line.match(/^\((\d)\)$/);
      if (sgMatch) {
        flushSubgroup();
        sub = { num: Number(sgMatch[1]), teacher: '', subject: '', room: '' };
        continue;
      }

      // Если в строке есть подгруппа и преподаватель вместе — редкость, но обработаем
      const sgInline = line.match(/^\((\d)\)\s*(.*)$/);
      if (sgInline) {
        flushSubgroup();
        sub = { num: Number(sgInline[1]), teacher: sgInline[2] || '', subject: '', room: '' };
        continue;
      }

      // 6) Если сейчас есть активная подгруппа — распределяем строку
      if (sub) {
        // предмет?
        if (/\(Прак\.\)|\(Лек\.\)|\(Лаб\.\)|МДК|ОП\.|ЕН\.|Иностранный|Математика|Физика|Химия|Биология|История|Физкультура|Физическая культура/i.test(line)
          || /^[А-ЯЁ][а-яё]/.test(line) && !sub.subject) {
          // но не путать с преподавателем вида "Иванов И.И."
          const looksLikeTeacher = /^[А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.\s?[А-ЯЁ]?\.?$/.test(line)
            || /^[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+$/.test(line);
          if (!looksLikeTeacher && !sub.subject) {
            sub.subject = line;
            continue;
          }
        }
        // преподаватель?
        const looksLikeTeacher = /^[А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.\s?[А-ЯЁ]?\.?$/.test(line)
          || /^[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+$/.test(line)
          || /^[А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.\s?[А-ЯЁ]\.$/.test(line)
          || /^[А-ЯЁ]\.\s?[А-ЯЁ]\.\s?[А-ЯЁ][а-яё]+$/.test(line);
        if (!sub.teacher && looksLikeTeacher) {
          sub.teacher = line;
          continue;
        }
        // аудитория — если ещё не заполнена и строка короткая/с цифрами/«АСЦ», «О1», «СПЗ»
        if (!sub.room && /^(?:[А-ЯЁA-Z]{1,4}[\s№]*)?\d{1,4}$|^[А-ЯЁ]{2,4}\s*№?\s*\d{1,4}$|^СПЗ$|^АСЦ/i.test(line)) {
          sub.room = line;
          continue;
        }
        // Если ничего не подошло и предмет уже есть — считаем, что это продолжение (например, длинное название)
        if (!sub.subject) sub.subject = line;
        else if (!sub.teacher) sub.teacher = line;
        else if (!sub.room) sub.room = line;
        continue;
      }

      // 7) Пара без подгруппы: «преподаватель» уже мог быть прочитан
      // В вашем формате без (1)/(2) бывает физкультура. Тогда строки идут:
      // Кривоножко Т.В. / (Прак.)Физическая культура / СПЗ
      if (currentPair !== null && currentTime) {
        if (!sub) {
          sub = { num: null, teacher: '', subject: '', room: '' };
        }
        const looksLikeTeacher = /^[А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.\s?[А-ЯЁ]?\.?$/.test(line)
          || /^[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+$/.test(line);
        if (!sub.teacher && looksLikeTeacher) sub.teacher = line;
        else if (!sub.subject && /\(Прак\.\)|\(Лек\.\)|МДК|ОП\.|ЕН\.|Физическая культура|Иностранный/i.test(line)) sub.subject = line;
        else if (!sub.room && /^(?:[А-ЯЁA-Z]{1,4}[\s№]*)?\d{1,4}$|^[А-ЯЁ]{2,4}\s*№?\s*\d{1,4}$|^СПЗ$|^АСЦ/i.test(line)) sub.room = line;
        else if (!sub.subject) sub.subject = line;
        else if (!sub.room) sub.room = line;
      }
    }

    flushPair();

    // Постобработка: проставить дату для записей без даты по дню недели
    // (если пользователь вставил недельный формат без дат — оставим date=null, day=известен)
    return entries;
  }

  // ---------- UI ----------
  function openScheduleImportDialog() {
    const html = `
      <h3>Импорт расписания</h3>
      <p style="font-size:13px;color:var(--muted);margin:0 0 12px">
        Вставьте расписание из деканата. Поддерживаются даты, дни недели, номера пар,
        время и подгруппы (1)/(2).
      </p>
      <div class="form-row">
        <textarea id="si-text" rows="14" placeholder="26.10.2026

Понедельник

2 пара

10:00-11:30

(1)

Бредихина К.О.

(Прак.)МДК0206 Диагностика и лечение ИЗиТ

АСЦ № 202"></textarea>
      </div>
      <button class="settings-btn" id="si-parse">Разобрать</button>

      <div id="si-result" class="hidden" style="margin-top:16px">
        <div class="section-title" style="margin:0 0 8px">
          Найдено занятий: <span id="si-count">0</span>
        </div>
        <div id="si-preview" style="max-height:40vh;overflow-y:auto;border:1px solid var(--border);border-radius:12px;padding:8px;background:var(--bg)"></div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" data-close-modal>Отмена</button>
          <button type="button" class="btn-primary compact" id="si-save">Добавить в расписание</button>
        </div>
      </div>
    `;
    openModal(html);

    let parsed = [];

    function showResult() {
      document.getElementById('si-count').textContent = parsed.length;
      const preview = document.getElementById('si-preview');
      if (!parsed.length) {
        preview.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:13px">Ничего не распознано. Проверьте формат.</div>';
      } else {
        // Группируем по дате/дню и номеру пары для красивого вывода
        const groups = {};
        parsed.forEach((p, i) => {
          const key = (p.date || 'day' + p.day) + '|' + p.pair;
          if (!groups[key]) groups[key] = { date: p.date, day: p.day, pair: p.pair, timeStart: p.timeStart, timeEnd: p.timeEnd, items: [] };
          groups[key].items.push({ ...p, _idx: i });
        });

        preview.innerHTML = Object.values(groups).map(g => {
          const dateLabel = g.date ? g.date.split('-').reverse().join('.') : DAYS_FULL[g.day];
          const items = g.items.map(it => `
            <div style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:13px">
              ${it.subgroup ? `<b style="color:var(--accent);min-width:24px">(${it.subgroup})</b>` : '<span style="min-width:24px"></span>'}
              <span style="flex:1">
                <b>${escapeHtml(it.subject || '—')}</b>
                <span style="color:var(--muted)"> · ${escapeHtml(it.teacher || '')}${it.room ? ' · ' + escapeHtml(it.room) : ''}</span>
              </span>
              <button class="icon-btn" data-remove="${it._idx}" style="width:26px;height:26px;font-size:11px">✕</button>
            </div>
          `).join('');
          return `
            <div style="margin-bottom:10px;padding:8px;background:var(--card);border-radius:10px;border:1px solid var(--border)">
              <div style="font-weight:700;font-size:13px;margin-bottom:4px">
                ${dateLabel} · ${g.pair} пара · ${g.timeStart}–${g.timeEnd}
              </div>
              ${items}
            </div>`;
        }).join('');

        preview.querySelectorAll('[data-remove]').forEach(b => {
          b.addEventListener('click', () => {
            parsed.splice(Number(b.dataset.remove), 1);
            showResult();
          });
        });
      }
      document.getElementById('si-result').classList.remove('hidden');
    }

    document.getElementById('si-parse').addEventListener('click', () => {
      parsed = parseScheduleText(document.getElementById('si-text').value);
      showResult();
    });

    document.getElementById('si-save').addEventListener('click', () => {
      if (!parsed.length) { closeModal(); return; }
      parsed.forEach(p => {
        db.schedule.push({
          id: crypto.randomUUID(),
          date: p.date || null,
          day: p.day,
          pair: p.pair,
          time: p.timeStart,
          timeEnd: p.timeEnd,
          subject: p.subject,
          teacher: p.teacher,
          room: p.room,
          subgroup: p.subgroup,
        });
      });
      Store.saveDB(db);
      closeModal();
      alert(`Добавлено занятий: ${parsed.length}`);
      render();
    });
  }

  window.ScheduleImport = { openScheduleImportDialog, parseScheduleText };
})();
