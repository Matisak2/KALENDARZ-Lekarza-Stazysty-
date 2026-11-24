// Ekran „Więcej”: eksport do Kalendarza, kopia zapasowa, ustawienia, źródła.
import { buildIcs } from './ics.js';
import { backupText, parseBackup } from './store.js';
import { fmtFull, fmtShort, fmtDayShort, addDays, isWeekend, toNum } from './dates.js';
import { holidayMap } from './holidays.js';
import { BOOKLET_COURSES, bookletProgress, coursesSigned } from './booklet.js';
import { syncStatus, signIn, signUp, signOutSync, syncNow } from './sync.js';
import { openTimesheet } from './timesheet-ui.js';
import { esc } from './blocks-ui.js';

export function renderMore(state) {
  const mode = state.settings.holidayMode;
  const theme = state.settings.theme || 'auto';
  const last = state.meta?.lastBackup;
  return `
    <header class="page-head">
      <div class="eyebrow">Kalendarz Stażysty</div>
      <h1 class="large-title">Więcej</h1>
    </header>
    <div class="desk-2"><div>
      <div class="card fade"><div class="card-label">🗂 Karta czasu pracy (wzór USK2)</div>
        <p class="sub">Wypełnia się sama z kalendarza: dni pracy, urlopy, L4, kursy, święta i dyżury. Podgląd i PDF do wysłania lub wydruku.</p>
        <button class="btn primary" data-act="timesheet">Otwórz kartę za ten miesiąc</button></div>
      ${syncCard()}
      ${bookletCard(state)}
      ${coursesCard(state)}
      ${satOffCard(state)}
      <div class="card fade">
        <div class="card-label">📅 Kalendarz iPhone'a</div>
        <div class="t-strong">Dodaj staż do Kalendarza</div>
        <p class="sub">Bloki i oddziały (z adresem w polu „Miejsce”), odrabianie, kursy, urlop oraz terminy LEK z przypomnieniami.</p>
        <button class="btn primary" data-act="ics">Eksportuj do Kalendarza (.ics)</button>
        <ol class="steps">
          <li>Stuknij przycisk powyżej.</li>
          <li>iPhone pokaże listę wydarzeń – stuknij <b>„Dodaj wszystko”</b>.</li>
          <li>Wybierz kalendarz (najlepiej nowy, np. „Staż”) i potwierdź.</li>
        </ol>
        <p class="hint small">Po zmianach w aplikacji najlepiej usuń stary kalendarz „Staż” i zaimportuj ponownie – inaczej wydarzenia mogą się zdublować.</p>
      </div>
      <div class="card fade">
        <div class="card-label">💾 Kopia zapasowa</div>
        <p class="sub">Dane są tylko na tym urządzeniu. Raz na jakiś czas zapisz kopię – np. w iCloud Drive albo wyślij przez AirDrop na komputer.</p>
        <button class="btn primary" data-act="backup">Zapisz kopię (.json)</button>
        <label class="btn">Wczytaj kopię…<input type="file" accept=".json,application/json" data-act="restore" hidden></label>
        <p class="hint small">${last ? `Ostatnia kopia: ${fmtFull(last.slice(0, 10))}` : 'Nie zapisano jeszcze żadnej kopii.'}</p>
      </div>
    </div><div>
      <div class="card fade">
        <div class="card-label">⚙️ Ustawienia</div>
        <div class="t-strong">Święta w trakcie bloku</div>
        <div class="segmented">
          <button data-holiday-mode="zaliczane" class="${mode === 'zaliczane' ? 'on' : ''}">Zaliczane</button>
          <button data-holiday-mode="odrabiane" class="${mode === 'odrabiane' ? 'on' : ''}">Odrabiane</button>
        </div>
        <p class="hint small">Zaliczane = wg poradnika OIL Szczecin 2026 (s. 37).</p>
        <div class="t-strong" style="margin-top:14px">Wygląd</div>
        <div class="segmented three">
          ${['auto', 'light', 'dark'].map((t) => `<button data-theme-set="${t}" class="${theme === t ? 'on' : ''}">${{ auto: 'Auto', light: 'Jasny', dark: 'Ciemny' }[t]}</button>`).join('')}
        </div>
      </div>
      <div class="card fade">
        <div class="card-label">📚 Źródła zasad</div>
        <ul class="links">
          <li><a href="https://oil.szczecin.pl/wp-content/uploads/2026/07/Poradnik-lekarza-stazysty-2026.pdf" target="_blank" rel="noopener">Poradnik lekarza stażysty 2026 – OIL Szczecin</a></li>
          <li><a href="https://oil.szczecin.pl/terminy-kursow-stazowych-lekarze/" target="_blank" rel="noopener">Terminy kursów stażowych – OIL Szczecin</a></li>
          <li><a href="https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20230000377" target="_blank" rel="noopener">Rozporządzenie MZ w sprawie stażu (Dz.U. 2023 poz. 377)</a></li>
          <li><a href="https://www.cem.edu.pl/" target="_blank" rel="noopener">CEM – Lekarski Egzamin Końcowy</a></li>
        </ul>
      </div>
    </div></div>`;
}

const RULE = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /stazysta/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}`;

function syncCard() {
  const s = syncStatus();
  const t = s.lastAt ? s.lastAt.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '';
  const logged = s.enabled && s.phase !== 'loggedOut' && s.phase !== 'off';
  const state = { ok: `✓ Zsynchronizowano${t ? ` o ${t}` : ''}`, syncing: '⏳ Synchronizuję…', error: '⚠️ Problem z synchronizacją' }[s.phase] || '';
  return `<div class="card fade">
    <div class="card-label">☁️ Synchronizacja telefon ↔ komputer</div>
    ${logged ? `
      <div class="t-strong">${esc(s.email)}</div>
      <div class="sub ${s.phase === 'error' ? 'neg' : ''}">${state}</div>
      ${s.error ? `<div class="seg-err">${esc(s.error)}</div>` : ''}
      <div class="quick two"><button class="btn" data-act="sync-now">Synchronizuj teraz</button><button class="btn" data-act="sync-out">Wyloguj</button></div>
      ${s.hasBackup ? '<p class="hint small">Przy ostatnim konflikcie starsza wersja została zachowana w tym urządzeniu.</p>' : ''}`
    : `
      <p class="sub">Pierwszy raz: wpisz e-mail i hasło (min. 6 znaków) i stuknij „Załóż konto”. Na drugim urządzeniu – „Zaloguj”. Zmiany z telefonu pojawią się na komputerze i odwrotnie.</p>
      <div class="sync-form">
        <label>E-mail<input type="email" autocomplete="username" data-sync="email" value="${esc(s.email)}"></label>
        <label>Hasło<input type="password" autocomplete="current-password" data-sync="pass"></label>
        <button class="btn primary" data-act="sync-in">Zaloguj i synchronizuj</button>
        <button class="btn" data-act="sync-up">Załóż konto (pierwszy raz)</button>
      </div>
      ${s.error ? `<div class="seg-err">${esc(s.error)}</div>` : ''}`}
    <details class="course-list"><summary>Ustawienia Firebase (już zrobione)</summary>
      <p class="hint small">Projekt <b>kalendarz-stazysty</b>: logowanie e-mailem włączone, baza Firestore z zasadą „każdy widzi tylko swoje dane”. Kopia zasad: <code>firebase/firestore.rules</code> w repozytorium.</p>
      <pre class="rule">${esc(RULE)}</pre>
      <button class="btn" data-act="copy-rule">Kopiuj zasady</button>
    </details>
  </div>`;
}

function bookletCard(state) {
  const bk = state.booklet || {};
  const g = bk.general || {};
  const blocks = state.blocks.map((b) => ({ b, p: bookletProgress(state, b) })).filter((x) => x.p.total);
  const tot = blocks.reduce((a, x) => a + x.p.total, 0);
  const done = blocks.reduce((a, x) => a + x.p.done, 0);
  const cs = coursesSigned(state);
  const ext = g.extensions || [];
  const crs = BOOKLET_COURSES.map((c) => {
    const v = bk.courses?.[c.key] || {};
    return `<div class="course ${v.date ? 'set' : ''}">
      <label class="skill ${v.date ? 'on' : ''}"><input type="checkbox" data-bkc="${c.key}" data-bkf="check" ${v.date ? 'checked' : ''}>
        <span class="box"></span><span class="nm">${esc(c.label)}${v.date ? `<small>podpisane ${fmtShort(v.date)}</small>` : ''}</span></label>
      <div class="row2">
        <label>Organizator<input data-bkc="${c.key}" data-bkf="org" value="${esc(v.org || '')}"></label>
        <label>Wykładowca<input data-bkc="${c.key}" data-bkf="lect" value="${esc(v.lect || '')}"></label>
      </div></div>`;
  }).join('');
  return `<div class="card fade">
    <div class="card-label">📘 Książeczka stażowa</div>
    <div class="res-head" style="margin-bottom:8px"><div><div class="big">${done + cs.done}<small>/ ${tot + cs.total}</small></div>
      <div class="sub">podpisów w blokach i szkoleniach</div></div></div>
    <div class="bk-mini">${blocks.map((x) => `<span class="${x.p.done === x.p.total ? 'ok' : ''}" style="--block:var(--c-${x.b.color})"><i></i>${esc(x.b.short)} ${x.p.done}/${x.p.total}</span>`).join('')}
      <span class="${cs.done === cs.total ? 'ok' : ''}"><i style="background:var(--c-course)"></i>Szkolenia ${cs.done}/${cs.total}</span></div>
    <p class="hint small">Podpisy w blokach odhaczasz w zakładce Bloki → stuknij blok → „📘 Książeczka”.</p>
    <details class="course-list"><summary>Szkolenia (strony z podpisem wykładowcy)</summary>${crs}</details>
    <details class="course-list"><summary>Koordynator, przedłużenia, zaliczenie stażu</summary>
      <div class="course"><label>Koordynator stażu (imię i nazwisko)<input data-bkg="coordinator" value="${esc(g.coordinator || '')}"></label></div>
      <div class="course"><b>Przedłużenie stażu podyplomowego</b>
        ${ext.map((x, i) => `<div class="ext-row"><span>${x.from ? fmtShort(x.from) : '?'}–${x.to ? fmtShort(x.to) : '?'} · ${esc(x.reason || '')}</span><button class="link danger" data-ext-del="${i}">Usuń</button></div>`).join('') || '<div class="hint small">Brak przedłużeń.</div>'}
        <div class="row2"><label>Od<input type="date" data-ext="from"></label><label>Do<input type="date" data-ext="to"></label></div>
        <label>Powód<input data-ext="reason" placeholder="np. zwolnienie lekarskie"></label>
        <button class="btn" data-ext-add>＋ Dodaj przedłużenie</button></div>
      <div class="course"><b>Zaliczenie stażu podyplomowego</b>
        <div class="row2"><label>Odbył staż od<input type="date" data-bkg="finalFrom" value="${g.finalFrom || ''}"></label>
          <label>do<input type="date" data-bkg="finalTo" value="${g.finalTo || ''}"></label></div>
        <label>Data podpisu koordynatora<input type="date" data-bkg="finalDate" value="${g.finalDate || ''}"></label></div>
    </details>
  </div>`;
}

function coursesCard(state) {
  const all = state.courses || [];
  const withDays = all.filter((c) => c.days > 0);
  const done = withDays.filter((c) => c.start).length;
  const rows = all.map((c) => `<div class="course ${c.start ? 'set' : ''}">
      <div class="course-head"><b>${esc(c.name)}</b>
        <span class="muted small">${c.days ? `${c.days} ${c.days === 1 ? 'dzień' : 'dni'}` : 'bez osobnego dnia'} · ${esc(c.provider)} · ${esc(c.mode)}</span></div>
      ${c.days ? `<div class="val-row"><span class="${c.start ? '' : 'muted'}">${c.start ? `${fmtDayShort(c.start)}${c.end && c.end !== c.start ? ` – ${fmtDayShort(c.end)}` : ''}` : 'bez terminu'}</span>
        <span><button class="chip" data-course-edit="${esc(c.id)}">${c.start ? 'Zmień' : 'Wpisz termin'}</button>
        ${c.start ? `<button class="chip danger-chip" data-course-clear="${esc(c.id)}">Usuń</button>` : ''}</span></div>` : ''}
    </div>`).join('');
  return `<div class="card fade">
    <div class="card-label">🎓 Kursy OIL · ${done}/${withDays.length} z terminem</div>
    <p class="sub">Terminy dla Twojego rocznika poda OIL Szczecin (zwykle ok. marca–kwietnia). Wpisz je, gdy przyjdą – aplikacja doliczy dni do odrobienia.</p>
    <details class="course-list"><summary>Pokaż kursy i wpisz terminy</summary>${rows}</details>
  </div>`;
}

function satOffCard(state) {
  const st = state.settings;
  const sats = [...holidayMap(st.startDate, st.endDate).values()].filter((h) => h.saturday);
  if (!sats.length) return '';
  return `<div class="card fade">
    <div class="card-label">🛋 Dni wolne za święta w sobotę</div>
    <p class="sub">Za święto w sobotę pracodawca wyznacza inny dzień wolny. Wpisz, który – liczy się jak święto.</p>
    ${sats.map((h) => {
      const off = st.saturdayDaysOff?.[h.date];
      const warn = off && (isWeekend(off) || Math.abs(toNum(off) - toNum(h.date)) > 45);
      return `<div class="course"><div class="course-head"><b>${esc(h.name)}</b><span class="muted small">sobota ${fmtShort(h.date)}</span></div>
        <div class="val-row"><span class="${off ? '' : 'muted'}">${off ? `wolne: ${fmtDayShort(off)}` : 'dzień wolny nie wpisany'}</span>
          <span><button class="chip" data-satoff-edit="${h.date}">${off ? 'Zmień' : 'Wpisz'}</button>
          ${off ? `<button class="chip danger-chip" data-satoff-clear="${h.date}">Usuń</button>` : ''}</span></div>
        ${warn ? `<div class="seg-err">⚠️ ${isWeekend(off) ? 'To weekend – sprawdź datę.' : 'Data daleko od święta – czy na pewno?'}</div>` : ''}
        ${st.saturdayDaysOffNote?.[h.date] ? `<div class="hint small">${esc(st.saturdayDaysOffNote[h.date])}</div>` : ''}</div>`;
    }).join('')}
  </div>`;
}

/** Małe okienko do zmiany dat – zmiana zapisuje się dopiero po „Zapisz”. */
function dateSheet({ title, sub, fields, onSave }) {
  const root = document.createElement('div');
  root.className = 'sheet-wrap';
  document.body.appendChild(root);
  document.body.classList.add('no-scroll');
  const close = () => { root.classList.add('closing'); document.body.classList.remove('no-scroll'); setTimeout(() => root.remove(), 220); };
  root.innerHTML = `<div class="sheet-backdrop" data-close></div>
    <div class="sheet" role="dialog" aria-label="${esc(title)}">
      <div class="sheet-head"><button class="link" data-close>Anuluj</button><b>${esc(title)}</b><button class="link strong" data-ok>Zapisz</button></div>
      <div class="sheet-body"><div class="form-card">
        ${sub ? `<p class="sub" style="margin-top:0">${esc(sub)}</p>` : ''}
        ${fields.map((f) => `<label>${esc(f.label)}<input type="date" data-k="${f.key}" value="${f.value || ''}"></label>`).join('')}
      </div></div></div>`;
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    if (e.target.closest('[data-ok]')) {
      const vals = {};
      root.querySelectorAll('[data-k]').forEach((i) => { vals[i.dataset.k] = i.value || null; });
      if (onSave(vals) !== false) close();
    }
  });
}

/** Koniec kursu: start + (dni − 1) dni roboczych. */
function courseEnd(start, days) {
  let d = start;
  let left = Math.max(0, days - 1);
  while (left > 0) { d = addDays(d, 1); if (!isWeekend(d)) left--; }
  return d;
}

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function shareOrDownload(name, text, type) {
  try {
    const file = new File([text], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  download(name, text, type);
}

/** Obsługa kliknięć ekranu „Więcej”. Zwraca true, gdy obsłużono. */
export function handleMoreClick(e, ctx) {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'ics') {
    download('kalendarz-stazu.ics', buildIcs(ctx.state, ctx.today()), 'text/calendar;charset=utf-8');
    ctx.toast('Plik kalendarza gotowy – stuknij „Dodaj wszystko”.');
    return true;
  }
  if (act === 'sync-in') {
    const card = e.target.closest('.card');
    const email = card.querySelector('[data-sync="email"]').value;
    const pass = card.querySelector('[data-sync="pass"]').value;
    if (!email || !pass) { ctx.toast('Wpisz e-mail i hasło'); return true; }
    signIn(email, pass).then(() => ctx.render());
    return true;
  }
  if (act === 'sync-up') {
    const card = e.target.closest('.card');
    const email = card.querySelector('[data-sync="email"]').value;
    const pass = card.querySelector('[data-sync="pass"]').value;
    if (!email || pass.length < 6) { ctx.toast('Wpisz e-mail i hasło (min. 6 znaków)'); return true; }
    signUp(email, pass).then(() => ctx.render());
    return true;
  }
  if (act === 'sync-out') {
    if (confirm('Wylogować z synchronizacji? Dane w tym urządzeniu zostaną.')) signOutSync().then(() => ctx.render());
    return true;
  }
  if (act === 'sync-now') { syncNow(); return true; }
  if (act === 'timesheet') { openTimesheet(ctx.state, ctx.today(), ctx); return true; }
  if (act === 'copy-rule') {
    navigator.clipboard?.writeText(RULE).then(() => ctx.toast('Skopiowano ✓'), () => ctx.toast('Zaznacz tekst i skopiuj ręcznie'));
    return true;
  }
  if (act === 'backup') {
    const d = new Date().toISOString().slice(0, 10);
    ctx.state.meta.lastBackup = new Date().toISOString();
    ctx.save();
    shareOrDownload(`kalendarz-stazysty-${d}.json`, backupText(ctx.state), 'application/json');
    ctx.render();
    return true;
  }
  const st0 = ctx.state;
  const se = e.target.closest('[data-satoff-edit]');
  if (se) {
    const hd = se.dataset.satoffEdit;
    dateSheet({
      title: 'Dzień wolny za sobotę', sub: `Za święto w sobotę ${fmtShort(hd)} – jaki dzień wolny wyznaczył pracodawca?`,
      fields: [{ key: 'off', label: 'Dzień wolny', value: st0.settings.saturdayDaysOff?.[hd] }],
      onSave: (v) => {
        const prev = st0.settings.saturdayDaysOff[hd] || null;
        st0.settings.saturdayDaysOff[hd] = v.off;
        ctx.save(); ctx.render();
        ctx.toast('Zapisano ✓', () => { st0.settings.saturdayDaysOff[hd] = prev; ctx.save(); ctx.render(); });
      },
    });
    return true;
  }
  const sc = e.target.closest('[data-satoff-clear]');
  if (sc) {
    const hd = sc.dataset.satoffClear;
    const prev = st0.settings.saturdayDaysOff[hd];
    st0.settings.saturdayDaysOff[hd] = null;
    ctx.save(); ctx.render();
    ctx.toast('Usunięto', () => { st0.settings.saturdayDaysOff[hd] = prev; ctx.save(); ctx.render(); });
    return true;
  }
  const ce = e.target.closest('[data-course-edit]');
  if (ce) {
    const c = st0.courses.find((x) => x.id === ce.dataset.courseEdit);
    dateSheet({
      title: 'Termin kursu', sub: `${c.name} – ${c.days} ${c.days === 1 ? 'dzień' : 'dni'}. Koniec uzupełni się sam, jeśli go nie wpiszesz.`,
      fields: [{ key: 'start', label: 'Od', value: c.start }, { key: 'end', label: 'Do', value: c.end }],
      onSave: (v) => {
        if (v.start && v.end && v.end < v.start) { ctx.toast('Koniec przed początkiem'); return false; }
        const prev = { start: c.start, end: c.end };
        c.start = v.start || v.end || null;
        c.end = c.start ? (v.end || courseEnd(c.start, c.days)) : null;
        ctx.save(); ctx.render();
        ctx.toast('Zapisano ✓', () => { Object.assign(c, prev); ctx.save(); ctx.render(); });
      },
    });
    return true;
  }
  const cc = e.target.closest('[data-course-clear]');
  if (cc) {
    const c = st0.courses.find((x) => x.id === cc.dataset.courseClear);
    const prev = { start: c.start, end: c.end };
    c.start = null; c.end = null;
    ctx.save(); ctx.render();
    ctx.toast('Usunięto termin', () => { Object.assign(c, prev); ctx.save(); ctx.render(); });
    return true;
  }
  if (e.target.closest('[data-ext-add]')) {
    const card = e.target.closest('.course');
    const v = (k) => card.querySelector(`[data-ext="${k}"]`).value;
    if (!v('from') || !v('to')) { ctx.toast('Wpisz daty od i do'); return true; }
    const st = ctx.state;
    st.booklet = st.booklet || {};
    st.booklet.general = st.booklet.general || {};
    st.booklet.general.extensions = [...(st.booklet.general.extensions || []), { from: v('from'), to: v('to'), reason: v('reason') }];
    ctx.save(); ctx.render(); ctx.toast('Dodano ✓');
    return true;
  }
  const xd = e.target.closest('[data-ext-del]');
  if (xd) {
    const g = ctx.state.booklet.general;
    const removed = g.extensions.splice(Number(xd.dataset.extDel), 1)[0];
    ctx.save(); ctx.render();
    ctx.toast('Usunięto', () => { g.extensions.push(removed); ctx.save(); ctx.render(); });
    return true;
  }
  const th = e.target.closest('[data-theme-set]');
  if (th) {
    ctx.state.settings.theme = th.dataset.themeSet;
    ctx.save();
    ctx.applyTheme();
    ctx.render();
    return true;
  }
  return false;
}

export function handleMoreChange(e, ctx) {
  const el = e.target;
  const st = ctx.state;
  if (el.dataset.bkc) {
    st.booklet = st.booklet || {};
    st.booklet.courses = st.booklet.courses || {};
    const cur = { ...(st.booklet.courses[el.dataset.bkc] || {}) };
    if (el.dataset.bkf === 'check') { if (el.checked) cur.date = new Date().toISOString().slice(0, 10); else delete cur.date; }
    else cur[el.dataset.bkf] = el.value;
    st.booklet.courses[el.dataset.bkc] = cur;
    ctx.save();
    if (el.dataset.bkf === 'check') {
      const key = el.dataset.bkc;
      const was = !el.checked;
      ctx.render();
      ctx.toast(el.checked ? 'Odhaczono ✓' : 'Odznaczono', () => {
        const c2 = st.booklet.courses[key];
        if (was) c2.date = c2.date || new Date().toISOString().slice(0, 10); else delete c2.date;
        ctx.save(); ctx.render();
      });
    } else ctx.toast('Zapisano ✓');
    return true;
  }
  if (el.dataset.bkg) {
    st.booklet = st.booklet || {};
    st.booklet.general = { ...(st.booklet.general || {}), [el.dataset.bkg]: el.value };
    ctx.save();
    ctx.toast('Zapisano ✓');
    return true;
  }
  if (el.dataset.ext) return true;
  if (el.dataset.course) {
    const c = ctx.state.courses.find((x) => x.id === el.dataset.course);
    c[el.dataset.cf] = el.value || null;
    if (el.dataset.cf === 'start') {
      if (!el.value) c.end = null;
      else if (!c.end || c.end < c.start) c.end = courseEnd(c.start, c.days);
    }
    if (c.end && !c.start) c.start = c.end;
    ctx.save();
    ctx.render();
    ctx.toast('Zapisano ✓');
    return true;
  }
  if (el.dataset.satoff) {
    ctx.state.settings.saturdayDaysOff[el.dataset.satoff] = el.value || null;
    ctx.save();
    ctx.render();
    ctx.toast('Zapisano ✓');
    return true;
  }
  if (e.target.dataset.act !== 'restore') return false;
  const f = e.target.files?.[0];
  if (!f) return true;
  f.text().then((txt) => {
    try {
      const data = parseBackup(txt);
      if (!confirm('Wczytać kopię? Obecne dane na tym urządzeniu zostaną zastąpione danymi z pliku.')) return;
      ctx.replace(data);
      ctx.toast('Kopia wczytana ✓');
    } catch (err) {
      alert(err.message);
    }
  });
  return true;
}

export { esc };
