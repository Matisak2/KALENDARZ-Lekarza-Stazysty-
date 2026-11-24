import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/defaults.js';
import { summarize, dayInfo, eventImpact, alerts } from '../js/engine.js';

const TODAY = '2026-11-24';

test('dayInfo: święto, weekend, blok z oddziałem, rezerwa', () => {
  const sum = summarize(defaultState(), TODAY);
  const wig = dayInfo(sum, '2026-12-24');
  assert.equal(wig.holiday.name, 'Wigilia');
  assert.equal(wig.block.id, 'pers2');
  assert.equal(wig.segment.hospital, 'usk1-police');
  assert.equal(wig.lost, null); // tryb "zaliczane"
  const sob = dayInfo(sum, '2026-11-28');
  assert.ok(sob.weekend);
  const off = dayInfo(sum, '2026-12-23');
  assert.equal(off.satOffFor, '2026-12-26');
  const res = dayInfo(sum, '2027-09-15');
  assert.ok(res.reserve);
  assert.equal(res.block, null);
  assert.ok(!dayInfo(sum, '2027-12-01').inStaz);
});

test('dayInfo: dzień odrabiania w rezerwie', () => {
  const st = defaultState();
  st.events.push({ id: 'l', type: 'l4', start: '2027-02-08', end: '2027-02-09' });
  const sum = summarize(st, TODAY);
  const d = dayInfo(sum, '2027-08-26');
  assert.equal(d.makeUp.blockId, 'int');
  assert.equal(dayInfo(sum, '2027-02-08').absence.type, 'l4');
  assert.equal(dayInfo(sum, '2027-02-08').lost.reason, 'l4');
});

test('eventImpact: urlop 2 tygodnie w pediatrii', () => {
  const st = defaultState();
  const imp = eventImpact(st, { id: 'n', type: 'urlop', start: '2027-08-09', end: '2027-08-20' }, TODAY);
  assert.equal(imp.calendarDays, 12);
  assert.equal(imp.workdays, 10);
  assert.equal(imp.vacationDays, 10);
  assert.equal(imp.vacationLeftAfter, 12);
  assert.equal(imp.perBlock.length, 1);
  assert.equal(imp.perBlock[0].block.id, 'ped');
  assert.equal(imp.perBlock[0].days, 10);
  assert.equal(Math.round(imp.perBlock[0].share * 100), 33);
  assert.equal(imp.freeBefore, 0);
  assert.equal(imp.freeAfter, 0); // urlop był już w puli
});

test('eventImpact: L4 przesuwa koniec stażu', () => {
  const imp = eventImpact(defaultState(), { id: 'n', type: 'l4', start: '2027-03-01', end: '2027-03-03' }, TODAY);
  assert.equal(imp.workdays, 3);
  assert.equal(imp.freeAfter, -3);
  assert.equal(imp.endBefore, '2027-10-31');
  assert.equal(imp.endAfter, '2027-11-04'); // 1.11 święto: 2,3,4 listopada
  assert.ok(imp.extends);
});

test('eventImpact: edycja istniejącego wpisu nie liczy go podwójnie', () => {
  const st = defaultState();
  st.events.push({ id: 'u', type: 'urlop', start: '2027-08-16', end: '2027-08-20' });
  const imp = eventImpact(st, { id: 'u', type: 'urlop', start: '2027-08-16', end: '2027-08-18' }, TODAY);
  assert.equal(imp.vacationDays, 3);
  assert.equal(imp.vacationLeftAfter, 19);
});

test('eventImpact: urlop na przełomie bloków dzieli się na dwa bloki', () => {
  const imp = eventImpact(defaultState(), { id: 'n', type: 'urlop', start: '2027-04-26', end: '2027-04-30' }, TODAY);
  assert.deepEqual(imp.perBlock.map((p) => [p.block.id, p.days]), [['anest', 3], ['rodz', 2]]);
});

test('Przypomnienie o kopii: brak wpisów – brak; są wpisy bez kopii – jest; kopia 10 dni temu – brak; 30 dni – jest', () => {
  const st = defaultState();
  const has = (s, t) => alerts(summarize(s, t)).some((a) => a.icon === '💾');
  assert.ok(!has(st, TODAY));
  st.duties.push({ id: 'd', date: '2026-11-03', minutes: 300 });
  assert.ok(has(st, TODAY));
  st.meta.lastBackup = '2026-11-14T10:00:00.000Z';
  assert.ok(!has(st, TODAY));
  assert.ok(has(st, '2026-12-14'));
});
