import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/defaults.js';
import { DOMAINS, parseCourseText, mergeCourse, guessDomain, studyDays, buildPlan, estimateScore, coverage, allLessons, lessonKey, DEFAULT_SURVEY } from '../js/lek.js';

const SAMPLE = `Kurs z Interny
ZMIEŃ KURS
Kurs
Baza pytań
Fiszki
PROPEDEUTYKA INTERNY (11)
ALERGOLOGIA (10)
Wstęp do alergologii
1.5h - 2.5h
Alergiczny nieżyt nosa
1h - 2h
Astma	2h - 3h
ANGIOLOGIA (9)
Choroby aorty piersiowej
1.5h - 2.5h
Tętniaki aorty brzusznej
1.5h - 2.5h
CHOROBY METABOLICZNE (8)
Wstęp do cukrzycy
1.5h - 2.5h
Hipoglikemia
`;

test('Wagi dziedzin LEK sumują się do 200 pytań', () => {
  assert.equal(DOMAINS.reduce((a, d) => a + d.q, 0), 200);
});

test('Import spisu WNL: działy, lekcje, czasy, ostrzeżenia o zwiniętych działach', () => {
  const p = parseCourseText(SAMPLE);
  assert.equal(p.name, 'Kurs z Interny');
  assert.equal(p.domain, 'int');
  const alerg = p.sections.find((s) => s.name === 'ALERGOLOGIA');
  assert.deepEqual(alerg.lessons.map((l) => [l.name, l.hMin, l.hMax]), [
    ['Wstęp do alergologii', 1.5, 2.5], ['Alergiczny nieżyt nosa', 1, 2], ['Astma', 2, 3]]);
  const met = p.sections.find((s) => s.name === 'CHOROBY METABOLICZNE');
  assert.equal(met.lessons[1].name, 'Hipoglikemia');
  assert.equal(met.lessons[1].hMin, null);
  assert.ok(p.warnings.some((w) => w.includes('PROPEDEUTYKA INTERNY')));
  assert.ok(!p.sections.some((s) => s.lessons.some((l) => /Baza pytań|Fiszki|ZMIEŃ/i.test(l.name))));
});

test('Rozpoznawanie dziedziny po nazwie kursu', () => {
  assert.equal(guessDomain('Kurs z Pediatrii'), 'ped');
  assert.equal(guessDomain('Kurs z Ginekologii i Położnictwa'), 'gin');
  assert.equal(guessDomain('Kurs z Medycyny Ratunkowej'), 'rat');
  assert.equal(guessDomain('Kurs z Psychiatrii'), 'psych');
  assert.equal(guessDomain('Kurs z Neurologii'), 'inne');
});

test('Ponowne wklejenie kursu zachowuje id i dziedzinę; klucze lekcji stałe', () => {
  const a = mergeCourse([], parseCourseText(SAMPLE));
  a[0].domain = 'int';
  const b = mergeCourse(a, parseCourseText(SAMPLE));
  assert.equal(b.length, 1);
  assert.equal(b[0].id, a[0].id);
  assert.equal(lessonKey('Kurs z Interny', 'ALERGOLOGIA', 'Astma'), allLessons({ courses: b }).find((l) => l.name === 'Astma').key);
});

test('Godziny nauki z grafiku: dyżur i dzień po dyżurze, weekend, urlop, święto', () => {
  const st = defaultState();
  st.duties = [{ id: 'd', date: '2026-12-01', minutes: 300 }];
  st.events = [{ id: 'u', type: 'urlop', start: '2026-12-07', end: '2026-12-07' }];
  const s = { ...DEFAULT_SURVEY, hWork: 2, hDuty: 0.5, hWeekend: 5, hVacation: 7 };
  const days = studyDays(st, s, '2026-11-30', '2026-12-09');
  const k = Object.fromEntries(days.map((d) => [d.date, d.kind]));
  assert.equal(k['2026-11-30'], 'work');
  assert.equal(k['2026-12-01'], 'duty');
  assert.equal(k['2026-12-02'], 'duty');
  assert.equal(k['2026-12-05'], 'free');
  assert.equal(k['2026-12-07'], 'vacation');
  assert.equal(days.at(-1).date, '2026-12-08');
  assert.equal(studyDays(st, s, '2026-12-24', '2026-12-26')[0].kind, 'free'); // Wigilia
});

test('Szacunek wyniku: rośnie z pokryciem i bazą; bez nauki ok. 20%', () => {
  assert.equal(estimateScore(0, 0, true), 20);
  assert.equal(estimateScore(0, 0, false), 20);
  assert.ok(estimateScore(0.5, 0.9, true) > 56);
  assert.ok(estimateScore(1, 1, false) <= 85);
});

test('Plan: lekcje rozłożone na tygodnie, za mało czasu -> część pominięta, wynik szacowany', () => {
  const st = defaultState();
  st.study = { courses: mergeCourse([], parseCourseText(SAMPLE)), done: {} };
  const plan = { id: 'p', survey: { examDate: '2026-12-20', hWork: 0.5, hDuty: 0, hWeekend: 1, hVacation: 2, base: false, mode: 'serio', goal: 'pass' } };
  const b = buildPlan(st, plan, '2026-11-25');
  assert.ok(b.hoursTotal > 0);
  assert.equal(b.chosen.length + b.dropped.length, b.lessonsTotal);
  assert.ok(b.dropped.length > 0);
  assert.ok(b.weeks.length >= 3);
  const inWeeks = b.weeks.reduce((a, w) => a + w.lessons.length, 0);
  assert.equal(inWeeks, b.chosen.length);
  assert.ok(['good', 'tight', 'hard'].includes(b.verdict));
});

test('Plan: dużo czasu -> wszystko zaplanowane; zrobione lekcje znikają z planu', () => {
  const st = defaultState();
  const courses = mergeCourse([], parseCourseText(SAMPLE));
  const all = allLessons({ courses });
  st.study = { courses, done: { [all[0].key]: '2026-11-20' } };
  const plan = { id: 'p', survey: { examDate: '2027-02-20', hWork: 2, hDuty: 1, hWeekend: 5, hVacation: 6, base: true, baseTotal: 2500, baseDone: 0 } };
  const b = buildPlan(st, plan, '2026-11-25');
  assert.equal(b.dropped.length, 0);
  assert.equal(b.chosen.length, all.length - 1);
  assert.equal(b.lessonsDone, 1);
  assert.ok(b.baseCanDo > 0);
  assert.equal(b.weeks.at(-1).lessons.length, 0); // ostatni tydzień = powtórka
});

test('Pominięcie i „muszę zrobić” wpływają na wybór', () => {
  const st = defaultState();
  const courses = mergeCourse([], parseCourseText(SAMPLE));
  const all = allLessons({ courses });
  st.study = { courses, done: {} };
  const b = buildPlan(st, { id: 'p', survey: { examDate: '2027-02-20' }, skip: [all[1].key] }, '2026-11-25');
  assert.ok(b.dropped.some((l) => l.key === all[1].key && l.reason.includes('przez Ciebie')));
});

test('Pokrycie: interna w całości = 39/200', () => {
  const courses = mergeCourse([], parseCourseText(SAMPLE));
  const ls = allLessons({ courses });
  assert.equal(Math.round(coverage(ls, new Set(ls.map((l) => l.key))) * 200), 39);
});
