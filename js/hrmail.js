// „Wklej mail z Kadr” – wyszukiwanie terminów (dat) w treści maila. Czysta logika, w całości testowana.
// Rozpoznaje: 03.12, 3.12.2026, 03.12.26, 3/12, „15 grudnia (2026)”. Godziny typu 15.35 albo 8.00 są pomijane
// (miesiąc > 12 albo 0). Bez roku – wybierany rok, w którym termin wypada najbliżej (nie dawniej niż 2 miesiące temu).
import { toNum, toIso } from './dates.js';

const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const NUM = /(?<![\d.,:/])(\d{1,2})[./](\d{1,2})(?:[./](\d{4}|\d{2}))?(?![\d,:]|\.\d)/g;
const WORD = new RegExp(`(?<!\\d)(\\d{1,2})\\s+(${MONTHS.join('|')})(?:\\s+(\\d{4}))?`, 'gi');

// Co jest w zdaniu – do tytułu terminu
const KEYS = [
  [/kart\w* czasu pracy/i, 'karta czasu pracy'],
  [/kart\w* dyżur/i, 'karta dyżurów'],
  [/list\w* obecno/i, 'lista obecności'],
  [/wnios\w* urlop/i, 'wniosek urlopowy'],
  [/zwolnieni|L4\b/i, 'zwolnienie lekarskie'],
  [/badani\w* (okresow|lekarsk)/i, 'badania lekarskie'],
  [/szkoleni/i, 'szkolenie'],
  [/umow/i, 'umowa'],
  [/pit\b/i, 'PIT'],
  [/podpis/i, 'podpisy'],
  [/pieczęć|pieczątk/i, 'pieczątki'],
];

function validDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return toIso(toNum(iso)) === iso ? iso : null;
}

/** Rok dla daty bez roku: najbliższy, ale nie wcześniej niż ok. 2 miesiące przed `today`. */
function withYear(m, d, today) {
  const y0 = Number(today.slice(0, 4));
  for (const y of [y0 - 1, y0, y0 + 1]) {
    const iso = validDate(y, m, d);
    if (iso && toNum(iso) >= toNum(today) - 62) return iso;
  }
  return null;
}

/** Zdanie (linia) wokół daty – do opisu terminu. */
function contextAt(text, index) {
  const start = Math.max(text.lastIndexOf('\n', index - 1) + 1, index - 140);
  let end = text.indexOf('\n', index);
  if (end < 0) end = text.length;
  end = Math.min(end, index + 160);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function titleFor(ctx, due) {
  const found = [...new Set(KEYS.filter(([re]) => re.test(ctx)).map(([, t]) => t))];
  const dd = `${due.slice(8, 10)}.${due.slice(5, 7)}`;
  if (found.length) return `Kadry: ${found.join(', ')} – do ${dd}`;
  const short = ctx.length > 60 ? `${ctx.slice(0, 57).trim()}…` : ctx;
  return `Kadry: ${short || 'termin z maila'}`;
}

/**
 * Terminy znalezione w treści maila: [{ due, title, detail, past }] posortowane po dacie (ta sama data – raz,
 * opisy połączone). `past` = data już minęła (domyślnie nie zaznaczamy jej do zapisu).
 */
export function parseHrMail(text, today) {
  const t = String(text || '');
  const found = new Map();
  const add = (iso, index) => {
    if (!iso) return;
    const ctx = contextAt(t, index);
    const prev = found.get(iso);
    if (prev) { if (!prev.detail.includes(ctx)) prev.detail = `${prev.detail} · ${ctx}`.slice(0, 300); return; }
    found.set(iso, { due: iso, detail: ctx, title: titleFor(ctx, iso), past: iso < today });
  };
  for (const m of t.matchAll(NUM)) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let iso;
    if (m[3]) { const y = Number(m[3].length === 2 ? `20${m[3]}` : m[3]); iso = validDate(y, mo, d); } else iso = withYear(mo, d, today);
    add(iso, m.index);
  }
  for (const m of t.matchAll(WORD)) {
    const d = Number(m[1]);
    const mo = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    add(m[3] ? validDate(Number(m[3]), mo, d) : withYear(mo, d, today), m.index);
  }
  return [...found.values()].sort((a, b) => (a.due < b.due ? -1 : 1));
}
