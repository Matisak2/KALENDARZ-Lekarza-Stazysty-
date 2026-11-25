// Zakładka „LEK”: planer nauki (Plan), spis kursów WNL (Materiały), wyniki LEK i próbne (Wyniki), Specjalizacje.
import { shareOrDownload } from './more-ui.js';
import { DOMAINS, domainOf, guessDomain, parseCoursesText, coursesFromFile, mergeCourses, coursesFileJson, mergeCourse, allLessons, buildPlan, currentWeek, DEFAULT_SURVEY, explainLesson } from './lek.js';
import { cemIndex, loadCem } from './lek-freq.js';
import { projectReviews, REVIEW_MIN, reviewsToday, rate, hardest, GRADES } from './lek-review.js';
import { specNames, wojNames, specStats, suggestTarget, chance, TRYBY } from './specs.js';
import { fmtShort, fmtFull, fmtDayShort, toNum, plural, todayIso } from './dates.js';
import { esc, helpBox } from './blocks-ui.js';

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
const pct = (n) => String(n).replace('.', ',');
const h = (n) => `${String(Math.round(n * 10) / 10).replace(".", ",")} h`;
const pctBar = (v, target) => `<div class="score-bar"><div style="width:${Math.min(100, v)}%"></div>
  <i style="left:56%" title="próg 56%"></i>${target > 56 ? `<i class="tg" style="left:${Math.min(100, target)}%" title="cel"></i>` : ''}</div>`;

/* ---------- Ekran ---------- */

/** Opcje planu: indeks bazy CEM (częstość tematów). */
export const planOpts = () => ({ cem: cemIndex() });

let planMemo = { k: null, b: null };
/**
 * Plan z powtórkami: 1) plan bez powtórek, 2) przewidywane powtórki (tematy zrobione + z planu),
 * 3) plan z czasem na powtórki odjętym od nauki nowych lekcji. Wynik zapamiętany do następnej zmiany danych.
 */
export function planFor(state, plan, today) {
  const cem = cemIndex();
  const st = state.study || {};
  const k = JSON.stringify([state.meta?.updatedAt, plan.id, plan.survey, plan.skip, plan.must, today, !!cem, Object.keys(st.done || {}).length, Object.keys(st.reviews || {}).length]);
  if (planMemo.k === k) return planMemo.b;
  const min = Number(plan.survey?.reviewMin ?? REVIEW_MIN) || 0;
  let b = buildPlan(state, plan, today, { cem });
  let load = new Map();
  if (min > 0) {
    // Dwa przybliżenia: powtórki liczone dla lekcji, które naprawdę zmieszczą się w planie
    for (let i = 0; i < 2; i++) {
      load = projectReviews(state, b, today);
      const ld = load;
      b = buildPlan(state, plan, today, { cem, reviewHours: (d) => ((ld.get(d) || 0) * min) / 60 });
    }
  }
  b.reviewLoad = load;
  b.reviewMin = min;
  planMemo = { k, b };
  return b;
}

export function renderLek(state, today, ctx) {
  const st = study(state);
  loadNabory(() => ctx.render());
  loadCem(() => ctx.render());
  const tabs = [['plan', 'Plan'], ['mat', 'Materiały'], ['wyn', 'Wyniki'], ['spec', 'Specjalizacje']];
  let body = '';
  if (seg === 'plan') body = planView(state, st, today);
  else if (seg === 'mat') body = materialsView(st);
  else if (seg === 'wyn') body = resultsView(st, state);
  else body = specsView(st, state);
  return `
    <header class="page-head"><div class="eyebrow">Planer nauki</div><h1 class="large-title">LEK</h1></header>
    ${helpBox('lek')}
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
  const b = planFor(state, p, today);
  const s = b.survey;
  const w = currentWeek(b, today);
  const vColor = { good: 'var(--ok)', tight: 'var(--warn)', hard: 'var(--danger)' }[b.verdict];
  const vText = {
    good: 'Realny cel – plan ma zapas.',
    tight: 'Na styk – trzymaj się planu.',
    hard: 'Przy tym czasie cel jest mało realny. Rozważ więcej godzin, inny cel albo późniejszy termin.',
  }[b.verdict];
  const doneSet = st.done || {};
  const pyt = (l) => (l.exp != null ? ` · ok. ${String(Math.round(l.exp * 10) / 10).replace('.', ',')} pyt. na LEK` : '');
  const lessonRow = (l) => `<div class="lesson ${doneSet[l.key] ? 'on' : ''}">
      <label class="skill ${doneSet[l.key] ? 'on' : ''}"><input type="checkbox" data-lesson="${esc(l.key)}" ${doneSet[l.key] ? 'checked' : ''}>
        <span class="box"></span><span class="nm">${esc(l.name)}<small>${esc(domText(l))} · ${esc(l.section)} · ${h(l.hours)}${pyt(l)}</small></span></label>
      <button class="chip" data-skip="${esc(l.key)}" title="Pomiń">Pomiń</button></div>`;
  const two = b.stages.length > 1;
  const stName = (i) => { const x = b.stages[i]; return x.final && two ? `do ostatecznego LEK ${fmtFull(x.exam)}` : `do LEK ${fmtFull(x.exam)}${two ? ' (trening)' : ''}`; };
  const perQ = (x) => b.stages[x.stage]?.perQ || 1.5;
  const next = b.stages[0];
  const trainings = b.stages.filter((x) => !x.final).map((x) => fmtFull(x.exam));
  let prevStage = -1;
  const weeksHtml = b.weeks.filter((x) => x !== w).slice(0, 60).map((x) => {
    const head = two && x.stage !== prevStage ? `<div class="sec-name"><span>Etap ${x.stage + 1} · ${esc(stName(x.stage))}</span></div>` : '';
    prevStage = x.stage;
    return `${head}<div class="wk ${x.review ? 'rv' : ''}">
      <div class="wk-h"><b>${fmtShort(x.start)}–${fmtShort(x.end)}</b><span>${h(x.hours)}${x.review ? ' · powtórka przed LEK' : ''}</span></div>
      ${x.lessons.length ? `<div class="wk-l">${x.lessons.map((l) => esc(l.name)).join(' · ')}</div>` : ''}
      ${x.base >= 0.5 ? `<div class="wk-l muted">🧩 baza CEM: ok. ${Math.round((x.base * 60) / perQ(x))} pytań</div>` : (!x.lessons.length ? '<div class="wk-l muted">Pytania i powtórki</div>' : '')}
    </div>`;
  }).join('');
  const dups = b.dropped.filter((l) => l.dup);
  const drops = b.dropped.filter((l) => !l.dup);
  const stagesCard = two ? `<div class="card fade"><div class="card-label">🎯 Twój plan podejść</div>
      ${b.stages.map((x) => `<div class="stage-row">
        <div class="t-strong">Etap ${x.i + 1} · ${esc(stName(x.i))}</div>
        <div class="sub">${x.basePlan === 'all' ? `🧩 cała baza CEM: ${x.baseQ} pytań (ok. ${Math.round(x.baseNeed)} h${x.perQ < 1.5 ? ', kolejne przejście – szybciej' : ''})` : x.basePlan === 'second' ? `🧩 kolejne przejście bazy CEM na końcu etapu (ok. ${Math.round(x.baseNeed)} h)` : x.withBase ? `🧩 baza CEM: ok. ${Math.round(x.baseHours)} h` : '🧩 bez jawnej bazy – pytania do ćwiczeń'}<br>
          📚 ${x.chosen.length} ${plural(x.chosen.length, 'lekcja', 'lekcje', 'lekcji')} (${h(x.lessonHours)})${x.final ? ' – pozostałe tematy' : x.i === 0 ? ' – najważniejsze tematy' : ' – kolejne najważniejsze tematy'} · szacunek: <b>${pct(x.est)}%</b></div></div>`).join('')}
      <p class="hint small">Zmienisz to w ankiecie („Edytuj ankietę” → Twój plan podejść).</p></div>` : '';
  const warnCard = b.warnings.length ? `<div class="card fade todo-card">${b.warnings.map((x) => `<div class="todo warn"><div class="todo-ic">⚠️</div><div class="grow"><div class="s">${esc(x)}</div></div></div>`).join('')}</div>` : '';
  const baseTotal = s.baseTotal || b.baseTotal;
  return `
    <div class="card hero fade" style="--block:var(--c-course)">
      <div class="card-label">${esc(p.name)} · ${two ? `trening ${trainings.join(', ')}, ostateczny LEK ${fmtFull(b.final.date)}` : s.mode === 'trening' ? 'podejście treningowe' : 'na serio'}</div>
      <div class="hero-top">
        <div class="hero-info">
          <div class="hero-name">${two ? b.daysLeftFinal : b.daysLeft} ${plural(two ? b.daysLeftFinal : b.daysLeft, 'dzień', 'dni', 'dni')}</div>
          <div class="hero-place">do ${two ? `ostatecznego LEK ${fmtFull(b.final.date)}` : `LEK ${fmtFull(s.examDate)}`} · cel ${b.target}%${s.spec ? ` (${esc(s.spec)})` : ''}</div>
          ${two ? `<div class="sub">Najbliższy LEK (trening): ${fmtFull(next.exam)} – za ${toNum(next.exam) - toNum(today)} ${plural(toNum(next.exam) - toNum(today), 'dzień', 'dni', 'dni')} · szacunek ${pct(next.est)}%</div>` : ''}
        </div>
      </div>
      <div class="est">
        <div><span>Szacowany wynik${two ? ' na ostatecznym LEK' : ''} przy realizacji planu</span><b style="color:${vColor}">${pct(b.estPlan)}%</b></div>
        ${pctBar(b.estPlan, b.target)}
        <div class="sub" style="color:${vColor};font-weight:700">${vText}</div>
        <div class="sub">Gdyby egzamin był dziś: ~${pct(b.estNow)}%. To orientacyjny szacunek${b.yields ? ' (pokrycie tematów ważone tym, jak często pojawiają się w bazie CEM)' : ''} – wpisuj wyniki próbnych.</div>
      </div>
      <div class="hero-stats">
        <div class="stat"><b>${Math.round(b.hoursTotal)}</b><span>godzin nauki do ${two ? 'ostatecznego ' : ''}LEK</span></div>
        <div class="stat"><b>${b.chosen.length}</b><span>lekcji w planie (${h(b.plannedHours)})</span></div>
        <div class="stat"><b>${drops.length}</b><span>pominiętych</span></div>
      </div>
    </div>
    ${warnCard}
    <div class="desk-2"><div>
      ${stagesCard}
      ${w ? `<div class="card fade"><div class="card-label">Ten tydzień · ${fmtShort(w.start)}–${fmtShort(w.end)} · ${h(w.hours)}${two ? ` · etap ${w.stage + 1}` : ''}</div>
        ${w.lessons.length ? w.lessons.map(lessonRow).join('') : '<p class="sub">W tym tygodniu: pytania z bazy i powtórka.</p>'}
        ${b.stages[w.stage]?.withBase ? `<div class="base-row">🧩 Baza pytań: ok. <b>${Math.round((w.base * 60) / perQ(w))}</b> pytań (${h(w.base)})${b.baseOnlyQ ? `<br><small>w tym ok. ${Math.round(((w.base * 60) / perQ(w)) * b.baseOnlyQ / 200)} z prawa i bioetyki, zdrowia publicznego i orzecznictwa – tych dziedzin uczysz się tylko z bazy</small>` : ''}</div>` : `<div class="base-row">🧩 Pytania do przerobionych tematów: ${h(w.base)}</div>`}
      </div>` : ''}
      ${reviewsCard(state, b, today)}
      ${s.base ? `<div class="card fade"><div class="card-label">🧩 Baza CEM</div>
        <div class="val-row"><span><b>${s.baseDone || 0}</b> / ${baseTotal || '?'} pytań</span>
          <span><button class="chip" data-base-add="50">+50</button><button class="chip" data-base-add="100">+100</button><button class="chip" data-lek="edit-plan">Zmień</button></span></div>
        ${baseTotal ? `<div class="minibar" style="--block:var(--c-course)"><div style="width:${Math.min(100, ((s.baseDone || 0) / baseTotal) * 100)}%"></div></div>` : '<p class="hint small">Wpisz w ankiecie, ile pytań ma baza.</p>'}
        <p class="hint small">${!s.baseTotal && b.baseTotal ? `Cała baza CEM (cem.edu.pl) ma ${b.baseTotal} pytań. ` : ''}Do najbliższego LEK zmieścisz jeszcze ok. ${b.baseCanDo} pytań.</p></div>` : ''}
    </div><div>
      ${domainsCard(b)}
      <div class="card fade"><details class="course-list"><summary>Kolejne tygodnie (${b.weeks.length})</summary>${weeksHtml}</details></div>
      <div class="card fade"><details class="course-list"><summary>Pominięte lekcje (${drops.length})</summary>
        ${drops.map((l) => `<div class="lesson"><span class="nm">${esc(l.name)}<small>${esc(l.reason)} · ${h(l.hours)}</small></span>
          <button class="chip" data-must="${esc(l.key)}">Jednak zrób</button></div>`).join('') || '<p class="sub">Nic – wszystko się mieści.</p>'}
      </details>
      ${dups.length ? `<details class="course-list"><summary>Te same tematy w kilku kursach (${dups.length}) – liczone raz</summary>
        <p class="hint small">Odhaczenie tematu w jednym kursie zalicza go we wszystkich.</p>
        ${dups.map((l) => `<div class="lesson"><span class="nm">${esc(l.name)}<small>${esc(l.course)} → ${esc(l.reason)}</small></span></div>`).join('')}</details>` : ''}</div>
      <div class="card fade"><div class="card-label">Plan</div>
        <div class="quick two"><button class="btn" data-lek="edit-plan">Edytuj ankietę</button><button class="btn" data-lek="new-plan">Nowy plan</button></div>
        ${plansList(st)}
      </div>
    </div></div>`;
}

/* ---------- Powtórki ---------- */

const examsOf = (state) => {
  const p = activePlan(state.study || {});
  const sv = p?.survey || {};
  return [sv.examDate, ...(sv.finalLater ? [...(sv.midExams || []).map((m) => m.date), sv.finalDate] : [])].filter(Boolean).sort();
};

/** Wiersze „Powtórki na dziś” z przyciskami oceny (ekran Dziś i zakładka LEK). */
export function reviewRows(state, today) {
  const p = activePlan(state.study || {});
  const r = reviewsToday(state, p?.survey, today);
  if (!r.list.length) return { html: '', ...r };
  const html = r.list.map((x) => `<div class="rv-item">
      <div class="nm">🔁 ${esc(x.name)}<small>${esc(x.section)} · ${x.r ? `powtórka nr ${x.r.reps + 1}` : 'pierwsza powtórka'}${x.hard ? ' · ostatnio trudne' : ''}</small></div>
      <div class="quick three rv-btns">${Object.entries(GRADES).map(([g, l]) => `<button class="btn rv-${g}" data-rv="${esc(x.key)}|${g}">${l}</button>`).join('')}</div>
    </div>`).join('') + (r.more ? `<p class="hint small">+ ${r.more} ${plural(r.more, 'zaległa powtórka', 'zaległe powtórki', 'zaległych powtórek')} – przejdą na kolejne dni (limit dziś: ${r.cap}).</p>` : '');
  return { html, ...r };
}

/** Ocena powtórki (przycisk Trudne / Średnio / Łatwe) – z „Cofnij”. */
export function handleReviewClick(e, state, ctx) {
  const el = e.target.closest('[data-rv]');
  if (!el) return false;
  const v = el.dataset.rv; // klucz lekcji sam zawiera „|” – ocena jest po ostatnim
  const key = v.slice(0, v.lastIndexOf('|'));
  const g = v.slice(v.lastIndexOf('|') + 1);
  if (!GRADES[g]) return true;
  const st = study(state);
  const today = ctx.today();
  const prev = st.reviews?.[key];
  const next = rate(prev, g, today, examsOf(state));
  st.reviews = { ...(st.reviews || {}), [key]: next };
  ctx.save(); ctx.render();
  ctx.toast(`${GRADES[g]} – następna powtórka ${fmtShort(next.due)}`, () => {
    st.reviews = { ...(st.reviews || {}) };
    if (prev) st.reviews[key] = prev; else delete st.reviews[key];
    ctx.save(); ctx.render();
  });
  return true;
}

function reviewsCard(state, b, today) {
  const r = reviewRows(state, today);
  const days = Object.entries(r.upcoming).sort();
  const hard = hardest(state.study);
  const load = b?.reviewLoad ? [...b.reviewLoad.values()].reduce((a, x) => a + x, 0) : 0;
  return `<div class="card fade"><div class="card-label">🔁 Powtórki</div>
    ${r.html || '<p class="sub">Na dziś nie ma powtórek ✓</p>'}
    ${days.length ? `<div class="sub">Najbliższe dni: ${days.map(([d, n]) => `${fmtDayShort(d)} – ${n}`).join(' · ')}</div>` : ''}
    ${hard.length ? `<details class="course-list"><summary>Twoje trudne tematy (${hard.length})</summary>${hard.map((x) => `<div class="val-row"><span>${esc(x.name)}<br><small class="muted">${esc(x.section)}</small></span><b>${x.n}× trudne</b></div>`).join('')}</details>` : ''}
    <p class="hint small">Po odhaczeniu lekcji temat wraca do powtórki po 1, 3, 7, 14 i 30 dniach. Ocena po powtórce: <b>Trudne</b> – wraca jutro, <b>Średnio</b> – kolejny odstęp, <b>Łatwe</b> – dłuższy odstęp. Przed LEK każdy temat ma powtórkę najpóźniej 2 dni przed egzaminem. Limit dziennie: 3 (dyżur 1, weekend i urlop 6, L4 i dni przerwy – 0); jedna powtórka to ok. ${b?.reviewMin ?? REVIEW_MIN} min (zmienisz w ankiecie)${load && b?.reviewMin ? ` – plan rezerwuje na nie ok. ${Math.round((load * b.reviewMin) / 60)} h do egzaminu` : ''}.</p>
  </div>`;
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
/** Dziedziny lekcji do wyświetlenia; ✎ = poprawione ręcznie. */
const domText = (l) => `${l.domains?.length ? l.domains.map(shortDom).join(' + ') : 'poza LEK'}${l.manual ? ' ✎' : ''}`;

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
  const o = b.onco;
  const onco = o && o.lessons ? `<div class="dom-row">
      <div class="dom-h"><b>🎗 Onkologia</b><span class="muted">≥ 30 pyt.</span><span class="dom-p">${Math.round(o.cov * 100)}%</span></div>
      <div class="minibar" style="--block:var(--c-course)"><div style="width:${Math.round(o.cov * 100)}%"></div></div>
      <div class="hint small">${o.lessons} ${plural(o.lessons, 'lekcja', 'lekcje', 'lekcji')} o nowotworach w Twoich kursach · zrobione ${Math.round((b.oncoNow?.cov || 0) * 100)}%. Pytania z onkologii są w ramach interny, pediatrii, chirurgii, ginekologii i medycyny rodzinnej (co najmniej 30 na LEK).</div></div>` : '';
  return `<div class="card fade"><details class="course-list"><summary>Dziedziny LEK – pokrycie planu</summary>
    <p class="hint small">Lekcja liczy się do każdej dziedziny, do której pasuje (np. nadciśnienie: interna i medycyna rodzinna). Procent = ile materiału z Twoich kursów dla tej dziedziny obejmie plan (z tym, co już zrobione).</p>
    ${rows}${onco}</details></div>`;
}

const num1 = (x) => String(Math.round(x * 10) / 10).replace('.', ',');

function materialsView(st) {
  const done = st.done || {};
  const courses = st.courses || [];
  const domOpts = (sel) => [...DOMAINS, { id: 'inne', name: 'Inne (poza dziedzinami LEK)' }]
    .map((d) => `<option value="${d.id}" ${d.id === sel ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
  const list = courses.map((c) => {
    const ls = allLessons({ courses: [c], domainFix: st.domainFix });
    const dn = ls.filter((l) => done[l.key]).length;
    const left = ls.filter((l) => !done[l.key]).reduce((a, l) => a + l.hours, 0);
    return `<div class="card fade">
      <div class="bc-top"><div class="bc-name">${esc(c.name)}</div><button class="chip danger-chip" data-course-del="${c.id}">Usuń</button></div>
      <label class="dom-sel">Dziedzina LEK<select data-course-dom="${c.id}">${domOpts(c.domain)}</select></label>
      ${c.domain === 'inne' ? '<div class="imp-row warn">⚠️ Ten kurs nie pasuje sam do żadnej dziedziny LEK. Wybierz dziedzinę powyżej (np. neurologia lub choroby zakaźne → Choroby wewnętrzne) – inaczej lekcje, których nazwa nie pasuje do żadnej dziedziny, wypadną z planu.</div>' : ''}
      <div class="bc-bar"><div style="width:${ls.length ? (dn / ls.length) * 100 : 0}%;background:var(--c-course)"></div></div>
      <div class="bc-nums"><span><b>${dn}</b> z ${ls.length} lekcji</span><span class="muted">zostało ok. ${h(left)}</span></div>
      <details class="course-list"><summary>Lekcje</summary>
        ${c.sections.map((s) => {
          const lo = s.lessons.reduce((a, l) => a + (l.hMin || 0), 0);
          const hi = s.lessons.reduce((a, l) => a + (l.hMax || 0), 0);
          return `<div class="sec-name"><span>${esc(s.name)} <span class="sec-n">(${s.lessons.length})</span></span>${lo ? `<span class="t-chip">🕒 ${num1(lo)}–${num1(hi)} h</span>` : ''}</div>${s.lessons.map((l) => {
          const x = ls.find((y) => y.section === s.name && y.name === l.name);
          const key = x?.key;
          return `<div class="lesson"><label class="skill ${done[key] ? 'on' : ''}"><input type="checkbox" data-lesson="${esc(key)}" ${done[key] ? 'checked' : ''}>
            <span class="box"></span><span class="nm">${esc(l.name)}<small class="${x && !x.domains.length ? 'neg' : ''}">${esc(x ? domText(x) : '')}</small></span>${l.hMin != null ? `<span class="t-chip">${num1(l.hMin)}–${num1(l.hMax)} h</span>` : ''}</label>
            <button class="chip" data-dom-fix="${esc(key)}" aria-label="Dziedziny LEK lekcji ${esc(l.name)}">Dziedziny</button></div>`;
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

/** Karta „Zapis na LEK” (SMK): data zgłoszenia, numer, opłata. */
function registrationCard(state) {
  const l = state.settings.lek || {};
  const fee = { '': 'nie wiem – sprawdzę w SMK', nie: 'nie – pierwsze zgłoszenie (bezpłatne)', tak: 'tak – kolejne zgłoszenie' };
  return `<div class="card fade"><div class="card-label">🗳 Zapis na LEK · ${esc(l.session || '')}</div>
    ${l.registered ? `<div class="val-row"><span>Zgłoszenie w SMK</span><b class="pos">✓ ${l.registeredAt ? fmtFull(l.registeredAt) : 'wysłane'}</b></div>
      ${l.smkNo ? `<div class="val-row"><span>Numer / identyfikator</span><b>${esc(l.smkNo)}</b></div>` : ''}
      <div class="val-row"><span>Opłata</span><b>${esc(fee[l.feeNeeded || ''])}${l.feeNeeded === 'tak' ? (l.feePaid ? ' · opłacona ✓' : ' · <span class="neg">nieopłacona</span>') : ''}</b></div>`
    : '<p class="sub">Zapisy w SMK: do 30.11 na sesję lutową, do 15.07 na wrześniową (art. 14a ustawy). Wpisz, gdy się zapiszesz – przypomnienia same się wyłączą.</p>'}
    <button class="btn" data-lek-reg>${l.registered ? 'Zmień dane zapisu' : 'Zapisałem się…'}</button></div>`;
}

/** Okno zapisu na LEK – zmiany dopiero po „Zapisz”. */
export function openLekRegistration(state, ctx) {
  const l = state.settings.lek;
  const { root, close } = sheet('Zapis na LEK', `<div class="form-card">
    <label class="skill ${l.registered ? 'on' : ''}"><input type="checkbox" data-r="registered" ${l.registered ? 'checked' : ''}><span class="box"></span><span class="nm">Zgłoszenie w SMK wysłane</span></label>
    <label>Data zgłoszenia<input type="date" data-r="registeredAt" value="${esc(l.registeredAt || ctx.today())}"></label>
    <label>Numer / identyfikator zgłoszenia (opcjonalnie)<input data-r="smkNo" value="${esc(l.smkNo || '')}" placeholder="z SMK"></label>
    <label>Czy trzeba zapłacić?<select data-r="feeNeeded">
      <option value="" ${!l.feeNeeded ? 'selected' : ''}>nie wiem – sprawdzę w SMK</option>
      <option value="nie" ${l.feeNeeded === 'nie' ? 'selected' : ''}>nie – pierwsze zgłoszenie (bezpłatne)</option>
      <option value="tak" ${l.feeNeeded === 'tak' ? 'selected' : ''}>tak – kolejne zgłoszenie</option></select></label>
    <label class="skill ${l.feePaid ? 'on' : ''}"><input type="checkbox" data-r="feePaid" ${l.feePaid ? 'checked' : ''}><span class="box"></span><span class="nm">Opłata wniesiona</span></label>
    <p class="hint small">Opłata obowiązuje od drugiego zgłoszenia (chyba że pierwszy LEK był niezdany albo nie przystąpiłeś), do 5 dni roboczych po końcu zapisów – art. 14a ust. 8 i 11 ustawy o zawodach lekarza.</p></div>`);
  root.addEventListener('change', (e) => { const c = e.target.closest('.skill'); if (c && e.target.type === 'checkbox') c.classList.toggle('on', e.target.checked); });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    if (!e.target.closest('[data-ok]')) return;
    const v = (k) => root.querySelector(`[data-r="${k}"]`);
    const prev = { ...l };
    Object.assign(l, { registered: v('registered').checked, registeredAt: v('registeredAt').value || null, smkNo: v('smkNo').value.trim(), feeNeeded: v('feeNeeded').value, feePaid: v('feePaid').checked });
    ctx.save(); ctx.render(); close();
    ctx.toast('Zapisano ✓', () => { Object.assign(l, prev); ctx.save(); ctx.render(); });
  });
}

function resultsView(st, state) {
  const at = [...(st.attempts || [])].sort((a, b) => (a.date < b.date ? 1 : -1));
  const mocks = [...(st.mocks || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  const best = at.reduce((m, a) => (a.pct != null && a.pct > m ? a.pct : m), -1);
  return `${registrationCard(state)}
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
  // „Moje” specjalizacje – tylko w danych użytkownika (study.mySpecs), nie w kodzie (audyt B18)
  const mineList = st.mySpecs || [];
  const list = q ? all.filter((n) => n.toLowerCase().includes(q)) : mineList.filter((n) => all.includes(n));
  const card = (dz) => {
    const rows = specStats(nabory, dz, specWoj, 'rez');
    const rowsP = specStats(nabory, dz, specWoj, 'poz');
    const t = suggestTarget(nabory, dz, specWoj, 'rez');
    const ch = mine != null ? chance(nabory, dz, specWoj, mine, 'rez') : null;
    const cell = (x) => (x.places ? `${x.places} m. · ${x.threshold != null ? `<b>${x.threshold.toFixed(2)}%</b>` : `<span class="pos">${x.status}</span>`}` : '<span class="muted">brak miejsc</span>');
    return `<div class="card fade spec-card">
      <div class="bc-top"><div class="bc-name">${esc(dz)}</div><button class="chip" data-spec-star="${esc(dz)}" aria-label="${mineList.includes(dz) ? 'Usuń z moich specjalizacji' : 'Dodaj do moich specjalizacji'}">${mineList.includes(dz) ? '★ Moja' : '☆ Dodaj'}</button>${t.target ? `<span class="status current">cel ${t.target}%</span>` : '<span class="status past">rezydentura: bez konkurencji</span>'}</div>
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
      <label class="dom-sel">Szukaj specjalizacji<input data-spec-q value="${esc(specQuery)}" placeholder="np. kardiologia (puste = Twoje ★)"></label>
      <p class="hint small">Próg = najniższy wynik zakwalifikowanych, gdy wszystkie miejsca zostały obsadzone. „Zostały wolne miejsca” = każdy chętny się dostał.
        Wynik w naborze to % punktów z LEK (+ ewentualne punkty za doktorat i publikacje). Dane: CMKP, ostatnia aktualizacja ${fmtFull(nabory.updated)}.</p>
    </div>
    ${list.map(card).join('') || (q ? '<p class="hint">Brak wyników wyszukiwania.</p>' : '<p class="hint">Wyszukaj specjalizację i stuknij „☆ Dodaj” – pojawi się tutaj na stałe (zapisuje się tylko u Ciebie).</p>')}
    ${extrasCard(st)}`;
}

/** Doktorat i publikacje – dodatkowe punkty w naborze (art. 16c ust. 10 pkt 1 ustawy o zawodach lekarza). */
function extrasCard(st) {
  const x = { phd: '', pubs: [], ...(st.extras || {}) };
  const phd = { '': '— wybierz —', nie: 'nie', trakcie: 'w trakcie (szkoła doktorska)', tak: 'tak – stopień doktora nauk medycznych' };
  const ok = x.pubs.filter((p) => p.listed).length;
  return `<div class="card fade"><div class="card-label">🎓 Doktorat i publikacje (punkty w naborze)</div>
    <p class="sub">W trybie rezydenckim poza wynikiem LEK liczą się dodatkowe punkty za stopień doktora nauk medycznych i publikacje w czasopismach z wykazu ministra (aktualnego w dniu publikacji) – art. 16c ust. 10 pkt 1. Do wniosku dołącza się skany dokumentów; udział w publikacji potwierdza Główna Biblioteka Lekarska albo biblioteka uczelni medycznej (art. 16c ust. 2 pkt 15 i ust. 2a).</p>
    <label class="dom-sel">Stopień doktora<select data-phd>${Object.entries(phd).map(([k, v]) => `<option value="${k}" ${x.phd === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
    <div class="t-strong" style="margin-top:10px">Publikacje · ${x.pubs.length}${x.pubs.length ? ` (z wykazu: ${ok})` : ''}</div>
    ${x.pubs.map((p) => `<div class="val-row"><span><b>${esc(p.title)}</b><br><small class="muted">${esc(p.journal || '')}${p.year ? ` · ${esc(p.year)}` : ''}${p.listed ? ' · z wykazu ✓' : ' · <span class="neg">sprawdź wykaz</span>'}${p.confirmed ? ' · potwierdzenie z biblioteki ✓' : ' · brak potwierdzenia z biblioteki'}</small></span>
      <button class="chip danger-chip" data-pub-del="${esc(p.id)}">Usuń</button></div>`).join('') || '<p class="hint small">Brak publikacji.</p>'}
    <button class="btn" data-lek="add-pub">＋ Dodaj publikację</button>
    <p class="hint small">Ile punktów daje doktorat i publikacja, określa rozporządzenie o specjalizacjach – sprawdź aktualne zasady w CMKP przed naborem.</p></div>`;
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

/**
 * Okno „Dziedziny lekcji”: dlaczego aplikacja przypisała lekcję do tych dziedzin (słowa z nazwy)
 * i ręczna poprawka (study.domainFix[klucz lekcji]). Zmiana tylko po „Zapisz”, potem „Cofnij”.
 */
function domainFixSheet(state, ctx, key) {
  const st = study(state);
  const l = allLessons(st).find((x) => x.key === key);
  if (!l) return;
  const auto = explainLesson(l.domain, l.section, l.name);
  const sel = new Set(l.domains);
  const why = [
    DOMAINS.some((d) => d.id === l.domain) ? `<div>📚 Kurs „${esc(l.course)}” → <b>${esc(shortDom(l.domain))}</b></div>` : `<div>📚 Kurs „${esc(l.course)}” nie ma dziedziny LEK</div>`,
    ...auto.hits.map((x) => `<div>🔎 „${esc(x.text)}” → <b>${esc(x.domains.filter((d) => auto.domains.includes(d)).map(shortDom).join(' + '))}</b></div>`),
  ].join('');
  const { root, close } = sheet('Dziedziny lekcji', `<div class="form-card">
      <div class="t-strong">${esc(l.name)}</div><div class="sub">${esc(l.section)} · ${esc(l.course)}</div>
      <div class="card-label" style="margin-top:12px">Rozpoznane automatycznie: ${esc(auto.domains.length ? auto.domains.map(shortDom).join(' + ') : 'poza LEK')}</div>
      <div class="hint small">${why}</div>
      <p class="hint small">Aplikacja czyta pełną nazwę działu i lekcji. Jeśli coś się nie zgadza, zaznacz właściwe dziedziny i stuknij <b>Zapisz</b> – poprawka zostanie przy tej lekcji także po ponownym wczytaniu spisu.</p></div>
    <div class="form-card"><div class="card-label">Ta lekcja liczy się do</div>
      ${DOMAINS.map((d) => `<label class="skill ${sel.has(d.id) ? 'on' : ''}"><input type="checkbox" data-fd="${d.id}" ${sel.has(d.id) ? 'checked' : ''}><span class="box"></span><span class="nm">${esc(d.name)}<small>${d.q} pytań na LEK</small></span></label>`).join('')}
      <p class="hint small">Bez zaznaczenia lekcja wypadnie z planu (poza LEK).</p>
      ${l.manual ? '<button class="btn" data-fd-auto>Przywróć rozpoznanie automatyczne</button>' : ''}</div>`);
  root.addEventListener('change', (e) => { const c = e.target.closest('[data-fd]'); if (c) c.closest('.skill').classList.toggle('on', c.checked); });
  const apply = (next) => {
    const prev = st.domainFix?.[key];
    st.domainFix = { ...(st.domainFix || {}) };
    if (next) st.domainFix[key] = next; else delete st.domainFix[key];
    ctx.save(); ctx.render(); close();
    ctx.toast('Zapisano ✓', () => { st.domainFix = { ...(st.domainFix || {}) }; if (prev) st.domainFix[key] = prev; else delete st.domainFix[key]; ctx.save(); ctx.render(); });
  };
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    if (e.target.closest('[data-fd-auto]')) return apply(null);
    if (e.target.closest('[data-ok]')) {
      const next = DOMAINS.map((d) => d.id).filter((id) => root.querySelector(`[data-fd="${id}"]`).checked);
      // Taki sam wynik jak automatyczny = bez ręcznej poprawki (aplikacja dalej sama się uczy z lepszego słownika)
      const same = next.length === auto.domains.length && next.every((d) => auto.domains.includes(d));
      return apply(same ? null : next);
    }
  });
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
        return `<div>Rozpoznano: <b>${esc(p.name)}</b> → ${p.domain === 'inne' ? '⚠️ bez dziedziny LEK (wybierzesz po dodaniu)' : esc(domainOf(p.domain).name)} · ${p.sections.length} ${plural(p.sections.length, 'dział', 'działy', 'działów')} · ${n} ${plural(n, 'lekcja', 'lekcje', 'lekcji')} · ok. ${String(Math.round(h * 10) / 10).replace('.', ',')} h</div>
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
      const other = ps.filter((p) => p.domain === 'inne' && r.added.includes(p.name)).length;
      ctx.toast(`${[...r.added.map((n) => `dodano ${n}`), ...r.updated.map((u) => `${u.name} +${u.lessons} lekcji`)].join(', ')} ✓${other ? ' – wybierz dziedzinę LEK dla kursu oznaczonego ⚠️' : ''}`, () => { st.courses = old; ctx.save(); ctx.render(); });
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
  const specs = nabory ? specNames(nabory) : (st.mySpecs || []);
  const chips = (field) => DOMAINS.map((d) => `<button class="chip ${s[field].includes(d.id) ? 'on' : ''}" data-chip="${field}:${d.id}">${esc(d.name.replace(/ \(.*\)/, ''))}</button>`).join('');
  const html = () => `
    <div class="form-card">
      <label>Nazwa planu<input data-s="name" value="${esc(name)}"></label>
      <label>Termin najbliższego LEK<input type="date" data-s="examDate" value="${s.examDate}"></label>
      <div class="t-strong small-t">Jak traktujesz najbliższe podejście?</div>
      <div class="segmented"><button data-sv="mode:trening" class="${s.mode === 'trening' ? 'on' : ''}">Trening</button><button data-sv="mode:serio" class="${s.mode === 'serio' ? 'on' : ''}">Na serio</button></div>
    </div>
    <div class="form-card">
      <div class="card-label">🎯 Twój plan podejść</div>
      <div class="t-strong small-t">Czy najbliższy LEK to ten, na który chcesz być najlepiej przygotowany?</div>
      <div class="segmented"><button data-sv="finalLater:false" class="${!s.finalLater ? 'on' : ''}">Tak, to ten</button><button data-sv="finalLater:true" class="${s.finalLater ? 'on' : ''}">Nie – ostateczny później</button></div>
      ${s.finalLater ? `
        <div class="t-strong small-t">Podejścia pośrednie (treningowe)</div>
        ${(s.midExams || []).map((m, i) => `<div class="mid-row">
          <label>Trening nr ${i + 2}<input type="date" data-mid-date="${i}" value="${esc(m.date || '')}"></label>
          <div class="segmented"><button data-mid-base="${i}:true" class="${m.base !== false ? 'on' : ''}">Jawna baza</button><button data-mid-base="${i}:false" class="${m.base === false ? 'on' : ''}">Bez bazy</button></div>
          <button class="chip danger-chip" data-mid-del="${i}">Usuń</button></div>`).join('') || '<p class="hint small">Brak – plan zakłada tylko najbliższy LEK jako trening.</p>'}
        <button class="btn" data-mid-add>＋ Dodaj podejście pośrednie</button>
        <p class="hint small">Przed każdym treningowym LEK plan przewidzi całą bazę CEM i najważniejsze z jeszcze nieprzerobionych lekcji.</p>
        <label>Termin ostatecznego LEK<input type="date" data-s="finalDate" value="${esc(s.finalDate || '')}"></label>
        <p class="hint small">Może być za pół roku albo za kilka lat. Data jest orientacyjna – CEM podaje dokładny termin później; zmienisz ją tutaj w każdej chwili.</p>
        <div class="t-strong small-t">Czy na ostatecznym LEK będzie jawna baza CEM?</div>
        <div class="segmented"><button data-sv="finalBase:true" class="${s.finalBase !== false ? 'on' : ''}">Tak (70% z bazy)</button><button data-sv="finalBase:false" class="${s.finalBase === false ? 'on' : ''}">Bez jawnej bazy</button></div>
        ${s.finalDate >= '2027-05-01' ? '<p class="hint small">Projekt UD384 (jeszcze nieprzyjęty) zakłada likwidację jawnej bazy od 1.05.2027. Sprawdź przepisy przed zapisami i w razie czego przełącz na „Bez jawnej bazy”.</p>' : ''}
        <p class="sub plan-note">Plan: <b>przed każdym treningowym LEK</b> – cała baza CEM i najważniejsze lekcje (tematy najczęstsze na LEK); <b>potem do ostatecznego LEK</b> – pozostałe lekcje, a na koniec drugie przejście bazy i tydzień powtórki.</p>` : '<p class="hint small">Plan przygotuje Cię jak najlepiej na najbliższy LEK.</p>'}
    </div>
    <div class="form-card">
      <div class="t-strong small-t">Cel${s.finalLater ? ' na ostatecznym LEK' : ''}</div>
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
      <div class="t-strong small-t">Ile minut na jedną powtórkę tematu?</div>
      <div class="segmented five">${[0, 5, 10, 15, 20].map((m) => `<button data-sv="reviewMin:${m}" class="${Number(s.reviewMin ?? 10) === m ? 'on' : ''}">${m ? `${m} min` : 'bez'}</button>`).join('')}</div>
      <p class="hint small">Powtórki (1, 3, 7, 14, 30 dni po lekcji) utrwalają materiał, ale zabierają czas na nowe lekcje – plan to uwzględnia. „bez” = plan nie rezerwuje na nie czasu (powtórki i tak pojawią się na Dziś).</p>
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
    if (e.target.dataset.midDate !== undefined) {
      const i = Number(e.target.dataset.midDate);
      s.midExams = (s.midExams || []).map((m, j) => (j === i ? { ...m, date: e.target.value } : m));
      return;
    }
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
      s[k] = v === 'true' ? true : v === 'false' ? false : k === 'reviewMin' ? Number(v) : v;
      if (k === 'finalLater' && s.finalLater) {
        // Propozycja: następna sesja (luty -> wrzesień, wrzesień -> luty kolejnego roku); trening przed ostatecznym LEK
        const y = Number(s.examDate.slice(0, 4));
        if (!s.finalDate || s.finalDate <= s.examDate) s.finalDate = Number(s.examDate.slice(5, 7)) <= 6 ? `${y}-09-15` : `${y + 1}-02-15`;
        s.mode = 'trening';
      }
      return redraw();
    }
    // Podejścia pośrednie (treningowe)
    const nextSession = (d) => { const y = Number(d.slice(0, 4)); return Number(d.slice(5, 7)) <= 6 ? `${y}-09-15` : `${y + 1}-02-15`; };
    if (e.target.closest('[data-mid-add]')) {
      const mids = [...(s.midExams || [])];
      const after = mids.length ? mids[mids.length - 1].date : s.examDate;
      const d = nextSession(after);
      mids.push({ date: d, base: true });
      s.midExams = mids;
      if (!s.finalDate || s.finalDate <= d) s.finalDate = nextSession(d);
      return redraw();
    }
    const md = e.target.closest('[data-mid-del]');
    if (md) { s.midExams = (s.midExams || []).filter((_, i) => i !== Number(md.dataset.midDel)); return redraw(); }
    const mb = e.target.closest('[data-mid-base]');
    if (mb) {
      const [i, v] = mb.dataset.midBase.split(':');
      s.midExams = (s.midExams || []).map((m, j) => (j === Number(i) ? { ...m, base: v === 'true' } : m));
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
      if (s.finalLater && (!s.finalDate || s.finalDate <= s.examDate)) return ctx.toast('Ostateczny LEK musi być później niż najbliższy');
      if (s.finalLater) {
        const mids = (s.midExams || []).filter((m) => m.date).sort((a, b) => (a.date < b.date ? -1 : 1));
        if (mids.some((m, i) => m.date <= s.examDate || m.date >= s.finalDate || (i && m.date === mids[i - 1].date))) {
          return ctx.toast('Podejścia pośrednie muszą być po najbliższym i przed ostatecznym LEK (różne daty)');
        }
        s.midExams = mids;
      }
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
  if ((el = t('[data-lek-reg]'))) { openLekRegistration(state, ctx); return true; }
  if ((el = t('[data-pub-del]'))) {
    const pubs = st.extras?.pubs || [];
    const i = pubs.findIndex((p) => p.id === el.dataset.pubDel);
    if (i < 0) return true;
    const removed = pubs.splice(i, 1)[0];
    ctx.save(); ctx.render();
    ctx.toast('Usunięto', () => { st.extras.pubs.splice(i, 0, removed); ctx.save(); ctx.render(); });
    return true;
  }
  if (handleReviewClick(e, state, ctx)) return true;
  if ((el = t('[data-dom-fix]'))) { domainFixSheet(state, ctx, el.dataset.domFix); return true; }
  if ((el = t('[data-lekseg]'))) { seg = el.dataset.lekseg; ctx.render(); window.scrollTo({ top: 0 }); return true; }
  if ((el = t('[data-lek]'))) {
    const a = el.dataset.lek;
    if (a === 'paste') pasteSheet(state, ctx);
    else if (a === 'save-courses') shareOrDownload(`kursy-wnl-${todayIso()}.json`, coursesFileJson(st.courses), 'application/json');
    else if (a === 'new-plan') surveySheet(state, ctx, null);
    else if (a === 'edit-plan') surveySheet(state, ctx, activePlan(st));
    else if (a === 'add-pub') {
      const { root, close } = sheet('Publikacja', `<div class="form-card">
        <label>Tytuł<input data-k="title"></label><label>Czasopismo<input data-k="journal"></label>
        <label>Rok<input data-k="year" type="number" inputmode="numeric" placeholder="np. 2026"></label>
        <label class="skill"><input type="checkbox" data-k="listed"><span class="box"></span><span class="nm">Czasopismo z wykazu ministra (w dniu publikacji)</span></label>
        <label class="skill"><input type="checkbox" data-k="confirmed"><span class="box"></span><span class="nm">Mam potwierdzenie z GBL / biblioteki uczelni</span></label></div>`);
      root.addEventListener('change', (ev) => { const c = ev.target.closest('.skill'); if (c) c.classList.toggle('on', ev.target.checked); });
      root.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-close]')) return close();
        if (!ev.target.closest('[data-ok]')) return;
        const v = (k) => root.querySelector(`[data-k="${k}"]`);
        if (!v('title').value.trim()) { ctx.toast('Wpisz tytuł'); return; }
        st.extras = { phd: '', pubs: [], ...(st.extras || {}) };
        st.extras.pubs = [...st.extras.pubs, { id: `pub${Date.now()}`, title: v('title').value.trim(), journal: v('journal').value.trim(), year: v('year').value, listed: v('listed').checked, confirmed: v('confirmed').checked }];
        ctx.save(); ctx.render(); ctx.toast('Zapisano ✓'); close();
      });
    } else if (a === 'add-att') {
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
  if ((el = t('[data-spec-star]'))) {
    const dz = el.dataset.specStar;
    const had = (st.mySpecs || []).includes(dz);
    undoable(had ? `Usunięto z moich: ${dz}` : `Dodano do moich: ${dz}`,
      () => { st.mySpecs = had ? st.mySpecs.filter((x) => x !== dz) : [...(st.mySpecs || []), dz]; },
      () => { st.mySpecs = had ? [...(st.mySpecs || []), dz] : (st.mySpecs || []).filter((x) => x !== dz); });
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
  if (el.dataset.phd !== undefined) {
    st.extras = { phd: '', pubs: [], ...(st.extras || {}), phd: el.value };
    ctx.save(); ctx.toast('Zapisano ✓');
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
