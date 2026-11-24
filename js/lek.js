// Planer nauki do LEK – czysta logika (bez interfejsu), w całości testowana.
// Wagi dziedzin: rozporządzenie MZ (Dz.U. 2021 poz. 828, t.j. 2023 poz. 105) – 200 pytań.
// Zasada 70/30 (baza CEM / nowe pytania): art. 14c ust. 4 ustawy o zawodach lekarza (stan 11.2026).
import { addDays, eachDay, isWeekend, toNum, weekday } from './dates.js';
import { buildContext, statutoryOff } from './engine.js';
import { EVENT_TYPES } from './defaults.js';

export const DOMAINS = [
  { id: 'int', name: 'Choroby wewnętrzne', q: 39, kw: /intern|chorób wewn|choroby wewn|kardio|wewnętrzn/i },
  { id: 'ped', name: 'Pediatria (z neonatologią)', q: 29, kw: /pediat|neonat/i },
  { id: 'chir', name: 'Chirurgia (z urazową)', q: 27, kw: /chirurg|ortoped|urazow/i },
  { id: 'gin', name: 'Położnictwo i ginekologia', q: 26, kw: /ginek|położn|polozn/i },
  { id: 'rodz', name: 'Medycyna rodzinna', q: 20, kw: /rodzinn/i },
  { id: 'rat', name: 'Medycyna ratunkowa i intensywna terapia', q: 20, kw: /ratunk|intensywn|anestez/i },
  { id: 'psych', name: 'Psychiatria', q: 14, kw: /psychiat/i },
  { id: 'etyka', name: 'Bioetyka i prawo medyczne', q: 10, kw: /bioety|prawo|prawa med/i },
  { id: 'zp', name: 'Zdrowie publiczne', q: 8, kw: /zdrowi[ae] publ/i },
  { id: 'orz', name: 'Orzecznictwo lekarskie', q: 7, kw: /orzecz/i },
];
export const DOMAIN_IDS = DOMAINS.map((d) => d.id);
export const domainOf = (id) => DOMAINS.find((d) => d.id === id) || { id: 'inne', name: 'Inne', q: 0 };

/** Dziedzina LEK na podstawie nazwy kursu (np. „Kurs z Interny” -> int). Brak dopasowania -> 'inne'. */
export function guessDomain(courseName) {
  const d = DOMAINS.find((x) => x.kw.test(courseName || ''));
  return d ? d.id : 'inne';
}

/* ---------- Import spisu kursu (wklejony tekst ze strony WNL) ---------- */

const NOISE = /^(kurs|baza pytań|fiszki|powtórki|kolekcje|oferty|pomoc|zmień kurs|zmien kurs|›|>|x|×)$/i;
const TIME = /(\d+(?:[.,]\d+)?)\s*h\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*h/i;
const WEEKDAY = /^(poniedziałek|wtorek|środa|czwartek|piątek|sobota|niedziela)\b[\s\d.,:/-]*$/i;
const DASH = /^[-–—]+$/;
const COUNT = /^\((\d+)\)$/;
const COURSE = /^kurs\s*(?:z\s+|[:\-–]\s*)?(.{2,60})$/i;
const num = (s) => parseFloat(String(s).replace(',', '.'));
const isCourseLine = (l) => COURSE.test(l) && !NOISE.test(l);
const courseTitle = (l) => {
  const rest = COURSE.exec(l)[1].trim();
  return /^kurs\s+z\s+/i.test(l) ? `Kurs z ${rest}` : `Kurs ${rest}`;
};

/**
 * Wstępne czyszczenie linii: pomija menu, dni tygodnia i myślniki. Rozdziela tytuł kursu sklejony z nazwą
 * pierwszego działu („Kurs z interny Alergologia” + „(10)”) – nazwę działu powtarza pierwsza lekcja.
 */
function prepLines(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && !NOISE.test(l) && !WEEKDAY.test(l) && !DASH.test(l));
  const out = [];
  lines.forEach((l, i) => {
    if (COUNT.test(lines[i + 1] || '')) {
      let j = i + 2;
      while (j < lines.length && TIME.test(lines[j]) && !lines[j].replace(TIME, '').trim()) j++;
      const sec = lines[j];
      if (sec && l !== sec && l.toLowerCase().endsWith(` ${sec.toLowerCase()}`)) {
        out.push(l.slice(0, l.length - sec.length).trim(), sec);
        return;
      }
    }
    out.push(l);
  });
  return out;
}

/**
 * Rozbiera wklejony spis kursu na działy i lekcje. Rozpoznaje dwa układy strony WNL:
 * – telefon: działy WIELKIMI LITERAMI (opcjonalnie „(n)”), pod nimi lekcje i czasy „1.5h - 2.5h”;
 * – komputer: dział = nazwa + linia „(n)” + łączny czas; lekcja = nazwa działu, tytuł, opis, czas, dzień tygodnia.
 * Dni tygodnia, myślniki i opisy lekcji są pomijane.
 */
export function parseCourseText(text, fallbackName = 'Kurs') {
  const lines = prepLines(text);
  const desktop = lines.some((l) => COUNT.test(l));
  let name = null;
  const sections = [];
  let sec = null;
  let last = null;
  let pending = []; // linie tekstu czekające na czas (tytuł + ewentualny opis)
  let afterHeader = false; // następny sam czas = łączny czas działu
  let secSkipped = false; // powtórzona nazwa działu na początku lekcji już pominięta
  const warnings = [];
  const newSection = (n, expected) => {
    sec = { name: n.replace(/\s+/g, ' ').trim(), expected, lessons: [] };
    sections.push(sec);
    last = null;
  };
  const ensureSec = () => { if (!sec) newSection('Lekcje', null); };
  const addLesson = (n, t) => {
    ensureSec();
    last = { name: n, hMin: t ? num(t[1]) : null, hMax: t ? num(t[2]) : null };
    sec.lessons.push(last);
  };
  // Linie bez czasu: na komputerze to tytuł (pierwsza) i opis (reszta); na telefonie każda to lekcja.
  const flush = (t) => {
    if (!pending.length) return false;
    if (desktop) addLesson(pending[0], t);
    else { pending.slice(0, -1).forEach((l) => addLesson(l, null)); addLesson(pending.at(-1), t); }
    pending = [];
    return true;
  };
  for (const raw of lines) {
    if (NOISE.test(raw) || WEEKDAY.test(raw) || DASH.test(raw)) continue;
    if (!name && isCourseLine(raw)) { name = courseTitle(raw); continue; }
    const cnt = COUNT.exec(raw);
    if (cnt) {
      // Poprzednia linia była nazwą działu (układ z komputera)
      const header = pending.pop();
      // Linia przed nazwą działu, gdy nie ma jeszcze żadnego działu = tytuł kursu (np. „Choroby zakaźne”)
      if (desktop && !sec && pending.length) { if (!name) name = pending.join(' '); pending = []; }
      flush(null);
      if (header) newSection(header, Number(cnt[1]));
      else if (sec) sec.expected = Number(cnt[1]);
      afterHeader = true;
      continue;
    }
    const t = TIME.exec(raw);
    const textPart = raw.replace(TIME, '').replace(/[☐☑✓✔□■]/g, '').trim();
    if (!textPart && t) {
      secSkipped = false;
      if (afterHeader) { afterHeader = false; continue; }
      if (!flush(t) && last) { last.hMin = num(t[1]); last.hMax = num(t[2]); }
      continue;
    }
    afterHeader = false;
    const head = /^([A-ZĄĆĘŁŃÓŚŹŻ0-9 ,.\-–/()&]+?)\s*(?:\((\d+)\))?$/.exec(textPart);
    const letters = textPart.replace(/[^A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/g, '');
    if (!desktop && head && letters.length >= 3 && letters === letters.toUpperCase()) {
      flush(null);
      newSection(head[1], head[2] ? Number(head[2]) : null);
      continue;
    }
    if (desktop) {
      // Każda lekcja zaczyna się powtórzoną nazwą działu – pomijamy ją
      if (!pending.length && !secSkipped && sec && textPart.toLowerCase() === sec.name.toLowerCase()) { secSkipped = true; continue; }
      secSkipped = false;
      pending.push(textPart);
      continue;
    }
    if (t) { flush(null); addLesson(textPart, t); continue; }
    pending.push(textPart);
  }
  flush(null);
  for (const s of sections) {
    if (s.expected != null && s.lessons.length < s.expected) {
      warnings.push(`Dział „${s.name}”: ${s.lessons.length} z ${s.expected} lekcji – rozwiń go w WNL i wklej ponownie.`);
    }
  }
  const courseName = name || fallbackName;
  return { name: courseName, domain: guessDomain(courseName), sections: sections.filter((s) => s.lessons.length || s.expected), warnings };
}

/** Kilka kursów w jednym wklejeniu: każdy zaczyna się linią „Kurs …” / „KURS: …” albo samym tytułem (np. „Choroby zakaźne”). */
export function parseCoursesText(text, fallbackName = 'Kurs') {
  const lines = prepLines(text);
  const desktop = lines.some((l) => COUNT.test(l));
  // Układ z komputera: linia tuż przed „nazwa działu + (n)”, która nie kończy lekcji czasem, to tytuł nowego kursu
  const titleAt = (i) => desktop && COUNT.test(lines[i + 2] || '') && !COUNT.test(lines[i + 1] || '')
    && !TIME.test(lines[i]) && !COUNT.test(lines[i]) && (i === 0 || TIME.test(lines[i - 1]));
  const chunks = [];
  let cur = [];
  lines.forEach((l, i) => {
    if ((isCourseLine(l) || titleAt(i)) && cur.length) { chunks.push(cur); cur = []; }
    cur.push(l);
  });
  if (cur.length) chunks.push(cur);
  return chunks.map((c) => parseCourseText(c.join('\n'), fallbackName)).filter((p) => p.sections.some((s) => s.lessons.length));
}

/**
 * Plik z kursami (prywatny, nie w kodzie aplikacji): JSON {type:'kalendarz-stazysty-kursy', courses:[…]}
 * albo zwykły tekst skopiowany z WNL. Zwraca listę kursów w formacie parseCourseText.
 */
export function coursesFromFile(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  let data = null;
  try { data = JSON.parse(raw); } catch { /* tekst */ }
  if (data && Array.isArray(data.courses)) {
    return data.courses.filter((c) => c && c.name && Array.isArray(c.sections)).map((c) => ({
      name: String(c.name),
      domain: DOMAIN_IDS.includes(c.domain) ? c.domain : guessDomain(c.name),
      sections: c.sections.map((s) => ({
        name: String(s.name),
        lessons: (s.lessons || []).filter((l) => l && l.name).map((l) => ({
          name: String(l.name),
          hMin: Number.isFinite(Number(l.hMin)) ? Number(l.hMin) : null,
          hMax: Number.isFinite(Number(l.hMax)) ? Number(l.hMax) : null,
        })),
      })).filter((s) => s.lessons.length),
      warnings: [],
    })).filter((c) => c.sections.length);
  }
  if (data || /^\s*[[{]/.test(raw)) return []; // inny plik JSON (np. kopia całej aplikacji) – nie zgadujemy
  return parseCoursesText(raw);
}

/** Klucz lekcji niezależny od kolejności – odhaczenia przetrwają ponowne wklejenie spisu. */
export const lessonKey = (course, section, lesson) =>
  `${course}|${section}|${lesson}`.toLowerCase().replace(/\s+/g, ' ').trim();

/** Scala nowy spis kursu z istniejącym (po nazwie kursu); zwraca listę kursów. */
export function mergeCourse(courses, parsed) {
  const list = [...(courses || [])];
  const i = list.findIndex((c) => c.name.toLowerCase() === parsed.name.toLowerCase());
  const course = {
    id: i >= 0 ? list[i].id : `c${Date.now()}`,
    name: parsed.name,
    domain: i >= 0 ? list[i].domain : parsed.domain,
    sections: parsed.sections.map((s) => ({ name: s.name, lessons: s.lessons.map((l) => ({ ...l })) })),
    importedAt: new Date().toISOString().slice(0, 10),
  };
  if (i >= 0) list[i] = course; else list.push(course);
  return list;
}

/* ---------- Czas na naukę z grafiku stażu ---------- */

/**
 * Godziny nauki dzień po dniu (od jutra/od daty do dnia przed egzaminem).
 * Rodzaj dnia: urlop -> hVacation; weekend/święto/dzień wolny -> hWeekend;
 * dzień dyżuru albo dzień po dyżurze -> hDuty; zwykły dzień -> hWork.
 * Dni tygodnia z `restDays` (przerwa wybrana w ankiecie) -> 0 h.
 */
export function studyDays(state, survey, from, examDate) {
  const ctx = buildContext(state);
  const dutyDays = new Set((state.duties || []).map((d) => d.date));
  const to = addDays(examDate, -1);
  if (from > to) return [];
  const rest = new Set((survey.restDays || []).map(Number)); // dni tygodnia bez nauki (0 = niedziela)
  return eachDay(from, to).map((d) => {
    const abs = ctx.absence.get(d);
    let kind = 'work';
    if (abs && abs.kind === 'event' && EVENT_TYPES[abs.type]?.vacation) kind = 'vacation';
    else if (isWeekend(d) || statutoryOff(ctx, d)) kind = 'free';
    else if (dutyDays.has(d) || dutyDays.has(addDays(d, -1))) kind = 'duty';
    if (rest.has(weekday(d))) return { date: d, kind: 'rest', hours: 0 };
    const h = { work: survey.hWork, free: survey.hWeekend, duty: survey.hDuty, vacation: survey.hVacation }[kind];
    return { date: d, kind, hours: Math.max(0, Number(h) || 0) };
  });
}

/* ---------- Plan ---------- */

export const DEFAULT_SURVEY = {
  examDate: '2027-02-20',
  mode: 'trening', // 'trening' | 'serio'
  goal: 'pass', // 'pass' | 'score'
  targetPct: 56,
  spec: '',
  woj: 'Zachodniopomorskie',
  hWork: 1.5,
  hDuty: 0.5,
  hWeekend: 4,
  hVacation: 6,
  style: 'mix', // 'video' | 'read' | 'questions' | 'mix'
  pace: 'fast', // czas lekcji z przedziału WNL: 'fast' = dolna granica, 'mid' = środek, 'slow' = górna
  weak: [],
  strong: [],
  base: true, // czy na tym terminie jest jawna baza CEM (70% pytań)
  baseTotal: 0, // liczba pytań bazy do przerobienia
  baseDone: 0,
  previous: [], // [{year, session, pct}]
  restDays: [], // dni tygodnia wolne od nauki (0 = niedziela … 6 = sobota)
};

const STYLE_FACTOR = { video: 1.15, read: 1.0, questions: 0.85, mix: 1.0 };

/** Udział czasu na bazę pytań (CEM albo pytania WNL) zależnie od trybu i zasad egzaminu. */
export function baseShare(survey) {
  if (!survey.base) return 0.2; // brak jawnej bazy – pytania tylko jako ćwiczenie
  return survey.mode === 'trening' ? 0.55 : 0.4;
}

/** Waga dziedziny w planie: liczba pytań × (słaba 1.3 / mocna 0.7). */
export function domainWeight(survey, id) {
  const d = domainOf(id);
  let w = d.q;
  if ((survey.weak || []).includes(id)) w *= 1.3;
  if ((survey.strong || []).includes(id)) w *= 0.7;
  return w;
}

/** Czas lekcji z przedziału WNL wg tempa (domyślnie dolna granica). */
export function lessonHours(lo, hi, pace = 'fast') {
  if (pace === 'slow') return hi;
  if (pace === 'mid') return (lo + hi) / 2;
  return lo;
}

/** Wszystkie lekcje z zaimportowanych kursów z informacją o dziedzinie i czasie. */
export function allLessons(study, pace = 'fast') {
  const out = [];
  for (const c of study.courses || []) {
    for (const s of c.sections || []) {
      for (const l of s.lessons || []) {
        const lo = l.hMin ?? 1.5;
        const hi = l.hMax ?? lo + 1;
        out.push({ key: lessonKey(c.name, s.name, l.name), course: c.name, courseId: c.id, domain: c.domain, section: s.name,
          name: l.name, hours: lessonHours(lo, hi, pace) });
      }
    }
  }
  return out;
}

/**
 * Prosty, jawny szacunek wyniku (%) – NIE prognoza. Opisany w aplikacji.
 *  k = pokrycie dziedzin ważone liczbą pytań (0–1), b = część bazy przerobiona (0–1).
 *  Bez bazy:  20 + 65·k.   Z bazą (70% pytań z bazy):  0.7·(20 + 72·b) + 0.3·(20 + 65·k).
 */
export function estimateScore(k, b, withBase) {
  const kk = Math.max(0, Math.min(1, k));
  const bb = Math.max(0, Math.min(1, b));
  const v = withBase ? 0.7 * (20 + 72 * bb) + 0.3 * (20 + 65 * kk) : 20 + 65 * kk;
  return Math.round(v * 10) / 10;
}

/** Pokrycie dziedzin: dla każdej dziedziny część lekcji (godzin) zrobiona lub zaplanowana. */
export function coverage(lessons, chosenKeys) {
  let sum = 0;
  let tot = 0;
  for (const d of DOMAINS) {
    const ls = lessons.filter((l) => l.domain === d.id);
    tot += d.q;
    if (!ls.length) continue;
    const all = ls.reduce((a, l) => a + l.hours, 0);
    const got = ls.filter((l) => chosenKeys.has(l.key)).reduce((a, l) => a + l.hours, 0);
    sum += d.q * (all ? got / all : 0);
  }
  return tot ? sum / tot : 0;
}

/**
 * Buduje plan od dnia `today` do egzaminu:
 *  – godziny z grafiku, część na bazę pytań, reszta na lekcje,
 *  – budżet godzin na dziedzinę proporcjonalny do wagi, lekcje w kolejności kursu,
 *  – czego nie zmieścimy -> „pominięte” (z najmniej opłacalnych dziedzin),
 *  – rozkład na tygodnie (ostatni tydzień = powtórka).
 */
export function buildPlan(state, plan, today) {
  const survey = { ...DEFAULT_SURVEY, ...plan.survey };
  const study = state.study || {};
  const done = study.done || {};
  const from = today;
  const days = studyDays(state, survey, from, survey.examDate);
  const hoursTotal = days.reduce((a, d) => a + d.hours, 0);
  const share = baseShare(survey);
  const reviewDays = days.filter((d) => toNum(survey.examDate) - toNum(d.date) <= 7);
  const reviewHours = reviewDays.reduce((a, d) => a + d.hours, 0);
  const learnHours = Math.max(0, (hoursTotal - reviewHours) * (1 - share));
  const baseHours = Math.max(0, (hoursTotal - reviewHours) * share);
  const factor = STYLE_FACTOR[survey.style] || 1;

  const lessons = allLessons(study, survey.pace).map((l) => ({ ...l, hours: Math.round(l.hours * factor * 10) / 10 }));
  const todo = lessons.filter((l) => !done[l.key]);
  const doneKeys = new Set(lessons.filter((l) => done[l.key]).map((l) => l.key));
  const skipped = new Set(plan.skip || []);
  const must = new Set(plan.must || []);

  // Budżet na dziedzinę ∝ wadze (tylko dziedziny, w których są lekcje do zrobienia)
  const domainsWithWork = DOMAINS.filter((d) => todo.some((l) => l.domain === d.id && !skipped.has(l.key)));
  const wSum = domainsWithWork.reduce((a, d) => a + domainWeight(survey, d.id), 0) || 1;
  const need = {};
  for (const d of domainsWithWork) need[d.id] = todo.filter((l) => l.domain === d.id && !skipped.has(l.key)).reduce((a, l) => a + l.hours, 0);
  // Rozdział budżetu z przelewaniem nadwyżek do dziedzin, które potrzebują więcej
  const budget = {};
  let left = learnHours;
  let open = [...domainsWithWork];
  for (let guard = 0; guard < 10 && open.length && left > 0.01; guard++) {
    const ws = open.reduce((a, d) => a + domainWeight(survey, d.id), 0) || 1;
    const next = [];
    let spent = 0;
    for (const d of open) {
      const give = left * (domainWeight(survey, d.id) / ws);
      const room = need[d.id] - (budget[d.id] || 0);
      const g = Math.min(give, room);
      budget[d.id] = (budget[d.id] || 0) + g;
      spent += g;
      if (room - g > 0.01) next.push(d);
    }
    left -= spent;
    open = next;
    if (spent < 0.01) break;
  }

  const chosen = [];
  const dropped = [];
  for (const d of DOMAINS) {
    let b = budget[d.id] || 0;
    const ls = todo.filter((l) => l.domain === d.id);
    // Najpierw „muszę”, potem w kolejności kursu
    const ordered = [...ls.filter((l) => must.has(l.key)), ...ls.filter((l) => !must.has(l.key))];
    for (const l of ordered) {
      if (skipped.has(l.key)) { dropped.push({ ...l, reason: 'pominięte przez Ciebie' }); continue; }
      if (must.has(l.key) || l.hours <= b + 0.25) { chosen.push(l); b -= l.hours; }
      else dropped.push({ ...l, reason: `brak czasu – ${domainOf(d.id).name}: ${domainOf(d.id).q} pytań na LEK` });
    }
  }
  for (const l of todo.filter((x) => x.domain === 'inne' || !DOMAIN_IDS.includes(x.domain))) {
    dropped.push({ ...l, reason: 'poza dziedzinami LEK – przypisz kurs do dziedziny, jeśli to potrzebne' });
  }

  // Kolejność nauki: przeplatamy dziedziny wg wagi (żeby każdy tydzień był zróżnicowany)
  const queues = DOMAINS.map((d) => ({ d, q: chosen.filter((l) => l.domain === d.id) })).filter((x) => x.q.length);
  const order = [];
  const credit = Object.fromEntries(queues.map((x) => [x.d.id, 0]));
  while (queues.some((x) => x.q.length)) {
    for (const x of queues) if (x.q.length) credit[x.d.id] += domainWeight(survey, x.d.id);
    const pick = queues.filter((x) => x.q.length).sort((a, b) => credit[b.d.id] - credit[a.d.id])[0];
    order.push(pick.q.shift());
    credit[pick.d.id] -= 100;
  }

  // Tygodnie (pn–nd); godziny na lekcje w tygodniu = godziny tygodnia × (1 − udział bazy)
  const weeks = [];
  for (const d of days) {
    const wd = (new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7;
    if (!weeks.length || wd === 0) weeks.push({ start: d.date, end: d.date, hours: 0, review: false, lessons: [], base: 0, lessonHours: 0 });
    const w = weeks[weeks.length - 1];
    w.end = d.date;
    w.hours += d.hours;
    if (toNum(survey.examDate) - toNum(d.date) <= 7) w.review = true;
  }
  let qi = 0;
  for (const w of weeks) {
    if (w.review && w.start >= addDays(survey.examDate, -7)) { w.base = Math.round(w.hours); continue; }
    const cap = w.hours * (1 - share);
    w.base = Math.round(w.hours * share * 10) / 10;
    while (qi < order.length && (w.lessonHours + order[qi].hours <= cap + 0.5 || w.lessons.length === 0 && cap > 0.5)) {
      w.lessons.push(order[qi]);
      w.lessonHours += order[qi].hours;
      qi++;
    }
  }
  // Co nie zmieściło się w tygodniach (zaokrąglenia) – trafia do ostatniego tygodnia nauki
  const lastLearn = [...weeks].reverse().find((w) => !w.review) || weeks[weeks.length - 1];
  while (qi < order.length && lastLearn) { lastLearn.lessons.push(order[qi]); lastLearn.lessonHours += order[qi].hours; qi++; }

  // Szacunki
  const plannedKeys = new Set([...doneKeys, ...chosen.map((l) => l.key)]);
  const kNow = coverage(lessons, doneKeys);
  const kPlan = coverage(lessons, plannedKeys);
  const baseLeft = Math.max(0, (survey.baseTotal || 0) - (survey.baseDone || 0));
  const minPerQ = 1.5; // pierwsze przejście + krótka powtórka
  const baseCanDo = Math.min(baseLeft, Math.floor(((baseHours + reviewHours) * 60) / minPerQ));
  const bNow = survey.baseTotal ? (survey.baseDone || 0) / survey.baseTotal : 0;
  const bPlan = survey.baseTotal ? ((survey.baseDone || 0) + baseCanDo) / survey.baseTotal : (survey.base ? 0.85 : 0);
  const estNow = estimateScore(kNow, bNow, survey.base);
  const estPlan = estimateScore(kPlan, bPlan, survey.base);
  const target = survey.goal === 'pass' ? 56 : Math.max(56, Number(survey.targetPct) || 56);
  const needHours = todo.filter((l) => !skipped.has(l.key) && DOMAIN_IDS.includes(l.domain)).reduce((a, l) => a + l.hours, 0);
  let verdict;
  if (estPlan >= target + 5) verdict = 'good';
  else if (estPlan >= target) verdict = 'tight';
  else verdict = 'hard';

  return {
    survey, days, hoursTotal, learnHours, baseHours, reviewHours, share, weeks, chosen, dropped,
    lessonsTotal: lessons.length, lessonsDone: doneKeys.size, needHours,
    baseLeft, baseCanDo, kNow, kPlan, estNow, estPlan, target, verdict,
    daysLeft: Math.max(0, toNum(survey.examDate) - toNum(today)),
  };
}

/** Tydzień, w którym jest dzień `today` (albo pierwszy przyszły). */
export function currentWeek(built, today) {
  return built.weeks.find((w) => w.start <= today && today <= w.end) || built.weeks.find((w) => w.start > today) || built.weeks[0] || null;
}
