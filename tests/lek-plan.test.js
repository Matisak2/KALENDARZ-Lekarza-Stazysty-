import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/defaults.js';
import { buildPlan, finalExam, examPlan, duplicateMap, allLessons, lessonKey } from '../js/lek.js';
import { prepareCem, topicYield, tokens, stem } from '../js/lek-freq.js';

// Zmyślony mini-indeks bazy CEM (rdzenie słów jak w scripts/cem.py)
const raw = (rows) => {
  const vocab = [];
  const q = rows.map(([d, text]) => `${d}|${tokens(text).map((s) => { if (!vocab.includes(s)) vocab.push(s); return vocab.indexOf(s); }).join(',')}`);
  return { vocab, q };
};
const CEM = prepareCem(raw([
  ...Array(6).fill(['int', 'nadciśnienie tętnicze leczenie pierwszego rzutu']),
  ...Array(2).fill(['int', 'kardiomiopatia przerostowa gradient']),
  ['int', 'wady zastawkowe stenoza aortalna'],
  ...Array(3).fill(['ped', 'zapalenie płuc u dzieci antybiotyk']),
  ['psych', 'schizofrenia leczenie'],
]));

const course = (name, domain, sections) => ({ id: `c-${name}`, name, domain, sections: sections.map(([sn, ls]) => ({ name: sn, lessons: ls.map((n) => ({ name: n, hMin: 2, hMax: 3 })) })) });

test('Częstość tematów: każde pytanie CEM liczy się raz – do najlepiej pasującej lekcji', () => {
  assert.equal(stem('kardiomiopatia'), 'kardiom');
  const courses = [course('Kurs z interny', 'int', [['Kardiologia', ['Nadciśnienie tętnicze', 'Kardiomiopatie', 'Wady zastawkowe']]]),
    course('Kurs z pediatrii', 'ped', [['Pulmonologia', ['Zapalenia płuc']]])];
  const ls = allLessons({ courses });
  const y = topicYield(ls, CEM);
  const g = (n) => y.get(ls.find((l) => l.name === n).key);
  assert.equal(g('Nadciśnienie tętnicze').n, 6);
  assert.equal(g('Kardiomiopatie').n, 2);
  assert.equal(g('Zapalenia płuc').n, 3);
  // oczekiwane pytania na LEK: interna 39 pytań / 9 pytań interny w bazie × 6
  assert.ok(Math.abs(g('Nadciśnienie tętnicze').exp - (39 / 9) * 6) < 0.01);
  const sum = [...y.values()].reduce((a, x) => a + x.n, 0);
  assert.ok(sum <= CEM.total);
});

test('A: w dziedzinie najpierw tematy najczęstsze na LEK; B: „Wstęp do…” razem ze swoim działem', () => {
  const st = defaultState();
  st.study.courses = [course('Kurs z interny', 'int', [['Kardiologia', ['Wstęp do kardiologii', 'Wady zastawkowe', 'Kardiomiopatie', 'Nadciśnienie tętnicze']]])];
  // ok. 5 h na lekcje: zmieszczą się 2 lekcje po 2 h
  const plan = { id: 'p', survey: { examDate: '2026-12-20', hWork: 0.5, hDuty: 0, hWeekend: 0, hVacation: 0, base: false } };
  const b = buildPlan(st, plan, '2026-11-25', { cem: CEM });
  const names = b.chosen.map((l) => l.name);
  assert.ok(names.includes('Nadciśnienie tętnicze'), names.join());
  assert.ok(!names.includes('Wady zastawkowe'));
  assert.ok(b.dropped.some((l) => l.name === 'Wady zastawkowe' && l.reason.includes('brak czasu')));
});

test('A: czas dzielony między dziedziny wg liczby pytań na LEK (psychiatria też dostaje lekcje)', () => {
  const st = defaultState();
  const many = (p, n) => Array.from({ length: n }, (_, i) => `${p} ${i + 1}`);
  st.study.courses = [course('Kurs z interny', 'int', [['Dział', many('Temat interny', 20)]]), course('Kurs z psychiatrii', 'psych', [['Dział', many('Temat psychiatrii', 20)]])];
  const b = buildPlan(st, { id: 'p', survey: { examDate: '2027-01-20', hWork: 1, hDuty: 1, hWeekend: 2, hVacation: 2, base: false } }, '2026-11-25');
  const n = (c) => b.chosen.filter((l) => l.course === c).length;
  assert.ok(n('Kurs z psychiatrii') > 0);
  assert.ok(n('Kurs z interny') > n('Kurs z psychiatrii')); // 39 vs 14 pytań
});

test('C: ten sam temat w kilku kursach liczony raz; zrobiony w jednym = zrobiony wszędzie', () => {
  const st = defaultState();
  st.study.courses = [course('Kurs z interny', 'int', [['Medycyna paliatywna', ['Odleżyny']]]), course('Kurs z medycyny ratunkowej', 'rat', [['Medycyna paliatywna', ['Odleżyny']]])];
  const ls = allLessons(st.study);
  const dm = duplicateMap(ls);
  assert.equal(dm.get(ls[1].key), ls[0].key); // interna ma więcej pytań na LEK – tam jest „główna” lekcja
  const b = buildPlan(st, { id: 'p', survey: { examDate: '2027-02-20' } }, '2026-11-25');
  assert.equal(b.lessonsTotal, 1);
  assert.ok(b.dropped.some((l) => l.dup && l.reason.includes('Kurs z interny')));
  st.study.done = { [lessonKey('Kurs z medycyny ratunkowej', 'Medycyna paliatywna', 'Odleżyny')]: '2026-11-20' };
  const b2 = buildPlan(st, { id: 'p', survey: { examDate: '2027-02-20' } }, '2026-11-25');
  assert.equal(b2.lessonsDone, 1);
  assert.equal(b2.chosen.length, 0);
});

test('Plan podejść: trening, potem ostateczny LEK – cała baza przed treningiem, drugie przejście bazy na końcu', () => {
  assert.equal(finalExam({ examDate: '2027-02-20', finalLater: true, finalDate: '2027-01-01' }), null);
  assert.equal(finalExam({ examDate: '2027-02-20', finalLater: false, finalDate: '2027-09-18' }), null);
  const st = defaultState();
  const many = (p, n) => Array.from({ length: n }, (_, i) => `${p} ${i + 1}`);
  st.study.courses = [course('Kurs z interny', 'int', [['Dział', many('Temat', 200)]])];
  const survey = { examDate: '2027-02-20', finalLater: true, finalDate: '2027-09-18', baseTotal: 2000, baseDone: 0 };
  const b = buildPlan(st, { id: 'p', survey }, '2026-11-25');
  assert.equal(b.stages.length, 2);
  const [s1, s2] = b.stages;
  assert.ok(Math.abs(s1.baseNeed - (2000 * 1.5) / 60) < 0.01); // cała baza: 50 h
  assert.ok(Math.abs(s1.baseHours - s1.baseNeed) < 0.01);
  assert.ok(Math.abs(s2.baseNeed - 2000 / 60) < 0.01); // drugie przejście: ok. 1 min na pytanie
  // etap 2: baza dopiero na końcu (pierwsze tygodnie etapu bez bazy, ostatnie tygodnie przed powtórką z bazą)
  const w2 = b.weeks.filter((w) => w.stage === 1 && !w.review);
  assert.equal(w2[0].base, 0);
  assert.ok(w2.at(-1).base > 0);
  // lekcje z etapu 1 są przed treningowym LEK, reszta – po nim
  assert.ok(b.weeks.filter((w) => w.stage === 0).every((w) => w.end < '2027-02-20'));
  assert.ok(b.weeks.filter((w) => w.stage === 1).every((w) => w.start > '2027-02-20'));
  assert.ok(s1.chosen.length > 0 && s2.chosen.length > 0);
  assert.ok(b.warnings.some((w) => w.includes('UD384')));
  // Brak ostatecznego LEK później = jeden etap jak dawniej
  assert.equal(buildPlan(st, { id: 'p', survey: { examDate: '2027-02-20' } }, '2026-11-25').stages.length, 1);
});

test('D: szacunek wyniku nie zakłada przerobionej bazy, gdy nie wiadomo, ile ma pytań', () => {
  const st = defaultState();
  st.study.courses = [course('Kurs z interny', 'int', [['Dział', ['Temat 1']]])];
  const b = buildPlan(st, { id: 'p', survey: { examDate: '2027-02-20', baseTotal: 0 } }, '2026-11-25');
  assert.ok(b.warnings.some((w) => w.includes('liczbę pytań w bazie')));
  const withCem = buildPlan(st, { id: 'p', survey: { examDate: '2027-02-20', baseTotal: 0 } }, '2026-11-25', { cem: CEM });
  assert.equal(withCem.baseTotal, CEM.total); // liczba pytań z indeksu bazy CEM
});

test('E: ostrzeżenie, gdy plan mieści mniej niż 30% lekcji', () => {
  const st = defaultState();
  st.study.courses = [course('Kurs z interny', 'int', [['Dział', Array.from({ length: 30 }, (_, i) => `Temat ${i + 1}`)]])];
  const b = buildPlan(st, { id: 'p', survey: { examDate: '2026-12-20', hWork: 0.5, hDuty: 0, hWeekend: 0, hVacation: 0, base: false } }, '2026-11-25');
  assert.ok(b.warnings.some((w) => w.startsWith('Plan mieści ok.')));
  const lots = buildPlan(st, { id: 'p', survey: { examDate: '2027-09-20', base: false } }, '2026-11-25');
  assert.ok(!lots.warnings.some((w) => w.startsWith('Plan mieści ok.')));
});

test('Plan podejść z treningiem pośrednim: cała baza przed każdym treningiem, na końcu kolejne przejście', () => {
  // podejścia pośrednie: tylko między najbliższym a ostatecznym, bez dubli, po kolei
  const ex = examPlan({ examDate: '2027-02-20', finalLater: true, finalDate: '2028-02-15',
    midExams: [{ date: '2027-09-15' }, { date: '2027-09-15' }, { date: '2026-12-01' }, { date: '2028-03-01' }, { date: '2027-06-01', base: false }] });
  assert.deepEqual(ex.map((e) => [e.date, e.mode, e.base, e.final]), [
    ['2027-02-20', 'trening', true, false], ['2027-06-01', 'trening', false, false], ['2027-09-15', 'trening', true, false], ['2028-02-15', 'serio', true, true]]);

  const st = defaultState();
  const many = (p, n) => Array.from({ length: n }, (_, i) => `${p} ${i + 1}`);
  st.study.courses = [course('Kurs z interny', 'int', [['Dział', many('Temat', 400)]])];
  const survey = { examDate: '2027-02-20', finalLater: true, finalDate: '2028-02-15', midExams: [{ date: '2027-09-15', base: true }], baseTotal: 2000, baseDone: 500 };
  const b = buildPlan(st, { id: 'p', survey }, '2026-11-25');
  assert.equal(b.stages.length, 3);
  const [s1, s2, s3] = b.stages;
  assert.deepEqual(b.stages.map((x) => [x.exam, x.basePlan, x.final]), [['2027-02-20', 'all', false], ['2027-09-15', 'all', false], ['2028-02-15', 'second', true]]);
  assert.ok(Math.abs(s1.baseNeed - (1500 * 1.5) / 60) < 0.01); // 1. przejście: reszta bazy, 1,5 min/pyt.
  assert.ok(Math.abs(s2.baseNeed - (2000 * 1.0) / 60) < 0.01); // 2. przejście: cała baza, 1 min/pyt.
  assert.ok(Math.abs(s3.baseNeed - (2000 * 1.0) / 60) < 0.01);
  // baza przed treningiem rozłożona na cały etap, przed ostatecznym – na końcu
  const w2 = b.weeks.filter((w) => w.stage === 1 && !w.review);
  assert.ok(w2[0].base > 0);
  const w3 = b.weeks.filter((w) => w.stage === 2 && !w.review);
  assert.equal(w3[0].base, 0);
  assert.ok(w3.at(-1).base > 0);
  // każdy etap ma lekcje; szacunek rośnie z etapu na etap
  assert.ok(s1.chosen.length && s2.chosen.length && s3.chosen.length);
  assert.ok(s1.est <= s2.est && s2.est <= s3.est);
  // po pierwszym LEK plan zaczyna się od etapu z treningiem pośrednim
  const later = buildPlan(st, { id: 'p', survey }, '2027-03-01');
  assert.deepEqual(later.stages.map((x) => x.exam), ['2027-09-15', '2028-02-15']);
});

test('Onkologia (≥30 pytań w dziedzinach klinicznych): lekcje o nowotworach i pokrycie planu', async () => {
  const { isOncology } = await import('../js/lek.js');
  assert.ok(isOncology({ section: 'Ginekologia', name: 'Rak szyjki macicy' }));
  assert.ok(isOncology({ section: 'Hematologia', name: 'Ostre białaczki' }));
  assert.ok(isOncology({ section: 'Podstawy onkologii', name: 'Pacjent onkologiczny' }));
  assert.ok(!isOncology({ section: 'Hematologia i onkologia dziecięca', name: 'Niedokrwistości' })); // dział nie decyduje
  assert.ok(!isOncology({ section: 'Onkologia ginekologiczna', name: 'Niezłośliwe choroby jajnika' }));
  assert.ok(!isOncology({ section: 'Chirurgia', name: 'Guzki krwawnicze' }));
  assert.ok(!isOncology({ section: 'Anestezjologia', name: 'Hipertermia złośliwa' }));
  const st = defaultState();
  st.study.courses = [course('Kurs z interny', 'int', [['Hematologia', ['Ostre białaczki', 'Chłoniaki', 'Niedokrwistości']]])];
  const b = buildPlan(st, { id: 'p', survey: { examDate: '2027-09-20', base: false } }, '2026-11-25');
  assert.equal(b.onco.lessons, 2);
  assert.equal(b.onco.cov, 1);
  assert.equal(b.oncoNow.cov, 0);
});
