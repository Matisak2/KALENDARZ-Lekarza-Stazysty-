import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/defaults.js';
import { DOMAINS, parseCourseText, parseCoursesText, coursesFromFile, mergeCourse, guessDomain, studyDays, buildPlan, estimateScore, coverage, allLessons, lessonKey, DEFAULT_SURVEY } from '../js/lek.js';

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

test('Czas lekcji: domyślnie dolna granica przedziału WNL, do wyboru środek i górna', () => {
  const courses = mergeCourse([], parseCourseText(SAMPLE));
  const astma = (pace) => allLessons({ courses }, pace).find((l) => l.name === 'Astma').hours;
  assert.equal(astma(), 2);
  assert.equal(astma('mid'), 2.5);
  assert.equal(astma('slow'), 3);
  assert.equal(DEFAULT_SURVEY.pace, 'fast');
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

// Układ strony WNL z komputera (przykład zmyślony, ten sam kształt): dział + „(n)” + łączny czas,
// lekcja = powtórzona nazwa działu, tytuł, opis, czas, dzień tygodnia.
const DESKTOP = `Kurs Chirurgia
Dział pierwszy
(2)
2.5h - 4.5h
Środa
–
Czwartek

Dział pierwszy
Lekcja A
Opis lekcji A, punkt, punkt.
1h - 2h
Środa

Dział pierwszy
Lekcja B
Opis lekcji B.
1.5h - 2.5h
Czwartek

Dział drugi
(2)
2h - 4h
Piątek
–
Poniedziałek

Dział drugi
Lekcja C
Opis C.
1h - 2h
Piątek
KURS: Interna
Alergologia
(1)
1h - 2h
Wtorek
–
Wtorek

Alergologia
Astma
Astma, opis.
1h - 2h
Wtorek
`;

test('Import WNL z komputera: pomija dni tygodnia, myślniki, opisy i łączny czas działu', () => {
  const p = parseCourseText(DESKTOP.split('KURS:')[0]);
  assert.equal(p.name, 'Kurs Chirurgia');
  assert.equal(p.domain, 'chir');
  assert.deepEqual(p.sections.map((s) => [s.name, s.expected]), [['Dział pierwszy', 2], ['Dział drugi', 2]]);
  assert.deepEqual(p.sections[0].lessons.map((l) => [l.name, l.hMin, l.hMax]), [['Lekcja A', 1, 2], ['Lekcja B', 1.5, 2.5]]);
  assert.deepEqual(p.sections[1].lessons.map((l) => l.name), ['Lekcja C']);
  assert.deepEqual(p.warnings, ['Dział „Dział drugi”: 1 z 2 lekcji – rozwiń go w WNL i wklej ponownie.']);
});

test('Kilka kursów w jednym wklejeniu („Kurs …” / „KURS: …”)', () => {
  const ps = parseCoursesText(DESKTOP);
  assert.deepEqual(ps.map((p) => [p.name, p.domain]), [['Kurs Chirurgia', 'chir'], ['Kurs Interna', 'int']]);
  assert.deepEqual(ps[1].sections[0].lessons.map((l) => [l.name, l.hMin]), [['Astma', 1]]);
  // Układ z telefonu dalej działa przez to samo wejście
  assert.equal(parseCoursesText(SAMPLE)[0].name, 'Kurs z Interny');
});

test('Dni przerwy w nauce (ankieta): wybrane dni tygodnia mają 0 h', () => {
  const st = defaultState();
  const s = { ...DEFAULT_SURVEY, hWork: 2, hWeekend: 5, restDays: [3, 0] }; // środa i niedziela
  const days = studyDays(st, s, '2026-11-30', '2026-12-08');
  const k = Object.fromEntries(days.map((d) => [d.date, [d.kind, d.hours]]));
  assert.deepEqual(k['2026-12-02'], ['rest', 0]); // środa
  assert.deepEqual(k['2026-12-06'], ['rest', 0]); // niedziela
  assert.deepEqual(k['2026-12-05'], ['free', 5]); // sobota
  assert.deepEqual(k['2026-12-03'], ['work', 2]);
  // Stare plany bez pola restDays działają jak dotąd
  const { restDays, ...old } = s;
  assert.ok(studyDays(st, old, '2026-11-30', '2026-12-08').every((d) => d.kind !== 'rest'));
});

test('Import z komputera: tytuł kursu bez słowa „Kurs” i kolejny kurs w tym samym wklejeniu', () => {
  const txt = `Choroby egzotyczne
Dział X
(1)
1h - 2h
Środa

Dział X
Lekcja X1
Opis.
1h - 2h
Środa
Kurs z ginekologii
Dział Y
(1)
1h - 2h
Czwartek

Dział Y
Dział Y
Opis lekcji o nazwie jak dział.
1.5h - 2.5h
Czwartek`;
  const ps = parseCoursesText(txt);
  assert.deepEqual(ps.map((p) => [p.name, p.domain]), [['Choroby egzotyczne', 'inne'], ['Kurs z ginekologii', 'gin']]);
  assert.deepEqual(ps[0].sections.map((s) => [s.name, s.lessons.map((l) => l.name)]), [['Dział X', ['Lekcja X1']]]);
  assert.deepEqual(ps[1].sections[0].lessons.map((l) => [l.name, l.hMin]), [['Dział Y', 1.5]]);
  assert.deepEqual(ps.flatMap((p) => p.warnings), []);
});

test('Import z komputera: tytuł kursu sklejony z nazwą pierwszego działu, bez pustych linii', () => {
  const txt = `Kurs z interny Dział A
(2)
2h - 4h
Wtorek
–
Środa
Dział A
Lekcja 1
Opis 1.
1h - 2h
Wtorek
Dział A
Lekcja 2
Opis 2.
1h - 2h
Środa
Dział B
(1)
1.5h - 2.5h
Sobota
Dział B
Lekcja 3
Opis 3.
1.5h - 2.5h
Sobota`;
  const ps = parseCoursesText(txt);
  assert.equal(ps.length, 1);
  assert.equal(ps[0].name, 'Kurs z interny');
  assert.equal(ps[0].domain, 'int');
  assert.deepEqual(ps[0].sections.map((s) => [s.name, s.lessons.map((l) => l.name)]), [['Dział A', ['Lekcja 1', 'Lekcja 2']], ['Dział B', ['Lekcja 3']]]);
  assert.deepEqual(ps[0].warnings, []);
});

test('Plik z kursami: JSON (prywatny plik użytkownika) albo tekst z WNL', () => {
  const json = JSON.stringify({ type: 'kalendarz-stazysty-kursy', version: 1, courses: [
    { name: 'Kurs X', domain: 'ped', sections: [{ name: 'Dział', lessons: [{ name: 'L1', hMin: 1.5, hMax: 2.5 }, { name: '' }] }, { name: 'Pusty', lessons: [] }] },
    { name: 'Kurs z psychiatrii', domain: 'zle', sections: [{ name: 'D', lessons: [{ name: 'L', hMin: 'x' }] }] },
  ] });
  const ps = coursesFromFile(`\uFEFF${json}`);
  assert.deepEqual(ps.map((p) => [p.name, p.domain, p.sections.length]), [['Kurs X', 'ped', 1], ['Kurs z psychiatrii', 'psych', 1]]);
  assert.deepEqual(ps[0].sections[0].lessons, [{ name: 'L1', hMin: 1.5, hMax: 2.5 }]);
  assert.equal(ps[1].sections[0].lessons[0].hMin, null);
  const merged = ps.reduce((l, p) => mergeCourse(l, p), []);
  assert.equal(allLessons({ courses: merged }).length, 2);
  assert.equal(coursesFromFile(SAMPLE)[0].name, 'Kurs z Interny');
  assert.deepEqual(coursesFromFile('{"zle": 1}'), []);
});
