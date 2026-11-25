import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/defaults.js';
import { lessonKey, studyDays, DEFAULT_SURVEY, buildPlan } from '../js/lek.js';
import { nextInterval, rate, reviewItems, reviewsToday, projectReviews, hardest } from '../js/lek-review.js';

const course = (name, domain, lessons) => ({ id: `c-${name}`, name, domain, sections: [{ name: 'Dział', lessons: lessons.map((n) => ({ name: n, hMin: 1, hMax: 2 })) }] });
const key = (c, l) => lessonKey(c, 'Dział', l);

test('Odstępy powtórek: 1 → 3 → 7 → 14 → 30, dalej × łatwość; Trudne = jutro, Łatwe = stopień dalej', () => {
  assert.equal(nextInterval(null, 'good').ivl, 1);
  assert.equal(nextInterval({ ivl: 1 }, 'good').ivl, 3);
  assert.equal(nextInterval({ ivl: 3 }, 'good').ivl, 7);
  assert.equal(nextInterval({ ivl: 14 }, 'good').ivl, 30);
  assert.equal(nextInterval({ ivl: 30, ease: 2.5 }, 'good').ivl, 75);
  assert.equal(nextInterval({ ivl: 7 }, 'easy').ivl, 30);
  const h = nextInterval({ ivl: 14, ease: 2.5 }, 'hard');
  assert.equal(h.ivl, 1);
  assert.equal(h.ease, 2.3);
});

test('Powtórka nie wypada po LEK – przesuwana na 2 dni przed egzaminem', () => {
  const r = rate({ ivl: 14, ease: 2.5, reps: 3, hist: [] }, 'good', '2027-02-01', ['2027-02-20', '2027-09-15']);
  assert.equal(r.due, '2027-02-18'); // 30 dni wypadałoby po 20.02
  assert.equal(r.reps, 4);
  assert.deepEqual(r.hist.at(-1), ['2027-02-01', 'good']);
  assert.equal(rate(null, 'good', '2026-11-26').due, '2026-11-29'); // po pierwszej powtórce: za 3 dni
  assert.equal(rate(null, 'hard', '2026-11-26').due, '2026-11-27');
  // po treningowym LEK liczy się już ostateczny
  assert.equal(rate({ ivl: 7 }, 'good', '2027-03-01', ['2027-02-20', '2027-09-15']).due, '2027-03-15');
});

test('Tematy do powtórek: zrobione lekcje; ten sam temat w dwóch kursach – jedna powtórka', () => {
  const st = defaultState();
  st.study.courses = [course('Kurs z interny', 'int', ['Odleżyny', 'Astma']), course('Kurs z medycyny ratunkowej', 'rat', ['Odleżyny'])];
  st.study.done = { [key('Kurs z interny', 'Odleżyny')]: '2026-11-20', [key('Kurs z medycyny ratunkowej', 'Odleżyny')]: '2026-11-22' };
  const items = reviewItems(st.study);
  assert.equal(items.length, 1);
  assert.equal(items[0].due, '2026-11-21'); // pierwsza powtórka dzień po lekcji
});

test('Limit powtórek dziennie: dzień pracy 3, weekend 6, L4 0; najpierw trudne', () => {
  const st = defaultState();
  const names = Array.from({ length: 8 }, (_, i) => `Temat ${i + 1}`);
  st.study.courses = [course('Kurs z interny', 'int', names)];
  st.study.done = Object.fromEntries(names.map((n) => [key('Kurs z interny', n), '2026-11-10']));
  st.study.reviews = { [key('Kurs z interny', 'Temat 8')]: { due: '2026-11-20', ivl: 1, ease: 2.3, reps: 2, hist: [['2026-11-19', 'hard']] } };
  const work = reviewsToday(st, DEFAULT_SURVEY, '2026-11-25'); // środa
  assert.equal(work.list.length, 3);
  assert.equal(work.more, 5);
  assert.equal(work.list[0].name, 'Temat 8'); // ostatnio trudny – pierwszy
  assert.equal(reviewsToday(st, DEFAULT_SURVEY, '2026-11-28').list.length, 6); // sobota
  st.events = [{ id: 'l', type: 'l4', start: '2026-11-25', end: '2026-11-25' }];
  assert.equal(reviewsToday(st, DEFAULT_SURVEY, '2026-11-25').list.length, 0);
  assert.equal(studyDays(st, DEFAULT_SURVEY, '2026-11-25', '2026-11-26')[0].kind, 'sick');
  assert.equal(hardest(st.study)[0].name, 'Temat 8');
});

test('Plan rezerwuje czas na powtórki (mniej godzin na nowe lekcje)', () => {
  const st = defaultState();
  const names = Array.from({ length: 60 }, (_, i) => `Temat ${i + 1}`);
  st.study.courses = [course('Kurs z interny', 'int', names)];
  st.study.done = Object.fromEntries(names.slice(0, 20).map((n) => [key('Kurs z interny', n), '2026-11-20']));
  const plan = { id: 'p', survey: { examDate: '2027-02-20', base: false } };
  const b0 = buildPlan(st, plan, '2026-11-25');
  const load = projectReviews(st, b0, '2026-11-25');
  assert.ok([...load.values()].reduce((a, x) => a + x, 0) >= 20); // każdy zrobiony temat ma powtórki
  assert.ok([...load.values()].every((n) => n <= 6));
  const b = buildPlan(st, plan, '2026-11-25', { reviewHours: (d) => ((load.get(d) || 0) * 20) / 60 });
  assert.ok(b.learnHours < b0.learnHours);
});
