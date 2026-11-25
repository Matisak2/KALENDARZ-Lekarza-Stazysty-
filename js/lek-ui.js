// Zakładka „LEK”: planer nauki (Plan), spis kursów WNL (Materiały), wyniki LEK i próbne (Wyniki), Specjalizacje.
import { shareOrDownload } from './more-ui.js';
import { DOMAINS, domainOf, guessDomain, parseCoursesText, coursesFromFile, mergeCourses, coursesFileJson, mergeCourse, allLessons, buildPlan, currentWeek, DEFAULT_SURVEY } from './lek.js';
import { specNames, wojNames, specStats, suggestTarget, chance, MY_SPECS, TRYBY } from './specs.js';
import { fmtShort, fmtFull, fmtDayShort, toNum, plural, todayIso } from './dates.js';
import { esc } from './blocks-ui.js';

let seg = 'plan';
let specWoj = 'Zachodniopomorskie';
let specQuery = '';
let nabory = null;
let naboryErr = '';

export function loadNabory(onReady) {
  if (nabory || naboryErr) return;
  fetch('data/nabory.json').then((r) => r.json()).then((d) => { nabory = d; onReady(); })
    .catch(() => { naboryErr = 'Nie udało się wczytać danych naboru (brak internetu?).'; onReady(); });
}

const study = (state) => {
  state.study = state.study || { courses: [], done: {}, plans: [], activePlan: null, attempts: [], mocks: [] };
  return state.study;
};
const activePlan = (st) => (st.plans || []).find((p) => p.id === st.activePlan && !p.archived) || null;
const h = (n) => `${String(Math.round(n * 10) / 10).replace(".", ",")} h`;
const pctBar = (v, target) => `<div class="score-bar"><div style="width:${Math.min(100, v)}%"></div>
  <i style="left:56%" title="próg 56%"></i>${target > 56 ? `<i class="tg" style="left:${Math.min(100, target)}%" title="cel"></i>` : ''}</div>`;

/* ---------- Ekran ---------- */

export function renderLek(state, today, ctx) {
  const st = study(state);
  loadNabory(() => ctx.render());
  const tabs = [['plan', 'Plan'], ['mat', 'Materiały'], ['wyn', 'Wyniki'], ['spec', 'Specjalizacje']];
  let body = '';
  if (seg === 'plan') body = planView(state, st, today);
  else if (seg === 'mat') body = materialsView(st);
  else if (seg === 'wyn') body = resultsView(st);
  else body = specsView(st, state);
  return `
    <header class="page-head"><div class="eyebrow">Planer nauki</div><h1 class="large-title">LEK</h1></header>
    <div class="segmented four sticky-seg">${tabs.map(([k, l]) => `<button data-lekseg="${k}" class="${seg === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div style="height:12px"></div>
    ${body}`;
}

function planView(state, st, today) {
  const p = activePlan(st);
  const lessons = allLessons(st);
  if (!lessons.length) {
    return `<div class="card fade empty-card">
      <div class="big-emoji">📚</div>
      <div class="t-strong">Najpierw dodaj spis kursów WNL</div>
      <p class="sub">Planer układa konkretne lekcje z Twojego pakietu. Wklej spis kursu (np. „Kurs z Interny”) w zakładce Materiały.</p>
      <button class="btn primary" data-lekseg="mat">Przejdź do Materiałów</button>
      ${!p ? '<button class="btn" data-lek="new-plan">Albo najpierw wypełnij ankietę</button>' : ''}
    </div>${p ? planSummary(state, st, p, today) : ''}`;
  }
  if (!p) {
    return `<div class="card fade empty-card"><div class="big-emoji">🎯</div>
      <div class="t-strong">Utwórz plan na najbliższe podejście</div>
      <p class="sub">Krótka ankieta: termin, cel, ile masz czasu, co Ci idzie słabiej. Plan dopasuje się do Twoich dyżurów i bloków.</p>
      <button class="btn primary" data-lek="new-plan">Wypełnij ankietę</button></div>
      ${plansList(st)}`;
  }
  return planSummary(state, st, p, today);
}

function planSummary(state, st, p, today) {
  const b = buildPlan(state, p, today);
  const s = b.survey;
  const w = currentWeek(b, today);
  const vColor = { good: 'var(--ok)', tight: 'var(--warn)', hard: 'var(--danger)' }[b.verdict];
  const vText = {
    good: 'Realny cel – plan ma zapas.',
    tight: 'Na styk – trzymaj się planu.',
    hard: 'Przy tym czasie cel jest mało realny. Rozważ więcej godzin, inny cel albo późniejszy termin.',
  }[b.verdict];
  const doneSet = st.done || {};
  const lessonRow = (l) => `<div class="lesson ${doneSet[l.key] ? 'on' : ''}">
      <label class="skill ${doneSet[l.key] ? 'on' : ''}"><input type="checkbox" data-lesson="${esc(l.key)}" ${doneSet[l.key] ? 'checked' : ''}>
        <span class="box"></span><span class="nm">${esc(l.name)}<small>${esc((l.domains?.length ? l.domains : [l.domain]).map(shortDom).join(' + '))} · ${esc(l.section)} · ${h(l.hours)}</small></span></label>
      <button class="chip" data-skip="${esc(l.key)}" title="Pomiń">Pomiń</button></div>`;
  const weeksHtml = b.weeks.filter((x) => x !== w).slice(0, 30).map((x) => `<div class="wk ${x.review ? 'rv' : ''}">
      <div class="wk-h"><b>${fmtShort(x.start)}–${fmtShort(x.end)}</b><span>${h(x.hours)}${x.review ? ' · powtórka' : ''}</span></div>
      ${x.lessons.length ? `<div class="wk-l">${x.lessons.map((l) => esc(l.name)).join(' · ')}</div>` : `<div class="wk-l muted">${x.review ? 'Powtórka i pytania z bazy' : 'Pytania i powtórki'}</div>`}
    </div>`).join('');
  return `
    <div class="card hero fade" style="--block:var(--c-course)">
      <div class="card-label">${esc(p.name)} · ${s.mode === 'trening' ? 'podejście treningowe' : 'na serio'}</div>
      <div class="hero-top">
        <div class="hero-info">
          <div class="hero-name">${b.daysLeft} ${plural(b.daysLeft, 'dzień', 'dni', 'dni')}</div>
          <div class="hero-place">do LEK ${fmtFull(s.examDate)} · cel ${b.target}%${s.spec ? ` (${esc(s.spec)})` : ''}</div>
        </div>
      </div>
      <div class="est">
        <div><span>Szacowany wynik przy realizacji planu</span><b style="color:${vColor}">${b.estPlan}%</b></div>
        ${pctBar(b.estPlan, b.target)}
        <div class="sub" style="color:${vColor};font-weight:700">${vText}</div>
        <div class="sub">Gdyby egzamin był dziś: ~${b.estNow}%. To orientacyjny szacunek – wpisuj wyniki próbnych, będą dokładniejsze.</div>
      </div>
      <div class="hero-stats">
        <div class="stat"><b>${Math.round(b.hoursTotal)}</b><span>godzin nauki do egzaminu</span></div>
        <div class="stat"><b>${b.chosen.length}</b><span>lekcji w planie (${h(b.chosen.reduce((a, l) => a + l.hours, 0))})</span></div>
        <div class="stat"><b>${b.dropped.length}</b><span>pominiętych</span></div>
      </div>
    </div>
    <div class="desk-2"><div>
      ${w ? `<div class="card fade"><div class="card-label">Ten tydzień · ${fmtShort(w.start)}–${fmtShort(w.end)} · ${h(w.hours)}</div>
        ${w.lessons.length ? w.lessons.map(lessonRow).join('') : '<p class="sub">W tym tygodniu: powtórka i pytania.</p>'}
        ${s.base ? `<div class="base-row">🧩 Baza pytań: ok. <b>${Math.round((w.base * 60) / 1.5)}</b> pytań (${h(w.base)})${b.baseOnlyQ ? `<br><small>w tym ok. ${Math.round(((w.base * 60) / 1.5) * b.baseOnlyQ / 200)} z prawa i bioetyki, zdrowia publicznego i orzecznictwa – tych dziedzin uczysz się tylko z bazy</small>` : ''}</div>` : `<div class="base-row">🧩 Pytania WNL do przerobionych tematów: ${h(w.base)}</div>`}
      </div>` : ''}
      ${s.base ? `<div class="card fade"><div class="card-label">🧩 Baza CEM</div>
        <div class="val-row"><span><b>${s.baseDone || 0}</b> / ${s.baseTotal || '?'} pytań</span>
          <span><button class="chip" data-base-add="50">+50</button><button class="chip" data-base-add="100">+100</button><button class="chip" data-lek="edit-plan">Zmień</button></span></div>
        ${s.baseTotal ? `<div class="minibar" style="--block:var(--c-course)"><div style="width:${Math.min(100, ((s.baseDone || 0) / s.baseTotal) * 100)}%"></div></div>` : '<p class="hint small">Wpisz w ankiecie, ile pytań ma baza (zobaczysz w swoim narzędziu do bazy).</p>'}
        <p class="hint small">Do egzaminu zmieścisz jeszcze ok. ${b.baseCanDo} pytań. Na luty 2027 baza daje 70% pytań (art. 14c ustawy).</p></div>` : ''}
    </div><div>
      ${domainsCard(b)}
      <div class="card fade"><details class="course-list"><summary>Kolejne tygodnie (${b.weeks.length})</summary>${weeksHtml}</details></div>
      <div class="card fade"><details class="course-list"><summary>Pominięte lekcje (${b.dropped.length})</summary>
        ${b.dropped.map((l) => `<div class="lesson"><span class="nm">${esc(l.name)}<small>${esc(l.reason)} · ${h(l.hours)}</small></span>
          <button class="chip" data-must="${esc(l.key)}">Jednak zrób</button></div>`).join('') || '<p class="sub">Nic – wszystko się mieści.</p>'}
      </details></div>
      <div class="card fade"><div class="card-label">Plan</div>
        <div class="quick two"><button class="btn" data-lek="edit-plan">Edytuj ankietę</button><button class="btn" data-lek="new-plan">Nowy plan</button></div>
        ${plansList(st)}
      </div>
    </div></div>`;
}

function plansList(st) {
  const ps = st.plans || [];
  if (!ps.length) return '';
  return `<div class="plans">${ps.map((p) => `<div class="val-row"><span class="${p.archived ? 'muted' : ''}">${p.id === st.activePlan ? '● ' : ''}${esc(p.name)}
      <small class="muted"> · ${fmtShort(p.survey.examDate)}${p.archived ? ' · archiwum' : ''}</small></span>
      <span>${p.id !== st.activePlan ? `<button class="chip" data-plan-use="${p.id}">Wybierz</button>` : ''}
      <button class="chip" data-plan-arch="${p.id}">${p.archived ? 'Przywróć' : 'Archiwizuj'}</button>
      <button class="chip danger-chip" data-plan-del="${p.id}">Usuń</button></span></div>`).join('')}</div>`;
}

const SHORT_DOM = { int: 'interna', ped: 'pediatria', chir: 'chirurgia', gin: 'ginekologia', rodz: 'medycyna rodzinna', rat: 'ratunkowa', psych: 'psychiatria', etyka: 'prawo i etyka', zp: 'zdrowie publiczne', orz: 'orzecznictwo' };
const shortDom = (id) => SHORT_DOM[id] || 'poza LEK';

/** Karta: jak plan pokrywa każdą dziedzinę LEK (także dziedziny bez własnego kursu WNL). */
function domainsCard(b) {
  const rows = (b.domains || []).map((d) => {
    const pct = Math.round(d.cov * 100);
    if (d.baseOnly) {
      const nq = Math.round(((b.baseCanDo || 0) * d.q) / 200);
      return `<div class="dom-row"><div class="dom-h"><b>${esc(d.name)}</b><span class="muted">${d.q} pyt.</span><span class="dom-p">🧩</span></div>
        <div class="hint small">Tylko baza pytań CEM – bez lekcji (kursy WNL tego nie obejmują).${b.survey.base && nq ? ` Do egzaminu ok. <b>${nq}</b> pytań z tej dziedziny.` : ''}</div></div>`;
    }
    const info = d.own ? `${d.lessons} ${plural(d.lessons, 'lekcja', 'lekcje', 'lekcji')}`
      : d.lessons ? `bez kursu – ${d.lessons} ${plural(d.lessons, 'pasująca lekcja', 'pasujące lekcje', 'pasujących lekcji')} z innych kursów` : 'bez kursu i bez pasujących lekcji';
    return `<div class="dom-row">
      <div class="dom-h"><b>${esc(d.name)}</b><span class="muted">${d.q} pyt.</span><span class="dom-p">${pct}%</span></div>
      <div class="minibar" style="--block:var(--c-course)"><div style="width:${pct}%"></div></div>
      <div class="hint small">${info}${!d.own && pct < 50 ? ' · resztę nadrób pytaniami z bazy CEM' : ''}</div></div>`;
  }).join('');
  return `<div class="card fade"><details class="course-list"><summary>Dziedziny LEK – pokrycie planu</summary>
    <p class="hint small">Lekcja liczy się do każdej dziedziny, do której pasuje (np. nadciśnienie: interna i medycyna rodzinna). Procent = ile materiału z Twoich kursów dla tej dziedziny obejmie plan (z tym, co już zrobione).</p>
    ${rows}</details></div>`;
}

const num1 = (x) => String(Math.round(x * 10) / 10).replace('.', ',');

function materialsView(st) {
  const done = st.done || {};
  const courses = st.courses || [];
  const domOpts = (sel) => [...DOMAINS, { id: 'inne', name: 'Inne (poza dziedzinami LEK)' }]
    .map((d) => `<option value="${d.id}" ${d.id === sel ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
  const list = courses.map((c) => {
    const ls = allLessons({ courses: [c] });
    const dn = ls.filter((l) => done[l.key]).length;
    const left = ls.filter((l) => !done[l.key]).reduce((a, l) => a + l.hours, 0);
    return `<div class="card fade">
      <div class="bc-top"><div class="bc-name">${esc(c.name)}</div><button class="chip danger-chip" data-course-del="${c.id}">Usuń</button></div>
      <label class="dom-sel">Dziedzina LEK<select data-course-dom="${c.id}">${domOpts(c.domain)}</select></label>
      <div class="bc-bar"><div style="width:${ls.length ? (dn / ls.length) * 100 : 0}%;background:var(--c-course)"></div></div>
      <div class="bc-nums"><span><b>${dn}</b> z ${ls.length} lekcji</span><span class="muted">zostało ok. ${h(left)}</span></div>
      <details class="course-list"><summary>Lekcje</summary>
        ${c.sections.map((s) => {
          const lo = s.lessons.reduce((a, l) => a + (l.hMin || 0), 0);
          const hi = s.lessons.reduce((a, l) => a + (l.hMax || 0), 0);
          return `<div class="sec-name"><span>${esc(s.name)} <span class="sec-n">(${s.lessons.length})</span></span>${lo ? `<span class="t-chip">🕒 ${num1(lo)}–${num1(hi)} h</span>` : ''}</div>${s.lessons.map((l) => {
          const key = ls.find((x) => x.section === s.name && x.name === l.name)?.key;
          return `<label class="skill ${done[key] ? 'on' : ''}"><input type="checkbox" data-lesson="${esc(key)}" ${done[key] ? 'checked' : ''}>
            <span class="box"></span><span class="nm">${esc(l.name)}</span>${l.hMin != null ? `<span class="t-chip">${num1(l.hMin)}–${num1(l.hMax)} h</span>` : ''}</label>`;
        }).join('')}`;
        }).join('')}
      </details></div>`;
  }).join('');
  return `
    <div class="card fade">
      <div class="card-label">📥 Spis kursów WNL</div>
      <ol class="sub steps-ol">
        <li>Na komputerze otwórz w WNL <b>planer lekcji</b> danego kursu (np. adres <b>onkologia</b>.wiecejnizlek.pl).</li>
        <li><b>Rozwiń wszystkie działy</b> (strzałka przy nazwie działu).</li>
        <li>Zaznacz listę (Ctrl+A), skopiuj (Ctrl+C) i wklej tutaj.</li>
        <li>Nazwy kursu nie ma na liście WNL – aplikacja poprosi o nią (np. „Kurs z onkologii”).</li>
      </ol>
      <p class="hint small">Daty i dni tygodnia z planu WNL są pomijane – plan układa ta aplikacja według Twojego grafiku. Zapisują się tylko nazwy tematów i czasy, w Twoich danych (nie w publicznym kodzie).</p>
      <button class="btn primary" data-lek="paste">Wklej spis kursu</button>
      <div class="quick two" style="margin-top:8px">
        <label class="btn">Wczytaj plik…<input type="file" accept=".json,.txt,application/json,text/plain" data-courses-file hidden></label>
        <button class="btn" data-lek="save-courses" ${courses.length ? '' : 'disabled'}>Zapisz plik z kursami</button>
      </div>
      <p class="hint small">Wczytanie pliku dodaje tylko to, czego jeszcze nie masz: nowe kursy oraz brakujące działy i lekcje. Nic nie znika, odhaczenia zostają. „Zapisz plik” robi aktualną kopię spisu (np. do Plików na iPhonie).</p>
    </div>
    ${list || '<p class="hint">Brak kursów. Wklej pierwszy spis powyżej.</p>'}`;
}

function resultsView(st) {
  const at = [...(st.attempts || [])].sort((a, b) => (a.date < b.date ? 1 : -1));
  const mocks = [...(st.mocks || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  const best = at.reduce((m, a) => (a.pct != null && a.pct > m ? a.pct : m), -1);
  return `
    <div class="card fade"><div class="card-label">📝 Twoje podejścia do LEK</div>
      ${at.map((a) => `<div class="val-row"><span><b>${esc(a.session)}</b> <small class="muted">${fmtFull(a.date)}</small></span>
        <span><b class="${a.pct >= 56 ? 'pos' : 'neg'}">${a.pct != null ? `${a.pct}%` : '—'}</b>
        <button class="chip danger-chip" data-att-del="${a.id}">Usuń</button></span></div>`).join('') || '<p class="sub">Brak wpisów.</p>'}
      ${best >= 0 ? `<p class="hint small">Najlepszy wynik: <b>${best}%</b>. W SMK przy wniosku na specjalizację widać wynik oznaczony jako „wyższy”.</p>` : ''}
      <button class="btn" data-lek="add-att">＋ Dodaj podejście</button>
    </div>
    <div class="card fade"><div class="card-label">📈 Egzaminy próbne</div>
      ${chart(mocks)}
      ${mocks.slice().reverse().map((m) => `<div class="val-row"><span>${fmtDayShort(m.date)} <small class="muted">${esc(m.source || '')}</small></span>
        <span><b>${m.pct}%</b><button class="chip danger-chip" data-mock-del="${m.id}">Usuń</button></span></div>`).join('') || '<p class="sub">Wpisuj wyniki próbnych LEK-ów (WNL, baza CEM) – zobaczysz trend i realne szanse.</p>'}
      <button class="btn" data-lek="add-mock">＋ Dodaj wynik próbnego</button>
    </div>`;
}

function chart(mocks) {
  if (mocks.length < 2) return '';
  const W = 320; const H = 130; const pad = 24;
  const xs = mocks.map((_, i) => pad + (i * (W - 2 * pad)) / (mocks.length - 1));
  const y = (v) => H - pad - ((v - 20) / 80) * (H - 2 * pad);
  const pts = mocks.map((m, i) => `${xs[i]},${y(m.pct)}`).join(' ');
  return `<svg class="mock-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Wyniki próbnych egzaminów">
    <line x1="${pad}" x2="${W - pad}" y1="${y(56)}" y2="${y(56)}" class="thr"/><text x="${W - pad}" y="${y(56) - 4}" text-anchor="end" class="lbl">56%</text>
    <polyline points="${pts}" class="ln"/>${mocks.map((m, i) => `<circle cx="${xs[i]}" cy="${y(m.pct)}" r="4" class="pt"/>`).join('')}
  </svg>`;
}

function specsView(st, state) {
  if (naboryErr) return `<div class="card">${esc(naboryErr)}</div>`;
  if (!nabory) return '<div class="card"><p class="sub">Wczytuję dane naboru…</p></div>';
  const best = Math.max(-1, ...(st.attempts || []).map((a) => a.pct ?? -1));
  const p = activePlan(st);
  const mine = best >= 0 ? best : null;
  const woj = wojNames(nabory);
  const all = specNames(nabory);
  const q = specQuery.trim().toLowerCase();
  const list = q ? all.filter((n) => n.toLowerCase().includes(q)) : MY_SPECS.filter((n) => all.includes(n));
  const card = (dz) => {
    const rows = specStats(nabory, dz, specWoj, 'rez');
    const rowsP = specStats(nabory, dz, specWoj, 'poz');
    const t = suggestTarget(nabory, dz, specWoj, 'rez');
    const ch = mine != null ? chance(nabory, dz, specWoj, mine, 'rez') : null;
    const cell = (x) => (x.places ? `${x.places} m. · ${x.threshold != null ? `<b>${x.threshold.toFixed(2)}%</b>` : `<span class="pos">${x.status}</span>`}` : '<span class="muted">brak miejsc</span>');
    return `<div class="card fade spec-card">
      <div class="bc-top"><div class="bc-name">${esc(dz)}</div>${t.target ? `<span class="status current">cel ${t.target}%</span>` : '<span class="status past">rezydentura: bez konkurencji</span>'}</div>
      <table class="spec-t"><tr><th>Nabór</th><th>Rezydentura</th><th>Pozarezyd.</th></tr>
        ${rows.map((x, i) => `<tr><td>${esc(x.session)}</td><td>${cell(x)}</td><td>${cell(rowsP[i])}</td></tr>`).join('')}</table>
      <p class="hint small">${esc(t.basis)}${ch ? ` · Twój najlepszy wynik ${mine}% wystarczyłby w ${ch.ok} z ${ch.of} naborów (szanse: ${ch.label}).` : ''}</p>
      ${p && t.target ? `<button class="btn" data-spec-goal="${esc(dz)}" data-spec-target="${t.target}">Ustaw jako cel planu (${t.target}%)</button>` : ''}
    </div>`;
  };
  return `
    <div class="card fade">
      <div class="card-label">🏥 Specjalizacje – nabory CMKP</div>
      <label class="dom-sel">Województwo<select data-spec-woj>${woj.map((w) => `<option ${w === specWoj ? 'selected' : ''}>${esc(w)}</option>`).join('')}</select></label>
      <label class="dom-sel">Szukaj specjalizacji<input data-spec-q value="${esc(specQuery)}" placeholder="np. kardiologia (puste = Twoje 4)"></label>
      <p class="hint small">Próg = najniższy wynik zakwalifikowanych, gdy wszystkie miejsca zostały obsadzone. „Zostały wolne miejsca” = każdy chętny się dostał.
        Wynik w naborze to % punktów z LEK (+ ewentualne punkty za doktorat i publikacje). Dane: CMKP, ostatnia aktualizacja ${fmtFull(nabory.updated)}.</p>
    </div>
    ${list.map(card).join('') || '<p class="hint">Brak wyników wyszukiwania.</p>'}`;
}

/* ---------- Okna ---------- */

function sheet(title, body, okLabel = 'Zapisz') {
  const root = document.createElement('div');
  root.className = 'sheet-wrap';
  document.body.appendChild(root);
  document.body.classList.add('no-scroll');
  root.innerHTML = `<div class="sheet-backdrop" data-close></div><div class="sheet" role="dialog" aria-label="${esc(title)}">
    <div class="sheet-head"><button class="link" data-close>Anuluj</button><b>${esc(title)}</b><button class="link strong" data-ok>${okLabel}</button></div>
    <div class="sheet-body">${body}</div></div>`;
  const close = () => { root.classList.add('closing'); document.body.classList.remove('no-scroll'); setTimeout(() => root.remove(), 220); };
  return { root, close };
}

function pasteSheet(state, ctx) {
  const st = study(state);
  const { root, close } = sheet('Wklej spis kursu', `<div class="form-card">
      <p class="sub" style="margin-top:0">Wklej listę skopiowaną z planera lekcji WNL (z rozwiniętymi działami). Kilka kursów naraz: przed każdym dopisz linijkę z nazwą, np. „Kurs z pediatrii”.</p>
      <textarea data-paste rows="10" placeholder="Podstawy onkologii&#10;(4)&#10;6h - 10h&#10;Podstawy onkologii&#10;Wstęp do onkologii&#10;…"></textarea>
      <label data-cname-wrap hidden>Nazwa kursu (nie ma jej w wklejonym tekście)<input data-cname placeholder="np. Kurs z onkologii"></label>
      <div data-preview class="hint small"></div></div>`);
  const ta = root.querySelector('[data-paste]');
  const prev = root.querySelector('[data-preview]');
  const cname = root.querySelector('[data-cname]');
  const cwrap = root.querySelector('[data-cname-wrap]');
  // Kurs bez tytułu w tekście (np. wklejone od pierwszego działu) – nazwę wpisuje użytkownik
  const parse = () => {
    const ps = parseCoursesText(ta.value, '');
    const noName = ps.some((p) => !p.name);
    cwrap.hidden = !noName;
    const n = cname.value.trim();
    for (const p of ps) if (!p.name) { p.name = n || 'Kurs bez nazwy'; p.domain = guessDomain(n); p.noName = !n; }
    return ps;
  };
  cname.addEventListener('input', () => ta.dispatchEvent(new Event('input')));
  ta.addEventListener('input', () => {
    const ps = parse();
    prev.innerHTML = !ta.value.trim() ? '' : !ps.length ? '<div class="seg-err">Nie rozpoznano lekcji – sprawdź wklejony tekst.</div>'
      : ps.map((p) => {
        const n = p.sections.reduce((a, s) => a + s.lessons.length, 0);
        const h = p.sections.reduce((a, s) => a + s.lessons.reduce((b, l) => b + (l.hMin || 0), 0), 0);
        return `<div>Rozpoznano: <b>${esc(p.name)}</b> → ${esc(domainOf(p.domain).name)} · ${p.sections.length} ${plural(p.sections.length, 'dział', 'działy', 'działów')} · ${n} ${plural(n, 'lekcja', 'lekcje', 'lekcji')} · ok. ${String(Math.round(h * 10) / 10).replace('.', ',')} h</div>
        ${p.warnings.length ? `<div class="seg-err">${p.warnings.map(esc).join('<br>')}</div>` : ''}`;
      }).join('');
  });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    if (e.target.closest('[data-ok]')) {
      const ps = parse();
      if (!ps.length) { ctx.toast('Nie rozpoznano lekcji – sprawdź wklejony tekst'); return; }
      if (ps.some((p) => p.noName)) { ctx.toast('Wpisz nazwę kursu'); cname.focus(); return; }
      const old = st.courses || [];
      const r = mergeCourses(old, ps);
      if (!r.added.length && !r.updated.length) { ctx.toast('Nic nowego – ten kurs już jest ✓'); close(); return; }
      st.courses = r.courses;
      ctx.save(); ctx.render();
      ctx.toast(`${[...r.added.map((n) => `dodano ${n}`), ...r.updated.map((u) => `${u.name} +${u.lessons} lekcji`)].join(', ')} ✓`, () => { st.courses = old; ctx.save(); ctx.render(); });
      close();
    }
  });
}

function surveySheet(state, ctx, plan) {
  const st = study(state);
  const s = { ...DEFAULT_SURVEY, ...(plan?.survey || {}) };
  if (!plan) {
    // Nowy plan: najbliższy termin LEK w przyszłości z ustawień
    const lek = state.settings.lek || {};
    if (lek.examDate && lek.examDate > todayIso()) s.examDate = lek.examDate;
  }
  let name = plan?.name || `LEK ${s.examDate.slice(5, 7) === '02' ? 'luty' : 'wrzesień'} ${s.examDate.slice(0, 4)}`;
  const specs = nabory ? specNames(nabory) : MY_SPECS;
  const chips = (field) => DOMAINS.map((d) => `<button class="chip ${s[field].includes(d.id) ? 'on' : ''}" data-chip="${field}:${d.id}">${esc(d.name.replace(/ \(.*\)/, ''))}</button>`).join('');
  const html = () => `
    <div class="form-card">
      <label>Nazwa planu<input data-s="name" value="${esc(name)}"></label>
      <label>Termin egzaminu<input type="date" data-s="examDate" value="${s.examDate}"></label>
      <div class="t-strong small-t">Jak traktujesz to podejście?</div>
      <div class="segmented"><button data-sv="mode:trening" class="${s.mode === 'trening' ? 'on' : ''}">Trening</button><button data-sv="mode:serio" class="${s.mode === 'serio' ? 'on' : ''}">Na serio</button></div>
      <div class="t-strong small-t">Cel</div>
      <div class="segmented"><button data-sv="goal:pass" class="${s.goal === 'pass' ? 'on' : ''}">Zdać (56%)</button><button data-sv="goal:score" class="${s.goal === 'score' ? 'on' : ''}">Wynik pod specjalizację</button></div>
      ${s.goal === 'score' ? `
        <label>Specjalizacja<select data-s="spec"><option value="">— wybierz —</option>${specs.map((x) => `<option ${x === s.spec ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
        <label>Województwo<select data-s="woj">${(nabory ? wojNames(nabory) : ['Zachodniopomorskie']).map((w) => `<option ${w === s.woj ? 'selected' : ''}>${esc(w)}</option>`).join('')}</select></label>
        <label>Docelowy wynik (%)<input type="number" inputmode="decimal" min="56" max="100" step="0.5" data-s="targetPct" value="${s.targetPct}"></label>
        ${s.spec && nabory ? `<p class="hint small">${esc(suggestTarget(nabory, s.spec, s.woj, 'rez').basis)}</p>` : ''}` : ''}
    </div>
    <div class="form-card">
      <div class="t-strong small-t">Poprzednie podejścia do LEK</div>
      ${(st.attempts || []).map((a) => `<div class="val-row"><span>${esc(a.session)}</span><b>${a.pct != null ? `${a.pct}%` : '—'}</b></div>`).join('') || '<p class="hint small">Brak – dodasz je w zakładce Wyniki albo tutaj:</p>'}
      <div class="row2"><label>Sesja (np. jesień 2025)<input data-att="session"></label><label>Wynik %<input type="number" inputmode="decimal" data-att="pct"></label></div>
      <button class="btn" data-att-add>＋ Dodaj podejście</button>
    </div>
    <div class="form-card">
      <div class="t-strong small-t">Ile godzin dziennie realnie się uczysz?</div>
      <div class="row2"><label>Zwykły dzień stażu<input type="number" inputmode="decimal" step="0.5" min="0" data-s="hWork" value="${s.hWork}"></label>
        <label>Dzień dyżuru / po dyżurze<input type="number" inputmode="decimal" step="0.5" min="0" data-s="hDuty" value="${s.hDuty}"></label></div>
      <div class="row2"><label>Weekend / święto<input type="number" inputmode="decimal" step="0.5" min="0" data-s="hWeekend" value="${s.hWeekend}"></label>
        <label>Dzień urlopu<input type="number" inputmode="decimal" step="0.5" min="0" data-s="hVacation" value="${s.hVacation}"></label></div>
      <div class="t-strong small-t">W które dni tygodnia chcesz przerwę od nauki?</div>
      <div class="chips">${[[1, 'pon'], [2, 'wt'], [3, 'śr'], [4, 'czw'], [5, 'pt'], [6, 'sob'], [0, 'nd']].map(([d, l]) => `<button class="chip ${(s.restDays || []).includes(d) ? 'on' : ''}" data-rest="${d}">${l}</button>`).join('')}</div>
      <p class="hint small">W zaznaczone dni plan nie da żadnej lekcji. Resztę rozłoży na pozostałe dni, zgodnie z Twoim grafikiem (dyżury, urlop, święta).</p>
      <div class="t-strong small-t">Ile czasu liczyć na lekcję (przedział z WNL, np. 1,5–2,5 h)?</div>
      <div class="segmented three">${[['fast', 'Dolna granica'], ['mid', 'Środek'], ['slow', 'Górna granica']].map(([k, l]) => `<button data-sv="pace:${k}" class="${s.pace === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="t-strong small-t">Jak się uczysz najchętniej?</div>
      <div class="segmented four">${[['video', 'Wideo'], ['read', 'Czytanie'], ['questions', 'Pytania'], ['mix', 'Mieszanie']].map(([k, l]) => `<button data-sv="style:${k}" class="${s.style === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    </div>
    <div class="form-card">
      <div class="t-strong small-t">Słabsze dziedziny (więcej czasu)</div><div class="chips">${chips('weak')}</div>
      <div class="t-strong small-t">Mocniejsze dziedziny (mniej czasu)</div><div class="chips">${chips('strong')}</div>
    </div>
    <div class="form-card">
      <div class="t-strong small-t">Baza pytań CEM</div>
      <div class="segmented"><button data-sv="base:true" class="${s.base ? 'on' : ''}">Jest jawna baza (70%)</button><button data-sv="base:false" class="${!s.base ? 'on' : ''}">Bez jawnej bazy</button></div>
      <p class="hint small">Na luty 2027 obowiązuje 70% pytań z bazy (art. 14c ust. 4). Projekt zmian (UD384) mógłby to zmienić od 1.05.2027 – ustaw zgodnie z przepisami na Twój termin.</p>
      ${s.base ? `<div class="row2"><label>Pytań w bazie<input type="number" inputmode="numeric" data-s="baseTotal" value="${s.baseTotal || ''}" placeholder="np. 3000"></label>
        <label>Już przerobione<input type="number" inputmode="numeric" data-s="baseDone" value="${s.baseDone || 0}"></label></div>` : ''}
    </div>`;
  const { root, close } = sheet(plan ? 'Edytuj plan' : 'Nowy plan – ankieta', html());
  const redraw = () => { const sc = root.querySelector('.sheet-body').scrollTop; root.querySelector('.sheet-body').innerHTML = html(); root.querySelector('.sheet-body').scrollTop = sc; };
  const read = (el) => {
    const k = el.dataset.s;
    if (k === 'name') name = el.value;
    else if (['hWork', 'hDuty', 'hWeekend', 'hVacation', 'targetPct', 'baseTotal', 'baseDone'].includes(k)) s[k] = Number(el.value) || 0;
    else s[k] = el.value;
  };
  root.addEventListener('input', (e) => { if (e.target.dataset.s) read(e.target); });
  root.addEventListener('change', (e) => {
    if (!e.target.dataset.s) return;
    read(e.target);
    if (e.target.dataset.s === 'spec' || e.target.dataset.s === 'woj') {
      if (nabory && s.spec) { const t = suggestTarget(nabory, s.spec, s.woj, 'rez'); if (t.target) s.targetPct = t.target; }
      redraw();
    }
  });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    const sv = e.target.closest('[data-sv]');
    if (sv) {
      const [k, v] = sv.dataset.sv.split(':');
      s[k] = v === 'true' ? true : v === 'false' ? false : v;
      return redraw();
    }
    const rd = e.target.closest('[data-rest]');
    if (rd) {
      const d = Number(rd.dataset.rest);
      const cur = s.restDays || [];
      s.restDays = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d];
      return redraw();
    }
    const c = e.target.closest('[data-chip]');
    if (c) {
      const [f, id] = c.dataset.chip.split(':');
      const other = f === 'weak' ? 'strong' : 'weak';
      s[f] = s[f].includes(id) ? s[f].filter((x) => x !== id) : [...s[f], id];
      s[other] = s[other].filter((x) => x !== id);
      return redraw();
    }
    if (e.target.closest('[data-att-add]')) {
      const ses = root.querySelector('[data-att="session"]').value.trim();
      const pct = root.querySelector('[data-att="pct"]').value;
      if (!ses) return ctx.toast('Wpisz sesję, np. „jesień 2025”');
      st.attempts = [...(st.attempts || []), { id: `a${Date.now()}`, session: ses, date: todayIso(), pct: pct === '' ? null : Number(pct) }];
      ctx.save();
      return redraw();
    }
    if (e.target.closest('[data-ok]')) {
      if (!s.examDate) return ctx.toast('Wpisz termin egzaminu');
      if (s.goal === 'pass') s.targetPct = 56;
      if (plan) { plan.name = name; plan.survey = { ...s }; }
      else {
        const np = { id: `p${Date.now()}`, name, createdAt: todayIso(), survey: { ...s }, skip: [], must: [] };
        st.plans = [...(st.plans || []), np];
        st.activePlan = np.id;
      }
      seg = 'plan';
      ctx.save(); ctx.render(); ctx.toast('Plan zapisany ✓');
      close();
    }
  });
}

function simpleSheet(title, fields, onSave) {
  const { root, close } = sheet(title, `<div class="form-card">${fields.map((f) => `<label>${esc(f.label)}<input ${f.type ? `type="${f.type}"` : ''} ${f.step ? `step="${f.step}"` : ''} data-k="${f.key}" value="${esc(f.value ?? '')}" ${f.ph ? `placeholder="${esc(f.ph)}"` : ''}></label>`).join('')}</div>`);
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    if (e.target.closest('[data-ok]')) {
      const v = {};
      root.querySelectorAll('[data-k]').forEach((i) => { v[i.dataset.k] = i.value; });
      if (onSave(v) !== false) close();
    }
  });
}

/* ---------- Obsługa zdarzeń ---------- */

export function handleLekClick(e, state, ctx, today) {
  const st = study(state);
  const t = (sel) => e.target.closest(sel);
  let el;
  if ((el = t('[data-lekseg]'))) { seg = el.dataset.lekseg; ctx.render(); window.scrollTo({ top: 0 }); return true; }
  if ((el = t('[data-lek]'))) {
    const a = el.dataset.lek;
    if (a === 'paste') pasteSheet(state, ctx);
    else if (a === 'save-courses') shareOrDownload(`kursy-wnl-${todayIso()}.json`, coursesFileJson(st.courses), 'application/json');
    else if (a === 'new-plan') surveySheet(state, ctx, null);
    else if (a === 'edit-plan') surveySheet(state, ctx, activePlan(st));
    else if (a === 'add-att') {
      simpleSheet('Podejście do LEK', [
        { key: 'session', label: 'Sesja', ph: 'np. jesień 2025' }, { key: 'date', label: 'Data egzaminu', type: 'date' },
        { key: 'pct', label: 'Wynik (%)', type: 'number', step: '0.01' }], (v) => {
        if (!v.session) { ctx.toast('Wpisz sesję'); return false; }
        st.attempts = [...(st.attempts || []), { id: `a${Date.now()}`, session: v.session, date: v.date || todayIso(), pct: v.pct === '' ? null : Number(v.pct) }];
        ctx.save(); ctx.render(); ctx.toast('Zapisano ✓');
      });
    } else if (a === 'add-mock') {
      simpleSheet('Egzamin próbny', [
        { key: 'date', label: 'Data', type: 'date', value: today }, { key: 'source', label: 'Źródło', ph: 'np. WNL, baza CEM 2024' },
        { key: 'pct', label: 'Wynik (%)', type: 'number', step: '0.1' }], (v) => {
        if (v.pct === '') { ctx.toast('Wpisz wynik'); return false; }
        st.mocks = [...(st.mocks || []), { id: `m${Date.now()}`, date: v.date || today, source: v.source, pct: Number(v.pct) }];
        ctx.save(); ctx.render(); ctx.toast('Zapisano ✓');
      });
    }
    return true;
  }
  const undoable = (msg, apply, revert) => { apply(); ctx.save(); ctx.render(); ctx.toast(msg, () => { revert(); ctx.save(); ctx.render(); }); };
  if ((el = t('[data-skip]'))) {
    const p = activePlan(st); const k = el.dataset.skip;
    undoable('Pominięto', () => { p.skip = [...new Set([...(p.skip || []), k])]; p.must = (p.must || []).filter((x) => x !== k); }, () => { p.skip = p.skip.filter((x) => x !== k); });
    return true;
  }
  if ((el = t('[data-must]'))) {
    const p = activePlan(st); const k = el.dataset.must;
    undoable('Dodano do planu', () => { p.must = [...new Set([...(p.must || []), k])]; p.skip = (p.skip || []).filter((x) => x !== k); }, () => { p.must = p.must.filter((x) => x !== k); });
    return true;
  }
  if ((el = t('[data-base-add]'))) {
    const p = activePlan(st); const n = Number(el.dataset.baseAdd);
    undoable(`+${n} pytań`, () => { p.survey.baseDone = (p.survey.baseDone || 0) + n; }, () => { p.survey.baseDone -= n; });
    return true;
  }
  if ((el = t('[data-plan-use]'))) { st.activePlan = el.dataset.planUse; ctx.save(); ctx.render(); return true; }
  if ((el = t('[data-plan-arch]'))) {
    const p = st.plans.find((x) => x.id === el.dataset.planArch);
    undoable(p.archived ? 'Przywrócono' : 'Zarchiwizowano', () => { p.archived = !p.archived; if (p.archived && st.activePlan === p.id) st.activePlan = null; }, () => { p.archived = !p.archived; });
    return true;
  }
  if ((el = t('[data-plan-del]'))) {
    const i = st.plans.findIndex((x) => x.id === el.dataset.planDel);
    const p = st.plans[i]; const wasActive = st.activePlan === p.id;
    if (!confirm(`Usunąć plan „${p.name}”?`)) return true;
    undoable('Usunięto plan', () => { st.plans.splice(i, 1); if (wasActive) st.activePlan = null; }, () => { st.plans.splice(i, 0, p); if (wasActive) st.activePlan = p.id; });
    return true;
  }
  if ((el = t('[data-course-del]'))) {
    const i = st.courses.findIndex((x) => x.id === el.dataset.courseDel);
    const c = st.courses[i];
    if (!confirm(`Usunąć kurs „${c.name}” z planera? Odhaczone lekcje zostaną zapamiętane.`)) return true;
    undoable('Usunięto kurs', () => st.courses.splice(i, 1), () => st.courses.splice(i, 0, c));
    return true;
  }
  if ((el = t('[data-att-del]'))) {
    const i = st.attempts.findIndex((x) => x.id === el.dataset.attDel); const a = st.attempts[i];
    undoable('Usunięto', () => st.attempts.splice(i, 1), () => st.attempts.splice(i, 0, a));
    return true;
  }
  if ((el = t('[data-mock-del]'))) {
    const i = st.mocks.findIndex((x) => x.id === el.dataset.mockDel); const m = st.mocks[i];
    undoable('Usunięto', () => st.mocks.splice(i, 1), () => st.mocks.splice(i, 0, m));
    return true;
  }
  if ((el = t('[data-spec-goal]'))) {
    const p = activePlan(st);
    const prev = { ...p.survey };
    undoable(`Cel: ${el.dataset.specGoal} ${el.dataset.specTarget}%`, () => {
      Object.assign(p.survey, { goal: 'score', spec: el.dataset.specGoal, woj: specWoj, targetPct: Number(el.dataset.specTarget) });
    }, () => { p.survey = prev; });
    return true;
  }
  return false;
}

export function handleLekChange(e, state, ctx) {
  const st = study(state);
  const el = e.target;
  if (el.dataset.lesson) {
    const k = el.dataset.lesson;
    st.done = st.done || {};
    const was = st.done[k];
    if (el.checked) st.done[k] = todayIso(); else delete st.done[k];
    ctx.save(); ctx.render();
    ctx.toast(el.checked ? 'Zrobione ✓' : 'Odznaczono', () => { if (was) st.done[k] = was; else delete st.done[k]; ctx.save(); ctx.render(); });
    return true;
  }
  if (el.dataset.coursesFile !== undefined && el.files?.[0]) {
    el.files[0].text().then((txt) => {
      const ps = coursesFromFile(txt);
      el.value = '';
      if (!ps.length) { ctx.toast('W pliku nie ma kursów'); return; }
      const old = st.courses || [];
      const r = mergeCourses(old, ps);
      if (!r.added.length && !r.updated.length) { ctx.toast('Nic nowego – wszystkie kursy z pliku już są ✓'); return; }
      st.courses = r.courses;
      ctx.save(); ctx.render();
      const msg = [r.added.length ? `dodano: ${r.added.join(', ')}` : '', r.updated.length ? `uzupełniono: ${r.updated.map((u) => `${u.name} (+${u.lessons})`).join(', ')}` : ''].filter(Boolean).join(' · ');
      ctx.toast(`${msg} ✓`, () => { st.courses = old; ctx.save(); ctx.render(); });
    });
    return true;
  }
  if (el.dataset.courseDom) {
    const c = st.courses.find((x) => x.id === el.dataset.courseDom);
    c.domain = el.value; ctx.save(); ctx.render(); ctx.toast('Zapisano ✓');
    return true;
  }
  if (el.dataset.specWoj !== undefined) { specWoj = el.value; ctx.render(); return true; }
  return false;
}

export function handleLekInput(e, ctx) {
  if (e.target.dataset.specQ === undefined) return false;
  specQuery = e.target.value;
  clearTimeout(handleLekInput.t);
  handleLekInput.t = setTimeout(() => {
    ctx.render();
    const i = document.querySelector('[data-spec-q]');
    if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }, 350);
  return true;
}
