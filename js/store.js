// Zapis danych w pamięci przeglądarki (na tym urządzeniu) + kopia zapasowa w pliku.
import { defaultState, SCHEMA_VERSION } from './defaults.js';

const KEY = 'kalendarz-stazysty';

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.version === SCHEMA_VERSION) return data;
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

export async function askPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch (e) { /* ignorujemy */ }
}
