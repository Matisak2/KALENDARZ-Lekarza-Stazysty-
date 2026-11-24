import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/defaults.js';
import { dutyMonth, dutyBuckets, dutyRoomOn, fmtHM, dutyTotals } from '../js/engine.js';

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
  assert.equal(m.warnings.length, 0);
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
