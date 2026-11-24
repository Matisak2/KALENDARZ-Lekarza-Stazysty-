// Święta ustawowe w Polsce (ustawa o dniach wolnych od pracy).
// Wigilia (24.12) jest dniem wolnym od 2025 r.
import { addDays, weekday } from './dates.js';

/** Data Wielkanocy (kalendarz gregoriański, algorytm Meeusa/Jonesa/Butchera). */
export function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Lista świąt w danym roku: { date, name }. */
export function holidaysForYear(year) {
  const p = (m, d) => `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const e = easter(year);
  const list = [
    { date: p(1, 1), name: 'Nowy Rok' },
    { date: p(1, 6), name: 'Trzech Króli' },
    { date: e, name: 'Wielkanoc' },
    { date: addDays(e, 1), name: 'Poniedziałek Wielkanocny' },
    { date: p(5, 1), name: 'Święto Pracy' },
    { date: p(5, 3), name: 'Święto Konstytucji 3 Maja' },
    { date: addDays(e, 49), name: 'Zielone Świątki' },
    { date: addDays(e, 60), name: 'Boże Ciało' },
    { date: p(8, 15), name: 'Wniebowzięcie NMP' },
    { date: p(11, 1), name: 'Wszystkich Świętych' },
    { date: p(11, 11), name: 'Święto Niepodległości' },
    { date: p(12, 25), name: 'Boże Narodzenie' },
    { date: p(12, 26), name: 'Drugi dzień Bożego Narodzenia' },
  ];
  if (year >= 2025) list.push({ date: p(12, 24), name: 'Wigilia' });
  return list
    .map((h) => ({ ...h, saturday: weekday(h.date) === 6, sunday: weekday(h.date) === 0 }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Mapa data -> święto dla zakresu dat. */
export function holidayMap(fromIso, toIso) {
  const map = new Map();
  const y0 = Number(fromIso.slice(0, 4));
  const y1 = Number(toIso.slice(0, 4));
  for (let y = y0; y <= y1; y++) {
    for (const h of holidaysForYear(y)) {
      if (h.date >= fromIso && h.date <= toIso) map.set(h.date, h);
    }
  }
  return map;
}
