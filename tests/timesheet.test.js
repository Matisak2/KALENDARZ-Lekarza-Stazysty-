import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/defaults.js';
import { buildTimesheet, hm, clock, nightMinutes } from '../js/timesheet.js';

test('Zapis godzin jak na wzorze USK2', () => {
  assert.equal(hm(455), '7,35');
  assert.equal(hm(300), '5');
  assert.equal(hm(305), '5,05');
  assert.equal(hm(10010, '.'), '166.50');
  assert.equal(clock(935), '15.35');
  assert.equal(clock(480), '8.00');
});

test('Październik 2026 jak na wzorze z kadr: RA 166.50, dyżury 40.20, M 207.10', () => {
  const st = defaultState();
  const d = (date, minutes) => ({ id: date, date, minutes });
  // dyżury z wzoru: 5 h albo 5 h 05 min
  st.duties = [d('2026-10-02', 300), d('2026-10-06', 305), d('2026-10-08', 300), d('2026-10-09', 305),
    d('2026-10-16', 300), d('2026-10-20', 305), d('2026-10-23', 300), d('2026-10-29', 305)];
  const k = buildTimesheet(st, '2026-10');
  assert.equal(k.rows.length, 31);
  const r = (n) => k.rows[n - 1];
  assert.equal(r(1).hours, '8.00-15.35');
  assert.equal(hm(r(1).nominal), '7,35');
  assert.equal(r(2).hours, '8.00-20.35');
  assert.equal(hm(r(2).duty), '5');
  assert.equal(r(6).hours, '8.00-20.40');
  assert.equal(hm(r(6).duty), '5,05');
  assert.ok(r(3).shaded && r(4).shaded && r(31).shaded);
  assert.equal(r(3).hours, '');
  assert.equal(hm(k.totals.nominal, '.'), '166.50');
  assert.equal(hm(k.totals.duty, '.'), '40.20');
  assert.equal(hm(k.totals.all, '.'), '207.10');
  assert.equal(k.monthLabel, 'październik 2026');
});

test('Listopad 2026: święto 11.11 zacieniowane, urlop i kurs, dyżur w sobotę jako świąteczny', () => {
  const st = defaultState();
  st.events = [{ id: 'u', type: 'urlop', start: '2026-11-16', end: '2026-11-17' }];
  st.courses.find((c) => c.id === 'onko').start = '2026-11-19';
  st.courses.find((c) => c.id === 'onko').end = '2026-11-19';
  st.duties = [{ id: 's', date: '2026-11-21', minutes: 605, start: '8:00' }];
  const k = buildTimesheet(st, '2026-11');
  const r = (n) => k.rows[n - 1];
  assert.ok(r(11).shaded);
  assert.equal(r(11).note, 'Święto Niepodległości');
  assert.equal(r(16).hours, 'UW');
  assert.equal(r(16).nominal, 0);
  assert.equal(r(19).hours, '8.00-15.35');
  assert.match(r(19).note, /SZ – szkolenie: Profilaktyka onkologiczna/);
  assert.equal(r(21).hours, '8.00-18.05');
  assert.equal(hm(r(21).dutyHoliday), '10,05');
  // listopad 2026: 21 dni pn–pt, minus 11.11 (święto) = 20, minus 2 dni urlopu = 18 × 7,35 (kurs liczy się jak praca)
  assert.equal(k.totals.nominal, 18 * 455);
});

test('Godziny nocne 22–6', () => {
  assert.equal(nightMinutes(20 * 60, 4 * 60), 120);
  assert.equal(nightMinutes(8 * 60, 600), 0);
});

import { summarize, alerts } from '../js/engine.js';

test('Przypomnienie o karcie: koniec listopada i początek grudnia; znika po wygenerowaniu', () => {
  const st = defaultState();
  const has = (t) => alerts(summarize(st, t)).find((a) => a.icon === '🗂');
  assert.equal(has('2026-11-28').ym, '2026-11');
  assert.equal(has('2026-12-03').ym, '2026-11');
  assert.ok(!has('2026-11-15'));
  st.timesheets = { '2026-11': { generatedAt: '2026-11-29' } };
  assert.ok(!has('2026-11-30'));
});

test('Nominał z e-maili Kadr USK2: listopad i grudzień 2026 = 151 h 40 min; kody nieobecności z legendy USK2', () => {
  const st = defaultState();
  assert.equal(hm(buildTimesheet(st, '2026-11').totals.nominal, '.'), '151.40');
  assert.equal(hm(buildTimesheet(st, '2026-12').totals.nominal, '.'), '151.40'); // 24, 25.12 + wolne 23.12 za 26.12
  st.events = [{ id: 'l', type: 'l4', start: '2026-11-16', end: '2026-11-16' }, { id: 'z', type: 'urlop_zadanie', start: '2026-11-17', end: '2026-11-17' }];
  const r = (d) => buildTimesheet(st, '2026-11').rows.find((x) => x.day === d);
  assert.equal(r(16).hours, 'ZL');
  assert.equal(r(17).hours, 'UW');
});
