import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/defaults.js';
import { summarize, blockStats, buildContext, alerts } from '../js/engine.js';
import { eachDay, isWeekend, weekday } from '../js/dates.js';

const TODAY = '2026-11-24';
const S = () => defaultState();
const O = () => { const s = defaultState(); s.settings.holidayMode = 'odrabiane'; return s; };
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
  const sum = summarize(O(), TODAY);
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
  const sum = summarize(O(), TODAY);
  const p = byId(sum, 'pers2');
  assert.deepEqual(p.lost.map((l) => l.date), ['2026-12-23', '2026-12-24', '2026-12-25', '2027-01-01', '2027-01-06']);
  assert.equal(p.makeUp, 5);
  assert.ok(alerts(sum).some((a) => a.title.startsWith('Chir. plastyczna: przepada 5 z 20')));
});

test('Tryb "odrabiane" (USK2): 9 dni do odrobienia, rezerwy brakuje 9 dni', () => {
  const sum = summarize(O(), TODAY);
  assert.equal(sum.reserve.makeUp, 9); // 1 chir + 5 plast + 1 interna + 2 rodzinna
  assert.equal(sum.reserve.coursesUnscheduled, 25);
  assert.equal(sum.reserve.vacationUnplanned, 22);
  assert.equal(sum.reserve.free, 47 - 9 - 25 - 22);
  assert.equal(sum.estimatedEnd, '2027-11-15'); // 9 dni roboczych po 31.10 (1.11 i 11.11 to święta)
});

test('Domyślnie tryb "zaliczane" (poradnik OIL): święta liczą się do stażu, bilans wychodzi na zero', () => {
  const st = S();
  assert.equal(st.settings.holidayMode, 'zaliczane');
  const sum = summarize(st, TODAY);
  assert.equal(sum.reserve.makeUp, 0);
  assert.equal(sum.reserve.free, 0);
  assert.equal(sum.estimatedEnd, '2027-10-31');
  assert.equal(byId(sum, 'chir').done, 39);
});

test('Urlop kosztuje tyle samo w bloku i w rezerwie (bilans się nie zmienia)', () => {
  const base = summarize(O(), TODAY).reserve.free;
  const a = O();
  a.events.push({ id: 'u1', type: 'urlop', start: '2027-08-16', end: '2027-08-20' });
  const sa = summarize(a, TODAY);
  assert.equal(byId(sa, 'ped').makeUp, 5);
  assert.equal(sa.vacation.planned, 5);
  assert.equal(sa.reserve.free, base);
  const b = O();
  b.events.push({ id: 'u2', type: 'urlop', start: '2027-09-06', end: '2027-09-10' });
  const sb = summarize(b, TODAY);
  assert.equal(sb.reserve.absences, 5);
  assert.equal(sb.reserve.free, base);
});

test('Urlop nie zużywa dni w święta ani w dzień wolny za sobotę', () => {
  const st = O();
  st.events.push({ id: 'u', type: 'urlop', start: '2026-12-21', end: '2026-12-31' });
  const sum = summarize(st, TODAY);
  assert.equal(sum.vacation.planned, 6); // 21,22,28,29,30,31 (23,24,25 wolne)
  assert.equal(sum.vacation.left, 16);
});

test('L4 wydłuża: 3 dni L4 w bloku = 3 dni więcej do odrobienia', () => {
  const st = O();
  st.events.push({ id: 'l', type: 'l4', start: '2027-02-08', end: '2027-02-10' });
  const sum = summarize(st, TODAY);
  assert.equal(byId(sum, 'int').makeUp, 4);
  assert.equal(sum.reserve.free, -12);
});

test('Kurs w trakcie bloku: dni bloku przepadają, a kurs przestaje być "bez terminu"', () => {
  const st = O();
  st.courses.find((c) => c.id === 'krew').start = '2027-03-01';
  st.courses.find((c) => c.id === 'krew').end = '2027-03-05';
  const sum = summarize(st, TODAY);
  assert.equal(byId(sum, 'int').makeUp, 6);
  assert.equal(sum.reserve.coursesUnscheduled, 20);
  assert.equal(sum.reserve.free, -9);
});

test('Kurs piątek–sobota zabiera tylko piątek', () => {
  const st = O();
  const bol = st.courses.find((c) => c.id === 'bol');
  bol.start = '2027-06-04'; // piątek
  bol.end = '2027-06-05';   // sobota
  const sum = summarize(st, TODAY);
  assert.equal(byId(sum, 'rodz').makeUp, 3);
  assert.equal(sum.reserve.free, -8);
});

test('Plan odrabiania zaczyna się 26.08.2027 od chirurgii', () => {
  const sum = summarize(O(), TODAY);
  assert.equal(sum.makeUpPlan[0].date, '2027-08-26');
  assert.equal(sum.makeUpPlan[0].blockId, 'chir');
  assert.equal(sum.makeUpPlan.length, 9);
  assert.ok(sum.makeUpPlan.every((m) => !m.beyondEnd));
});

test('Dzień wolny za 01.05.2027 – po wpisaniu daty przepada w bloku', () => {
  const st = O();
  st.settings.saturdayDaysOff['2027-05-01'] = '2027-05-04';
  const sum = summarize(st, TODAY);
  assert.equal(byId(sum, 'rodz').makeUp, 3);
  assert.ok(!alerts(sum).some((a) => a.title.includes('Święto Pracy')));
  assert.ok(alerts(summarize(O(), TODAY)).some((a) => a.title.includes('Święto Pracy')));
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
  const sum = summarize(O(), TODAY);
  assert.equal(sum.program.total, 260);
  assert.equal(sum.program.done, 38);
});

test('Tryb "zaliczane": chirurgia plastyczna bez dni do odrobienia, urlop w bloku nadal do odrobienia', () => {
  const st = S();
  st.events.push({ id: 'u', type: 'urlop', start: '2027-08-16', end: '2027-08-20' });
  const sum = summarize(st, TODAY);
  assert.equal(byId(sum, 'pers2').makeUp, 0);
  assert.equal(byId(sum, 'ped').makeUp, 5);
  assert.equal(sum.reserve.free, 0);
  assert.ok(!alerts(sum).some((a) => a.title.includes('plastyczna')));
});

test('Terminy Kadr USK2 i formalności przed stażem poza USK2 (z odhaczaniem)', async () => {
  const { hospitalOf } = await import('../js/hospitals.js');
  const st = defaultState();
  const get = (t) => alerts(summarize(st, t));
  const nov = get('2026-11-25').find((a) => a.id === 'kp-2026-11');
  assert.ok(nov && nov.detail.includes('03.12'));
  assert.ok(!get('2026-12-04').some((a) => a.id === 'kp-2026-11'));
  assert.ok(get('2026-12-10').some((a) => a.id === 'kcp-2026-12'));
  st.settings.hrDone = { 'kp-2026-11': true };
  assert.ok(!get('2026-11-25').some((a) => a.id === 'kp-2026-11'));
  // Chirurgia dziecięca w Zdrojach od 26.11 – przypomnienie o piśmie i informacji do Kadr
  const b = st.blocks.find((x) => x.id === 'pers1');
  b.segments = [{ id: 's', start: b.start, end: b.end, hospital: 'zdroje', ward: '' }];
  assert.notEqual(hospitalOf(b.segments[0]).id, 'usk2');
  const ext = get('2026-11-20').find((a) => a.id?.startsWith('ext-pers1'));
  assert.ok(ext && ext.detail.includes('książeczki zdrowia'));
  b.segments[0].hospital = 'usk2';
  assert.ok(!get('2026-11-20').some((a) => a.id?.startsWith('ext-pers1')));
});

test('Pomysły na urlop: mosty i długie weekendy (1 dzień urlopu = 4+ dni wolnego)', async () => {
  const { vacationIdeas } = await import('../js/engine.js');
  const v = vacationIdeas(defaultState(), '2026-11-25');
  const by = (d) => v.find((x) => x.take.includes(d));
  assert.equal(by('2026-12-22').free, 6); // 22.12 + wolne 23.12 za 26.12 + Wigilia + święta + weekend
  assert.equal(by('2027-05-28').start, '2027-05-27'); // Boże Ciało (czw) + piątek
  assert.deepEqual(by('2027-05-28').inBlock, ['Med. rodzinna']);
  assert.ok(v.every((x) => x.free / x.days >= 3));
  for (let i = 1; i < v.length; i++) assert.ok(v[i].start > v[i - 1].end); // bez nakładania
});

test('Terminy Kadr na cały staż: XI i XII z e-maili, dalej 3. dzień roboczy następnego miesiąca', async () => {
  const { hrDeadlines, nthWorkday, buildContext } = await import('../js/engine.js');
  const st = defaultState();
  const list = hrDeadlines(st);
  const by = (id) => list.find((d) => d.id === id);
  assert.equal(by('kp-2026-11').due, '2026-12-03');
  assert.equal(by('kp-2027-01').due, '2027-02-03'); // 1.02 pn, 2.02 wt, 3.02 śr
  assert.equal(by('kp-2027-03').due, '2027-04-05'); // 1.04 cz, 2.04 pt, 5.04 pn
  assert.equal(by('kp-2027-04').due, '2027-05-06'); // 3.05 święto: 4, 5, 6.05
  assert.ok(by('kp-2027-10'));
  assert.ok(!by('kp-2026-12')); // grudzień – osobne terminy z e-maila (15.12 i 31.12)
  assert.equal(nthWorkday(buildContext(st), '2027-01', 1), '2027-01-04'); // 1.01 święto, 2–3 weekend
});

test('LEK: po zapisie i „nie trzeba płacić” – bez przypomnienia o opłacie', () => {
  const st = defaultState();
  const titles = () => alerts(summarize(st, '2026-12-01')).map((a) => a.title);
  assert.ok(titles().some((t) => t.startsWith('Opłata za LEK')));
  st.settings.lek.registered = true;
  assert.ok(titles().some((t) => t.startsWith('LEK: sprawdź w SMK')));
  st.settings.lek.feeNeeded = 'nie';
  assert.ok(!titles().some((t) => t.startsWith('Opłata za LEK') || t.startsWith('LEK: sprawdź')));
});

test('Podsumowanie tygodnia: pn–nd, miejsce, święta, nieobecności, dyżury i terminy', async () => {
  const { weekSummary } = await import('../js/engine.js');
  const st = defaultState();
  st.duties = [{ id: 'd', date: '2026-11-24', minutes: 305 }];
  st.events.push({ id: 'u', type: 'urlop', start: '2026-11-27', end: '2026-11-27' });
  const w = weekSummary(st, '2026-11-25');
  assert.equal(w.start, '2026-11-23');
  assert.equal(w.end, '2026-11-29');
  assert.match(w.days[0].label, /^Chirurgia/);
  assert.match(w.days[3].label, /^Chir\. dziecięca · /); // 26.11 nowy blok (Zdroje)
  assert.equal(w.days[4].kind, 'absence');
  assert.equal(w.days[5].kind, 'free');
  assert.equal(w.dutyMin, 305);
  assert.ok(w.items.some((i) => i.text.startsWith('Nowy blok: Chirurgia dziecięca')));
  assert.ok(w.items.every((i) => i.date >= w.start && i.date <= w.end)); // zgłoszenie LEK 30.11 – już w następnym tygodniu
  assert.ok(weekSummary(st, '2026-11-30').items.some((i) => i.text.startsWith('Zgłoszenie na LEK')));
  const w2 = weekSummary(st, '2026-12-23');
  assert.ok(w2.days.find((d) => d.date === '2026-12-24').kind === 'free');
  assert.ok(w2.days.find((d) => d.date === '2026-12-23').label.startsWith('Dzień wolny'));
});
