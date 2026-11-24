import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/defaults.js';
import { summarize, blockStats, buildContext, alerts } from '../js/engine.js';
import { eachDay, isWeekend, weekday } from '../js/dates.js';

const TODAY = '2026-11-24';
const S = () => defaultState();
const byId = (sum, id) => sum.stats.find((s) => s.block.id === id);

test('Harmonogram grupy 6: każdy blok zaczyna się w czwartek i kończy w środę', () => {
  for (const b of S().blocks) {
    assert.equal(weekday(b.start), 4, `${b.name} start`);
    assert.equal(weekday(b.end), 3, `${b.name} koniec`);
  }
});

test('Dni robocze w okresie umowy: 282 = 235 (bloki) + 47 (rezerwa)', () => {
  const all = eachDay('2026-10-01', '2027-10-31').filter((d) => !isWeekend(d)).length;
  assert.equal(all, 282);
  const sum = summarize(S(), TODAY);
  assert.equal(sum.stats.reduce((a, s) => a + s.workdaysInRange, 0), 235);
  assert.equal(sum.reserve.start, '2027-08-26');
  assert.equal(sum.reserve.workdays, 47);
});

test('Chirurgia 24.11.2026: 38 dni zrobione, 1 w bloku, 11.11 do odrobienia', () => {
  const sum = summarize(S(), TODAY);
  const chir = byId(sum, 'chir');
  assert.equal(chir.status, 'current');
  assert.equal(chir.required, 40);
  assert.equal(chir.planned, 39);
  assert.equal(chir.done, 38);
  assert.equal(chir.remainingInRange, 1);
  assert.equal(chir.makeUp, 1);
  assert.deepEqual(chir.lost.map((l) => l.date), ['2026-11-11']);
  assert.equal(sum.current.block.id, 'chir');
  assert.equal(sum.next.block.id, 'pers1');
});

test('Chirurgia plastyczna traci 5 z 20 dni (23.12 za 26.12, Wigilia, święta, Nowy Rok, Trzech Króli)', () => {
  const sum = summarize(S(), TODAY);
  const p = byId(sum, 'pers2');
  assert.deepEqual(p.lost.map((l) => l.date), ['2026-12-23', '2026-12-24', '2026-12-25', '2027-01-01', '2027-01-06']);
  assert.equal(p.makeUp, 5);
  assert.ok(alerts(sum).some((a) => a.title.startsWith('Chir. plastyczna: przepada 5 z 20')));
});

test('Tryb "odrabiane" (USK2): 9 dni do odrobienia, rezerwy brakuje 9 dni', () => {
  const sum = summarize(S(), TODAY);
  assert.equal(sum.reserve.makeUp, 9); // 1 chir + 5 plast + 1 interna + 2 rodzinna
  assert.equal(sum.reserve.coursesUnscheduled, 25);
  assert.equal(sum.reserve.vacationUnplanned, 22);
  assert.equal(sum.reserve.free, 47 - 9 - 25 - 22);
  assert.equal(sum.estimatedEnd, '2027-11-15'); // 9 dni roboczych po 31.10 (1.11 i 11.11 to święta)
});

test('Tryb "zaliczane" (poradnik OIL): święta liczą się do stażu, bilans wychodzi na zero', () => {
  const st = S();
  st.settings.holidayMode = 'zaliczane';
  const sum = summarize(st, TODAY);
  assert.equal(sum.reserve.makeUp, 0);
  assert.equal(sum.reserve.free, 0);
  assert.equal(sum.estimatedEnd, '2027-10-31');
  assert.equal(byId(sum, 'chir').done, 39);
});

test('Urlop kosztuje tyle samo w bloku i w rezerwie (bilans się nie zmienia)', () => {
  const base = summarize(S(), TODAY).reserve.free;
  const a = S();
  a.events.push({ id: 'u1', type: 'urlop', start: '2027-08-16', end: '2027-08-20' });
  const sa = summarize(a, TODAY);
  assert.equal(byId(sa, 'ped').makeUp, 5);
  assert.equal(sa.vacation.planned, 5);
  assert.equal(sa.reserve.free, base);
  const b = S();
  b.events.push({ id: 'u2', type: 'urlop', start: '2027-09-06', end: '2027-09-10' });
  const sb = summarize(b, TODAY);
  assert.equal(sb.reserve.absences, 5);
  assert.equal(sb.reserve.free, base);
});

test('Urlop nie zużywa dni w święta ani w dzień wolny za sobotę', () => {
  const st = S();
  st.events.push({ id: 'u', type: 'urlop', start: '2026-12-21', end: '2026-12-31' });
  const sum = summarize(st, TODAY);
  assert.equal(sum.vacation.planned, 6); // 21,22,28,29,30,31 (23,24,25 wolne)
  assert.equal(sum.vacation.left, 16);
});

test('L4 wydłuża: 3 dni L4 w bloku = 3 dni więcej do odrobienia', () => {
  const st = S();
  st.events.push({ id: 'l', type: 'l4', start: '2027-02-08', end: '2027-02-10' });
  const sum = summarize(st, TODAY);
  assert.equal(byId(sum, 'int').makeUp, 4);
  assert.equal(sum.reserve.free, -12);
});

test('Kurs w trakcie bloku: dni bloku przepadają, a kurs przestaje być "bez terminu"', () => {
  const st = S();
  st.courses.find((c) => c.id === 'krew').start = '2027-03-01';
  st.courses.find((c) => c.id === 'krew').end = '2027-03-05';
  const sum = summarize(st, TODAY);
  assert.equal(byId(sum, 'int').makeUp, 6);
  assert.equal(sum.reserve.coursesUnscheduled, 20);
  assert.equal(sum.reserve.free, -9);
});

test('Kurs piątek–sobota zabiera tylko piątek', () => {
  const st = S();
  const bol = st.courses.find((c) => c.id === 'bol');
  bol.start = '2027-06-04'; // piątek
  bol.end = '2027-06-05';   // sobota
  const sum = summarize(st, TODAY);
  assert.equal(byId(sum, 'rodz').makeUp, 3);
  assert.equal(sum.reserve.free, -8);
});

test('Plan odrabiania zaczyna się 26.08.2027 od chirurgii', () => {
  const sum = summarize(S(), TODAY);
  assert.equal(sum.makeUpPlan[0].date, '2027-08-26');
  assert.equal(sum.makeUpPlan[0].blockId, 'chir');
  assert.equal(sum.makeUpPlan.length, 9);
  assert.ok(sum.makeUpPlan.every((m) => !m.beyondEnd));
});

test('Dzień wolny za 01.05.2027 – po wpisaniu daty przepada w bloku', () => {
  const st = S();
  st.settings.saturdayDaysOff['2027-05-01'] = '2027-05-04';
  const sum = summarize(st, TODAY);
  assert.equal(byId(sum, 'rodz').makeUp, 3);
  assert.ok(!alerts(sum).some((a) => a.title.includes('Święto Pracy')));
  assert.ok(alerts(summarize(S(), TODAY)).some((a) => a.title.includes('Święto Pracy')));
});

test('Przypomnienie o zapisach na LEK pojawia się na 30 dni przed terminem', () => {
  const a = alerts(summarize(S(), TODAY));
  const lek = a.find((x) => x.title.includes('LEK (wiosna 2027)'));
  assert.ok(lek);
  assert.equal(lek.level, 'urgent');
  assert.equal(lek.detail, 'Zostało 6 dni');
  assert.ok(!alerts(summarize(S(), '2026-10-15')).some((x) => x.title.includes('LEK (wiosna 2027)')));
});

test('Pula urlopu: 22 dni (5 + 17)', () => {
  const sum = summarize(S(), TODAY);
  assert.equal(sum.vacation.total, 22);
});

test('Przed stażem i po stażu', () => {
  const before = summarize(S(), '2026-09-20');
  assert.equal(before.current, null);
  assert.equal(before.next.block.id, 'chir');
  const after = summarize(S(), '2027-09-01');
  assert.equal(after.current, null);
  assert.ok(after.stats.every((s) => s.status === 'past'));
});

test('Postęp programu: 260 dni (235 bloków + 25 kursów)', () => {
  const sum = summarize(S(), TODAY);
  assert.equal(sum.program.total, 260);
  assert.equal(sum.program.done, 38);
});
