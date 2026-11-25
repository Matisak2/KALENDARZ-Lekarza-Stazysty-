import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/defaults.js';

// Środowisko przeglądarki: pamięć i przeglądarka
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 (iPhone)' }, configurable: true });

const sync = await import('../js/sync.js');

function cloud() {
  const docs = new Map();
  return {
    docs,
    fs: {
      doc: (_db, col, id) => `${col}/${id}`,
      setDoc: async (ref, data) => { docs.set(ref, JSON.parse(JSON.stringify(data))); },
      getDoc: async (ref) => ({ exists: () => docs.has(ref), data: () => docs.get(ref) }),
    },
    db: {},
  };
}
function device(state) {
  const d = { state, toasts: [], replaced: 0 };
  d.ctx = {
    get state() { return d.state; },
    replaceFromCloud(data) { d.state = data; d.replaced++; },
    toast: (t) => d.toasts.push(t),
    onStatus() {},
  };
  return d;
}

test('Telefon wysyła, komputer pobiera, potem odwrotnie – bez utraty danych', async () => {
  const c = cloud();
  const u = { uid: 'U1', email: 'x@y.pl' };
  // Telefon: wpis urlopu
  const phone = device(defaultState());
  phone.state.events.push({ id: 'u1', type: 'urlop', start: '2027-08-16', end: '2027-08-20' });
  phone.state.meta.updatedAt = 1000;
  mem.clear();
  sync.__test(c, u, phone.ctx);
  await sync.__reconcile(null);
  assert.equal(JSON.parse(c.docs.get('stazysta/U1').data).events.length, 1);

  // Komputer (osobna pamięć): nowy, pusty -> pobiera
  mem.clear();
  const pc = device(defaultState());
  sync.__test(c, u, pc.ctx);
  await sync.__reconcile(c.docs.get('stazysta/U1'));
  assert.equal(pc.replaced, 1);
  assert.equal(pc.state.events[0].id, 'u1');
  assert.match(pc.toasts[0], /iPhone/);

  // Komputer dopisuje dyżur -> wysyła
  pc.state.duties.push({ id: 'd1', date: '2026-12-01', minutes: 300 });
  pc.state.meta.updatedAt = 2000;
  await sync.__reconcile(c.docs.get('stazysta/U1'));
  const remote = JSON.parse(c.docs.get('stazysta/U1').data);
  assert.equal(remote.duties.length, 1);
  assert.equal(remote.events.length, 1);
});

test('Konflikt: zmiany w obu urządzeniach – nowsza wygrywa, starsza zostaje jako kopia', async () => {
  const c = cloud();
  const u = { uid: 'U2' };
  mem.clear();
  const a = device(defaultState());
  a.state.meta.updatedAt = 1000;
  sync.__test(c, u, a.ctx);
  await sync.__reconcile(null); // wspólny punkt 1000
  // W chmurze ktoś inny zapisał 3000
  const other = defaultState();
  other.notes = { '2027-01-01': 'z komputera' };
  other.meta.updatedAt = 3000;
  await c.fs.setDoc('stazysta/U2', { data: JSON.stringify(other), updatedAt: 3000, device: 'Mac' });
  // A zmienił lokalnie 2000 (starsze niż chmura)
  a.state.notes = { '2026-12-01': 'z telefonu' };
  a.state.meta.updatedAt = 2000;
  await sync.__reconcile(c.docs.get('stazysta/U2'));
  assert.equal(a.state.notes['2027-01-01'], 'z komputera');
  const kopie = JSON.parse(mem.get('kalendarz-stazysty-kopie'));
  assert.equal(JSON.parse(kopie[0].data).notes['2026-12-01'], 'z telefonu');
  assert.match(kopie[0].reason, /przed pobraniem z chmury/);
});

test('Audyt B1: telefon z danymi + komputer z drobną zmianą przed logowaniem – dane z telefonu przetrwają', async () => {
  const c = cloud();
  const u = { uid: 'U4' };
  mem.clear();
  const phone = device(defaultState());
  phone.state.events.push({ id: 'w', type: 'urlop', start: '2027-08-16', end: '2027-08-20' });
  phone.state.meta.updatedAt = 1000;
  sync.__test(c, u, phone.ctx);
  await sync.__reconcile(null);
  // Komputer: nowa pamięć, zmieniony motyw (updatedAt 2000), nigdy nie synchronizowany
  mem.clear();
  const pc = device(defaultState());
  pc.state.settings.theme = 'dark';
  pc.state.meta.updatedAt = 2000;
  sync.__test(c, u, pc.ctx);
  await sync.__reconcile(c.docs.get('stazysta/U4'));
  assert.equal(pc.state.events[0].id, 'w'); // pobrał dane z telefonu
  assert.equal(JSON.parse(c.docs.get('stazysta/U4').data).events.length, 1); // chmura nietknięta
  const kopie = JSON.parse(mem.get('kalendarz-stazysty-kopie'));
  assert.equal(JSON.parse(kopie[0].data).settings.theme, 'dark'); // wersja z komputera zachowana
});

test('Uszkodzone dane w chmurze niczego nie nadpisują', async () => {
  const c = cloud();
  mem.clear();
  const a = device(defaultState());
  a.state.events.push({ id: 'e', type: 'l4', start: '2027-02-01', end: '2027-02-02' });
  sync.__test(c, { uid: 'U3' }, a.ctx);
  await sync.__reconcile({ data: 'zepsute', updatedAt: 9999 });
  assert.equal(a.state.events.length, 1);
  assert.equal(a.replaced, 0);
});
