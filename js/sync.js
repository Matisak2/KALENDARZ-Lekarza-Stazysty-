// Synchronizacja telefon ↔ komputer przez Firebase (osobny projekt kalendarz-stazysty).
// Dane leżą w Firestore pod stazysta/{uid} – dostęp ma tylko zalogowany właściciel (zasada w konsoli Firebase).
// Telefon działa dalej bez internetu: lokalna pamięć jest główna, chmura to kopia i łącznik między urządzeniami.
import { decideSync, toRemote, fromRemote, deviceName } from './sync-core.js';
import { snapshot } from './store.js';
import { SCHEMA_VERSION } from './defaults.js';

const V = '10.14.1';
// Konfiguracja aplikacji webowej (dane publiczne – bezpieczeństwo zapewniają zasady Firestore).
const CFG = {
  apiKey: 'AIzaSyCel96CbdTIWXgMgLTODKaNIUHWVoYbr7U',
  authDomain: 'kalendarz-stazysty.firebaseapp.com',
  projectId: 'kalendarz-stazysty',
  storageBucket: 'kalendarz-stazysty.firebasestorage.app',
  messagingSenderId: '461989706723',
  appId: '1:461989706723:web:12069f1b1c19820a4e7ed6',
};
const INFO_KEY = 'kalendarz-sync';

let fb = null;
let ctx = null;
let user = null;
let unsub = null;
let timer = null;
// Dane w chmurze zapisała nowsza wersja aplikacji – nic nie wysyłamy, dopóki ta wersja się nie zaktualizuje (audyt B4)
let blocked = false;
const NEWER = 'W chmurze są dane z nowszej wersji aplikacji (z drugiego urządzenia). Zamknij aplikację całkowicie i otwórz ją ponownie z internetem – pobierze się nowa wersja. Do tego czasu nic nie wysyłam, żeby niczego nie nadpisać.';
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
  'auth/email-already-in-use': 'Konto z tym adresem już istnieje – użyj „Zaloguj”.',
  'auth/weak-password': 'Hasło musi mieć co najmniej 6 znaków.',
  'auth/operation-not-allowed': 'W Firebase nie włączono logowania e-mailem (Authentication → Email/Password).',
  'auth/unauthorized-domain': 'W Firebase brakuje domeny matisak2.github.io (Authentication → Settings → Authorized domains).',
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
  // Nowsza wersja danych w chmurze: ani wysyłać (nadpisałoby nowsze pola), ani pobierać (ta wersja ich nie odczyta)
  const rv = Number(fromRemote(remote)?.version) || 0;
  if (rv > SCHEMA_VERSION) { blocked = true; changed({ phase: 'error', error: NEWER }); return; }
  blocked = false;
  try {
    if (d === 'push' || d === 'conflict-push') {
      if (d === 'conflict-push' && remote) snapshot(remote.data, `wersja z chmury (${remote.device || 'inne urządzenie'}) przed nadpisaniem`);
      await fb.fs.setDoc(fb.fs.doc(fb.db, 'stazysta', user.uid), toRemote(st, deviceName(navigator.userAgent)));
      setInfo({ lastSync: localAt });
    } else if (d === 'pull' || d === 'conflict-pull') {
      const data = fromRemote(remote);
      if (!data) throw new Error('Dane w chmurze są uszkodzone – nic nie zmieniłem.');
      // Zawsze przed pobraniem z chmury: kopia tego, co było w tym urządzeniu
      snapshot(st, `przed pobraniem z chmury (z: ${remote.device || 'inne urządzenie'})`);
      // Najpierw podmiana, dopiero potem zapamiętanie synchronizacji – nieudana podmiana nie może wyglądać na „zsynchronizowane”
      if (ctx.replaceFromCloud(data) === false) { blocked = true; changed({ phase: 'error', error: NEWER }); return; }
      setInfo({ lastSync: remoteAt });
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
  if (!user || blocked) return;
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

export async function signUp(email, password) {
  changed({ phase: 'syncing', error: '' });
  try {
    await boot();
    await fb.auth.createUserWithEmailAndPassword(fb.au, email.trim(), password);
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
  return { ...status, email: user?.email || info().email || '', enabled: !!info().enabled };
}

/** Tylko do testów: podstawienie udawanej chmury i użytkownika. */
export function __test(backend, u, c) { fb = backend; user = u; ctx = c; }
export const __reconcile = (remote) => reconcile(remote);
