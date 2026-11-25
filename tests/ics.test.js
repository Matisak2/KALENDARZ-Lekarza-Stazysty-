import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/defaults.js';
import { buildIcs, buildIcsExport, buildDutiesIcs } from '../js/ics.js';

test('Audyt B10: dyżur przez północ – koniec następnego dnia, poprawna godzina', () => {
  const st = defaultState();
  st.duties = [{ id: 'n', date: '2026-12-04', minutes: 24 * 60, start: '8:00' }];
  const ics = buildIcs(st, '2026-11-25');
  assert.ok(ics.includes('DTSTART:20261204T080000'));
  assert.ok(ics.includes('DTEND:20261205T080000'));
  assert.ok(!/T(2[4-9]|[3-9]\d)\d{4}/.test(ics));
});

test('Eksport „tylko nowe i zmienione”: drugi eksport bez zmian jest pusty, zmieniony dyżur wraca', () => {
  const st = defaultState();
  st.duties = [{ id: 'a', date: '2026-12-01', minutes: 305 }, { id: 'b', date: '2026-12-03', minutes: 300 }];
  const first = buildIcsExport(st, '2026-11-25');
  assert.equal(first.count, first.total);
  const second = buildIcsExport(st, '2026-11-25', first.sent);
  assert.equal(second.count, 0);
  st.duties[1].minutes = 305;
  st.duties.push({ id: 'c', date: '2026-12-08', minutes: 305 });
  const third = buildIcsExport(st, '2026-11-25', second.sent);
  assert.equal(third.count, 2);
  assert.ok(third.text.includes('UID:dyzur-b@') && third.text.includes('UID:dyzur-c@'));
  assert.ok(!third.text.includes('UID:dyzur-a@'));
});

test('Plik tylko z dyżurami (po propozycji)', () => {
  const st = defaultState();
  const ics = buildDutiesIcs(st, [{ id: 'x', date: '2026-12-01', minutes: 305, start: '15:35' }]);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.ok(ics.includes('DTEND:20261201T204000'));
});

test('Audyt B12: dyżur o 0:00 eksportuje się o 0:00, nie o 15:00', async () => {
  const { buildDutiesIcs } = await import('../js/ics.js');
  const { defaultState } = await import('../js/defaults.js');
  const t = buildDutiesIcs(defaultState(), [{ id: 'n', date: '2026-12-05', minutes: 300, start: '0:00' }]);
  assert.match(t, /DTSTART:20261205T000000/);
});

test('Audyt B3: usunięty dyżur trafia do eksportu „tylko zmiany” jako odwołany; zrobiony termin Kadr jako „✓”', async () => {
  const { buildIcsExport } = await import('../js/ics.js');
  const { defaultState } = await import('../js/defaults.js');
  const st = defaultState();
  st.duties = [{ id: 'd1', date: '2026-12-01', minutes: 305, start: '15:35' }, { id: 'd0', date: '2026-11-02', minutes: 300, start: '15:35' }];
  const first = buildIcsExport(st, '2026-11-25');
  assert.ok(first.sent['dyzur-d1@kalendarz-stazysty'].s.includes('20261201T153500'));
  st.duties = [];
  st.settings.hrDone = { 'kp-2026-11': true };
  const next = buildIcsExport(st, '2026-11-25', first.sent);
  assert.match(next.text, /UID:dyzur-d1@kalendarz-stazysty\r\nDTSTAMP:\d+T\d+Z\r\nDTSTART:20261201T153500\r\nDTEND:20261201T204000\r\nSUMMARY:❌ Odwołane: 🌙 Dyżur 15:35\r\nSEQUENCE:\d+\r\nSTATUS:CANCELLED/);
  assert.equal(next.cancelled, 1); // przeszły dyżur z 02.11 nie jest odwoływany
  assert.match(next.text, /SUMMARY:✓ Oddaj w Kadrach dokumenty za listopad/);
  // stary zapis (sam skrót, bez daty) – nic nie odwołujemy, bo nie znamy daty
  assert.equal(buildIcsExport(st, '2026-11-25', { 'dyzur-x': 'abc' }).cancelled, 0);
});
