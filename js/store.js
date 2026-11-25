// Zapis danych w pamięci przeglądarki (na tym urządzeniu) + kopia zapasowa w pliku.
import { defaultState, SCHEMA_VERSION } from './defaults.js';

const KEY = 'kalendarz-stazysty';
const SNAP_KEY = 'kalendarz-stazysty-kopie';
const RAW_KEY = 'kalendarz-stazysty-nieczytelne';
const SNAP_MAX = 6; // kopie „przed operacją”
const DAILY_MAX = 3; // kopie dzienne
const DAILY = 'kopia dzienna';

/**
 * Problem przy odczycie zapisanych danych: null | 'broken' (uszkodzone) | 'newer' (zapisała je nowsza wersja aplikacji).
 * Wtedy aplikacja startuje z danymi domyślnymi, ale stare dane NIE są kasowane (kopia pod RAW_KEY).
 */
export let loadProblem = null;

/** Przenosi dane ze starszych wersji – nic, co wpisał użytkownik, nie ginie. */
export function migrate(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.blocks)) return null;
  const def = defaultState();
  if (!data.version || data.version < 2) {
    // v2: oddziały (odcinki) w blokach
    for (const b of data.blocks) {
      if (!Array.isArray(b.segments)) {
        const d = def.blocks.find((x) => x.id === b.id && x.start === b.start && x.end === b.end);
        b.segments = d?.segments ? JSON.parse(JSON.stringify(d.segments)) : [];
      }
      delete b.place;
    }
    data.version = 2;
  }
  if (data.version < 3) {
    // v3: lista umiejętności z pediatrii ułożona jak w książeczce – przenieś odhaczone pozycje
    const map = { 0: 2, 1: 0, 2: 4, 3: 5, 4: 6, 5: 7, 6: 8, 7: 9, 8: 10, 9: 11, 10: 3 };
    const sk = data.skills || {};
    const moved = {};
    for (const [k, v] of Object.entries(sk)) {
      const m = /^ped:(\d+)$/.exec(k);
      if (m) moved[`ped:${map[m[1]]}`] = v; else moved[k] = v;
    }
    data.skills = moved;
    data.version = 3;
  }
  if (data.version < 4) {
    // v4: planer LEK (study) + przypomnienia o opłacie za LEK (art. 14a ust. 8 ustawy)
    const dl = data.settings?.lek?.deadlines;
    if (Array.isArray(dl)) {
      for (const x of def.settings.lek.deadlines) if (!dl.some((y) => y.date === x.date && y.label === x.label)) dl.push(x);
      dl.sort((a, b) => (a.date < b.date ? -1 : 1));
    }
    data.version = 4;
  }
  if (data.version < 5) {
    // v5: przypadki z oddziału, publikacje/doktorat, eksport .ics „tylko zmiany” – same nowe, puste pola
    data.cases = Array.isArray(data.cases) ? data.cases : [];
    data.version = 5;
  }
  // Uzupełnij brakujące pola nowszymi domyślnymi (bez nadpisywania wpisanych)
  data.settings = { ...def.settings, ...data.settings };
  data.courses = data.courses || def.courses;
  data.events = data.events || [];
  data.duties = data.duties || [];
  data.cases = data.cases || [];
  data.notes = data.notes || {};
  data.skills = data.skills || {};
  data.customSkills = data.customSkills || {};
  data.booklet = data.booklet || {};
  data.timesheets = data.timesheets || {};
  data.study = { ...def.study, ...(data.study || {}) };
  data.study.extras = { ...def.study.extras, ...(data.study.extras || {}) };
  data.meta = { ...def.meta, ...data.meta };
  return data.version === SCHEMA_VERSION ? data : null;
}

export function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { /* brak dostępu do pamięci – używamy danych domyślnych */ }
  if (raw) {
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { /* uszkodzone */ }
    const data = parsed ? migrate(parsed) : null;
    if (data) return data;
    // Nie udało się odczytać – zachowaj surowe dane, nic nie kasuj
    loadProblem = Number(parsed?.version) > SCHEMA_VERSION ? 'newer' : 'broken';
    try { if (!localStorage.getItem(RAW_KEY)) localStorage.setItem(RAW_KEY, raw); } catch (e) { /* brak miejsca */ }
  }
  const s = defaultState();
  s.meta.createdAt = new Date().toISOString();
  return s;
}

const listeners = [];
export function onSave(fn) { listeners.push(fn); }

/** Zapis w telefonie. keepTime = dane przyszły z chmury (nie są nową zmianą). */
export function save(state, { keepTime = false } = {}) {
  // Dane z nowszej wersji aplikacji: nie nadpisujemy ich starszą wersją (wystarczy odświeżyć aplikację)
  if (loadProblem === 'newer') return false;
  try {
    if (!keepTime) state.meta = { ...(state.meta || {}), updatedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(state));
    if (!keepTime) listeners.forEach((fn) => fn());
    return true;
  } catch (e) {
    return false;
  }
}

/** Tekst kopii zapasowej (.json). */
export function backupText(state) {
  return JSON.stringify({ format: 'kalendarz-stazysty', exportedAt: new Date().toISOString(), data: state }, null, 2);
}

/** Wczytanie kopii – zwraca dane albo rzuca błąd z opisem po polsku. */
export function parseBackup(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { throw new Error('To nie jest plik kopii (błędny format).'); }
  const raw = obj?.format === 'kalendarz-stazysty' ? obj.data : obj;
  const data = migrate(raw);
  if (!data && Number(raw?.version) > SCHEMA_VERSION) throw new Error('Tę kopię zapisała nowsza wersja aplikacji – zamknij aplikację, otwórz ją ponownie z internetem i spróbuj jeszcze raz.');
  if (!data) throw new Error('Ten plik nie wygląda na kopię Kalendarza Stażysty.');
  return data;
}

/** Surowe (nieczytelne) dane zachowane przy starcie – do zapisania w pliku. */
export function rawProblemData() {
  try { return localStorage.getItem(RAW_KEY); } catch (e) { return null; }
}

/* ---------- Kopie automatyczne w tym urządzeniu ---------- */

/** Lista kopii automatycznych (najnowsza pierwsza): [{ id, at, reason, data: tekst JSON }]. */
export function snapshots() {
  try {
    const list = JSON.parse(localStorage.getItem(SNAP_KEY) || '[]');
    return Array.isArray(list) ? list.filter((x) => x && typeof x.data === 'string') : [];
  } catch (e) { return []; }
}

/**
 * Zapisuje kopię danych (obiekt stanu albo tekst JSON) przed ryzykowną operacją.
 * Trzyma 3 kopie dzienne i 6 kopii „przed operacją”; gdy brakuje miejsca – usuwa najstarsze (najpierw te „przed operacją”). Zwraca id kopii albo null.
 */
export function snapshot(data, reason, now = Date.now()) {
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  let list = snapshots();
  if (list[0] && list[0].data === text) return list[0].id; // ta sama wersja – bez dublowania
  const item = { id: `k${now}`, at: new Date(now).toISOString(), reason: String(reason || ''), data: text };
  // Osobno: 3 kopie dzienne i 6 kopii „przed operacją” – częsta synchronizacja nie wypycha kopii dziennych (audyt B11)
  const daily = (x) => x.reason === DAILY;
  list = [item, ...list];
  list = [...list.filter(daily).slice(0, DAILY_MAX), ...list.filter((x) => !daily(x)).slice(0, SNAP_MAX)]
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  while (list.length) {
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(list)); return list.some((x) => x.id === item.id) ? item.id : null; } catch (e) {
      if (list.length === 1) return null;
      // Brak miejsca: najpierw usuwamy najstarszą kopię „przed operacją”, potem najstarszą dzienną
      const i = list.map((x, k) => [x, k]).reverse().find(([x]) => !daily(x) && x.id !== item.id)?.[1] ?? list.length - 1;
      list = list.filter((_, k) => k !== i);
    }
  }
  return null;
}

/** Dane z kopii automatycznej (po migracji) – albo błąd z opisem po polsku. */
export function snapshotData(id) {
  const s = snapshots().find((x) => x.id === id);
  if (!s) throw new Error('Nie ma już tej kopii.');
  return parseBackup(s.data);
}

/** Kopia „raz dziennie” przy otwarciu aplikacji. */
export function dailySnapshot(state, now = Date.now()) {
  const last = snapshots().find((x) => x.reason === DAILY);
  if (last && now - Date.parse(last.at) < 20 * 3600 * 1000) return null;
  return snapshot(state, DAILY, now);
}

export async function askPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch (e) { /* ignorujemy */ }
}
