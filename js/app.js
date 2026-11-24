// Kalendarz Stażysty – interfejs
import { load, save, askPersistence } from './store.js';
import { summarize, alerts, segmentAt } from './engine.js';
import { renderBlocks, openBlockEditor } from './blocks-ui.js';
import { renderMore, handleMoreClick, handleMoreChange } from './more-ui.js';
import { hospitalOf } from './hospitals.js';
import { renderCalendar, openDay, openEventEditor, shiftMonth, todayMonth } from './calendar-ui.js';
import { renderDuties, openDutyEditor, dutyTodayCard } from './duties-ui.js';
import { fmtLong, fmtShort, fmtFull, fmtDayShort, toNum, todayIso, isWeekend, dni, plural } from './dates.js';
import { holidayMap } from './holidays.js';

let state = load();
let tab = 'dzis';
let month = null;
let dmonth = null;

// ?dzis=RRRR-MM-DD – podgląd aplikacji "na inny dzień" (do testów)
function getToday() {
  const q = new URLSearchParams(location.search).get('dzis');
  return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todayIso();
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const color = (b) => `var(--c-${b.color || 'gray'})`;

function ring(pct, size, stroke, center) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="bar" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"
        stroke-dasharray="${c}" stroke-dashoffset="${c}" data-target="${c * (1 - p)}"/>
    </svg>
    <div class="ring-center">${center}</div>
  </div>`;
}

function relDays(n) {
  if (n === 0) return 'dziś';
  if (n === 1) return 'jutro';
  if (n === 2) return 'pojutrze';
  return `za ${n} dni`;
}

function todayKind(sum) {
  const t = sum.today;
  const ctx = sum.ctx;
  if (isWeekend(t)) return { icon: '☀️', text: 'Dziś weekend' };
  const h = ctx.holidays.get(t);
  if (h) return { icon: '🎉', text: `Dziś święto – ${h.name}` };
  if (ctx.satOff.has(t)) return { icon: '🛋', text: 'Dziś dzień wolny za święto w sobotę' };
  const a = ctx.absence.get(t);
  if (a) return { icon: a.kind === 'course' ? '🎓' : '🏖', text: `Dziś: ${a.label}` };
  return null;
}

/* ---------- Ekran: Dziś ---------- */

function heroCard(sum) {
  const t = sum.today;
  const s = sum.current;
  const kind = todayKind(sum);

  if (!s) {
    // Przed stażem / w rezerwie / po stażu
    const st = state.settings;
    if (t < st.startDate) {
      const n = toNum(st.startDate) - toNum(t);
      return `<div class="card hero fade" style="--block:var(--accent)">
        <div class="card-label">Przed stażem</div>
        <div class="hero-name">Staż zaczyna się ${relDays(n)}</div>
        <div class="hero-place">${fmtFull(st.startDate)}</div></div>`;
    }
    if (t <= sum.estimatedEnd) {
      const mk = sum.makeUpToday && state.blocks.find((b) => b.id === sum.makeUpToday.blockId);
      const left = sum.makeUpPlan.filter((m) => m.date > t).length;
      return `<div class="card hero fade" style="--block:${mk ? color(mk) : 'var(--c-gray)'}">
        <div class="card-label">Rezerwa · ${fmtShort(sum.reserve.start)}–${fmtShort(sum.reserve.end)}</div>
        <div class="hero-name">${mk ? `Odrabianie: ${esc(mk.short)}` : 'Czas rezerwy'}</div>
        <div class="hero-place">${left ? `Zostało ${dni(left)} odrabiania` : 'Wszystkie bloki zrealizowane'}</div>
        ${kind ? `<div class="pills"><span class="pill">${kind.icon} ${esc(kind.text)}</span></div>` : ''}</div>`;
    }
    return `<div class="card hero fade" style="--block:var(--ok)">
      <div class="card-label">Koniec</div>
      <div class="hero-name">Staż zakończony 🎉</div>
      <div class="hero-place">Gratulacje, doktorze!</div></div>`;
  }

  const b = s.block;
  const pct = s.required ? Math.min(s.done, s.required) / s.required : 0;
  const seg = segmentAt(b, t);
  const hosp = hospitalOf(seg);
  const lostFuture = s.lost.filter((l) => l.date > t);
  const calLeft = toNum(b.end) - toNum(t);
  const pills = [];
  if (kind) pills.push(`<span class="pill">${kind.icon} ${esc(kind.text)}</span>`);
  if (s.makeUp > 0) {
    const list = s.lost.map((l) => fmtShort(l.date)).join(', ');
    pills.push(`<span class="pill">↺ ${s.makeUp} do odrobienia po ${fmtShort(sum.reserve.start)} <span class="muted">(${list})</span></span>`);
  }
  if (lostFuture.length && !s.makeUp) pills.push(`<span class="pill">${lostFuture.length} dni wolnych przed końcem bloku</span>`);

  return `<div class="card hero fade" style="--block:${color(b)}">
    <div class="hero-top">
      <div class="hero-info">
        <div class="card-label"><span class="dot"></span>Teraz${b.group ? ` · ${esc(b.group)}` : ''}</div>
        <div class="hero-name">${esc(b.name)}</div>
        <div class="hero-place">${fmtShort(b.start)}–${fmtShort(b.end)}</div>
      </div>
      ${ring(pct, 104, 11, `<b>${Math.round(pct * 100)}%</b><span>bloku</span>`)}
    </div>
    <div class="hero-stats">
      <div class="stat"><b>${s.done}<small class="muted" style="font-size:14px">/${s.required}</small></b><span>dzień stażu w bloku</span></div>
      <div class="stat"><b>${s.remainingInRange}</b><span>${plural(s.remainingInRange, 'dzień roboczy', 'dni robocze', 'dni roboczych')} do końca</span></div>
      <div class="stat"><b>${calLeft}</b><span>${plural(calLeft, 'dzień kalendarzowy', 'dni kalendarzowe', 'dni kalendarzowych')}</span></div>
    </div>
    ${seg ? `<div class="hero-ward">
        <div class="hw-ic">📍</div>
        <div><b>${esc(seg.ward)}</b><span>${esc(hosp?.name || '')}${hosp?.address ? ` · ${esc(hosp.address)}` : ''}</span></div>
      </div>` : `<button class="hero-ward empty" data-goto-block="${esc(b.id)}"><div class="hw-ic">＋</div>
        <div><b>Przypisz oddział</b><span>Wybierz szpital i oddział dla tego bloku</span></div></button>`}
    ${pills.length ? `<div class="pills">${pills.join('')}</div>` : ''}
  </div>`;
}

function nextCards(sum) {
  const t = sum.today;
  const n = sum.next;
  const nextHtml = n
    ? `<div class="card fade" style="--block:${color(n.block)}">
        <div class="card-label">Następny blok</div>
        <div class="next-name"><span class="dot"></span>${esc(n.block.short)}</div>
        <div class="sub">od ${fmtDayShort(n.block.start)}<br><b style="color:var(--text)">${relDays(toNum(n.block.start) - toNum(t))}</b></div>
      </div>`
    : `<div class="card fade"><div class="card-label">Następny blok</div><div class="next-name">Rezerwa</div>
        <div class="sub">od ${fmtDayShort(sum.reserve.start)}</div></div>`;
  const endHtml = `<div class="card fade">
      <div class="card-label">Do końca stażu</div>
      <div class="big">${sum.calendar.daysToEnd}<small>dni</small></div>
      <div class="sub">${sum.calendar.workdaysToEnd} ${plural(sum.calendar.workdaysToEnd, 'roboczy', 'robocze', 'roboczych')} · ${fmtFull(sum.estimatedEnd)}${sum.estimatedEnd !== state.settings.endDate ? ' <span class="neg">(szac.)</span>' : ''}</div>
    </div>`;
  return `<div class="grid-2">${nextHtml}${endHtml}</div>`;
}

function progressCard(sum) {
  const st = state.settings;
  const total = toNum(st.endDate) - toNum(st.startDate) + 1;
  const pos = (d) => ((toNum(d) - toNum(st.startDate)) / total) * 100;
  const segs = sum.stats.map((s) => {
    const w = ((toNum(s.block.end) - toNum(s.block.start) + 1) / total) * 100;
    return `<div class="${s.status}" style="width:${w}%;background:${color(s.block)}" title="${esc(s.block.name)}"></div>`;
  });
  const resW = ((toNum(st.endDate) - toNum(sum.reserve.start) + 1) / total) * 100;
  segs.push(`<div class="reserve" style="width:${resW}%" title="Rezerwa"></div>`);
  const marker = sum.today >= st.startDate && sum.today <= st.endDate ? `<div class="timeline-marker" style="left:${pos(sum.today)}%"></div>` : '';
  const pct = sum.program.total ? Math.round((sum.program.done / sum.program.total) * 100) : 0;

  const seen = new Set();
  const legend = sum.stats.filter((s) => {
    const k = s.block.group || s.block.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map((s) => `<span><i style="background:${color(s.block)}"></i>${esc(s.block.group ? 'Wybrana' : s.block.short)}</span>`);
  legend.push(`<span><i style="background:var(--track)"></i>Rezerwa</span>`);

  return `<div class="card fade">
    <div class="progress-head">
      <div class="card-label" style="margin:0">Cały staż</div>
      <div class="big" style="font-size:28px">${pct}<small>%</small></div>
    </div>
    <div class="timeline"><div class="timeline-bar">${segs.join('')}</div>${marker}</div>
    <div class="timeline-legend">${legend.join('')}</div>
    <div class="note">${sum.program.done} z ${sum.program.total} dni programu (bloki + kursy) · ${sum.calendar.elapsed} z ${sum.calendar.total} dni kalendarzowych</div>
  </div>`;
}

function reserveCard(sum) {
  const r = sum.reserve;
  const cls = r.free < 0 ? 'neg' : r.free === 0 ? 'zero' : 'pos';
  const mode = state.settings.holidayMode;
  const need = r.vacationUnplanned + r.coursesUnscheduled + r.makeUp + r.absences;
  const scale = Math.max(r.workdays, need) || 1;
  const seg = (n, cssColor, label) => (n > 0
    ? `<div style="flex:${n};background:${cssColor}" title="${label}: ${n}"></div>` : '');
  const over = Math.max(0, need - r.workdays);
  const freeN = Math.max(0, r.workdays - need);
  return `<div class="card fade">
    <div class="card-label">Rezerwa na koniec stażu · ${fmtShort(r.start)}–${fmtShort(r.end)}</div>
    <div class="res-head">
      <div><div class="big ${cls}">${r.free > 0 ? '+' : ''}${r.free}</div>
        <div class="sub">${r.free < 0 ? 'dni brakuje' : r.free === 0 ? 'zapasu – idealnie na styk' : 'dni zapasu'}</div></div>
      <div class="sub" style="text-align:right">${r.workdays} dni roboczych<br>w rezerwie</div>
    </div>
    <div class="stack-bar" style="--scale:${scale}">
      ${seg(r.vacationUnplanned, 'var(--c-vacation)', 'Urlop')}
      ${seg(r.coursesUnscheduled, 'var(--c-course)', 'Kursy')}
      ${seg(r.makeUp, 'var(--c-sick)', 'Odrabianie')}
      ${seg(r.absences, 'var(--c-gray)', 'Nieobecności')}
      ${seg(freeN, 'var(--track)', 'Zapas')}
      ${over ? `<div class="over" style="flex:${over}" title="Brakuje: ${over}"></div>` : ''}
    </div>
    <div class="legend-rows">
      <div><i style="background:var(--c-vacation)"></i>Urlop do wykorzystania<b>${r.vacationUnplanned}</b></div>
      <div><i style="background:var(--c-course)"></i>Kursy bez terminu<b>${r.coursesUnscheduled}</b></div>
      <div><i style="background:var(--c-sick)"></i>Odrabianie z bloków<b>${r.makeUp}</b></div>
      ${r.absences ? `<div><i style="background:var(--c-gray)"></i>Nieobecności w rezerwie<b>${r.absences}</b></div>` : ''}
    </div>
    <div class="segmented" role="group" aria-label="Jak liczyć święta">
      <button data-holiday-mode="zaliczane" class="${mode === 'zaliczane' ? 'on' : ''}">Święta zaliczane</button>
      <button data-holiday-mode="odrabiane" class="${mode === 'odrabiane' ? 'on' : ''}">Święta odrabiane</button>
    </div>
    <div class="note">${mode === 'odrabiane'
      ? 'Wariant ostrożny: święto w trakcie bloku przepada i trzeba je odrobić.'
      : 'Wg poradnika OIL Szczecin 2026 (s. 36): „Dni ustawowo wolne od pracy nie wydłużają stażu cząstkowego”.'}
      ${r.free < 0 ? ` Staż potrwa wtedy do ok. <b>${fmtFull(sum.estimatedEnd)}</b>.` : ''}</div>
  </div>`;
}

function vacationCard(sum) {
  const v = sum.vacation;
  const years = Object.entries(v.pool).map(([y, n]) => `${y}: ${n}`).join(' · ');
  const usedPct = v.total ? ((v.used + v.planned) / v.total) * 100 : 0;
  return `<div class="card fade" style="--block:var(--c-vacation)">
    <div class="card-label">Urlop</div>
    <div class="big">${v.left}<small>z ${v.total} dni</small></div>
    <div class="minibar"><div style="width:${usedPct}%"></div></div>
    <div class="sub">wykorzystane ${v.used} · plan ${v.planned}<br>pula ${years}</div>
  </div>`;
}

function lekCard(sum) {
  const lek = state.settings.lek;
  if (!lek?.examDate) return '';
  const n = toNum(lek.examDate) - toNum(sum.today);
  if (n < 0) return '';
  return `<div class="card fade" style="--block:var(--c-course)">
    <div class="card-label">LEK · ${esc(lek.session)}</div>
    <div class="big">${n}<small>${n === 1 ? 'dzień' : 'dni'}</small></div>
    <div class="sub">${fmtLong(lek.examDate)} ${lek.examDate.slice(0, 4)}</div>
  </div>`;
}

function upcomingCard(sum) {
  const t = sum.today;
  const map = holidayMap(t, state.settings.endDate);
  const items = [...map.values()].filter((h) => !h.sunday).slice(0, 4);
  if (!items.length) return '';
  const blockOf = (d) => state.blocks.find((b) => d >= b.start && d <= b.end);
  return `<div class="card fade">
    <div class="card-label">Najbliższe święta</div>
    ${items.map((h) => {
      const b = blockOf(h.date);
      const off = state.settings.saturdayDaysOff?.[h.date];
      const sub = h.saturday
        ? (off ? `sobota → wolne ${fmtDayShort(off)}` : 'sobota → dzień wolny do wyznaczenia')
        : `${fmtDayShort(h.date)}${b ? ` · ${esc(b.short)}` : ''}`;
      const [, m, d] = h.date.split('-');
      return `<div class="list-item">
        <div class="date-chip"><b>${Number(d)}</b><span>${['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'][Number(m) - 1]}</span></div>
        <div class="grow"><div class="t">${esc(h.name)}</div><div class="s">${sub}</div></div>
        <div class="s muted">${relDays(toNum(h.date) - toNum(t))}</div>
      </div>`;
    }).join('')}
  </div>`;
}

function todoCard(al, label = 'Na dziś') {
  if (!al.length) return '';
  const order = { urgent: 0, warn: 1, info: 2 };
  const rows = [...al].sort((a, b) => order[a.level] - order[b.level]).map((a) => `
    <div class="todo ${a.level}" ${a.action === 'backup' ? 'data-goto-tab="wiecej" role="button"' : ''}>
      <div class="todo-ic">${a.icon}</div>
      <div class="grow"><div class="t">${esc(a.title)}</div><div class="s">${esc(a.detail || '')}</div></div>
      ${a.action === 'deadline-done' ? `<button class="chip" data-deadline-done="${a.date}">Zrobione ✓</button>` : ''}
    </div>`).join('');
  return `<div class="card fade todo-card"><div class="card-label">${label} · ${al.length}</div>${rows}</div>`;
}

function renderToday() {
  const t = getToday();
  const sum = summarize(state, t);
  const al = alerts(sum);
  const blk = sum.current ? color(sum.current.block) : 'var(--accent)';
  document.body.style.setProperty('--page', blk);

  return `
    <header class="page-head">
      <div class="eyebrow">${fmtLong(t)}</div>
      <h1 class="large-title">Dziś</h1>
    </header>
    ${todoCard(al.filter((a) => a.level === 'urgent'), 'Pilne')}
    <div class="desk-2">
      <div>
        ${heroCard(sum)}
        ${nextCards(sum)}
        ${progressCard(sum)}
      </div>
      <div>
        ${todoCard(al.filter((a) => a.level !== 'urgent'))}
        ${dutyTodayCard(state, t)}
        ${reserveCard(sum)}
        <div class="grid-2">${vacationCard(sum)}${lekCard(sum)}</div>
        ${upcomingCard(sum)}
      </div>
    </div>`;
}

function renderSoon(title, text) {
  return `<div class="eyebrow">Kalendarz Stażysty</div><h1 class="large-title">${title}</h1>
    <div class="card soon fade"><b>Wkrótce</b>${text}</div>`;
}

/* ---------- Render ---------- */

const app = document.getElementById('app');

function render() {
  let html;
  if (tab !== 'dzis') document.body.style.setProperty('--page', 'var(--accent)');
  if (tab === 'dzis') html = renderToday();
  else if (tab === 'bloki') html = renderBlocks(state, getToday());
  else if (tab === 'dyzury') html = renderDuties(state, getToday(), dmonth || (dmonth = todayMonth(getToday())));
  else if (tab === 'kalendarz') html = renderCalendar(state, getToday(), month || (month = todayMonth(getToday())));
  else html = renderMore(state);
  app.innerHTML = html;
  // Opóźnienie dla animacji kart i pierścieni
  app.querySelectorAll('.fade').forEach((el, i) => { el.style.animationDelay = `${Math.min(i, 10) * 45}ms`; });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    app.querySelectorAll('.ring .bar').forEach((c) => { c.style.strokeDashoffset = c.dataset.target; });
  }));
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
}

document.getElementById('tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  window.scrollTo({ top: 0 });
  render();
});

/* ---------- Wspólne akcje ---------- */

function applyTheme() {
  const t = state.settings.theme || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

function toast(text, undo) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  if (undo) {
    const b = document.createElement('button');
    b.textContent = 'Cofnij';
    b.onclick = () => { undo(); el.remove(); };
    el.appendChild(b);
  }
  document.body.appendChild(el);
  const ms = undo ? 5000 : 2600;
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

function editBlock(id) {
  openBlockEditor(state, id, (updated) => {
    const i = state.blocks.findIndex((b) => b.id === id);
    state.blocks[i] = updated;
    save(state);
    render();
    toast('Zapisano ✓');
  });
}

const ctx = {
  get state() { return state; },
  today: getToday,
  save: () => save(state),
  render: () => render(),
  toast,
  applyTheme,
  replace(data) { state = data; save(state); applyTheme(); render(); },
};

app.addEventListener('click', (e) => {
  const m = e.target.closest('[data-holiday-mode]');
  if (m) {
    state.settings.holidayMode = m.dataset.holidayMode;
    save(state);
    render();
    return;
  }
  const eb = e.target.closest('[data-edit-block]');
  if (eb) return editBlock(eb.dataset.editBlock);
  const gb = e.target.closest('[data-goto-block]');
  if (gb) return editBlock(gb.dataset.gotoBlock);
  const dd = e.target.closest('[data-deadline-done]');
  if (dd) {
    const dl = state.settings.lek.deadlines.find((x) => x.date === dd.dataset.deadlineDone);
    if (dl) dl.done = true;
    save(state);
    render();
    toast('Odhaczone ✓', () => { if (dl) delete dl.done; save(state); render(); });
    return;
  }
  const gt = e.target.closest('[data-goto-tab]');
  if (gt) { tab = gt.dataset.gotoTab; window.scrollTo({ top: 0 }); return render(); }
  const dm = e.target.closest('[data-dmonth]');
  if (dm) {
    dmonth = dm.dataset.dmonth === 'today' ? todayMonth(getToday()) : shiftMonth(dmonth, Number(dm.dataset.dmonth));
    return render();
  }
  const nd = e.target.closest('[data-new-duty]');
  if (nd) return openDutyEditor(state, { date: nd.dataset.newDuty }, ctx);
  const ed = e.target.closest('[data-edit-duty]');
  if (ed) return openDutyEditor(state, state.duties.find((x) => x.id === ed.dataset.editDuty), ctx);
  const mo = e.target.closest('[data-month]');
  if (mo) {
    month = mo.dataset.month === 'today' ? todayMonth(getToday()) : shiftMonth(month, Number(mo.dataset.month));
    return render();
  }
  const day = e.target.closest('[data-day]');
  if (day) return openDay(state, getToday(), day.dataset.day, ctx);
  const ne = e.target.closest('[data-new-event]');
  if (ne) return openEventEditor(state, getToday(), { type: 'urlop', start: ne.dataset.newEvent }, ctx);
  const ee = e.target.closest('[data-edit-event]');
  if (ee) return openEventEditor(state, getToday(), state.events.find((x) => x.id === ee.dataset.editEvent), ctx);
  handleMoreClick(e, ctx);
});
app.addEventListener('change', (e) => handleMoreChange(e, ctx));

// Przesunięcie palcem w bok na kalendarzu = zmiana miesiąca
let touchX = null;
let touchY = null;
app.addEventListener('touchstart', (e) => {
  if (tab !== 'kalendarz' || !e.target.closest('#cal-swipe')) return;
  touchX = e.touches[0].clientX;
  touchY = e.touches[0].clientY;
}, { passive: true });
app.addEventListener('touchend', (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  const dy = e.changedTouches[0].clientY - touchY;
  touchX = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    month = shiftMonth(month, dx < 0 ? 1 : -1);
    render();
  }
});

applyTheme();
render();
askPersistence();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
