import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easter, holidaysForYear, holidayMap } from '../js/holidays.js';

test('Wielkanoc – znane daty', () => {
  assert.equal(easter(2024), '2024-03-31');
  assert.equal(easter(2025), '2025-04-20');
  assert.equal(easter(2026), '2026-04-05');
  assert.equal(easter(2027), '2027-03-28');
  assert.equal(easter(2028), '2028-04-16');
  assert.equal(easter(2038), '2038-04-25');
});

test('Święta ruchome 2027: Poniedziałek Wielkanocny, Zielone Świątki, Boże Ciało', () => {
  const h = Object.fromEntries(holidaysForYear(2027).map((x) => [x.name, x.date]));
  assert.equal(h['Poniedziałek Wielkanocny'], '2027-03-29');
  assert.equal(h['Zielone Świątki'], '2027-05-16');
  assert.equal(h['Boże Ciało'], '2027-05-27');
});

test('Wigilia jest świętem od 2025 r., wcześniej nie', () => {
  assert.ok(holidaysForYear(2025).some((x) => x.date === '2025-12-24'));
  assert.ok(holidaysForYear(2026).some((x) => x.date === '2026-12-24'));
  assert.ok(!holidaysForYear(2024).some((x) => x.date === '2024-12-24'));
});

test('Rok 2026/2027: 14 świąt w okresie stażu, w tym 2 w sobotę i 3 w niedzielę', () => {
  const m = holidayMap('2026-10-01', '2027-10-31');
  const all = [...m.values()];
  assert.equal(all.length, 14);
  assert.deepEqual(all.filter((x) => x.saturday).map((x) => x.date), ['2026-12-26', '2027-05-01']);
  assert.deepEqual(all.filter((x) => x.sunday).map((x) => x.date), ['2026-11-01', '2027-03-28', '2027-05-16', '2027-08-15']);
});
