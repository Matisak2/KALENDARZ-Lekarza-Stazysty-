// Zapis danych w pamięci przeglądarki (na tym urządzeniu) + kopia zapasowa w pliku.
import { defaultState, SCHEMA_VERSION } from './defaults.js';

const KEY = 'kalendarz-stazysty';

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
  // Uzupełnij brakujące pola nowszymi domyślnymi (bez nadpisywania wpisanych)
  data.settings = { ...def.settings, ...data.settings };
  data.courses = data.courses || def.courses;
  data.events = data.events || [];
  data.duties = data.duties || [];
  data.notes = data.notes || {};
  data.meta = { ...def.meta, ...data.meta };
  return data.version === SCHEMA_VERSION ? data : null;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = migrate(JSON.parse(raw));
      if (data) return data;
    }
  } catch (e) { /* brak dostępu do pamięci – używamy danych domyślnych */ }
  const s = defaultState();
  s.meta.createdAt = new Date().toISOString();
  return s;
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
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
  const data = migrate(obj?.format === 'kalendarz-stazysty' ? obj.data : obj);
  if (!data) throw new Error('Ten plik nie wygląda na kopię Kalendarza Stażysty.');
  return data;
}

export async function askPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch (e) { /* ignorujemy */ }
}
