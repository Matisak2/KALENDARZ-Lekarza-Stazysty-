// Ekran „Kalendarz”: miesiąc w kolorach bloków + okno dnia + dodawanie wpisów (urlop, L4…).
import { summarize, dayInfo, eventImpact, dutyDayIssues } from './engine.js';
import { EVENT_TYPES } from './defaults.js';
import { hospitalOf } from './hospitals.js';
import { addDays, fmtLong, fmtShort, fmtFull, fmtDayShort, weekday, MONTHS, toNum, plural } from './dates.js';
import { esc, helpBox } from './blocks-ui.js';
import { openDutyEditor } from './duties-ui.js';
import { openLetters } from './letters-ui.js';
import { fmtHM } from './engine.js';

const color = (b) => `var(--c-${b.color || 'gray'})`;
const WD = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'];

function monthDays(ym) {
  const [y, m] = ym.split('-').map(Number);
  const first = `${ym}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const lead = (weekday(first) + 6) % 7; // poniedziałek = 0
  const cells = [];
  for (let i = lead; i > 0; i--) cells.push({ d: addDays(first, -i), out: true });
  for (let d = first; d <= last; d = addDays(d, 1)) cells.push({ d, out: false });
  while (cells.length % 7) cells.push({ d: addDays(cells.at(-1).d, 1), out: true });
  return cells;
}

export function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** Nieobecność „liczy się” tylko w dzień roboczy (nie weekend, nie święto, nie dzień wolny za sobotę). */
const realAbsence = (info) => info.absence && !info.weekend && !info.holiday && !info.satOffFor;

function badge(info) {
  if (info.satOffFor) return '🛋';
  if (realAbsence(info)) {
    if (info.absence.kind === 'course') return '🎓';
    return EVENT_TYPES[info.absence.type]?.icon || '•';
  }
  if (info.makeUp) return '↺';
  if (info.satOffFor) return '🛋';
  return '';
}

export function renderCalendar(state, today, ym) {
  const sum = summarize(state, today);
  const [y, m] = ym.split('-').map(Number);
  // Dyżur w dniu, w którym nie może się odbyć – ⚠️ zamiast 🌙
  const badDuty = new Set((state.duties || []).filter((x) => x.date.startsWith(ym) && dutyDayIssues(state, x.date, sum.ctx).length).map((x) => x.date));
  const cells = monthDays(ym).map(({ d, out }) => {
    const info = dayInfo(sum, d);
    const blk = info.block || (info.makeUp && state.blocks.find((b) => b.id === info.makeUp.blockId));
    const cls = ['day'];
    if (out) cls.push('out');
    if (info.weekend) cls.push('we');
    if (info.holiday) cls.push('hol');
    if (d === today) cls.push('today');
    if (realAbsence(info)) cls.push('abs', `abs-${info.absence.type}`);
    if (info.makeUp) cls.push('mk');
    if (info.reserve && !info.makeUp) cls.push('res');
    if (!info.inStaz) cls.push('off');
    const prevB = dayInfo(sum, addDays(d, -1)).block;
    const startsBlock = info.block && (!prevB || prevB.id !== info.block.id);
    return `<button class="${cls.join(' ')}" data-day="${d}" style="${blk ? `--block:${color(blk)}` : ''}"
      aria-label="${fmtLong(d)}${info.holiday ? `, ${info.holiday.name}` : ''}">
      <span class="dn">${Number(d.slice(8))}</span>
      ${badge(info) ? `<span class="bd">${badge(info)}</span>` : ''}
      ${(state.duties || []).some((x) => x.date === d) ? `<span class="duty-dot">${badDuty.has(d) ? '⚠️' : '🌙'}</span>` : ''}
      ${state.notes?.[d] ? '<span class="note-dot"></span>' : ''}
      ${startsBlock && !out ? '<span class="start-tick"></span>' : ''}
    </button>`;
  }).join('');

  // Bloki widoczne w miesiącu (legenda)
  const first = `${ym}-01`;
  const last = addDays(shiftMonth(ym, 1) + '-01', -1);
  const inMonth = state.blocks.filter((b) => b.start <= last && b.end >= first);
  const legend = inMonth.map((b) => {
    const segs = (b.segments || []).filter((s) => s.start <= last && s.end >= first);
    const where = segs.map((s) => hospitalOf(s)?.short).filter(Boolean);
    return `<div class="lg-row" style="--block:${color(b)}"><span class="lg-sw"></span>
      <div class="grow"><b>${esc(b.name)}</b><small>${fmtShort(b.start < first ? first : b.start)}–${fmtShort(b.end > last ? last : b.end)}${where.length ? ` · ${esc([...new Set(where)].join(', '))}` : ''}</small></div></div>`;
  }).join('');

  // Wpisy w miesiącu
  const evs = (state.events || []).filter((e) => e.start <= last && e.end >= first).sort((a, b) => (a.start < b.start ? -1 : 1));
  const courses = (state.courses || []).filter((c) => c.start && c.start <= last && c.end >= first);
  const notes = Object.entries(state.notes || {}).filter(([k]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && k >= first && k <= last).sort();
  const items = [
    ...notes.map(([k, v]) => `<button class="list-item ev-item" data-day="${k}"><div class="ev-ic">📝</div>
      <div class="grow"><div class="t">${fmtDayShort(k)}</div><div class="s note-prev">${esc(v)}</div></div><span class="chev">›</span></button>`),
    ...evs.map((e) => `<button class="list-item ev-item" data-edit-event="${esc(e.id)}">
      <div class="ev-ic">${EVENT_TYPES[e.type]?.icon || '•'}</div>
      <div class="grow"><div class="t">${esc(EVENT_TYPES[e.type]?.label || e.type)}</div>
      <div class="s">${fmtDayShort(e.start)}${e.end !== e.start ? ` – ${fmtDayShort(e.end)}` : ''}${e.note ? ` · ${esc(e.note)}` : ''}</div></div>
      <span class="chev">›</span></button>`),
    ...courses.map((c) => `<div class="list-item"><div class="ev-ic">🎓</div><div class="grow"><div class="t">${esc(c.name)}</div>
      <div class="s">${fmtDayShort(c.start)}${c.end !== c.start ? ` – ${fmtDayShort(c.end)}` : ''} · kurs</div></div></div>`),
  ];

  return `
    <header class="page-head cal-head">
      <div>
        <div class="eyebrow">${y}</div>
        <h1 class="large-title">${MONTHS[m - 1]}</h1>
      </div>
      <div class="cal-nav">
        <button class="round" data-month="-1" aria-label="Poprzedni miesiąc">‹</button>
        <button class="pill-btn" data-month="today">Dziś</button>
        <button class="round" data-month="1" aria-label="Następny miesiąc">›</button>
      </div>
    </header>
    ${helpBox('kalendarz')}
    <div class="desk-2 cal-desk"><div>
      <div class="card fade cal-card" id="cal-swipe">
        <div class="wd-row">${WD.map((w, i) => `<span class="${i > 4 ? 'we' : ''}">${w}</span>`).join('')}</div>
        <div class="cal-grid">${cells}</div>
        <div class="cal-key">
          <span><i class="k-hol"></i>święto</span><span>🏖 urlop</span><span>🤒 L4</span><span>🎓 kurs</span><span>↺ odrabianie</span><span>🛋 wolne za sobotę</span><span>🌙 dyżur</span><span>⚠️ dyżur w złym dniu</span><span><i class="k-note"></i>notatka</span>
        </div>
      </div>
      <button class="btn primary add-ev" data-new-event="${today >= first && today <= last ? today : first}">＋ Dodaj urlop / L4 / nieobecność</button>
    </div><div>
      ${legend ? `<div class="card fade"><div class="card-label">Bloki w tym miesiącu</div>${legend}</div>` : ''}
      <div class="card fade"><div class="card-label">Wpisy w tym miesiącu</div>
        ${items.length ? items.join('') : '<div class="muted small" style="padding:6px 0">Brak wpisów. Stuknij dzień w kalendarzu, aby coś dodać.</div>'}
      </div>
    </div></div>`;
}

/* ---------- Okna (arkusze) ---------- */

function sheet(title, bodyHtml, { left = 'Zamknij', right = null, rightDisabled = false } = {}) {
  return `<div class="sheet-backdrop" data-close></div>
    <div class="sheet" role="dialog" aria-label="${esc(title)}">
      <div class="sheet-head"><button class="link" data-close>${left}</button><b>${esc(title)}</b>
        ${right ? `<button class="link strong" data-ok ${rightDisabled ? 'disabled' : ''}>${right}</button>` : '<span></span>'}</div>
      <div class="sheet-body">${bodyHtml}</div>
    </div>`;
}

function mount() {
  const root = document.createElement('div');
  root.className = 'sheet-wrap';
  document.body.appendChild(root);
  document.body.classList.add('no-scroll');
  const close = () => {
    root.classList.add('closing');
    document.body.classList.remove('no-scroll');
    setTimeout(() => root.remove(), 220);
  };
  return { root, close };
}

/** Okno dnia: co się dzieje + szybkie dodanie wpisu. */
export function openDay(state, today, d, ctx) {
  const sum = summarize(state, today);
  const info = dayInfo(sum, d);
  const h = hospitalOf(info.segment);
  const rows = [];
  if (info.block) {
    rows.push(`<div class="day-block" style="--block:${color(info.block)}">
      <div class="card-label"><span class="dot"></span>${esc(info.block.group || 'Blok stażu')}</div>
      <div class="t-strong">${esc(info.block.name)}</div>
      ${info.segment ? `<div class="sub">📍 ${esc(info.segment.ward)}<br>${esc(h?.name || '')}${h?.address ? `, ${esc(h.address)}` : ''}</div>`
        : '<div class="sub">Oddział nie przypisany</div>'}
    </div>`);
  } else if (info.reserve) {
    rows.push(`<div class="day-block"><div class="t-strong">Rezerwa na koniec stażu</div>
      ${info.makeUp ? `<div class="sub">↺ Odrabianie: ${esc(state.blocks.find((b) => b.id === info.makeUp.blockId)?.name)}</div>` : ''}</div>`);
  } else if (!info.inStaz) {
    rows.push('<div class="day-block"><div class="sub">Poza okresem stażu</div></div>');
  }
  const status = [];
  if (info.weekend) status.push('☀️ Weekend');
  if (info.holiday) status.push(`🎉 ${info.holiday.name}${info.holiday.saturday ? ' (sobota – przysługuje inny dzień wolny)' : ''}`);
  if (info.satOffFor) status.push(`🛋 Dzień wolny za święto z ${fmtShort(info.satOffFor)}`);
  if (info.absence) status.push(`${info.absence.kind === 'course' ? '🎓' : EVENT_TYPES[info.absence.type]?.icon || '•'} ${esc(info.absence.label)}`);
  if (info.lost) status.push(`↺ Ten dzień przepada w bloku – do odrobienia`);
  else if (info.block && !info.weekend && !info.absence) status.push('✓ Dzień stażu (liczy się do bloku)');
  const evs = (state.events || []).filter((e) => e.start <= d && d <= e.end);
  const dus = (state.duties || []).filter((x) => x.date === d);
  const dutyIssues = dus.length ? dutyDayIssues(state, d) : [];

  const { root, close } = mount();
  root.innerHTML = sheet(fmtLong(d), `
    ${rows.join('')}
    <div class="form-card">${status.map((s) => `<div class="st-row">${s}</div>`).join('') || '<div class="st-row muted">—</div>'}</div>
    ${evs.map((e) => `<button class="list-item ev-item card" data-edit-event="${esc(e.id)}"><div class="ev-ic">${EVENT_TYPES[e.type]?.icon}</div>
      <div class="grow"><div class="t">${esc(EVENT_TYPES[e.type]?.label)}</div><div class="s">${fmtDayShort(e.start)} – ${fmtDayShort(e.end)}</div></div><span class="chev">›</span></button>`).join('')}
    ${dus.map((x) => `<button class="list-item ev-item card" data-edit-duty="${esc(x.id)}"><div class="ev-ic">🌙</div>
      <div class="grow"><div class="t">Dyżur · ${fmtHM(x.minutes)}</div>${x.note ? `<div class="s">${esc(x.note)}</div>` : ''}
      ${dutyIssues.length ? `<div class="s neg">⚠️ W tym dniu nie może być dyżuru: ${esc(dutyIssues.map((w) => w.text).join(' · '))}</div>` : ''}</div><span class="chev">›</span></button>`).join('')}
    <div class="form-card"><label class="note-label">📝 Notatka do dnia
      <textarea data-note="${d}" rows="3" placeholder="np. czego się nauczyłem, co nadrobić (bez danych pacjentów)">${esc(state.notes?.[d] || '')}</textarea></label></div>
    ${info.inStaz || d >= state.settings.startDate ? `
      <div class="quick">
        <button class="btn" data-quick="urlop">🏖 Urlop</button>
        <button class="btn" data-quick="l4">🤒 L4</button>
        <button class="btn" data-quick="inne">• Inna</button>
      </div>
      <button class="btn" data-quick-duty style="background:var(--card);box-shadow:var(--shadow)">🌙 Dodaj dyżur</button>` : ''}
  `);
  root.addEventListener('change', (e) => {
    const n = e.target.dataset.note;
    if (!n) return;
    state.notes = state.notes || {};
    const v = e.target.value.trim();
    if (v) state.notes[n] = v; else delete state.notes[n];
    ctx.save(); ctx.render(); ctx.toast('Notatka zapisana ✓');
  });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    const q = e.target.closest('[data-quick]');
    if (q) { close(); return openEventEditor(state, today, { type: q.dataset.quick, start: d, end: d }, ctx); }
    const ee = e.target.closest('[data-edit-event]');
    if (ee) { close(); return openEventEditor(state, today, state.events.find((x) => x.id === ee.dataset.editEvent), ctx); }
    if (e.target.closest('[data-quick-duty]')) { close(); return openDutyEditor(state, { date: d }, ctx); }
    const ed = e.target.closest('[data-edit-duty]');
    if (ed) { close(); return openDutyEditor(state, state.duties.find((x) => x.id === ed.dataset.editDuty), ctx); }
  });
}

/** Formularz wpisu z podglądem skutków. */
export function openEventEditor(state, today, ev, ctx) {
  const isNew = !ev.id || !state.events.some((x) => x.id === ev.id);
  const draft = { id: ev.id || `e${Date.now()}`, type: ev.type || 'urlop', start: ev.start, end: ev.end || ev.start, note: ev.note || '' };
  const { root, close } = mount();

  const draw = () => {
    const valid = draft.start && draft.end && draft.start <= draft.end;
    let preview = '';
    if (valid) {
      const imp = eventImpact(state, draft, today);
      const blocks = imp.perBlock.map((p) => {
        const warn = p.share >= 0.2;
        return `<div class="imp-row ${warn ? 'warn' : ''}" style="--block:${color(p.block)}"><span class="dot"></span>
          <span class="grow">${esc(p.block.short)}: ${p.days} z ${p.block.required} dni (${Math.round(p.share * 100)}%)</span>${warn ? '⚠️' : ''}</div>`;
      }).join('');
      const endMoved = imp.endAfter !== imp.endBefore;
      preview = `<div class="form-card impact">
        <div class="card-label">Skutki</div>
        <div class="imp-big"><b>${imp.workdays}</b> ${plural(imp.workdays, 'dzień roboczy', 'dni robocze', 'dni roboczych')}
          <span class="muted">· ${imp.calendarDays} ${plural(imp.calendarDays, 'dzień', 'dni', 'dni')} kalendarzowych</span></div>
        ${imp.vacationDays ? `<div class="imp-row">🏖 Urlop: −${imp.vacationDays} · zostanie <b>${imp.vacationLeftAfter}</b> z ${state.settings.vacationPool ? Object.values(state.settings.vacationPool).reduce((a, b) => a + Number(b), 0) : 22}</div>` : ''}
        ${imp.vacationLeftAfter < 0 && imp.vacationDays ? '<div class="imp-row warn">⚠️ Przekraczasz pulę urlopu</div>' : ''}
        ${blocks ? `<div class="imp-sub">Do odrobienia z bloków (po zakończeniu harmonogramu):</div>${blocks}` : ''}
        ${imp.inReserve ? `<div class="imp-row">⏳ W okresie rezerwy: ${imp.inReserve} dni</div>` : ''}
        <div class="imp-row ${imp.freeAfter < 0 ? 'warn' : ''}">Zapas rezerwy: ${imp.freeBefore} → <b>${imp.freeAfter}</b></div>
        ${endMoved ? `<div class="imp-row warn">📅 Koniec stażu: ${fmtFull(imp.endBefore)} → <b>${fmtFull(imp.endAfter)}</b></div>` : ''}
        ${imp.extends ? '<div class="hint small">Ta nieobecność wydłuża staż (art. 15a ustawy o zawodach lekarza) – zgłoś ją w kadrach; szpital powiadamia OIL.</div>' : ''}
      </div>`;
    }
    root.innerHTML = sheet(isNew ? 'Nowy wpis' : 'Edytuj wpis', `
      <div class="form-card">
        <div class="type-grid">${Object.entries(EVENT_TYPES).map(([k, t]) => `<button class="type-btn ${draft.type === k ? 'on' : ''}" data-type="${k}"><span>${t.icon}</span>${esc(t.short)}</button>`).join('')}</div>
        <div class="row2">
          <label>Od<input type="date" data-f="start" value="${draft.start}"></label>
          <label>Do<input type="date" data-f="end" value="${draft.end}"></label>
        </div>
        <label>Notatka<input data-f="note" value="${esc(draft.note)}" placeholder="opcjonalnie"></label>
        ${!valid ? '<div class="seg-err">Data końca nie może być przed początkiem.</div>' : ''}
      </div>
      ${preview}
      ${draft.type === 'urlop' ? '<button class="btn" data-letter="urlop">📝 Wniosek o ten urlop</button>' : ''}
      ${draft.type === 'l4' ? '<button class="btn" data-letter="l4">✉️ Informacja o L4 do Kadr i opiekuna</button>' : ''}
      ${!isNew ? '<button class="btn danger-btn" data-del>Usuń wpis</button>' : ''}
    `, { left: 'Anuluj', right: 'Zapisz', rightDisabled: !valid });
  };

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    const t = e.target.closest('[data-type]');
    if (t) { draft.type = t.dataset.type; return draw(); }
    const lt = e.target.closest('[data-letter]');
    if (lt) return openLetters(state, ctx, { kind: lt.dataset.letter, from: draft.start, to: draft.end });
    if (e.target.closest('[data-ok]')) {
      if (!(draft.start && draft.end && draft.start <= draft.end)) return;
      const i = state.events.findIndex((x) => x.id === draft.id);
      if (i >= 0) state.events[i] = draft; else state.events.push(draft);
      ctx.save(); ctx.render(); ctx.toast('Zapisano ✓');
      return close();
    }
    if (e.target.closest('[data-del]')) {
      const idx = state.events.findIndex((x) => x.id === draft.id);
      if (idx < 0) return close();
      const removed = state.events.splice(idx, 1)[0];
      ctx.save(); ctx.render();
      ctx.toast('Usunięto', () => { state.events.push(removed); ctx.save(); ctx.render(); });
      return close();
    }
  });
  root.addEventListener('change', (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    draft[f] = e.target.value;
    if (f === 'start' && (!draft.end || draft.end < draft.start)) draft.end = draft.start;
    if (f !== 'note') draw();
  });
  root.addEventListener('input', (e) => { if (e.target.dataset.f === 'note') draft.note = e.target.value; });
  draw();
}

export function todayMonth(today) {
  return today.slice(0, 7);
}

export { toNum };
