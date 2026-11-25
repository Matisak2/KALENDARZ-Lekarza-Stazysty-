import { test } from 'node:test';
import assert from 'node:assert/strict';

// Osobny plik: load() ustawia stan modułu (loadProblem) – każdy przypadek w świeżym imporcie
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

test('Audyt B2: dane z nowszej wersji aplikacji – start z domyślnymi, ale stare dane NIE są nadpisywane', async () => {
  mem.clear();
  const raw = JSON.stringify({ version: 99, blocks: [], events: [{ id: 'x' }] });
  mem.set('kalendarz-stazysty', raw);
  const store = await import('../js/store.js?v=newer');
  const s = store.load();
  assert.equal(store.loadProblem, 'newer');
  assert.equal(s.events.length, 0);
  assert.equal(store.save(s), false); // zapis zablokowany
  assert.equal(mem.get('kalendarz-stazysty'), raw);
  assert.equal(store.rawProblemData(), raw);
});

test('Audyt B2: uszkodzone dane – zachowane jako surowa kopia, aplikacja działa dalej', async () => {
  mem.clear();
  mem.set('kalendarz-stazysty', '{zepsute');
  const store = await import('../js/store.js?v=broken');
  const s = store.load();
  assert.equal(store.loadProblem, 'broken');
  assert.equal(store.rawProblemData(), '{zepsute');
  assert.equal(store.save(s), true);
  assert.equal(mem.get('kalendarz-stazysty-nieczytelne'), '{zepsute');
});
