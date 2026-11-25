import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/defaults.js';
import { dutyMonth, dutyBuckets, dutyRoomOn, fmtHM, dutyTotals, proposeDuties, proposalShortfall, dutyDayIssues } from '../js/engine.js';

const S = () => defaultState();
const duty = (id, date, minutes) => ({ id, date, minutes });

test('fmtHM', () => {
  assert.equal(fmtHM(605), '10 h 05 min');
  assert.equal(fmtHM(2420), '40 h 20 min');
  assert.equal(fmtHM(300), '5 h');
  assert.equal(fmtHM(45), '45 min');
  assert.equal(fmtHM(-605), '−10 h 05 min');
});

test('Tygodnie miesiąca: 1–7, 8–14, 15–21, 22–koniec (luty 2027: 22–28, styczeń: 22–31)', () => {
  const feb = dutyBuckets('2027-02');
  assert.deepEqual(feb.map((b) => [b.start, b.end]), [
    ['2027-02-01', '2027-02-07'], ['2027-02-08', '2027-02-14'], ['2027-02-15', '2027-02-21'], ['2027-02-22', '2027-02-28']]);
  assert.equal(dutyBuckets('2027-01').at(-1).end, '2027-01-31');
  assert.equal(dutyBuckets('2026-11').at(-1).end, '2026-11-30');
});

test('Norma: pełny miesiąc na bloku z dyżurami = 40 h 20 min', () => {
  const m = dutyMonth(S(), '2026-10');
  assert.equal(m.norm, 2420);
  assert.equal(m.dutyWeeks, 4);
});

test('Norma: maj 2027 cały na medycynie rodzinnej = 0', () => {
  assert.equal(dutyMonth(S(), '2027-05').norm, 0);
});

test('Norma: czerwiec 2027 – 1. tydzień rodzinna, potem noworodki/SOR = 30 h 15 min', () => {
  const m = dutyMonth(S(), '2027-06');
  assert.deepEqual(m.buckets.map((b) => b.dutyWeek), [false, true, true, true]);
  assert.equal(m.norm, 3 * 605);
});

test('Norma: 5 dni urlopu w miesiącu zmniejsza o 10 h 05 min, 4 dni – nie', () => {
  const st = S();
  st.events.push({ id: 'u', type: 'urlop', start: '2027-03-01', end: '2027-03-05' });
  assert.equal(dutyMonth(st, '2027-03').norm, 2420 - 605);
  st.events[0].end = '2027-03-04';
  assert.equal(dutyMonth(st, '2027-03').norm, 2420);
});

test('Suma, liczba i limit tygodnia', () => {
  const st = S();
  st.duties = [duty('a', '2027-03-02', 300), duty('b', '2027-03-04', 305), duty('c', '2027-03-09', 605)];
  const m = dutyMonth(st, '2027-03');
  assert.equal(m.total, 1210);
  assert.equal(m.count, 3);
  assert.equal(m.left, 2420 - 1210);
  assert.deepEqual(m.buckets.map((b) => b.minutes), [605, 605, 0, 0]);
  // dyżur 605 min jest nietypowy (USK2: 5 h 05 albo 5 h) – tylko informacja, bez ostrzeżenia
  assert.equal(m.warnings.filter((w) => w.level === 'warn').length, 0);
  assert.ok(m.warnings.some((w) => w.level === 'info' && w.text.includes('nietypowa')));
  st.duties.push(duty('d', '2027-03-06', 60));
  assert.ok(dutyMonth(st, '2027-03').warnings.some((w) => w.text.startsWith('Tydzień 1')));
});

test('Ostrzeżenia: ponad 8 dyżurów, dyżur w dniu urlopu i na med. rodzinnej', () => {
  const st = S();
  st.duties = Array.from({ length: 9 }, (_, i) => duty(`x${i}`, `2027-03-${String(i * 3 + 1).padStart(2, '0')}`, 60));
  assert.ok(dutyMonth(st, '2027-03').warnings.some((w) => w.text.includes('maksymalnie 8')));
  const st2 = S();
  st2.events.push({ id: 'u', type: 'urlop', start: '2027-03-01', end: '2027-03-01' });
  st2.duties = [duty('a', '2027-03-01', 300), duty('b', '2027-05-12', 300)];
  const w = [...dutyMonth(st2, '2027-03').warnings, ...dutyMonth(st2, '2027-05').warnings].map((x) => x.text);
  assert.ok(w.some((t) => t.includes('nieobecności')));
  assert.ok(w.some((t) => t.includes('Med. rodzinna')));
});

test('Ile zostało w tygodniu (przy edycji pomija edytowany dyżur)', () => {
  const st = S();
  st.duties = [duty('a', '2027-03-02', 300), duty('b', '2027-03-04', 200)];
  assert.equal(dutyRoomOn(st, '2027-03-06').room, 105);
  assert.equal(dutyRoomOn(st, '2027-03-06', 'b').room, 305);
  assert.equal(dutyRoomOn(st, '2027-03-08').room, 605);
});

test('Suma całego stażu i maksimum 413 h 25 min', () => {
  const st = S();
  st.duties = [duty('a', '2026-10-05', 605), duty('b', '2026-10-12', 605)];
  const t = dutyTotals(st);
  assert.equal(t.total, 1210);
  assert.equal(fmtHM(t.max), '413 h 25 min');
});

test('Zasady USK2: dyżur w sobotę, święto i w przerwie świątecznej 23–27.12 → ostrzeżenie; pn–pt bez', () => {
  const st = defaultState();
  st.duties = [
    { id: 'a', date: '2026-12-05', minutes: 305 }, // sobota
    { id: 'b', date: '2026-12-23', minutes: 300 }, // środa w przerwie świątecznej
    { id: 'c', date: '2026-12-07', minutes: 305 }, // poniedziałek – OK
  ];
  const w = dutyMonth(st, '2026-12').warnings.map((x) => x.text);
  assert.ok(w.some((t) => t.startsWith('05.12') && t.includes('soboty, niedziele i święta')));
  assert.ok(w.some((t) => t.startsWith('23.12') && t.includes('przerwa świąteczna')));
  assert.ok(!w.some((t) => t.startsWith('07.12')));
  st.duties = [{ id: 'd', date: '2026-11-11', minutes: 305 }]; // święto w środę
  assert.ok(dutyMonth(st, '2026-11').warnings.some((x) => x.text.startsWith('11.11') && x.text.includes('święta')));
});

test('Propozycja dyżurów na grudzień 2026: norma 40 h 20, 2 dyżury w tygodniu (5 h 05 + 5 h), bez weekendów i przerwy 23–27.12', () => {
  const st = defaultState();
  const p = proposeDuties(st, '2026-12');
  assert.equal(p.reduce((a, x) => a + x.minutes, 0), 2420);
  assert.ok(p.length <= 8);
  for (const x of p) {
    const wd = new Date(`${x.date}T00:00:00Z`).getUTCDay();
    assert.ok(wd >= 1 && wd <= 5, x.date);
    assert.ok(!(x.date >= '2026-12-23' && x.date <= '2026-12-27'), x.date);
    assert.ok([300, 305].includes(x.minutes));
    assert.equal(x.start, '15:35');
  }
  st.duties = p.map((x, i) => ({ id: `p${i}`, ...x }));
  const m = dutyMonth(st, '2026-12');
  assert.equal(m.left, 0);
  assert.deepEqual(m.warnings, []);
  assert.deepEqual(proposeDuties(st, '2026-12'), []); // norma zrobiona – nic więcej
});

test('Propozycja dyżurów: dolicza tylko brakujące, omija urlop; maj 2027 (medycyna rodzinna) – nic', () => {
  const st = defaultState();
  st.duties = [{ id: 'a', date: '2027-01-05', minutes: 305 }];
  st.events = [{ id: 'u', type: 'urlop', start: '2027-01-11', end: '2027-01-15' }];
  const p = proposeDuties(st, '2027-01');
  const m = dutyMonth(st, '2027-01');
  assert.equal(p.reduce((a, x) => a + x.minutes, 0), m.norm - 305);
  assert.ok(!p.some((x) => x.date >= '2027-01-11' && x.date <= '2027-01-15'));
  assert.ok(!p.some((x) => x.date === '2027-01-04' || x.date === '2027-01-06')); // odstęp od dyżuru 05.01
  assert.deepEqual(proposeDuties(defaultState(), '2027-05'), []);
});

test('Audyt B6: propozycja tylko pełnych dyżurów 5 h 05 / 5 h – nigdy kawałka', () => {
  const st = defaultState();
  // W tygodniu 1 grudnia już 300 min, w tygodniu 2 – 400 min (nietypowy wpis): zostaje 205 min miejsca
  st.duties = [{ id: 'a', date: '2026-12-01', minutes: 300 }, { id: 'b', date: '2026-12-08', minutes: 400 }];
  const p = proposeDuties(st, '2026-12');
  assert.ok(p.length > 0);
  assert.ok(p.every((x) => x.minutes === 305 || x.minutes === 300), p.map((x) => x.minutes).join(','));
  assert.ok(!p.some((x) => x.date >= '2026-12-08' && x.date <= '2026-12-14')); // 205 min miejsca – bez propozycji
  for (const ym of ['2026-10', '2026-11', '2026-12', '2027-01', '2027-06', '2027-08']) {
    assert.ok(proposeDuties(defaultState(), ym).every((x) => [300, 305].includes(x.minutes)));
  }
});

test('Audyt B7: tydzień kursu – propozycja zgłasza brakującą część normy zamiast jej nie zauważyć', () => {
  const st = defaultState();
  st.courses[0].start = '2027-01-18';
  st.courses[0].end = '2027-01-22';
  const p = proposeDuties(st, '2027-01');
  assert.ok(p.every((x) => x.date < '2027-01-18' || x.date > '2027-01-22'));
  assert.equal(proposalShortfall(st, '2027-01', p), 2420 - p.reduce((a, x) => a + x.minutes, 0));
  assert.ok(proposalShortfall(st, '2027-01', p) > 0);
  assert.equal(proposalShortfall(defaultState(), '2026-12'), 0);
});

test('Dyżur w dniu, w którym nie może się odbyć → ostrzeżenie (każdy powód)', () => {
  const st = defaultState();
  st.events.push({ id: 'u', type: 'l4', start: '2027-02-08', end: '2027-02-08' });
  const why = (d) => dutyDayIssues(st, d).map((x) => x.text).join(' | ');
  assert.match(why('2027-02-06'), /soboty, niedziele/); // sobota
  assert.match(why('2027-01-06'), /Trzech Króli/); // święto
  assert.match(why('2026-12-23'), /Dzień wolny za|przerwa/); // dzień wolny za 26.12 i przerwa
  assert.match(why('2027-02-08'), /nieobecności/); // L4
  assert.match(why('2027-05-12'), /bez dyżurów/); // med. rodzinna
  assert.match(why('2027-09-08'), /rezerwa/); // po blokach
  assert.match(why('2027-11-10'), /poza okresem stażu/);
  assert.equal(why('2027-02-09'), ''); // zwykły wtorek na internie
  st.duties = [{ id: 'z', date: '2027-02-06', minutes: 305 }];
  assert.ok(dutyMonth(st, '2027-02').issues.z.length);
});

test('Propozycja nie obejmuje dni, które już minęły (parametr „od”)', () => {
  const p = proposeDuties(defaultState(), '2026-12', '2026-12-10');
  assert.ok(p.length > 0 && p.every((x) => x.date >= '2026-12-10'));
});
