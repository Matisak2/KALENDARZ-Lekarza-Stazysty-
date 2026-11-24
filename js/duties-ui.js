// Ekran „Dyżury”: miesiąc (norma, suma, „tygodnie” z limitem 10 h 05 min, liczba ≤ 8) + okno wpisu.
import { dutyMonth, dutyRoomOn, dutyTotals, fmtHM, DUTY_COUNT_MAX, DUTY_WEEK_LIMIT } from './engine.js';
import { fmtDayShort, fmtLong, MONTHS } from './dates.js';
import { esc } from './blocks-ui.js';

function ring(pct, size, stroke, center) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="bar" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"
        stroke-dasharray="${c}" stroke-dashoffset="${c}" data-target="${c * (1 - p)}"/>
    </svg><div class="ring-center">${center}</div></div>`;
}

/** Karta dyżurów na ekran „Dziś”. */
export function dutyTodayCard(state, today) {
  const m = dutyMonth(state, today.slice(0, 7));
  if (!m.norm && !m.count) return '';
  const pct = m.norm ? m.total / m.norm : 1;
  return `<button class="card fade duty-mini" data-goto-tab="dyzury" style="--block:var(--c-course)">
    <div class="card-label">🌙 Dyżury · ${MONTHS[Number(m.ym.slice(5)) - 1].toLowerCase()}</div>
    <div style="display:flex;align-items:center;gap:14px">
      ${ring(pct, 58, 7, `<b style="font-size:13px">${Math.round(Math.min(pct, 9.99) * 100)}%</b>`)}
      <div><div style="font-weight:800;font-size:16px">${fmtHM(m.total)} <span class="muted" style="font-weight:600">z ${fmtHM(m.norm)}</span></div>
      <div class="sub" style="margin-top:2px">${m.count} z ${DUTY_COUNT_MAX} dyżurów${m.left > 0 ? ` · zostało ${fmtHM(m.left)}` : m.norm ? ' · norma zrobiona ✓' : ''}</div></div>
    </div>
    ${m.warnings.length ? `<div class="imp-row warn" style="margin-top:6px">⚠️ ${esc(m.warnings[0].text)}</div>` : ''}
  </button>`;
}

export function renderDuties(state, today, ym) {
  const m = dutyMonth(state, ym);
  const [y, mo] = ym.split('-').map(Number);
  const pct = m.norm ? m.total / m.norm : (m.total ? 1 : 0);
  const tot = dutyTotals(state);
  const status = !m.norm && !m.total ? 'W tym miesiącu nie ma obowiązkowych dyżurów'
    : m.left > 0 ? `Zostało ${fmtHM(m.left)}` : m.left === 0 ? 'Norma zrobiona ✓' : `Ponad normę o ${fmtHM(-m.left)}`;

  const buckets = m.buckets.map((b) => {
    const w = Math.min(100, (b.minutes / b.limit) * 100);
    return `<div class="bk ${b.minutes > b.limit ? 'over' : ''} ${b.dutyWeek ? '' : 'nodu'}">
      <div class="bk-head"><b>Tydzień ${b.i}</b><span class="muted">${b.start.slice(8)}–${b.end.slice(8)}.${b.end.slice(5, 7)}</span>
        <span class="bk-v">${fmtHM(b.minutes)} <span class="muted">/ ${fmtHM(b.limit)}</span></span></div>
      <div class="bk-bar"><div style="width:${w}%"></div></div>
      ${!b.dutyWeek ? '<div class="hint small" style="margin-top:4px">blok bez obowiązkowych dyżurów</div>' : ''}
    </div>`;
  }).join('');

  const list = m.duties.map((x) => `<button class="list-item ev-item" data-edit-duty="${esc(x.id)}">
      <div class="ev-ic">🌙</div>
      <div class="grow"><div class="t">${fmtDayShort(x.date)}</div>${x.note ? `<div class="s">${esc(x.note)}</div>` : ''}</div>
      <b class="tnum">${fmtHM(x.minutes)}</b><span class="chev">›</span></button>`).join('');

  const defDate = today.startsWith(ym) ? today : `${ym}-01`;
  return `
    <header class="page-head cal-head">
      <div><div class="eyebrow">Dyżury · ${y}</div><h1 class="large-title">${MONTHS[mo - 1]}</h1></div>
      <div class="cal-nav">
        <button class="round" data-dmonth="-1" aria-label="Poprzedni miesiąc">‹</button>
        <button class="pill-btn" data-dmonth="today">Dziś</button>
        <button class="round" data-dmonth="1" aria-label="Następny miesiąc">›</button>
      </div>
    </header>
    <div class="desk-2"><div>
      <div class="card hero fade" style="--block:var(--c-course)">
        <div class="hero-top">
          <div class="hero-info">
            <div class="card-label">Ten miesiąc</div>
            <div class="hero-name">${fmtHM(m.total)}</div>
            <div class="hero-place">norma: ${fmtHM(m.norm)}${m.reduction ? ` (−${fmtHM(m.reduction)} za ${m.absenceWorkdays} dni urlopu/L4)` : ''}</div>
          </div>
          ${ring(pct, 96, 10, `<b>${Math.round(Math.min(pct, 9.99) * 100)}%</b><span>normy</span>`)}
        </div>
        <div class="hero-stats">
          <div class="stat"><b>${m.count}<small class="muted" style="font-size:14px">/${DUTY_COUNT_MAX}</small></b><span>dyżurów</span></div>
          <div class="stat"><b>${m.dutyWeeks}</b><span>tygodnie z dyżurami</span></div>
          <div class="stat"><b style="font-size:17px">${m.left > 0 ? fmtHM(m.left) : '0'}</b><span>zostało</span></div>
        </div>
        <div class="pills"><span class="pill">${status}</span></div>
      </div>
      <button class="btn primary add-ev" data-new-duty="${defDate}">＋ Dodaj dyżur</button>
      ${m.warnings.length ? `<div class="card fade todo-card"><div class="card-label">Uwaga</div>
        ${m.warnings.map((w) => `<div class="todo ${w.level}"><div class="todo-ic">⚠️</div><div class="grow"><div class="t">${esc(w.text)}</div></div></div>`).join('')}</div>` : ''}
    </div><div>
      <div class="card fade"><div class="card-label">Tygodnie miesiąca · limit ${fmtHM(DUTY_WEEK_LIMIT)}</div>${buckets}</div>
      <div class="card fade"><div class="card-label">Dyżury w miesiącu</div>
        ${list || '<div class="muted small" style="padding:6px 0">Brak dyżurów w tym miesiącu.</div>'}</div>
      <div class="card fade"><div class="card-label">Cały staż</div>
        <div class="big" style="font-size:28px">${fmtHM(tot.total)}</div>
        <div class="sub">${tot.count} dyżurów · maksymalnie ${fmtHM(tot.max)} (41 tyg. × 10 h 05 min, poradnik OIL)</div>
      </div>
    </div></div>`;
}

/* ---------- Okno dyżuru ---------- */

export function openDutyEditor(state, duty, ctx) {
  const isNew = !state.duties.some((x) => x.id === duty.id);
  const draft = { id: duty.id || `d${Date.now()}`, date: duty.date, minutes: duty.minutes ?? null, note: duty.note || '', start: duty.start || '' };
  if (draft.minutes == null) draft.minutes = Math.min(DUTY_WEEK_LIMIT, dutyRoomOn(state, draft.date).room) || 300;

  const root = document.createElement('div');
  root.className = 'sheet-wrap';
  document.body.appendChild(root);
  document.body.classList.add('no-scroll');
  const close = () => { root.classList.add('closing'); document.body.classList.remove('no-scroll'); setTimeout(() => root.remove(), 220); };

  const draw = () => {
    const room = dutyRoomOn(state, draft.date, draft.id);
    const after = room.used + Number(draft.minutes || 0);
    const h = Math.floor(draft.minutes / 60);
    const mi = draft.minutes % 60;
    const chips = [...new Set([room.room, 300, 302, 605].filter((v) => v > 0))].map((v) =>
      `<button class="chip ${v === draft.minutes ? 'on' : ''}" data-min="${v}">${v === room.room ? `reszta tygodnia · ${fmtHM(v)}` : fmtHM(v)}</button>`).join('');
    const valid = draft.date && draft.minutes > 0;
    root.innerHTML = `<div class="sheet-backdrop" data-close></div>
    <div class="sheet" role="dialog" aria-label="Dyżur">
      <div class="sheet-head"><button class="link" data-close>Anuluj</button><b>${isNew ? 'Nowy dyżur' : 'Edytuj dyżur'}</b>
        <button class="link strong" data-ok ${valid ? '' : 'disabled'}>Zapisz</button></div>
      <div class="sheet-body">
        <div class="form-card">
          <label>Dzień (początek dyżuru)<input type="date" data-f="date" value="${draft.date}"></label>
          <div class="row2">
            <label>Godziny<input type="number" inputmode="numeric" min="0" max="24" data-f="h" value="${h}"></label>
            <label>Minuty<input type="number" inputmode="numeric" min="0" max="59" step="1" data-f="m" value="${mi}"></label>
          </div>
          <div class="chips">${chips}</div>
          <label>Początek dyżuru (do karty czasu pracy)<input type="time" data-f="start" value="${esc(draft.start || '')}" placeholder="15:35"></label>
          <p class="hint small">Puste = w dzień pracy od 15:35 (po zmianie), w weekend i święto od 8:00.</p>
          <label>Notatka<input data-f="note" value="${esc(draft.note)}" placeholder="np. SOR, oddział"></label>
        </div>
        <div class="form-card impact">
          <div class="card-label">Tydzień ${room.bucket.i} miesiąca (${room.bucket.start.slice(8)}–${room.bucket.end.slice(8)})</div>
          <div class="imp-row ${after > DUTY_WEEK_LIMIT ? 'warn' : ''}">Po zapisie: <b>${fmtHM(after)}</b> z ${fmtHM(DUTY_WEEK_LIMIT)}${after > DUTY_WEEK_LIMIT ? ' ⚠️ ponad limit' : ''}</div>
          <div class="hint small">${fmtLong(draft.date)}</div>
        </div>
        ${!isNew ? '<button class="btn danger-btn" data-del>Usuń dyżur</button>' : ''}
      </div>
    </div>`;
  };

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    const c = e.target.closest('[data-min]');
    if (c) { draft.minutes = Number(c.dataset.min); return draw(); }
    if (e.target.closest('[data-ok]')) {
      if (!(draft.date && draft.minutes > 0)) return;
      const i = state.duties.findIndex((x) => x.id === draft.id);
      if (i >= 0) state.duties[i] = draft; else state.duties.push(draft);
      ctx.save(); ctx.render(); ctx.toast('Zapisano ✓');
      return close();
    }
    if (e.target.closest('[data-del]')) {
      const i = state.duties.findIndex((x) => x.id === draft.id);
      const removed = state.duties.splice(i, 1)[0];
      ctx.save(); ctx.render();
      ctx.toast('Usunięto', () => { state.duties.push(removed); ctx.save(); ctx.render(); });
      return close();
    }
  });
  root.addEventListener('change', (e) => {
    const f = e.target.dataset.f;
    if (f === 'date' && e.target.value) draft.date = e.target.value;
    else if (f === 'h' || f === 'm') {
      const hh = Number(root.querySelector('[data-f="h"]').value) || 0;
      const mm = Math.min(59, Number(root.querySelector('[data-f="m"]').value) || 0);
      draft.minutes = Math.max(0, hh * 60 + mm);
    } else if (f === 'note') { draft.note = e.target.value; return; }
    else if (f === 'start') { draft.start = e.target.value; return; }
    draw();
  });
  root.addEventListener('input', (e) => { if (e.target.dataset.f === 'note') draft.note = e.target.value; });
  draw();
}
