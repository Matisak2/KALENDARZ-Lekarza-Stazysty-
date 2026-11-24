// Operacje na datach w formacie 'RRRR-MM-DD'. Wszystko liczone w UTC,
// żeby strefa czasowa ani zmiana czasu nie przesuwały dni.

const DAY = 86400000;

export function toNum(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
}

export function toIso(num) {
  return new Date(num * DAY).toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  return toIso(toNum(iso) + n);
}

/** 0 = niedziela … 6 = sobota */
export function weekday(iso) {
  return new Date(toNum(iso) * DAY).getUTCDay();
}

export function isWeekend(iso) {
  const w = weekday(iso);
  return w === 0 || w === 6;
}

export function diffDays(a, b) {
  return toNum(b) - toNum(a);
}

/** Wszystkie dni od a do b włącznie. */
export function eachDay(a, b) {
  const out = [];
  for (let n = toNum(a), e = toNum(b); n <= e; n++) out.push(toIso(n));
  return out;
}

export function clampRange(a, b, lo, hi) {
  const s = a > lo ? a : lo;
  const e = b < hi ? b : hi;
  return s <= e ? [s, e] : null;
}

export function inRange(iso, a, b) {
  return iso >= a && iso <= b;
}

export function todayIso(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const MONTHS_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
export const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const DAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const DAYS_SHORT = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];

export function fmtLong(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${DAYS[weekday(iso)]}, ${d} ${MONTHS_GEN[m - 1]}`;
}

export function fmtShort(iso) {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

export function fmtFull(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export function fmtDayShort(iso) {
  return `${DAYS_SHORT[weekday(iso)]} ${fmtShort(iso)}`;
}

/** Polska odmiana: 1 dzień, 2 dni, 5 dni; 1 tydzień, 2 tygodnie, 5 tygodni itd. */
export function plural(n, one, few, many) {
  const a = Math.abs(n);
  if (a === 1) return one;
  const t = a % 10, h = a % 100;
  if (t >= 2 && t <= 4 && (h < 12 || h > 14)) return few;
  return many;
}

export function dni(n) {
  return `${n} ${n === 1 || n === -1 ? 'dzień' : 'dni'}`;
}
