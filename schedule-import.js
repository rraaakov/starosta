/* ============================================================
   ИМПОРТ РАСПИСАНИЯ ИЗ ТЕКСТА
   - Парсит даты, дни недели, пары, время, подгруппы
   - Пропускает прошедшие даты
   ============================================================ */
(function () {
  const DAYS_FULL = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
  const DAYS_SHORT = ['пн','вт','ср','чт','пт','сб','вс'];

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function normalizeDay(str) {
    const s = str.trim().toLowerCase();
    for (let i = 0; i < DAYS_FULL.length; i++) {
      if (s === DAYS_FULL[i].toLowerCase() || s === DAYS_SHORT[i]) return i;
    }
    return null;
  }

  function parseDate(str) {
    const m = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (!m) return null;
    const d = +m[1], mo = +m[2], y = +m[3];
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }

  function parseTimeRange(str) {
    const m = str.match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return {
      start: `${String(m[1]).padStart(2,'0')}:${m[2]}`,
      end: `${String(m[3]).padStart(2,'0')}:${m[4]}`,
    };
  }

  function parsePairNumber(str) {
    const m = str.match(/(\d+)\s*-?\s*(?:я\s+)?пара/i) || str.match(/пара\s*(\d+)/i);
    return m ? Number(m[1]) : null;
  }

  function looksLikeTeacher(line) {
    return /^[А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.\s?[А-ЯЁ]?\.?$/.test(line)
      || /^[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+$/.test(line)
      || /^[А-ЯЁ]\.\s?[А-ЯЁ]\.\s?[А-ЯЁ][а-яё]+$/.test(line);
  }

  function looksLikeRoom(line) {
    return /^(?:[А-ЯЁA-Z]{1,4}[\s№]*)?\d{1,4}$/.test(line)
      || /^[А-ЯЁ]{2,4}\s*№?\s*\d{1,4}$/.test(line)
      || /^СПЗ$/i.test(line)
      || /^АСЦ/i.test(line)
      || /^О\d/i.test(line);
  }

  function looksLikeSubject(line) {
    return /\(Прак\.\)|\(Лек\.\)|\(Лаб\.\)|МДК|ОП\.|ЕН\.|Иностранный|Математика|Физика|Химия|Биология|История|Физкультура|Физическая культура|Диагностика|Лечение|Анатомия|Фармакология|Сестринское/i.test(line);
  }

  function parseScheduleText(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim());
    const entries = [];
    const today = todayISO();

    let currentDate = null;
    let currentDay = null;
    let currentPair = null;
    let currentTime = null;
    let sub = null;
    const subgroups = [];

    const flushSubgroup = () => {
      if (!sub) return;
      sub.teacher = (sub.teacher || '').replace(/\s+/g, ' ').trim();
      sub.subject = (sub.subject || '').replace(/\s+/g, ' ').trim();
      sub.room = (sub.room || '').replace(/\s+/g, ' ').trim();
      if (sub.subject || sub.teacher) subgroups.push(sub);
      sub = null;
    };

    const flushPair = () => {
      flushSubgroup();
      // Пропускаем прошедшие даты
      const isPast = currentDate && currentDate < today;
      if (!isPast && currentPair !== null && currentTime && currentDay !== null && subgroups.length) {
        subgroups.forEach(sg => {
          entries.push({
            date: currentDate,
            day: currentDay,
            pair: currentPair,
            timeStart: currentTime.start,
            timeEnd: currentTime.end,
            subgroup: sg.num,
            teacher: sg.teacher,
            subject: sg.subject,
            room: sg.room,
          });
        });
      }
      subgroups.length = 0;
    };

    for (const line of lines) {
      if (!line) continue;

      const iso = parseDate(line);
      if (iso) {
        flushPair();
        currentDate = iso;
        currentDay = (new Date(iso + 'T00:00:00').getDay() + 6) % 7;
        currentPair = null; currentTime = null;
        continue;
      }

      const d = normalizeDay(line);
      if (d !== null) {
        flushPair();
        currentDay = d;
        currentPair = null; currentTime = null;
        continue;
      }

      if (/^сегодня$/i.test(line)) continue;

      const pn = parsePairNumber(line);
      if (pn !== null && /пара/i.test(line)) {
        flushPair();
        currentPair = pn;
        currentTime = null;
        continue;
      }

      const tr = parseTimeRange(line);
      if (tr) { currentTime = tr; continue; }

      const sgLine = line.match(/^\((\d)\)\s*(.*)$/);
      if (sgLine) {
        flushSubgroup();
        sub = { num: Number(sgLine[1]), teacher: sgLine[2] || '', subject: '', room: '' };
        continue;
      }

      if (currentPair === null || !currentTime) continue;

      if (!sub) sub = { num: null, teacher: '', subject: '', room: '' };

      if (!sub.teacher && looksLikeTeacher(line)) { sub.teacher = line; continue; }
      if (!sub.subject && looksLikeSubject(line)) { sub.subject = line; continue; }
      if (!sub.room && looksLikeRoom(line)) { sub.room = line; continue; }
      if (!sub.subject) sub.subject = line;
      else if (!sub.room) sub.room = line;
    }

    flushPair();
    return entries;
  }

  function openScheduleImportDialog() {
    openModal(`
      <h3>Импорт расписания</h3>
      <p style="font-size:13px;color:var(--muted);margin:0 0 12px">
        Вставьте расписание. <b>Прошедшие даты будут автоматически пропущены.</b>
      </p>
      <div class="form-row">
        <textarea id="si-text" rows="12" placeholder="26.10.2026&#10;&#10;Понедельник&#10;&#10;2 пара&#10;&#10;10:00-11:30&#10;&#10;(1)&#10;&#10;Бредихина К.О.&#10;&#10;(Прак.)МДК0206 Диагностика и лечение ИЗиТ&#10;&#10;АСЦ № 202"></textarea>
      </div>
      <button class="settings-btn" id="si-parse">Разобрать</button>
      <div id="si-result" class="hidden" style="margin-top:16px">
        <div class="section-title" style="margin:0 0 8px">Найдено занятий: <span id="si-count">0</span></div>
        <div id="si-preview" style="max-height:40vh;overflow-y:auto;border:1px solid var(--border);border-radius:12px;padding:8px;background:var(--bg)"></div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" data-close-modal>Отмена</button>
          <button type="button" class="btn-primary compact" id="si-save">Добавить в расписание</button>
        </div>
      </div>
    `);

    let parsed = [];
    const today = todayISO();

    function showResult() {
      document.getElementById('si-count').textContent = parsed.length;
      const preview = document.getElementById('si-preview');
      if (!parsed.length) {
        preview.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:13px">Ничего не распознано (или все даты прошедшие).</div>';
      } else {
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
          b.addEventListener('click', () => { parsed.splice(Number(b.dataset.remove), 1); showResult(); });
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
      let added = 0, skippedPast = 0;
      parsed.forEach(p => {
        if (p.date && p.date < today) { skippedPast++; return; }
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
        added++;
      });
      Store.saveDB(db);
      closeModal();
      alert(`Добавлено: ${added}` + (skippedPast ? `\nПропущено прошедших: ${skippedPast}` : ''));
      render();
    });
  }

  window.ScheduleImport = { openScheduleImportDialog, parseScheduleText };
})();
