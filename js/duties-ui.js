// Ekran „Dyżury”: miesiąc (norma, suma, „tygodnie” z limitem 10 h 05 min, liczba ≤ 8) + okno wpisu.
import { dutyMonth, dutyRoomOn, dutyTotals, fmtHM, proposeDuties, proposalShortfall, dutyDayIssues, DUTY_COUNT_MAX, DUTY_WEEK_LIMIT } from './engine.js';
import { buildDutiesIcs } from './ics.js';
import { dutyPay } from './timesheet.js';
import { download } from './more-ui.js';
import { printHtml } from './timesheet-ui.js';
import { fmtDayShort, fmtLong, MONTHS } from './dates.js';
import { esc, helpBox } from './blocks-ui.js';

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

/**
 * „Zero myślenia” na ekranie Dziś: gdy w tym miesiącu brakuje dyżurów (albo od 15. dnia – w następnym miesiącu
 * nic jeszcze nie zaplanowano), karta z gotową propozycją – jedno stuknięcie i dyżury są w aplikacji i w Kalendarzu.
 */
export function dutyPlanCard(state, today) {
  const ym = today.slice(0, 7);
  const [y, mo] = ym.split('-').map(Number);
  const next = `${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, '0')}`;
  const out = [];
  for (const k of [ym, next]) {
    if (k === next && Number(today.slice(8)) < 15) continue;
    const m = dutyMonth(state, k);
    if (m.left <= 0 || (k === next && m.count)) continue;
    const p = proposeDuties(state, k, today);
    if (!p.length) continue;
    out.push(`<div class="todo"><div class="todo-ic">🌙</div><div class="grow">
      <div class="t">Dyżury – ${MONTHS[Number(k.slice(5)) - 1].toLowerCase()}: brakuje ${fmtHM(m.left)}</div>
      <div class="s">Mam gotową propozycję: ${p.length} ${p.length === 1 ? 'dyżur' : p.length < 5 ? 'dyżury' : 'dyżurów'} (${p.map((x) => fmtDayShort(x.date)).join(', ')})</div></div>
      <button class="chip" data-duty-propose="${k}">Zobacz</button></div>`);
  }
  return out.length ? `<div class="card fade todo-card"><div class="card-label">Zaplanuj dyżury</div>${out.join('')}</div>` : '';
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

  const list = m.duties.map((x) => {
    const bad = (m.issues[x.id] || []).filter((w) => w.level === 'warn');
    return `<button class="list-item ev-item ${bad.length ? 'duty-bad' : ''}" data-edit-duty="${esc(x.id)}">
      <div class="ev-ic">${bad.length ? '⚠️' : '🌙'}</div>
      <div class="grow"><div class="t">${fmtDayShort(x.date)}</div>${x.note ? `<div class="s">${esc(x.note)}</div>` : ''}
        ${bad.length ? `<div class="s neg">${esc(bad.map((w) => w.text).join(' · '))}</div>` : ''}</div>
      <b class="tnum">${fmtHM(x.minutes)}</b><span class="chev">›</span></button>`;
  }).join('');

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
    ${helpBox('dyzury')}
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
      <div class="quick two">
        <button class="btn" data-duty-propose="${ym}" ${m.left > 0 ? '' : 'disabled'}>✨ Zaproponuj dyżury</button>
        <button class="btn" data-duty-sheet="${ym}">🖨 Karta dyżurów</button>
      </div>
      ${m.warnings.length ? `<div class="card fade todo-card"><div class="card-label">Uwaga</div>
        ${m.warnings.map((w) => `<div class="todo ${w.level}"><div class="todo-ic">⚠️</div><div class="grow"><div class="t">${esc(w.text)}</div></div></div>`).join('')}</div>` : ''}
    </div><div>
      <div class="card fade"><div class="card-label">Tygodnie miesiąca · limit ${fmtHM(DUTY_WEEK_LIMIT)}</div>${buckets}</div>
      <div class="card fade"><div class="card-label">Dyżury w miesiącu</div>
        ${list || '<div class="muted small" style="padding:6px 0">Brak dyżurów w tym miesiącu.</div>'}</div>
      ${payCard(state, ym)}
      <div class="card fade"><div class="card-label">Cały staż</div>
        <div class="big" style="font-size:28px">${fmtHM(tot.total)}</div>
        <div class="sub">${tot.count} dyżurów · maksymalnie ${fmtHM(tot.max)} (41 tyg. × 10 h 05 min, poradnik OIL)</div>
      </div>
    </div></div>`;
}

/** Szacunek wypłaty za dyżury w miesiącu (rozp. MZ, § 12 pkt 1 lit. a: 125% stawki godzinowej). */
function payCard(state, ym) {
  const p = dutyPay(state, ym);
  const zl = (v) => `${v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
  return `<div class="card fade"><div class="card-label">💰 Wynagrodzenie za dyżury · szacunek</div>
    <label class="dom-sel">Pensja zasadnicza brutto (miesięcznie, z umowy)<input type="number" inputmode="decimal" step="0.01" data-pay-base value="${p.base || ''}" placeholder="np. z umowy lub paska"></label>
    ${p.base ? `<div class="val-row"><span>Stawka godzinowa</span><b>${zl(p.hourly)}</b></div>
      <div class="val-row"><span>Dyżury ${fmtHM(p.dutyMin)} × 125%</span><b>${zl(p.pay)} brutto</b></div>` : ''}
    <p class="hint small">Za każdą godzinę dyżuru stażysty – 125% stawki godzinowej pensji zasadniczej (rozporządzenie w sprawie stażu, Dz.U. 2023 poz. 377, § 12 pkt 1 lit. a). Stawka = pensja / wymiar godzin miesiąca (${fmtHM(p.nominalMin)}). To szacunek do porównania z paskiem – Kadry mogą liczyć stawkę inaczej. Pensja zapisuje się tylko u Ciebie.</p>
  </div>`;
}

/* ---------- Okno dyżuru ---------- */

export function openDutyEditor(state, duty, ctx) {
  const isNew = !state.duties.some((x) => x.id === duty.id);
  const draft = { id: duty.id || `d${Date.now()}`, date: duty.date, minutes: duty.minutes ?? null, note: duty.note || '', start: duty.start || '' };
  // USK2: 2 dyżury w tygodniu – 15:35–20:40 (5 h 05 min) i 15:35–20:35 (5 h)
  if (draft.minutes == null) { const room = dutyRoomOn(state, draft.date).room; draft.minutes = room >= DUTY_WEEK_LIMIT ? 305 : Math.min(room, 300) || 300; }

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
    const chips = [[305, '15:35–20:40 · 5 h 05 min'], [300, '15:35–20:35 · 5 h']].map(([v, l]) =>
      `<button class="chip ${v === draft.minutes ? 'on' : ''}" data-min="${v}">${l}</button>`).join('');
    const issues = dutyDayIssues(state, draft.date);
    const odd = ![300, 305].includes(Number(draft.minutes));
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
          ${issues.map((w) => `<div class="imp-row warn">⚠️ W tym dniu nie może być dyżuru: ${esc(w.text)}</div>`).join('')}
          ${odd ? '<div class="imp-row">ℹ️ W USK2 dyżur trwa 5 h 05 min albo 5 h.</div>' : ''}
          <label>Początek dyżuru (do karty czasu pracy)<input type="time" data-f="start" value="${esc(draft.start || '')}" placeholder="15:35"></label>
          <p class="hint small">Puste = od 15:35 (po zmianie). W tygodniu 2 dyżury: 5 h 05 min + 5 h = 10 h 05 min.</p>
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

/* ---------- Propozycja dyżurów na miesiąc ---------- */

const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function openDutyProposal(state, ym, ctx) {
  const list = proposeDuties(state, ym, ctx.today()).map((x) => ({ ...x, on: true }));
  const short = proposalShortfall(state, ym, list);
  const root = document.createElement('div');
  root.className = 'sheet-wrap';
  document.body.appendChild(root);
  document.body.classList.add('no-scroll');
  const close = () => { root.classList.add('closing'); document.body.classList.remove('no-scroll'); setTimeout(() => root.remove(), 220); };
  const draw = () => {
    const sum = list.filter((x) => x.on).reduce((a, x) => a + x.minutes, 0);
    root.innerHTML = `<div class="sheet-backdrop" data-close></div><div class="sheet" role="dialog" aria-label="Propozycja dyżurów">
      <div class="sheet-head"><button class="link" data-close>Anuluj</button><b>Propozycja dyżurów</b><button class="link strong" data-ok ${sum ? '' : 'disabled'}>Dodaj</button></div>
      <div class="sheet-body">
        <div class="form-card">
          <p class="sub" style="margin-top:0">2 dyżury w każdym tygodniu rozliczeniowym (5 h 05 + 5 h), tylko pn–pt. Pominięte: weekendy, święta, przerwa świąteczna, kursy, urlop i bloki bez dyżurów. Odznacz dni, które Ci nie pasują – potem możesz je przestawić w kalendarzu dyżurów.</p>
          ${list.length ? list.map((x, i) => `<label class="skill ${x.on ? 'on' : ''}"><input type="checkbox" data-pi="${i}" ${x.on ? 'checked' : ''}>
            <span class="box"></span><span class="nm">${fmtLong(x.date)}<small>15:35–${hhmm(935 + x.minutes)} · ${fmtHM(x.minutes)}</small></span></label>`).join('')
            : '<p class="hint">Brak wolnych dni na dyżury albo norma jest już zrobiona.</p>'}
          <div class="imp-row" style="margin-top:8px">Razem: <b>${fmtHM(sum)}</b></div>
          ${short ? `<div class="imp-row warn">⚠️ Do normy zabraknie ${fmtHM(short)} – do końca miesiąca nie ma więcej dni, w które może być dyżur (dni, które minęły, kurs, urlop, święta, przerwa, limit tygodnia). Uzgodnij z Kadrami, czy norma się zmniejsza.</div>` : ''}
        </div>
      </div></div>`;
  };
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    if (e.target.closest('[data-ok]')) {
      const add = list.filter((x) => x.on).map((x, i) => ({ id: `d${Date.now()}${i}`, date: x.date, minutes: x.minutes, start: x.start, note: '' }));
      if (!add.length) return;
      state.duties.push(...add);
      ctx.save(); ctx.render();
      ctx.toast(`Dodano ${add.length} dyżurów ✓`, () => { state.duties = state.duties.filter((d) => !add.includes(d)); ctx.save(); ctx.render(); });
      close();
      return askIcs(state, add);
    }
  });
  root.addEventListener('change', (e) => {
    const i = e.target.dataset.pi;
    if (i != null) { list[Number(i)].on = e.target.checked; draw(); }
  });
  draw();
}

/** Po dodaniu dyżurów: od razu do Kalendarza iPhone'a (plik tylko z nowymi dyżurami). */
function askIcs(state, duties) {
  const root = document.createElement('div');
  root.className = 'sheet-wrap';
  document.body.appendChild(root);
  const close = () => { root.classList.add('closing'); setTimeout(() => root.remove(), 220); };
  root.innerHTML = `<div class="sheet-backdrop" data-close></div><div class="sheet" role="dialog" aria-label="Do Kalendarza">
    <div class="sheet-head"><button class="link" data-close>Nie teraz</button><b>Do Kalendarza</b><span></span></div>
    <div class="sheet-body"><div class="form-card">
      <p class="sub" style="margin-top:0">Dodać ${duties.length} ${duties.length === 1 ? 'dyżur' : 'dyżury'} do Kalendarza iPhone'a (z przypomnieniem rano)? W pliku są tylko te nowe dyżury – nic się nie zdubluje.</p>
      <button class="btn primary" data-ics-go>📅 Dodaj do Kalendarza</button>
    </div></div></div>`;
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    if (e.target.closest('[data-ics-go]')) {
      download('dyzury.ics', buildDutiesIcs(state, duties), 'text/calendar;charset=utf-8');
      close();
    }
  });
}

/* ---------- Karta dyżurów (wzór USK2) ---------- */

const MONTHS_NOM = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
/** 305 -> "5,05", 300 -> "5,00", 2420 -> "40,20" (godziny,minuty – jak na wzorze). */
export const hcomma = (min) => `${Math.floor(min / 60)},${String(min % 60).padStart(2, '0')}`;

export function dutySheetHtml(state, ym) {
  const duties = (state.duties || []).filter((x) => x.date.startsWith(ym)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const n = Math.max(10, duties.length);
  const rows = Array.from({ length: n }, (_, i) => {
    const x = duties[i];
    return `<tr><td class="c lp">${i + 1}</td><td>${x ? `${x.date.slice(8)}.${x.date.slice(5, 7)}.` : ''}</td><td class="c">${x ? hcomma(Number(x.minutes)) : ''}</td><td></td></tr>`;
  }).join('');
  const total = duties.reduce((a, x) => a + Number(x.minutes || 0), 0);
  const name = state.settings.personal?.name || '';
  return `<div class="ks">
    <div class="ks-title">Karta Dyżurów</div>
    <div class="ks-line">Lek.<span>${esc(name) || '……………………………………'}</span></div>
    <div class="ks-line">miesiąc<span>${MONTHS_NOM[Number(ym.slice(5)) - 1]}</span></div>
    <table class="ks-t">
      <thead><tr><th>LP</th><th>DATA</th><th>ILOŚĆ GODZIN</th><th>POTWIERDZENIE</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td class="nb"></td><td class="sm">SUMA GODZIN:</td><td class="c">${total ? hcomma(total) : ''}</td><td class="nb"></td></tr></tfoot>
    </table>
    <div class="ks-sign"><div>SPORZĄDZIŁ:</div><div>ZATWIERDZIŁ:</div></div>
  </div>`;
}

export function printDutySheet(state, ym) {
  printHtml(dutySheetHtml(state, ym), `Karta dyżurów ${MONTHS_NOM[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`);
}
