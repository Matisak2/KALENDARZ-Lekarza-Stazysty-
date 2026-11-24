import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideSync, toRemote, fromRemote, deviceName } from '../js/sync-core.js';
import { defaultState } from '../js/defaults.js';

test('Pierwsze połączenie: w chmurze pusto -> wyślij dane z telefonu', () => {
  assert.equal(decideSync(1000, null, 0), 'push');
  assert.equal(decideSync(0, null, 0), 'none');
});

test('Zmiana tylko w telefonie -> wyślij; tylko w chmurze -> pobierz', () => {
  assert.equal(decideSync(2000, 1000, 1000), 'push');
  assert.equal(decideSync(1000, 2000, 1000), 'pull');
  assert.equal(decideSync(1500, 1500, 1500), 'none');
});

test('Zmiany w obu miejscach -> wygrywa nowsza, druga zostaje jako kopia', () => {
  assert.equal(decideSync(3000, 2000, 1000), 'conflict-push');
  assert.equal(decideSync(2000, 3000, 1000), 'conflict-pull');
});

test('Nowe urządzenie (nigdy nie synchronizowane) z pustymi danymi pobiera chmurę', () => {
  assert.equal(decideSync(0, 5000, 0), 'pull');
});

test('Zapis do chmury i odczyt zwracają te same dane', () => {
  const st = defaultState();
  st.meta.updatedAt = 12345;
  st.events.push({ id: 'u', type: 'urlop', start: '2027-08-16', end: '2027-08-20' });
  st.skills = { 'ped:0': { date: '2027-07-20' } };
  const r = toRemote(st, 'iPhone');
  assert.equal(r.updatedAt, 12345);
  assert.deepEqual(fromRemote(r), st);
  assert.equal(fromRemote({ data: 'zepsute' }), null);
});

test('Nazwa urządzenia', () => {
  assert.equal(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), 'iPhone');
  assert.equal(deviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'), 'Mac');
});
