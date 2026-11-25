// Częstość tematów na LEK z publicznej bazy pytań CEM (data/cem.json, generuje scripts/cem.py).
//
// Każde pytanie z bazy jest przypisywane do JEDNEJ, najlepiej pasującej lekcji ze spisu użytkownika:
//  – liczą się wspólne „rdzenie słów” (np. „kardiom”), rzadkie słowa ważą więcej niż częste (np. „kardiomiopatia” > „serce”),
//  – słowa z nazwy lekcji ważą 1, z nazwy działu 0,4,
//  – pierwszeństwo mają lekcje z tej samej dziedziny co pytanie (kurs tej dziedziny ×1,6, lekcja z tą dziedziną ×1,25),
//  – remis (ta sama lekcja w kilku kursach, „Leczenie cukrzycy 1” i „2”) – pytanie dzielone po równo.
// Wynik dla lekcji: ile pytań z tego tematu można się spodziewać na LEK = Σ (pytania dziedziny na LEK / pytania dziedziny w bazie)
// po przypisanych pytaniach. To szacunek – baza to 70% egzaminu, nowe pytania zwykle dotyczą podobnych tematów.

export const LEK_Q = { int: 39, ped: 29, chir: 27, gin: 26, rodz: 20, rat: 20, psych: 14, etyka: 10, zp: 8, orz: 7 };

/** Rdzeń słowa – identycznie jak w scripts/cem.py. */
export function stem(w) {
  return w.slice(0, Math.max(4, Math.min(7, w.length - 2)));
}

// Słowa ogólne (nie mówią nic o temacie) – pomijane w nazwach lekcji i działów
const STOP = new Set(`wstęp do i w z ze u na oraz o od po przy bez dla jako lub a choroby choroba chorób chorobach leczenie leczenia
diagnostyka diagnostyczne podstawy podstawowe inne wybrane pozostałe zaburzenia zaburzenie zespół zespoły zespołu stany stan nagłe
nagłych część praktyce teorii ogólne ogólna szczegółowa układu układ narządu narządów objawy badanie badania zmiany ogniskowe
dorosłych postępowanie zasady techniki typu przebiegu prawidłowym nieprawidłowym`.toLowerCase().replace(/ó/g, 'o').split(/\s+/).filter(Boolean).map(stem));

/** Rdzenie słów tekstu (bez słów ogólnych). */
export function tokens(text) {
  const words = String(text || '').toLowerCase().replace(/ó/g, 'o').match(/[a-ząćęłńśźż0-9]+/g) || [];
  return [...new Set(words.filter((w) => w.length >= 3 && !/^\d+$/.test(w)).map(stem).filter((s) => !STOP.has(s)))];
}

/** Przygotowanie indeksu z data/cem.json: pytania jako tablice rdzeni + częstości słów (idf). */
export function prepareCem(raw) {
  if (!raw || !Array.isArray(raw.q) || !Array.isArray(raw.vocab)) return null;
  const qs = raw.q.map((line) => {
    const [d, ids] = String(line).split('|');
    return { d, s: ids ? ids.split(',').map((i) => raw.vocab[Number(i)]) : [] };
  });
  const df = new Map();
  for (const q of qs) for (const s of q.s) df.set(s, (df.get(s) || 0) + 1);
  const byDomain = {};
  for (const q of qs) byDomain[q.d] = (byDomain[q.d] || 0) + 1;
  return { qs, df, total: qs.length, byDomain, updated: raw.updated || '', source: raw.source || '' };
}

const MIN_SCORE = 1.2; // poniżej – pytanie nie pasuje wyraźnie do żadnej lekcji (nie jest przypisywane)

let memo = { sig: null, cem: null, res: null };

/**
 * Ile pytań na LEK przypada na każdą lekcję. `lessons` – z allLessons (key, name, section, domain, domains).
 * Zwraca Map: klucz lekcji -> { exp: oczekiwana liczba pytań na LEK, n: liczba pytań z bazy }.
 */
export function topicYield(lessons, cem) {
  if (!cem) return null;
  const sig = lessons.map((l) => `${l.key}:${(l.domains || []).join('+')}`).join('|');
  if (memo.cem === cem && memo.sig === sig) return memo.res;
  const idf = (s) => Math.log(cem.total / (1 + (cem.df.get(s) || 0)));
  const lw = lessons.map((l) => {
    const m = new Map();
    for (const s of tokens(l.name)) m.set(s, 1);
    for (const s of tokens(l.section)) if (!m.has(s)) m.set(s, 0.4);
    let n = 0;
    for (const [s, w] of m) n += (w * idf(s)) ** 2;
    return { l, m, norm: Math.sqrt(Math.sqrt(n) || 1) };
  });
  const inv = new Map();
  lw.forEach((x, i) => { for (const s of x.m.keys()) { if (!inv.has(s)) inv.set(s, []); inv.get(s).push(i); } });
  const exp = new Array(lessons.length).fill(0);
  const cnt = new Array(lessons.length).fill(0);
  for (const q of cem.qs) {
    const sc = new Map();
    for (const s of q.s) {
      const list = inv.get(s);
      if (!list) continue;
      const v = idf(s);
      for (const i of list) sc.set(i, (sc.get(i) || 0) + lw[i].m.get(s) * v);
    }
    let best = -1;
    let bi = [];
    for (const [i, v0] of sc) {
      const l = lw[i].l;
      const dm = l.domain === q.d ? 1.6 : (l.domains || []).includes(q.d) ? 1.25 : 1;
      const v = (v0 / lw[i].norm) * dm;
      if (v > best + 1e-9) { best = v; bi = [i]; } else if (Math.abs(v - best) <= 1e-9) bi.push(i);
    }
    if (best < MIN_SCORE || !bi.length) continue;
    const w = (LEK_Q[q.d] || 0) / (cem.byDomain[q.d] || 1) / bi.length;
    for (const i of bi) { exp[i] += w; cnt[i] += 1 / bi.length; }
  }
  const res = new Map(lessons.map((l, i) => [l.key, { exp: Math.round(exp[i] * 100) / 100, n: Math.round(cnt[i] * 10) / 10 }]));
  memo = { sig, cem, res };
  return res;
}

/* ---------- Wczytanie indeksu w aplikacji (raz, w tle) ---------- */

let loaded = null;
let loading = false;

/** Indeks bazy CEM, jeśli już wczytany (inaczej null – plan działa wtedy bez częstości tematów). */
export function cemIndex() { return loaded; }

export function loadCem(onReady) {
  if (loaded || loading || typeof fetch !== 'function') return;
  loading = true;
  fetch('data/cem.json').then((r) => r.json()).then((d) => { loaded = prepareCem(d); onReady?.(); })
    .catch(() => { loading = false; });
}
