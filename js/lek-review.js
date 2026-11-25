// Powtórki tematów (spaced repetition) – czysta logika, w całości testowana.
//
// Po odhaczeniu lekcji temat wraca do powtórki: 1 → 3 → 7 → 14 → 30 dni, dalej co „odstęp × łatwość”.
// Po powtórce oceniasz: Trudne (wraca jutro, temat trudniejszy), Średnio (kolejny stopień), Łatwe (stopień dalej).
// Przed egzaminem: powtórka, która wypadłaby po LEK, jest przesuwana na 2 dni przed nim.
// Limit dziennie: zwykły dzień 3, dyżur / po dyżurze 1, weekend / święto / urlop 6, dzień przerwy i L4 – 0.
// Zaległe przechodzą na kolejne dni (najpierw trudne, potem najdłużej czekające).
import { addDays, toNum } from './dates.js';
import { allLessons, duplicateMap, studyDays, DEFAULT_SURVEY } from './lek.js';

export const LADDER = [1, 3, 7, 14, 30];
export const REVIEW_MIN = 10; // domyślnie minut na jedną powtórkę tematu (ankieta: reviewMin)
export const CAP = { work: 3, duty: 1, free: 6, vacation: 6, rest: 0, sick: 0 };
export const GRADES = { hard: 'Trudne', good: 'Średnio', easy: 'Łatwe' };

/** Następny odstęp (dni) i łatwość po ocenie. */
export function nextInterval(r, g) {
  const ivl = r?.ivl || 0;
  const ease = r?.ease || 2.5;
  if (g === 'hard') return { ivl: 1, ease: Math.max(1.3, Math.round((ease - 0.2) * 100) / 100) };
  const step = LADDER.findIndex((x) => x > ivl); // kolejny stopień drabinki
  const good = step >= 0 ? LADDER[step] : Math.round(ivl * ease);
  if (g === 'easy') {
    const e = step >= 0 && step + 1 < LADDER.length ? LADDER[step + 1] : Math.round(good * 1.3);
    return { ivl: e, ease: Math.round((ease + 0.15) * 100) / 100 };
  }
  return { ivl: good, ease };
}

/**
 * Ocena powtórki: zwraca nowy stan tematu { due, ivl, ease, reps, hist }.
 * `exams` – daty LEK (rosnąco): powtórka nie wypada po najbliższym egzaminie, tylko 2 dni przed nim.
 */
export function rate(r, g, today, exams = []) {
  // Pierwsza powtórka (dzień po lekcji) to już stopień „1 dzień” drabinki
  const n = nextInterval(r || { ivl: 1 }, g);
  let due = addDays(today, n.ivl);
  const exam = exams.find((d) => d > today);
  if (exam && due >= exam) {
    const before = addDays(exam, -2);
    due = before > today ? before : addDays(today, 1);
  }
  return { due, ivl: n.ivl, ease: n.ease, reps: (r?.reps || 0) + 1, hist: [...(r?.hist || []), [today, g]].slice(-20) };
}

/** Tematy do powtórek: zrobione lekcje (ten sam temat z kilku kursów – raz). */
export function reviewItems(study) {
  const ls = allLessons(study || {});
  const dup = duplicateMap(ls);
  const done = study?.done || {};
  const reviews = study?.reviews || {};
  const out = new Map();
  for (const l of ls) {
    const at = done[l.key];
    if (!at) continue;
    const key = dup.get(l.key);
    const main = ls.find((x) => x.key === key) || l;
    const prev = out.get(key);
    const doneAt = String(at).slice(0, 10);
    if (prev && prev.doneAt <= doneAt) continue;
    const r = reviews[key] || null;
    out.set(key, { key, name: main.name, section: main.section, course: main.course, doneAt, r, due: r?.due || addDays(doneAt, 1),
      hard: r?.hist?.length ? r.hist.at(-1)[1] === 'hard' : false });
  }
  return [...out.values()];
}

/** Rodzaj dnia do limitu powtórek (z grafiku stażu i ankiety). */
export function dayKind(state, survey, d) {
  return studyDays(state, { ...DEFAULT_SURVEY, ...(survey || {}) }, d, addDays(d, 1))[0]?.kind || 'work';
}

const byPriority = (a, b) => (b.hard - a.hard) || (a.due < b.due ? -1 : a.due > b.due ? 1 : 0) || (a.doneAt < b.doneAt ? -1 : 1);

/** Powtórki na dziś: { list (do limitu), more (zaległe ponad limit), cap, upcoming: { data: liczba } na 7 dni }. */
export function reviewsToday(state, survey, today) {
  const items = reviewItems(state.study).filter((x) => x.due <= today).sort(byPriority);
  const cap = CAP[dayKind(state, survey, today)] ?? 3;
  const upcoming = {};
  for (const x of reviewItems(state.study)) {
    if (x.due > today && toNum(x.due) - toNum(today) <= 7) upcoming[x.due] = (upcoming[x.due] || 0) + 1;
  }
  return { list: items.slice(0, cap), more: Math.max(0, items.length - cap), cap, upcoming };
}

/** Tematy najczęściej oceniane jako „Trudne” (Twoje słabe punkty). */
export function hardest(study, limit = 6) {
  return reviewItems(study).map((x) => ({ ...x, n: (x.r?.hist || []).filter((h) => h[1] === 'hard').length }))
    .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, limit);
}

/**
 * Przewidywana liczba powtórek dzień po dniu (do planu: tyle czasu odejmujemy od nauki nowych lekcji).
 * Zakłada oceny „Średnio”; lekcje z planu – przerobione na koniec swojego tygodnia. Zwraca Map: data -> liczba powtórek.
 */
export function projectReviews(state, built, today) {
  const kind = new Map(built.days.map((d) => [d.date, d.kind]));
  const items = reviewItems(state.study).map((x) => ({ due: x.due < today ? today : x.due, ivl: x.r?.ivl || 1 }));
  for (const w of built.weeks) for (const l of w.lessons) items.push({ due: addDays(w.end, 1), ivl: 1 });
  const out = new Map();
  const end = built.days.length ? built.days[built.days.length - 1].date : today;
  for (let d = today; d <= end; d = addDays(d, 1)) {
    const cap = CAP[kind.get(d) || 'work'] ?? 3;
    if (!cap) continue;
    const due = items.filter((x) => x.due <= d).sort((a, b) => (a.due < b.due ? -1 : 1)).slice(0, cap);
    for (const x of due) {
      const n = nextInterval({ ivl: x.ivl }, 'good');
      x.ivl = n.ivl;
      x.due = addDays(d, n.ivl);
    }
    if (due.length) out.set(d, due.length);
  }
  return out;
}
