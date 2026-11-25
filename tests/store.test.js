import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, SCHEMA_VERSION } from '../js/defaults.js';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const store = await import('../js/store.js');

test('Migracja v4 -> v5: wpisy zostają, dochodzą puste przypadki i publikacje', () => {
  const old = defaultState();
  old.version = 4;
  delete old.cases;
  delete old.study.extras;
  old.events.push({ id: 'e', type: 'urlop', start: '2027-08-16', end: '2027-08-20' });
  const m = store.migrate(JSON.parse(JSON.stringify(old)));
  assert.equal(m.version, SCHEMA_VERSION);
  assert.equal(m.version, 5);
  assert.deepEqual(m.cases, []);
  assert.deepEqual(m.study.extras, { phd: '', pubs: [] });
  assert.equal(m.events[0].id, 'e');
});

test('Kopie automatyczne: zapis, bez dublowania tej samej wersji, max 6, odczyt', () => {
  mem.clear();
  const s = defaultState();
  const id1 = store.snapshot(s, 'test', 1000);
  assert.equal(store.snapshot(s, 'test 2', 2000), id1); // ta sama treść – bez nowej kopii
  for (let i = 0; i < 8; i++) { s.notes = { [`2027-01-0${i + 1}`]: 'x' }; store.snapshot(s, `n${i}`, 3000 + i); }
  const list = store.snapshots();
  assert.equal(list.length, 6);
  assert.equal(list[0].reason, 'n7');
  const back = store.snapshotData(list[0].id);
  assert.equal(back.notes['2027-01-08'], 'x');
});

test('Kopia dzienna – najwyżej raz na ~dobę', () => {
  mem.clear();
  const s = defaultState();
  const t = Date.parse('2026-11-25T08:00:00Z');
  assert.ok(store.dailySnapshot(s, t));
  s.notes = { a: 'b' };
  assert.equal(store.dailySnapshot(s, t + 3600e3), null);
  assert.ok(store.dailySnapshot(s, t + 25 * 3600e3));
});

test('Dane bez study.domainFix (starsze zapisy) dostają puste poprawki dziedzin, nic nie ginie', () => {
  const old = defaultState();
  delete old.study.domainFix;
  old.study.done = { 'kurs|dział|lekcja': '2026-11-20' };
  const m = store.migrate(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(m.study.domainFix, {});
  assert.deepEqual(m.study.done, { 'kurs|dział|lekcja': '2026-11-20' });
});

test('Dane bez study.reviews dostają puste powtórki, odhaczone lekcje zostają', () => {
  const old = defaultState();
  delete old.study.reviews;
  old.study.done = { 'k|d|l': '2026-11-20' };
  const m = store.migrate(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(m.study.reviews, {});
  assert.deepEqual(m.study.done, { 'k|d|l': '2026-11-20' });
});

test('Audyt B11: kopie dzienne (3) osobno od kopii „przed operacją” (6) – synchronizacja ich nie wypycha', () => {
  mem.clear();
  const s = defaultState();
  const DAY = 24 * 3600 * 1000;
  for (let d = 0; d < 4; d++) { s.notes = { a: `dzień ${d}` }; store.dailySnapshot(s, d * DAY); }
  for (let i = 0; i < 10; i++) { s.notes = { a: `pobranie ${i}` }; store.snapshot(s, 'przed pobraniem z chmury', 4 * DAY + i); }
  const list = store.snapshots();
  assert.equal(list.filter((x) => x.reason === 'kopia dzienna').length, 3);
  assert.equal(list.filter((x) => x.reason !== 'kopia dzienna').length, 6);
  assert.ok(list[0].at > list.at(-1).at); // najnowsza pierwsza
});
