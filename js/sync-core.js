// Logika synchronizacji (bez Firebase) – co zrobić, gdy dane są i w telefonie, i w chmurze.
// Zasada: wygrywa nowsza wersja; ta, która „przegrała” konflikt, zostaje jako kopia w tym urządzeniu.

/**
 * @param {number} localAt   – kiedy zmieniono dane w tym urządzeniu (meta.updatedAt)
 * @param {number|null} remoteAt – kiedy zmieniono dane w chmurze (null = w chmurze nic nie ma)
 * @param {number} lastSync  – stan z ostatniej udanej synchronizacji (updatedAt, który był wtedy wspólny)
 * @returns {'none'|'push'|'pull'|'conflict-push'|'conflict-pull'}
 */
export function decideSync(localAt, remoteAt, lastSync) {
  const l = Number(localAt) || 0;
  const s = Number(lastSync) || 0;
  if (remoteAt == null) return l ? 'push' : 'none';
  const r = Number(remoteAt) || 0;
  if (l === r) return 'none';
  // Pierwsza synchronizacja na tym urządzeniu (lub po wylogowaniu), a w chmurze już są dane:
  // zawsze pobierz chmurę (to „prawdziwe” dane z drugiego urządzenia); to, co było tutaj, zostaje jako kopia.
  if (!s) return l ? 'conflict-pull' : 'pull';
  const localChanged = l > s;
  const remoteChanged = r > s;
  if (localChanged && remoteChanged) return l >= r ? 'conflict-push' : 'conflict-pull';
  if (remoteChanged) return 'pull';
  if (localChanged) return 'push';
  return l > r ? 'push' : 'pull';
}

/** Zapis w chmurze: całe dane jako tekst (bez ograniczeń Firestore na klucze) + znacznik czasu. */
export function toRemote(state, device) {
  return { data: JSON.stringify(state), updatedAt: Number(state.meta?.updatedAt) || Date.now(), device: device || '' };
}

export function fromRemote(doc) {
  if (!doc || typeof doc.data !== 'string') return null;
  try { return JSON.parse(doc.data); } catch (e) { return null; }
}

/** Krótka nazwa urządzenia do opisu („iPhone”, „Mac”…). */
export function deviceName(ua = '') {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac OS X|Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'komputer';
}
