// Karta czasu pracy (wzór USK2, „Wydanie 4”, KP-WK 2023-11-27) – wyliczenie wierszy z danych aplikacji.
// Zapis godzin jak na wzorze: „7,35” = 7 h 35 min; sumy „166.50” = 166 h 50 min.
import { eachDay, isWeekend, MONTHS } from './dates.js';
import { buildContext, statutoryOff } from './engine.js';
import { EVENT_TYPES } from './defaults.js';

export const WORK_START = 8 * 60; // 8:00
export const WORK_MIN = 7 * 60 + 35; // 7 h 35 min (wymiar dobowy stażysty)

const MONTHS_GEN = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];

/** 455 -> "7,35" (godziny,minuty); 300 -> "5"; 0 -> "". */
export function hm(min, sep = ',') {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}${sep}${String(m).padStart(2, '0')}` : `${h}`;
}
/** Godzina zegarowa: 935 -> "15.35", 480 -> "8.00". */
export function clock(min) {
  const t = ((min % 1440) + 1440) % 1440;
  return `${Math.floor(t / 60)}.${String(t % 60).padStart(2, '0')}`;
}
export function parseClock(s) {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(s || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Minuty dyżuru w przedziale nocnym 22–6 (dla dyżuru od `start` przez `len` minut). */
export function nightMinutes(start, len) {
  let n = 0;
  for (let t = start; t < start + len; t++) {
    const c = ((t % 1440) + 1440) % 1440;
    if (c >= 22 * 60 || c < 6 * 60) n++;
  }
  return n;
}

// Kody z legendy USK2 (lista obecności, Wydanie 5, KP-WK 2023-11-27): ZL – zwolnienie lekarskie, UW – urlop
// wypoczynkowy (także na żądanie), OP – opieka, UB – urlop bezpłatny, NU – nieobecność usprawiedliwiona płatna,
// SZ – szkolenie, WD – wolne po dyżurze medycznym.
export const ABS_CODE = { urlop: 'UW', urlop_zadanie: 'UW', l4: 'ZL', opieka: 'OP', bezplatny: 'UB', inne: 'NU' };

/**
 * Wiersze karty na miesiąc `ym` (RRRR-MM).
 * Dzień pracy: „8.00-15.35”, nominalne 7,35. Dyżur w dzień pracy: zaczyna się o 15.35 (godziny łącznie „8.00-koniec”),
 * kolumna 4 = długość dyżuru. Dyżur w weekend/święto: kolumna 7 (świąteczny), start z wpisu (domyślnie 8.00).
 */
export function buildTimesheet(state, ym) {
  const ctx = buildContext(state);
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = eachDay(`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`);
  const st = state.settings;
  const overrides = state.timesheets?.[ym]?.rows || {};
  const warnings = [];
  const rows = days.map((d) => {
    const day = Number(d.slice(8));
    const free = isWeekend(d) || !!statutoryOff(ctx, d);
    const inStaz = d >= st.startDate && d <= st.endDate;
    const abs = ctx.absence.get(d);
    const duties = (state.duties || []).filter((x) => x.date === d);
    const dutyMin = duties.reduce((a, x) => a + Number(x.minutes || 0), 0);
    const r = { day, date: d, shaded: free, hours: '', nominal: 0, duty: 0, dutyHoliday: 0, dutyNightHoliday: 0, dutyPhone: 0, note: '' };
    const off = statutoryOff(ctx, d);
    if (off) r.note = off.label;
    if (!inStaz) return { ...r, ...overrides[day] };
    if (free) {
      if (dutyMin) {
        const start = parseClock(duties[0].start) ?? WORK_START;
        r.hours = `${clock(start)}-${clock(start + dutyMin)}`;
        r.dutyHoliday = dutyMin;
        r.dutyNightHoliday = nightMinutes(start, dutyMin);
      }
    } else if (abs) {
      // Dyżur w dniu nieobecności/kursu nie trafia na kartę – ostrzeżenie zamiast cichego pominięcia (audyt B5)
      if (dutyMin) warnings.push(`${d.slice(8)}.${d.slice(5, 7)}: dyżur (${hm(dutyMin)}) w dniu ${abs.kind === 'course' ? 'kursu' : 'nieobecności'} (${abs.label}) – nie ma go na karcie. Popraw dyżur albo nieobecność.`);
      if (abs.kind === 'course') {
        r.hours = `${clock(WORK_START)}-${clock(WORK_START + WORK_MIN)}`;
        r.nominal = WORK_MIN;
        r.note = `SZ – szkolenie: ${abs.label}`;
      } else {
        r.hours = ABS_CODE[abs.type] || 'NU';
        r.note = EVENT_TYPES[abs.type]?.label || '';
      }
    } else {
      r.nominal = WORK_MIN;
      const end = WORK_START + WORK_MIN + dutyMin;
      r.hours = `${clock(WORK_START)}-${clock(end)}`;
      r.duty = dutyMin;
      r.dutyRed = dutyMin > 0;
    }
    return { ...r, ...overrides[day] };
  });
  const sum = (k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const totals = { nominal: sum('nominal'), duty: sum('duty'), dutyHoliday: sum('dutyHoliday'), dutyNightHoliday: sum('dutyNightHoliday'), dutyPhone: sum('dutyPhone') };
  totals.all = totals.nominal + totals.duty + totals.dutyHoliday;
  return {
    ym, monthLabel: `${MONTHS_GEN[m - 1]} ${y}`, monthTitle: MONTHS[m - 1], rows, totals, warnings,
    name: st.personal?.name || '', unit: st.personal?.unit || 'LEKARZ STAŻYSTA', group: st.group || '',
  };
}

/**
 * Szacunek wynagrodzenia za dyżury w miesiącu (brutto). Rozporządzenie MZ w sprawie stażu (Dz.U. 2023 poz. 377),
 * § 12 pkt 1 lit. a: za każdą godzinę dyżuru (w porze dziennej i nocnej) – 125% stawki godzinowej zasadniczego
 * wynagrodzenia miesięcznego. Stawka godzinowa = pensja zasadnicza / wymiar godzin miesiąca (dni robocze × 7 h 35 min).
 * To szacunek do porównania z paskiem – sposób liczenia stawki w USK2 może się różnić.
 */
export function dutyPay(state, ym) {
  const ctx = buildContext(state);
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const st = state.settings;
  const days = eachDay(`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`);
  const nominalMin = days.filter((d) => !isWeekend(d) && !statutoryOff(ctx, d)).length * WORK_MIN;
  const dutyMin = (state.duties || []).filter((x) => x.date.startsWith(ym)).reduce((a, x) => a + Number(x.minutes || 0), 0);
  const base = Number(st.pay?.base) || 0;
  const hourly = base && nominalMin ? base / (nominalMin / 60) : 0;
  const pay = Math.round((dutyMin / 60) * hourly * 1.25 * 100) / 100;
  return { base, nominalMin, hourly: Math.round(hourly * 100) / 100, dutyMin, rate: 1.25, pay };
}

/**
 * Lista obecności na miesiąc: dzień pracy = miejsce na podpis; nieobecność = kod z legendy USK2
 * (ZL, UW, OP, UB, NU, SZ – szkolenie/kurs); weekend i święto – zacienione.
 */
export function buildAttendance(state, ym) {
  const ctx = buildContext(state);
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const st = state.settings;
  const WD = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
  const rows = eachDay(`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`).map((d) => {
    const off = statutoryOff(ctx, d);
    const free = isWeekend(d) || !!off;
    const inStaz = d >= st.startDate && d <= st.endDate;
    const abs = ctx.absence.get(d);
    let code = '';
    if (inStaz && !free && abs) code = abs.kind === 'course' ? 'SZ' : (ABS_CODE[abs.type] || 'NU');
    return { day: Number(d.slice(8)), date: d, wd: WD[new Date(`${d}T00:00:00Z`).getUTCDay()], shaded: free || !inStaz, code, note: off ? off.label : '' };
  });
  return { ym, monthLabel: `${MONTHS_GEN[m - 1]} ${y}`, rows, name: st.personal?.name || '', group: st.group || '' };
}
