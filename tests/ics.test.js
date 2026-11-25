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
