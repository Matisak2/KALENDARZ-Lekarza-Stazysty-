// Synchronizacja telefon ↔ komputer przez Firebase (ten sam projekt co aplikacja Budżet).
// Dane leżą w Firestore pod stazysta/{uid} – dostęp ma tylko zalogowany właściciel (zasada w konsoli Firebase).
// Telefon działa dalej bez internetu: lokalna pamięć jest główna, chmura to kopia i łącznik między urządzeniami.
import { decideSync, toRemote, fromRemote, deviceName } from './sync-core.js';

const V = '10.14.1';
const CFG = {
  apiKey: 'AIzaSyBda2N5_9Pdez3kzI4MFR7o2gGSSm8nLZM',
  authDomain: 'budzet-panstwa-ciemcia.firebaseapp.com',
  projectId: 'budzet-panstwa-ciemcia',
  appId: '1:711621657322:web:d589b95213dd2211328d93',
};
const INFO_KEY = 'kalendarz-sync';
const BACKUP_KEY = 'kalendarz-stazysty-kopia-konfliktu';

let fb = null;
let ctx = null;
let user = null;
let unsub = null;
let timer = null;
const status = { phase: 'off', error: '', lastAt: null, from: '' };

function info() {
  try { return JSON.parse(localStorage.getItem(INFO_KEY) || '{}'); } catch (e) { return {}; }
}
function setInfo(patch) {
  try { localStorage.setItem(INFO_KEY, JSON.stringify({ ...info(), ...patch })); } catch (e) { /* brak pamięci */ }
}
function changed(patch) {
  Object.assign(status, patch);
  ctx?.onStatus?.();
}

const MSG = {
  'auth/invalid-credential': 'Zły e-mail lub hasło.',
  'auth/wrong-password': 'Złe hasło.',
  'auth/user-not-found': 'Nie ma konta z tym adresem.',
  'auth/invalid-email': 'To nie wygląda na adres e-mail.',
  'auth/too-many-requests': 'Za dużo prób – spróbuj za kilka minut.',
  'auth/network-request-failed': 'Brak internetu.',
  'permission-denied': 'Brak dostępu do bazy – trzeba dodać zasadę w konsoli Firebase (instrukcja w aplikacji).',
  unavailable: 'Brak połączenia z chmurą – spróbuję ponownie później.',
};
const msg = (e) => MSG[e?.code] || e?.message || 'Nieznany błąd.';

async function boot() {
  if (fb) return fb;
  const base = `https://www.gstatic.com/firebasejs/${V}`;
  const [app, auth, fs] = await Promise.all([
    import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-firestore.js`),
  ]);
  const a = app.initializeApp(CFG);
  const au = auth.getAuth(a);
  await auth.setPersistence(au, auth.browserLocalPersistence);
  fb = { auth, fs, au, db: fs.getFirestore(a) };
  auth.onAuthStateChanged(au, (u) => {
    user = u;
    if (unsub) { unsub(); unsub = null; }
    if (!u) { changed({ phase: 'loggedOut' }); return; }
    setInfo({ enabled: true, email: u.email });
    changed({ phase: 'syncing', error: '' });
    const ref = fb.fs.doc(fb.db, 'stazysta', u.uid);
    unsub = fb.fs.onSnapshot(ref, (snap) => reconcile(snap.exists() ? snap.data() : null),
      (e) => changed({ phase: 'error', error: msg(e) }));
  });
  return fb;
}

/** Porównanie danych z chmurą i decyzja: wysłać, pobrać, czy nic. */
async function reconcile(remote) {
  if (!user || !ctx) return;
  const st = ctx.state;
  const localAt = Number(st.meta?.updatedAt) || 0;
  const remoteAt = remote ? Number(remote.updatedAt) || 0 : null;
  const d = decideSync(localAt, remoteAt, info().lastSync || 0);
  try {
    if (d === 'push' || d === 'conflict-push') {
      if (d === 'conflict-push' && remote) localStorage.setItem(BACKUP_KEY, remote.data);
      await fb.fs.setDoc(fb.fs.doc(fb.db, 'stazysta', user.uid), toRemote(st, deviceName(navigator.userAgent)));
      setInfo({ lastSync: localAt });
    } else if (d === 'pull' || d === 'conflict-pull') {
      const data = fromRemote(remote);
      if (!data) throw new Error('Dane w chmurze są uszkodzone – nic nie zmieniłem.');
      if (d === 'conflict-pull') localStorage.setItem(BACKUP_KEY, JSON.stringify(st));
      setInfo({ lastSync: remoteAt });
      ctx.replaceFromCloud(data);
      ctx.toast(`☁️ Zaktualizowano z urządzenia: ${remote.device || 'inne'}`);
    } else {
      setInfo({ lastSync: localAt });
    }
    changed({ phase: 'ok', error: '', lastAt: new Date(), from: remote?.device || '' });
  } catch (e) {
    changed({ phase: 'error', error: msg(e) });
  }
}

/** Po każdej zmianie w aplikacji – wyślij do chmury (z opóźnieniem, żeby nie wysyłać przy każdym znaku). */
export function onLocalSave() {
  if (!user) return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      const snap = await fb.fs.getDoc(fb.fs.doc(fb.db, 'stazysta', user.uid));
      await reconcile(snap.exists() ? snap.data() : null);
    } catch (e) { changed({ phase: 'error', error: msg(e) }); }
  }, 1200);
}

export async function initSync(c) {
  ctx = c;
  if (!info().enabled) { status.phase = 'off'; return; }
  try { await boot(); } catch (e) { changed({ phase: 'error', error: 'Nie udało się połączyć z Firebase (brak internetu?).' }); }
}

export async function signIn(email, password) {
  changed({ phase: 'syncing', error: '' });
  try {
    await boot();
    await fb.auth.signInWithEmailAndPassword(fb.au, email.trim(), password);
  } catch (e) {
    changed({ phase: 'loggedOut', error: msg(e) });
  }
}

export async function signOutSync() {
  if (fb) await fb.auth.signOut(fb.au);
  setInfo({ enabled: false, lastSync: 0 });
  changed({ phase: 'off', error: '' });
}

export async function syncNow() {
  if (!user) return;
  changed({ phase: 'syncing' });
  onLocalSave();
}

export function syncStatus() {
  return { ...status, email: user?.email || info().email || '', enabled: !!info().enabled, hasBackup: !!safeGet(BACKUP_KEY) };
}

function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

/** Tylko do testów: podstawienie udawanej chmury i użytkownika. */
export function __test(backend, u, c) { fb = backend; user = u; ctx = c; }
export const __reconcile = (remote) => reconcile(remote);
