// Planer nauki do LEK – czysta logika (bez interfejsu), w całości testowana.
// Wagi dziedzin: rozporządzenie MZ (Dz.U. 2021 poz. 828, t.j. 2023 poz. 105) – 200 pytań.
// Zasada 70/30 (baza CEM / nowe pytania): art. 14c ust. 4 ustawy o zawodach lekarza (stan 11.2026).
import { addDays, eachDay, isWeekend, toNum, weekday } from './dates.js';
import { buildContext, statutoryOff } from './engine.js';
import { EVENT_TYPES } from './defaults.js';
import { classifyLesson } from './lek-domains.js';
import { topicYield } from './lek-freq.js';

export const DOMAINS = [
  { id: 'int', name: 'Choroby wewnętrzne', q: 39, kw: /intern|chorób wewn|choroby wewn|kardio(?!chir)|wewnętrzn|zakaźn|neurolog|hematolog|endokryn|diabetolog|nefrolog|gastroenterolog|hepatolog|pulmonolog|reumatolog|alergolog|onkolog(?!.*(ginekolog|dziecięc))/i },
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

/**
 * Klucz kursu odporny na odmianę i zapis: „Kurs Chirurgia” = „Kurs z chirurgii”,
 * „Kurs z Ginekologii i Położnictwa” = „Kurs z ginekologii i położnictwa”.
 */
export function courseKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-ząćęłńóśźż ]/g, ' ').split(/\s+/)
    .filter((w) => w && !['kurs', 'z', 'ze', 'i', 'oraz'].includes(w)).map((w) => w.slice(0, 5)).sort().join(' '); // kolejność słów bez znaczenia (audyt B17)
}

/**
 * Dokłada kursy bez dublowania: nowy kurs – dodany; kurs, który już jest – dopisywane są tylko brakujące
 * działy i lekcje (nic nie jest usuwane, odhaczenia zostają). Zwraca { courses, added, updated, same }.
 */
export function mergeCourses(courses, parsedList) {
  const list = (courses || []).map((c) => ({ ...c, sections: c.sections.map((s) => ({ ...s, lessons: [...s.lessons] })) }));
  const added = [];
  const updated = [];
  const same = [];
  const low = (x) => String(x).toLowerCase().replace(/\s+/g, ' ').trim();
  parsedList.forEach((p, k) => {
    const c = list.find((x) => courseKey(x.name) === courseKey(p.name));
    if (!c) {
      list.push({ id: `c${Date.now()}${k}`, name: p.name, domain: p.domain,
        sections: p.sections.map((s) => ({ name: s.name, lessons: s.lessons.map((l) => ({ name: l.name, hMin: l.hMin, hMax: l.hMax })) })),
        importedAt: new Date().toISOString().slice(0, 10) });
      added.push(p.name);
      return;
    }
    let n = 0;
    for (const ps of p.sections) {
      let s = c.sections.find((x) => low(x.name) === low(ps.name));
      if (!s) { s = { name: ps.name, lessons: [] }; c.sections.push(s); }
      for (const l of ps.lessons) {
        if (!s.lessons.some((x) => low(x.name) === low(l.name))) { s.lessons.push({ name: l.name, hMin: l.hMin, hMax: l.hMax }); n++; }
      }
    }
    if (n) { c.importedAt = new Date().toISOString().slice(0, 10); updated.push({ name: c.name, lessons: n }); } else same.push(c.name);
  });
  return { courses: list, added, updated, same };
}

/** Plik z kursami do zachowania (i ponownego wczytania): bez odhaczeń, tylko spis. */
export function coursesFileJson(courses) {
  return JSON.stringify({ type: 'kalendarz-stazysty-kursy', version: 1, savedAt: new Date().toISOString().slice(0, 10),
    courses: (courses || []).map((c) => ({ name: c.name, domain: c.domain, sections: c.sections.map((s) => ({ name: s.name, lessons: s.lessons.map((l) => ({ name: l.name, hMin: l.hMin, hMax: l.hMax })) })) })) }, null, 1);
}

/* ---------- Czas na naukę z grafiku stażu ---------- */

/**
 * Godziny nauki dzień po dniu (od jutra/od daty do dnia przed egzaminem).
 * Rodzaj dnia: urlop -> hVacation; weekend/święto/dzień wolny -> hWeekend;
 * dzień dyżuru albo dzień po dyżurze -> hDuty; zwykły dzień -> hWork; L4 i opieka -> 0 h.
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
    else if (abs && abs.kind === 'event' && ['l4', 'opieka'].includes(abs.type)) return { date: d, kind: 'sick', hours: 0 }; // L4 / opieka – bez nauki
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
  // Plan podejść: najbliższy LEK (examDate) może być treningiem przed ostatecznym LEK (finalDate)
  finalLater: false, // true = najbliższy LEK to nie ostateczny
  finalDate: '', // termin ostatecznego LEK (orientacyjny – można zmienić)
  finalBase: true, // czy na ostatecznym LEK będzie jawna baza CEM
  midExams: [], // podejścia pośrednie (treningowe) między najbliższym a ostatecznym LEK: [{ date, base }]
  reviewMin: 10, // minut na jedną powtórkę tematu (0 = plan nie rezerwuje czasu na powtórki)
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

/**
 * Dziedziny, których bez własnego kursu uczymy się wyłącznie z bazy pytań CEM (lekcje z innych kursów
 * pokrywają je tylko szczątkowo – decyzja właściciela 11.2026). Kurs przypisany do takiej dziedziny działa normalnie.
 */
export const BASE_ONLY = ['etyka', 'zp', 'orz'];

/**
 * Dziedziny LEK lekcji: najpierw dziedzina kursu, potem dziedziny rozpoznane z PEŁNEJ nazwy działu i lekcji
 * (słownik wyrażeń medycznych w lek-domains.js – np. nadciśnienie: interna + medycyna rodzinna).
 */
export function lessonDomains(courseDomain, section, name) {
  return classifyLesson(courseDomain, section, name, DOMAIN_IDS, BASE_ONLY).domains;
}

/** To samo z wyjaśnieniem: które słowa nazwy zadecydowały o dziedzinach (okno „Dziedziny lekcji”). */
export function explainLesson(courseDomain, section, name) {
  return classifyLesson(courseDomain, section, name, DOMAIN_IDS, BASE_ONLY);
}

/** Wszystkie lekcje z zaimportowanych kursów z informacją o dziedzinie i czasie (z ręcznymi poprawkami dziedzin). */
export function allLessons(study, pace = 'fast') {
  const out = [];
  const fix = study.domainFix || {};
  for (const c of study.courses || []) {
    for (const s of c.sections || []) {
      for (const l of s.lessons || []) {
        const lo = l.hMin ?? 1.5;
        const hi = l.hMax ?? lo + 1;
        const key = lessonKey(c.name, s.name, l.name);
        const manual = Array.isArray(fix[key]) ? fix[key].filter((d) => DOMAIN_IDS.includes(d)) : null;
        out.push({ key, course: c.name, courseId: c.id, domain: c.domain, section: s.name,
          name: l.name, hours: lessonHours(lo, hi, pace), domains: manual || lessonDomains(c.domain, s.name, l.name), manual: !!manual });
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
/**
 * Pokrycie dziedzin LEK. Lekcja liczy się do każdej swojej dziedziny. Ile materiału „trzeba” na dziedzinę:
 * proporcjonalnie do liczby pytań (godziny kursów na 1 pytanie w dziedzinach z własnym kursem) – dzięki temu
 * dziedzina bez kursu z jedną pasującą lekcją nie wygląda na przerobioną w 100%.
 */
export function domainCoverage(lessons, chosenKeys) {
  const own = DOMAINS.filter((d) => lessons.some((l) => l.domain === d.id));
  const ownHours = lessons.filter((l) => DOMAIN_IDS.includes(l.domain)).reduce((a, l) => a + l.hours, 0);
  const ownQ = own.reduce((a, d) => a + d.q, 0);
  const perQ = ownQ ? ownHours / ownQ : 0;
  return DOMAINS.map((d) => {
    const ls = lessons.filter((l) => (l.domains || [l.domain]).includes(d.id));
    const all = ls.reduce((a, l) => a + l.hours, 0);
    const got = ls.filter((l) => chosenKeys.has(l.key)).reduce((a, l) => a + l.hours, 0);
    const hasOwn = own.includes(d);
    const needH = hasOwn ? all : Math.max(all, d.q * perQ);
    const baseOnly = !hasOwn && BASE_ONLY.includes(d.id);
    return { id: d.id, name: d.name, q: d.q, own: hasOwn, baseOnly, lessons: ls.length, hours: all, got, cov: needH ? Math.min(1, got / needH) : 0 };
  });
}
/**
 * Onkologia na LEK: co najmniej 30 pytań w ramach chorób wewnętrznych, pediatrii, chirurgii, ginekologii i medycyny rodzinnej
 * (rozp. MZ, Dz.U. 2021 poz. 828 – t.j. Dz.U. 2023 poz. 105). Lekcja „onkologiczna” = w nazwie lekcji słowa o nowotworach.
 */
const ONCO_PREFIX = ['nowotw', 'białacz', 'chłoniak', 'szpiczak', 'mięsak', 'czerniak', 'onkolog', 'hematoonkolog', 'przerzut', 'chemioterap', 'radioterap', 'mielodysplast', 'mieloprolif'];
const ONCO_WORD = new Set(['rak', 'raka', 'raki', 'raków', 'guz', 'guza', 'guzy', 'guzów']);
export function isOncology(l) {
  // Tylko nazwa lekcji – nazwa działu („Hematologia i onkologia dziecięca”) obejmuje też tematy nienowotworowe
  const words = String(l.name || '').toLowerCase().match(/[a-ząćęłńóśźż]+/g) || [];
  return words.some((w) => ONCO_WORD.has(w) || ONCO_PREFIX.some((p) => w.startsWith(p)));
}

/** Pokrycie onkologii: { lessons, hours, got, cov } – ważone częstością na LEK (exp), gdy jest baza CEM, inaczej godzinami. */
export function oncologyCoverage(lessons, chosenKeys) {
  const ls = lessons.filter(isOncology);
  const w = (l) => (l.exp != null ? l.exp : l.hours);
  const all = ls.reduce((a, l) => a + w(l), 0);
  const got = ls.filter((l) => chosenKeys.has(l.key)).reduce((a, l) => a + w(l), 0);
  return { lessons: ls.length, hours: ls.reduce((a, l) => a + l.hours, 0), cov: all ? Math.min(1, got / all) : 0 };
}

export function coverage(lessons, chosenKeys) {
  const tot = DOMAINS.reduce((a, d) => a + d.q, 0);
  return tot ? domainCoverage(lessons, chosenKeys).reduce((a, d) => a + d.q * d.cov, 0) / tot : 0;
}

/** Ostateczny LEK (gdy najbliższe podejście jest treningiem) – albo null, gdy najbliższy LEK jest ostateczny. */
export function finalExam(survey) {
  if (!survey.finalLater || !survey.finalDate || survey.finalDate <= survey.examDate) return null;
  return { date: survey.finalDate, base: survey.finalBase !== false };
}

/**
 * Wszystkie podejścia po kolei: najbliższy LEK, podejścia pośrednie (treningowe) i ostateczny LEK.
 * Podejścia pośrednie poza przedziałem (najbliższy, ostateczny) albo z tą samą datą są pomijane.
 */
export function examPlan(survey) {
  const s = { ...DEFAULT_SURVEY, ...survey };
  const fin = finalExam(s);
  const first = { date: s.examDate, mode: fin ? s.mode : s.mode, base: s.base !== false, final: !fin };
  if (!fin) return [first];
  const mids = [...new Map((s.midExams || []).filter((m) => m?.date && m.date > s.examDate && m.date < fin.date)
    .map((m) => [m.date, { date: m.date, mode: 'trening', base: m.base !== false, final: false }])).values()]
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return [first, ...mids, { date: fin.date, mode: 'serio', base: fin.base, final: true }];
}

const INTRO = /^(wstęp|podstawy|wprowadzenie)\b/i;
const MIN_PER_Q_1 = 1.5; // pierwsze przejście bazy: ok. 1,5 min na pytanie (z wyjaśnieniem)
const MIN_PER_Q_2 = 1.0; // drugie przejście (pytania już znane): ok. 1 min
/** Data, od której wg projektu UD384 (nieprzyjętego) mogłaby zniknąć jawna baza CEM. */
export const UD384_FROM = '2027-05-01';

/**
 * Te same tematy w kilku kursach (np. „Medycyna paliatywna” w internie, ratunkowej i onkologii):
 * liczymy je raz – w kursie dziedziny z największą liczbą pytań na LEK. Zwraca Map: klucz lekcji -> klucz „główny”.
 */
export function duplicateMap(lessons) {
  const groups = new Map();
  lessons.forEach((l, i) => {
    const k = l.name.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ l, i });
  });
  const q = (l) => (DOMAIN_IDS.includes(l.domain) ? domainOf(l.domain).q : 0);
  const map = new Map();
  for (const g of groups.values()) {
    const main = [...g].sort((a, b) => q(b.l) - q(a.l) || a.i - b.i)[0].l;
    for (const { l } of g) map.set(l.key, main.key);
  }
  return map;
}

/** Główna dziedzina lekcji: dziedzina kursu (jeśli jest dziedziną LEK), inaczej pierwsza rozpoznana z nazwy. */
const mainDomain = (l) => (DOMAIN_IDS.includes(l.domain) ? l.domain : (l.domains || [])[0] || null);

/**
 * Buduje plan od dnia `today`:
 *  – jedno podejście (najbliższy LEK jest ostateczny) albo dwa etapy: do treningowego LEK (cała baza CEM + najważniejsze lekcje)
 *    i od niego do ostatecznego LEK (reszta lekcji, na końcu drugie przejście bazy), ostatni tydzień przed egzaminem = powtórka,
 *  – czas na lekcje dzielony między dziedziny proporcjonalnie do liczby pytań na LEK (słabsza ×1,3, mocniejsza ×0,7),
 *  – w dziedzinie najpierw tematy najczęstsze na LEK w przeliczeniu na godzinę (baza CEM – opts.cem), „Wstęp do…” razem ze swoim działem,
 *  – ten sam temat z kilku kursów liczony raz, odhaczenie w jednym kursie = zrobione wszędzie,
 *  – czego nie zmieścimy -> „pominięte” (z powodem).
 * opts: { cem – indeks bazy CEM (lek-freq.js), reviewHours(date) – godziny powtórek danego dnia }.
 */
export function buildPlan(state, plan, today, opts = {}) {
  const survey = { ...DEFAULT_SURVEY, ...plan.survey };
  const study = state.study || {};
  const done = study.done || {};
  const cem = opts.cem || null;
  const final = finalExam(survey);
  const factor = STYLE_FACTOR[survey.style] || 1;
  const skipped = new Set(plan.skip || []);
  const must = new Set(plan.must || []);

  // Lekcje: czas wg tempa i stylu, częstość na LEK z bazy CEM, duplikaty
  const all = allLessons(study, survey.pace).map((l) => ({ ...l, hours: Math.round(l.hours * factor * 10) / 10 }));
  const yields = topicYield(all, cem);
  const dup = duplicateMap(all);
  const groupDone = new Set(all.filter((l) => done[l.key]).map((l) => dup.get(l.key)));
  const lessons = all.map((l, idx) => ({ ...l, idx, exp: yields ? yields.get(l.key)?.exp || 0 : null, mainKey: dup.get(l.key) }));
  const isDone = (l) => !!done[l.key] || groupDone.has(l.mainKey);
  const canon = lessons.filter((l) => l.mainKey === l.key);
  const doneKeys = new Set(canon.filter(isDone).map((l) => l.key));
  const todo = canon.filter((l) => !isDone(l));
  const dropped = [];
  for (const l of lessons.filter((x) => x.mainKey !== x.key && !isDone(x))) {
    const m = lessons.find((x) => x.key === l.mainKey);
    dropped.push({ ...l, reason: `ten sam temat co w: ${m?.course || 'innym kursie'}`, dup: true });
  }

  // Kolejność wyboru (A + B): w dziedzinie wg częstości na LEK na godzinę; dziedziny przeplatane proporcjonalnie do pytań
  const score = new Map();
  for (const l of todo) score.set(l.key, yields ? (l.exp + 0.02) / Math.max(0.25, l.hours) : 0);
  if (yields) {
    // „Wstęp do…” / „Podstawy…” – tak ważne jak średnio lekcje jego działu (wchodzi razem z działem)
    const bySec = new Map();
    for (const l of todo) { const k = `${l.courseId}|${l.section}`; if (!bySec.has(k)) bySec.set(k, []); bySec.get(k).push(l); }
    for (const l of todo) {
      if (!INTRO.test(l.name)) continue;
      const sec = bySec.get(`${l.courseId}|${l.section}`);
      const avg = sec.reduce((a, x) => a + score.get(x.key), 0) / sec.length;
      score.set(l.key, Math.max(score.get(l.key), avg * 1.05));
    }
  }
  const queues = new Map();
  for (const l of todo) {
    if (skipped.has(l.key)) { dropped.push({ ...l, reason: 'pominięte przez Ciebie' }); continue; }
    const d = mainDomain(l);
    if (!d) { dropped.push({ ...l, reason: 'poza dziedzinami LEK – przypisz kurs do dziedziny, jeśli to potrzebne' }); continue; }
    if (!queues.has(d)) queues.set(d, []);
    queues.get(d).push(l);
  }
  for (const q of queues.values()) q.sort((a, b) => (must.has(b.key) - must.has(a.key)) || (score.get(b.key) - score.get(a.key)) || a.idx - b.idx);
  const order = todo.filter((l) => must.has(l.key) && !skipped.has(l.key) && mainDomain(l));
  const inOrder = new Set(order.map((l) => l.key));
  const taken = {};
  for (;;) {
    let pick = null;
    for (const [d, q] of queues) {
      while (q.length && inOrder.has(q[0].key)) q.shift();
      if (!q.length) continue;
      const r = (taken[d] || 0) / domainWeight(survey, d);
      if (!pick || r < pick.r) pick = { d, r };
    }
    if (!pick) break;
    const l = queues.get(pick.d).shift();
    order.push(l);
    inOrder.add(l.key);
    taken[pick.d] = (taken[pick.d] || 0) + l.hours;
  }

  // Etapy: do najbliższego LEK i (opcjonalnie) od niego do ostatecznego LEK
  const baseTotal = Number(survey.baseTotal) || cem?.total || 0;
  const baseLeft = Math.max(0, baseTotal - (Number(survey.baseDone) || 0));
  const mkStage = (i, from, exam, mode, withBase, basePlan, perQ = MIN_PER_Q_1, baseQ = baseLeft) => {
    const days = studyDays(state, survey, from, exam).map((d) => {
      const rv = opts.reviewHours ? Math.min(d.hours, opts.reviewHours(d.date) || 0) : 0;
      return { ...d, reviews: rv, free: d.hours - rv, review: toNum(exam) - toNum(d.date) <= 7 };
    });
    const hours = days.reduce((a, d) => a + d.hours, 0);
    const reviewsH = days.reduce((a, d) => a + d.reviews, 0);
    const reviewHours = days.filter((d) => d.review).reduce((a, d) => a + d.free, 0);
    const normal = days.filter((d) => !d.review).reduce((a, d) => a + d.free, 0);
    let baseHours;
    let baseNeed = 0;
    if (basePlan === 'all' || basePlan === 'second') { baseNeed = (baseQ * perQ) / 60; baseHours = Math.min(normal, baseNeed); }
    else baseHours = normal * (withBase ? (mode === 'trening' ? 0.55 : 0.4) : 0.2);
    return { i, from, exam, mode, withBase, basePlan, perQ, baseQ, days, hours, reviewsH, reviewHours, baseHours, baseNeed,
      learnHours: Math.max(0, normal - baseHours), chosen: [] };
  };
  // Każde podejście = etap. Przed każdym treningowym LEK: cała baza (1. przejście ok. 1,5 min/pyt., kolejne ok. 1 min)
  // + najważniejsze lekcje; przed ostatecznym: reszta lekcji, kolejne przejście bazy na końcu etapu.
  const exams = examPlan(survey).filter((e, i, arr) => e.date > today || i === arr.length - 1);
  const stages = [];
  let passes = 0;
  exams.forEach((e, i) => {
    const prev = i ? exams[i - 1].date : null;
    const from = prev && addDays(prev, 1) > today ? addDays(prev, 1) : today;
    let plan = 'share';
    if (exams.length > 1 && e.base) plan = e.final && passes ? 'second' : 'all';
    const perQ = passes ? MIN_PER_Q_2 : MIN_PER_Q_1;
    const st = mkStage(i, from, e.date, e.mode, e.base, plan, perQ, passes ? baseTotal : baseLeft);
    st.final = e.final;
    if (e.base) passes++;
    stages.push(st);
  });

  // Przydział lekcji do etapów wg kolejności (najważniejsze – do najbliższego LEK)
  const stageOf = new Map();
  for (const st of stages) {
    let left = st.learnHours;
    for (const l of order) {
      if (stageOf.has(l.key)) continue;
      if (l.hours <= left + 0.25) { stageOf.set(l.key, st.i); st.chosen.push(l); left -= l.hours; }
    }
  }
  for (const l of order) {
    if (stageOf.has(l.key)) continue;
    const d = domainOf(mainDomain(l));
    dropped.push({ ...l, reason: `brak czasu – ${d.name}: ${d.q} pytań na LEK${l.exp != null ? ` (ten temat: ok. ${String(l.exp).replace('.', ',')} pyt.)` : ''}` });
  }
  const chosen = order.filter((l) => stageOf.has(l.key));

  // Tygodnie (pn–nd) w każdym etapie; godziny na lekcje w tygodniu
  const weeks = [];
  for (const st of stages) {
    const ws = [];
    for (const d of st.days) {
      const wd = (new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7;
      if (!ws.length || wd === 0) ws.push({ start: d.date, end: d.date, hours: 0, normal: 0, reviews: 0, review: false, lessons: [], base: 0, lessonHours: 0, stage: st.i, cap: 0 });
      const w = ws[ws.length - 1];
      w.end = d.date;
      w.hours += d.hours;
      w.reviews += d.reviews;
      if (d.review) w.review = true; else w.normal += d.free;
    }
    const normalTotal = ws.reduce((a, w) => a + w.normal, 0);
    if (st.basePlan === 'second') {
      // Drugie przejście bazy – na końcu etapu (przed tygodniem powtórki)
      let need = st.baseHours;
      for (const w of [...ws].reverse()) { const b = Math.min(w.normal, need); w.base = b; need -= b; }
    } else {
      for (const w of ws) w.base = normalTotal ? (w.normal * st.baseHours) / normalTotal : 0;
    }
    for (const w of ws) {
      w.cap = Math.max(0, w.normal - w.base);
      const revDays = st.days.filter((d) => d.review && d.date >= w.start && d.date <= w.end);
      w.base = Math.round((w.base + revDays.reduce((a, d) => a + d.free, 0)) * 10) / 10;
    }
    // Kolejność nauki w etapie: dziedziny przeplatane wg wagi, w dziedzinie kolejność kursu (wstęp najpierw)
    const qs = new Map();
    for (const l of st.chosen) { const d = mainDomain(l); if (!qs.has(d)) qs.set(d, []); qs.get(d).push(l); }
    for (const q of qs.values()) q.sort((a, b) => a.idx - b.idx);
    const seq = [];
    const credit = {};
    while ([...qs.values()].some((q) => q.length)) {
      let best = null;
      for (const [d, q] of qs) { if (!q.length) continue; credit[d] = (credit[d] || 0) + domainWeight(survey, d); if (!best || credit[d] > credit[best]) best = d; }
      seq.push(qs.get(best).shift());
      credit[best] -= 100;
    }
    let qi = 0;
    for (const w of ws) {
      if (w.review && w.normal === 0) continue;
      while (qi < seq.length && (w.lessonHours + seq[qi].hours <= w.cap + 0.5 || (w.lessons.length === 0 && w.cap > 0.5))) {
        w.lessons.push(seq[qi]);
        w.lessonHours += seq[qi].hours;
        qi++;
      }
    }
    const lastLearn = [...ws].reverse().find((w) => !w.review) || ws[ws.length - 1];
    while (qi < seq.length && lastLearn) { lastLearn.lessons.push(seq[qi]); lastLearn.lessonHours += seq[qi].hours; qi++; }
    weeks.push(...ws);
  }

  // Szacunki: pokrycie tematów (ważone częstością na LEK, gdy jest baza CEM) i przerobiona baza
  const withDomain = canon.filter((l) => mainDomain(l));
  const totalExp = withDomain.reduce((a, l) => a + (l.exp || 0), 0);
  const k = (keys) => (yields && totalExp ? withDomain.filter((l) => keys.has(l.key)).reduce((a, l) => a + l.exp, 0) / totalExp : coverage(lessons, keys));
  const bNow = baseTotal ? (Number(survey.baseDone) || 0) / baseTotal : 0;
  const keysAll = new Set([...doneKeys, ...chosen.map((l) => l.key)]);
  const can = (st, perQ, left) => Math.min(left, Math.floor(((st.baseHours + st.reviewHours) * 60) / perQ));
  const st0 = stages[0];
  const baseCanDo = can(st0, st0.perQ, baseLeft);
  const doneQ = Number(survey.baseDone) || 0;
  const keysSoFar = new Set(doneKeys);
  let bPrev = baseTotal ? doneQ / baseTotal : 0;
  stages.forEach((st, i) => {
    for (const l of st.chosen) keysSoFar.add(l.key);
    let b = bPrev;
    if (st.withBase && baseTotal) {
      const first = st.baseQ === baseLeft && st.perQ === MIN_PER_Q_1;
      b = Math.max(bPrev, Math.min(1, ((first ? doneQ : 0) + can(st, st.perQ, st.baseQ)) / baseTotal));
    }
    st.k = k(new Set(keysSoFar));
    st.b = b;
    st.est = estimateScore(st.k, b, st.withBase);
    st.lessonHours = st.chosen.reduce((a, l) => a + l.hours, 0);
    st.baseShort = st.baseNeed > 0 && st.baseHours + 0.01 < st.baseNeed;
    if (st.withBase) bPrev = b;
  });
  const last = stages[stages.length - 1];
  const kNow = k(doneKeys);
  const kPlan = last.k;
  const estNow = estimateScore(kNow, bNow, survey.base);
  const estPlan = last.est;
  const target = survey.goal === 'pass' ? 56 : Math.max(56, Number(survey.targetPct) || 56);
  const needHours = todo.filter((l) => !skipped.has(l.key) && mainDomain(l)).reduce((a, l) => a + l.hours, 0);
  const plannedHours = chosen.reduce((a, l) => a + l.hours, 0);
  let verdict;
  if (estPlan >= target + 5) verdict = 'good';
  else if (estPlan >= target) verdict = 'tight';
  else verdict = 'hard';

  // Ostrzeżenia (E i inne)
  const warnings = [];
  const pctPlanned = needHours ? plannedHours / needHours : 1;
  if (needHours && pctPlanned < 0.3) {
    warnings.push(`Plan mieści ok. ${Math.round(pctPlanned * 100)}% lekcji (${Math.round(plannedHours)} z ${Math.round(needHours)} h). Wybrane są tematy najczęstsze na LEK – resztę nadrób pytaniami z bazy albo dodaj godzin w ankiecie.`);
  }
  for (const st of stages) {
    if (st.baseShort) warnings.push(`${st.final && stages.length > 1 ? 'Przed ostatecznym LEK' : `Do LEK ${st.exam.slice(8)}.${st.exam.slice(5, 7)}.${st.exam.slice(0, 4)}`} nie zmieścisz całej bazy CEM (potrzeba ok. ${Math.round(st.baseNeed)} h, jest ${Math.round(st.baseHours)} h) – dodaj godzin albo zmniejsz liczbę pytań do przerobienia.`);
  }
  const ud = stages.some((st) => st.withBase && st.exam >= UD384_FROM);
  if (ud) warnings.push('Projekt UD384 (jeszcze nieprzyjęty) zakłada likwidację jawnej bazy CEM od 1.05.2027 – sprawdź przepisy przed zapisami i w razie czego zmień w ankiecie „baza jawna”.');
  if (survey.base && !baseTotal) warnings.push('Wpisz w ankiecie liczbę pytań w bazie CEM – bez niej szacunek wyniku nie uwzględnia bazy.');

  return {
    survey, final, stages, days: stages.flatMap((s) => s.days), hoursTotal: stages.reduce((a, s) => a + s.hours, 0),
    learnHours: stages.reduce((a, s) => a + s.learnHours, 0), baseHours: stages.reduce((a, s) => a + s.baseHours, 0),
    reviewHours: stages.reduce((a, s) => a + s.reviewHours, 0), share: st0.learnHours + st0.baseHours ? st0.baseHours / (st0.learnHours + st0.baseHours) : 0,
    weeks, chosen, dropped, yields: !!yields,
    domains: domainCoverage(lessons.filter((l) => l.mainKey === l.key), keysAll), domainsNow: domainCoverage(lessons.filter((l) => l.mainKey === l.key), doneKeys),
    onco: oncologyCoverage(canon, keysAll), oncoNow: oncologyCoverage(canon, doneKeys),
    baseOnlyQ: domainCoverage(canon, doneKeys).filter((d) => d.baseOnly).reduce((a, d) => a + d.q, 0),
    lessonsTotal: canon.length, lessonsDone: doneKeys.size, needHours, plannedHours,
    baseTotal, baseLeft, baseCanDo, kNow, kPlan, estNow, estPlan, target, verdict, warnings,
    daysLeft: Math.max(0, toNum(survey.examDate) - toNum(today)),
    daysLeftFinal: final ? Math.max(0, toNum(final.date) - toNum(today)) : null,
  };
}

/** Tydzień, w którym jest dzień `today` (albo pierwszy przyszły). */
export function currentWeek(built, today) {
  return built.weeks.find((w) => w.start <= today && today <= w.end) || built.weeks.find((w) => w.start > today) || built.weeks[0] || null;
}
