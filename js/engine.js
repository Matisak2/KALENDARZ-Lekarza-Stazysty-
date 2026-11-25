// Silnik wyliczeń: dni robocze, bloki, odrabianie, rezerwa, urlop.
// Czysta logika bez interfejsu – w całości pokryta testami (tests/).
import { addDays, eachDay, isWeekend, toNum } from './dates.js';
import { holidayMap } from './holidays.js';
import { EVENT_TYPES, HR_DEADLINES, DUTY_BREAKS } from './defaults.js';
import { hospitalOf } from './hospitals.js';
import { bookletProgress } from './booklet.js';

/**
 * Buduje kontekst dni: święta, dni wolne za soboty, nieobecności i kursy.
 * Zakres sięga rok poza koniec stażu, żeby dało się policzyć ewentualne wydłużenie.
 */
export function buildContext(state) {
  const { settings } = state;
  const from = settings.startDate;
  const to = addDays(settings.endDate, 366);
  const holidays = holidayMap(from, to);

  // Dni wolne wyznaczone za święta przypadające w sobotę
  const satOff = new Map();
  for (const [hDate, off] of Object.entries(settings.saturdayDaysOff || {})) {
    if (off) satOff.set(off, hDate);
  }

  // Nieobecności: data -> { kind, type, label, id }
  const absence = new Map();
  for (const ev of state.events || []) {
    if (!ev.start || !ev.end) continue;
    for (const d of eachDay(ev.start, ev.end)) {
      if (!absence.has(d)) absence.set(d, { kind: 'event', type: ev.type, id: ev.id, label: EVENT_TYPES[ev.type]?.short || ev.type });
    }
  }
  for (const c of state.courses || []) {
    if (!c.start || !c.end) continue;
    for (const d of eachDay(c.start, c.end)) {
      absence.set(d, { kind: 'course', type: 'kurs', id: c.id, label: c.name });
    }
  }

  const ctx = { state, settings, holidays, satOff, absence };
  ctx.lastBlockEnd = (state.blocks || []).reduce((m, b) => (b.end > m ? b.end : m), settings.startDate);
  return ctx;
}

/** Czy dzień jest wolny "z mocy prawa" (święto w dzień roboczy lub dzień wolny za sobotę). */
export function statutoryOff(ctx, d) {
  if (isWeekend(d)) return null;
  const h = ctx.holidays.get(d);
  if (h) return { reason: 'święto', label: h.name };
  if (ctx.satOff.has(d)) {
    const hd = ctx.satOff.get(d);
    return { reason: 'wolne za sobotę', label: `Dzień wolny za ${ctx.holidays.get(hd)?.name || 'święto'} (${hd.slice(8, 10)}.${hd.slice(5, 7)})` };
  }
  return null;
}

/**
 * Klasyfikacja dnia w bloku:
 *  - 'weekend'  – sobota/niedziela (nie liczy się),
 *  - 'work'     – dzień stażu zrealizowany/planowany,
 *  - 'lost'     – dzień roboczy, który przepada i trzeba go odrobić.
 */
export function classifyBlockDay(ctx, d) {
  if (isWeekend(d)) return { kind: 'weekend' };
  const abs = ctx.absence.get(d);
  const off = statutoryOff(ctx, d);
  if (off) {
    if (ctx.settings.holidayMode === 'zaliczane') return { kind: 'work', counted: off };
    return { kind: 'lost', reason: off.reason, label: off.label };
  }
  if (abs) return { kind: 'lost', reason: abs.kind === 'course' ? 'kurs' : abs.type, label: abs.label };
  return { kind: 'work' };
}

/** Dni, w które można odrabiać w rezerwie (dzień roboczy, bez święta i bez nieobecności). */
export function isFreeWorkday(ctx, d) {
  return !isWeekend(d) && !statutoryOff(ctx, d) && !ctx.absence.has(d);
}

export function blockStats(ctx, block, today) {
  const days = eachDay(block.start, block.end);
  const lost = [];
  let planned = 0;
  let done = 0;
  for (const d of days) {
    const c = classifyBlockDay(ctx, d);
    if (c.kind === 'work') {
      planned++;
      if (d <= today) done++;
    } else if (c.kind === 'lost') {
      lost.push({ date: d, reason: c.reason, label: c.label });
    }
  }
  const required = Number(block.required) || 0;
  const makeUp = Math.max(0, required - planned);
  const surplus = Math.max(0, planned - required);
  const remainingInRange = planned - done;
  let status;
  if (today < block.start) status = 'future';
  else if (today <= block.end) status = 'current';
  else status = 'past';
  return {
    block, required, planned, done, lost, makeUp, surplus, remainingInRange, status,
    workdaysInRange: days.filter((d) => !isWeekend(d)).length,
    lostShare: required ? lost.length / required : 0,
  };
}

/** Liczba dni roboczych urlopu w wydarzeniu (bez świąt i dni wolnych za soboty). */
export function vacationDaysOf(ctx, ev) {
  if (!EVENT_TYPES[ev.type]?.vacation) return 0;
  return eachDay(ev.start, ev.end).filter((d) => !isWeekend(d) && !statutoryOff(ctx, d)).length;
}

export function vacationSummary(ctx, today) {
  const pool = ctx.settings.vacationPool || {};
  const total = Object.values(pool).reduce((a, b) => a + Number(b || 0), 0);
  let used = 0, planned = 0, onDemand = 0;
  const byYear = {};
  for (const ev of ctx.state.events || []) {
    if (!EVENT_TYPES[ev.type]?.vacation) continue;
    for (const d of eachDay(ev.start, ev.end)) {
      if (isWeekend(d) || statutoryOff(ctx, d)) continue;
      if (d <= today) used++; else planned++;
      const y = d.slice(0, 4);
      byYear[y] = (byYear[y] || 0) + 1;
      if (ev.type === 'urlop_zadanie') onDemand++;
    }
  }
  return { total, pool, used, planned, left: total - used - planned, byYear, onDemand };
}

/**
 * Pełne podsumowanie stażu.
 * Rezerwa = dni robocze od dnia po ostatnim bloku do końca umowy.
 * Z rezerwy "schodzą": odrabianie bloków, kursy bez terminu, niezaplanowany urlop
 * oraz nieobecności wpisane w okresie rezerwy.
 */
export function summarize(state, today) {
  const ctx = buildContext(state);
  const { settings } = state;
  const blocks = [...state.blocks].sort((a, b) => (a.start < b.start ? -1 : 1));
  const stats = blocks.map((b) => blockStats(ctx, b, today));

  // Rezerwa
  const reserveStart = addDays(ctx.lastBlockEnd, 1);
  const reserveDays = reserveStart <= settings.endDate ? eachDay(reserveStart, settings.endDate) : [];
  const reserveWorkdays = reserveDays.filter((d) => !isWeekend(d) && !statutoryOff(ctx, d));
  const reserveAbsences = reserveWorkdays.filter((d) => ctx.absence.has(d));
  const reserveFree = reserveWorkdays.filter((d) => !ctx.absence.has(d));

  const totalMakeUp = stats.reduce((a, s) => a + s.makeUp, 0);
  const coursesUnscheduled = (state.courses || []).filter((c) => !c.start).reduce((a, c) => a + Number(c.days || 0), 0);
  const vac = vacationSummary(ctx, today);
  const vacationUnplanned = Math.max(0, vac.left);

  const free = reserveWorkdays.length - reserveAbsences.length - totalMakeUp - coursesUnscheduled - vacationUnplanned;

  // Plan odrabiania: kolejne wolne dni rezerwy przypisane blokom w kolejności chronologicznej.
  // Jeśli rezerwy zabraknie – kolejne dni robocze po końcu umowy (szacunek wydłużenia).
  const makeUpPlan = [];
  let cursor = reserveStart;
  const nextFree = () => {
    while (!isFreeWorkday(ctx, cursor)) cursor = addDays(cursor, 1);
    const d = cursor;
    cursor = addDays(cursor, 1);
    return d;
  };
  for (const s of stats) {
    for (let i = 0; i < s.makeUp; i++) {
      const d = nextFree();
      makeUpPlan.push({ date: d, blockId: s.block.id, beyondEnd: d > settings.endDate });
    }
  }
  // Szacowany koniec stażu: jeśli brakuje dni, dokładamy kolejne dni robocze po końcu umowy.
  let estimatedEnd = settings.endDate;
  if (free < 0) {
    let d = settings.endDate;
    let missing = -free;
    while (missing > 0) {
      d = addDays(d, 1);
      if (isFreeWorkday(ctx, d)) missing--;
    }
    estimatedEnd = d;
  }

  const current = stats.find((s) => s.status === 'current') || null;
  const next = stats.find((s) => s.block.start > today) || null;
  const makeUpToday = makeUpPlan.find((m) => m.date === today) || null;

  // Postęp programu: dni bloków + dni kursów
  const programTotal = stats.reduce((a, s) => a + s.required, 0) + (state.courses || []).reduce((a, c) => a + Number(c.days || 0), 0);
  const coursesDone = (state.courses || []).reduce((a, c) => {
    if (!c.start) return a;
    return a + Math.min(Number(c.days || 0), eachDay(c.start, c.end < today ? c.end : today).filter((d) => !isWeekend(d) && c.start <= today).length);
  }, 0);
  const makeUpDone = makeUpPlan.filter((m) => m.date <= today).length;
  const programDone = stats.reduce((a, s) => a + Math.min(s.done, s.required), 0) + makeUpDone + coursesDone;

  const calTotal = toNum(settings.endDate) - toNum(settings.startDate) + 1;
  const calElapsed = Math.min(calTotal, Math.max(0, toNum(today) - toNum(settings.startDate) + 1));
  const daysToEnd = Math.max(0, toNum(estimatedEnd) - toNum(today));
  const workdaysToEnd = today < estimatedEnd ? eachDay(addDays(today, 1), estimatedEnd).filter((d) => !isWeekend(d) && !statutoryOff(ctx, d)).length : 0;

  return {
    ctx, today, stats, current, next, makeUpToday,
    reserve: {
      start: reserveStart, end: settings.endDate,
      workdays: reserveWorkdays.length, absences: reserveAbsences.length, freeDays: reserveFree.length,
      makeUp: totalMakeUp, coursesUnscheduled, vacationUnplanned, free,
    },
    makeUpPlan, estimatedEnd, vacation: vac,
    program: { total: programTotal, done: programDone },
    calendar: { total: calTotal, elapsed: calElapsed, daysToEnd, workdaysToEnd },
  };
}

/** Lista ostrzeżeń i przypomnień do pokazania na ekranie "Dziś". */
export function alerts(sum) {
  const out = [];
  const { settings } = sum.ctx;
  const today = sum.today;

  for (const dl of settings.lek?.deadlines || []) {
    if (dl.done || (settings.lek?.registered && dl.label.startsWith('Zgłoszenie na LEK (wiosna'))) continue;
    const left = toNum(dl.date) - toNum(today);
    if (left >= 0 && left <= 30) out.push({ level: left <= 7 ? 'urgent' : 'warn', icon: '📝', title: dl.label, detail: left === 0 ? 'Dziś!' : `Zostało ${left} ${left === 1 ? 'dzień' : 'dni'}`, date: dl.date, action: 'deadline-done' });
  }
  // Terminy Kadr USK2 (karty czasu pracy, dyżurów, listy obecności)
  const hrDone = settings.hrDone || {};
  for (const d of HR_DEADLINES) {
    const left = toNum(d.due) - toNum(today);
    if (!hrDone[d.id] && left >= 0 && left <= 21) {
      out.push({ level: left <= 3 ? 'urgent' : 'warn', icon: '📋', title: d.title, detail: `${d.detail} · ${left === 0 ? 'dziś!' : `zostało ${left} ${left === 1 ? 'dzień' : 'dni'}`}`, action: 'hr-done', id: d.id });
    }
  }
  // Staż cząstkowy poza USK2: pismo ze zgodą koordynatora + kopia książeczki zdrowia, pisemna informacja do Kadr
  for (const b of sum.ctx.state.blocks || []) {
    const left = toNum(b.start) - toNum(today);
    const seg = [...(b.segments || [])].sort((x, y) => (x.start < y.start ? -1 : 1))[0];
    const h = hospitalOf(seg);
    const id = `ext-${b.id}-${b.start}`;
    if (h && h.id !== 'usk2' && left >= -7 && left <= 21 && !hrDone[id]) {
      out.push({ level: left <= 3 ? 'urgent' : 'warn', icon: '🏥', action: 'hr-done', id,
        title: `${b.short} (${h.short || h.name})${left > 0 ? ` od ${b.start.slice(8)}.${b.start.slice(5, 7)}` : ''} – formalności`,
        detail: 'Poinformuj koordynatora; do placówki pismo ze zgodą koordynatora + kopia książeczki zdrowia; pisemna informacja do Kadr USK2 o miejscu stażu (Informacja USK2, pkt 10–11)' });
    }
  }
  for (const [hDate, off] of Object.entries(settings.saturdayDaysOff || {})) {
    if (!off && hDate >= settings.startDate && hDate <= settings.endDate) {
      const h = sum.ctx.holidays.get(hDate);
      out.push({ level: 'info', icon: '📅', title: `Wpisz dzień wolny za ${h?.name || 'święto'} (${hDate.slice(8, 10)}.${hDate.slice(5, 7)}, sobota)`, detail: 'Pracodawca musi wyznaczyć inny dzień wolny' });
    }
  }
  const st = sum.ctx.state;
  // Karta czasu pracy: ostatnie 3 dni miesiąca i pierwsze 5 dni kolejnego
  {
    const [y, m, dd] = today.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    let ym = null;
    if (dd >= lastDay - 2) ym = today.slice(0, 7);
    else if (dd <= 5) { const t = y * 12 + (m - 1) - 1; ym = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; }
    const inStaz = ym && `${ym}-31` >= st.settings.startDate && `${ym}-01` <= st.settings.endDate;
    if (inStaz && !st.timesheets?.[ym]?.generatedAt) {
      out.push({ level: 'info', icon: '🗂', action: 'timesheet', ym, title: `Karta czasu pracy za ${['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'][Number(ym.slice(5)) - 1]}`, detail: 'Wygeneruj PDF i oddaj do podpisu' });
    }
  }
  // Książeczka: blok kończy się w ciągu 5 dni albo już się skończył, a brakuje podpisów
  const unsigned = sum.stats.filter((s) => toNum(s.block.end) - toNum(today) <= 5)
    .map((s) => ({ b: s.block, p: bookletProgress(st, s.block) })).filter((x) => x.p.missing.length);
  if (unsigned.length) {
    const first = unsigned[0];
    out.push({
      level: 'info', icon: '📘', action: 'booklet', blockId: first.b.id,
      title: unsigned.length === 1 ? `Książeczka – ${first.b.short}: brakuje ${first.p.missing.length} podpisów`
        : `Książeczka: brakuje podpisów w ${unsigned.length} blokach`,
      detail: unsigned.map((x) => `${x.b.short} ${x.p.done}/${x.p.total}`).join(' · '),
    });
  }
  const entries = (st.events || []).length + (st.duties || []).length
    + (st.courses || []).filter((c) => c.start).length + Object.keys(st.notes || {}).length;
  if (entries > 0) {
    const last = st.meta?.lastBackup ? st.meta.lastBackup.slice(0, 10) : null;
    const ago = last ? toNum(today) - toNum(last) : null;
    if (!last) out.push({ level: 'info', icon: '💾', title: 'Zrób kopię zapasową', detail: 'Dane są tylko w tym telefonie – Więcej → Zapisz kopię', action: 'backup' });
    else if (ago >= 30) out.push({ level: 'info', icon: '💾', title: `Ostatnia kopia ${ago} dni temu`, detail: 'Zapisz nową kopię: Więcej → Zapisz kopię', action: 'backup' });
  }
  if (sum.reserve.free < 0) {
    out.push({ level: 'warn', icon: '⏳', title: `Brakuje ${-sum.reserve.free} dni roboczych w rezerwie`, detail: `Przy obecnych założeniach staż może potrwać do ${sum.estimatedEnd.slice(8, 10)}.${sum.estimatedEnd.slice(5, 7)}.${sum.estimatedEnd.slice(0, 4)}` });
  }
  for (const s of sum.stats) {
    if (s.status !== 'past' && s.required <= 20 && s.lostShare >= 0.2) {
      out.push({ level: 'info', icon: '⚠️', title: `${s.block.short}: przepada ${s.lost.length} z ${s.required} dni`, detail: `${Math.round(s.lostShare * 100)}% bloku do odrobienia po zakończeniu harmonogramu` });
    }
  }
  return out;
}

/* ---------- Tygodnie bloku i przypisane oddziały ---------- */

/**
 * Tygodnie bloku (czwartek–środa w harmonogramie grupy):
 * { i: numer tygodnia w bloku, n: numer tygodnia stażu, start, end }.
 */
export function blockWeeks(block, stazStart) {
  const out = [];
  let s = block.start;
  let i = 1;
  while (s <= block.end) {
    const e7 = addDays(s, 6);
    const end = e7 < block.end ? e7 : block.end;
    const n = Math.floor((toNum(s) - toNum(stazStart)) / 7) + 1;
    out.push({ i, n, start: s, end });
    s = addDays(s, 7);
    i++;
  }
  return out;
}

/** Odcinek (oddział) bloku obowiązujący w danym dniu. */
export function segmentAt(block, d) {
  return (block.segments || []).find((s) => s.start <= d && d <= s.end) || null;
}

/**
 * Sprawdza odcinki bloku: luki (dni bez oddziału), nakładanie się i wyjście poza blok.
 * Zwraca { ok, gaps:[{start,end}], overlaps:[[a,b]], outside:[seg] }.
 */
export function checkSegments(block) {
  const segs = [...(block.segments || [])].sort((a, b) => (a.start < b.start ? -1 : 1));
  const outside = segs.filter((s) => s.start < block.start || s.end > block.end || s.start > s.end);
  const overlaps = [];
  for (let k = 1; k < segs.length; k++) {
    if (segs[k].start <= segs[k - 1].end) overlaps.push([segs[k - 1], segs[k]]);
  }
  const gaps = [];
  let cur = block.start;
  for (const s of segs) {
    if (s.start > cur) gaps.push({ start: cur, end: addDays(s.start, -1) });
    if (s.end >= cur) cur = addDays(s.end, 1);
  }
  if (cur <= block.end) gaps.push({ start: cur, end: block.end });
  return { ok: !outside.length && !overlaps.length, gaps: segs.length ? gaps : [], overlaps, outside };
}

/** Gdzie jestem danego dnia: blok + oddział (jeśli przypisany). */
export function placeOn(state, d) {
  const block = (state.blocks || []).find((b) => b.start <= d && d <= b.end) || null;
  if (!block) return null;
  return { block, segment: segmentAt(block, d) };
}

/* ---------- Dzień w kalendarzu i skutki wpisu ---------- */

/** Wszystko o jednym dniu – do kalendarza miesięcznego i okna dnia. */
export function dayInfo(sum, d) {
  const { ctx } = sum;
  const block = ctx.state.blocks.find((b) => b.start <= d && d <= b.end) || null;
  const makeUp = sum.makeUpPlan.find((m) => m.date === d) || null;
  const holiday = ctx.holidays.get(d) || null;
  const satOffFor = ctx.satOff.get(d) || null;
  const absence = ctx.absence.get(d) || null;
  const weekend = isWeekend(d);
  const inStaz = d >= ctx.settings.startDate && d <= sum.estimatedEnd;
  const reserve = !block && inStaz && d >= sum.reserve.start;
  const cls = block ? classifyBlockDay(ctx, d) : null;
  return {
    date: d, block, segment: block ? segmentAt(block, d) : null, makeUp, holiday, satOffFor, absence,
    weekend, inStaz, reserve, lost: cls?.kind === 'lost' ? cls : null,
  };
}

/**
 * Skutek wpisu (urlop, L4…) przed zapisaniem:
 * dni robocze, dni urlopu, ile dni zabiera z każdego bloku, ile z rezerwy, zmiana zapasu.
 */
export function eventImpact(state, ev, today) {
  const before = summarize(state, today);
  const others = (state.events || []).filter((e) => e.id !== ev.id);
  const after = summarize({ ...state, events: [...others, ev] }, today);
  const ctx = after.ctx;
  const days = eachDay(ev.start, ev.end);
  const work = days.filter((d) => !isWeekend(d) && !statutoryOff(ctx, d));
  const perBlock = [];
  for (const s of after.stats) {
    const n = work.filter((d) => s.block.start <= d && d <= s.block.end).length;
    if (n) perBlock.push({ block: s.block, days: n, share: s.required ? n / s.required : 0 });
  }
  return {
    calendarDays: days.length,
    workdays: work.length,
    vacationDays: EVENT_TYPES[ev.type]?.vacation ? work.length : 0,
    vacationLeftAfter: after.vacation.left,
    perBlock,
    inReserve: work.filter((d) => d >= after.reserve.start && d <= after.reserve.end).length,
    freeBefore: before.reserve.free,
    freeAfter: after.reserve.free,
    endBefore: before.estimatedEnd,
    endAfter: after.estimatedEnd,
    extends: !!EVENT_TYPES[ev.type]?.extends,
  };
}

/* ---------- Dyżury ---------- */

export const DUTY_WEEK_LIMIT = 605; // 10 h 05 min na „tydzień” miesiąca
export const DUTY_MONTH_MAX = 2420; // 40 h 20 min
export const DUTY_COUNT_MAX = 8;

/** Formatowanie minut: 605 -> "10 h 05 min". */
export function fmtHM(min) {
  const m = Math.round(Math.abs(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  const s = h && r ? `${h} h ${String(r).padStart(2, '0')} min` : h ? `${h} h` : `${r} min`;
  return min < 0 ? `−${s}` : s;
}

/** „Tygodnie” miesiąca wg zasad szpitala: 1–7, 8–14, 15–21, 22–koniec. */
export function dutyBuckets(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const p = (d) => `${ym}-${String(d).padStart(2, '0')}`;
  return [[1, 7], [8, 14], [15, 21], [22, last]].map(([a, b], i) => ({ i: i + 1, start: p(a), end: p(b) }));
}

/**
 * Dyżury w miesiącu: norma, suma, liczba, „tygodnie” i ostrzeżenia.
 * Norma: 10 h 05 min za każdy „tydzień”, w którym większość dni roboczych przypada na blok z dyżurami,
 * minus 10 h 05 min za każde pełne 5 dni urlopu / L4 / bezpłatnego w miesiącu (poradnik OIL 2026).
 */
export function dutyMonth(state, ym) {
  const ctx = buildContext(state);
  const duties = (state.duties || []).filter((x) => x.date.startsWith(ym)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const blockOf = (d) => state.blocks.find((b) => b.start <= d && d <= b.end) || null;
  const buckets = dutyBuckets(ym).map((bk) => {
    const work = eachDay(bk.start, bk.end).filter((d) => !isWeekend(d));
    const dutyDays = work.filter((d) => blockOf(d)?.duties).length;
    const minutes = duties.filter((x) => x.date >= bk.start && x.date <= bk.end).reduce((a, x) => a + Number(x.minutes || 0), 0);
    return { ...bk, dutyWeek: work.length > 0 && dutyDays * 2 > work.length, minutes, limit: DUTY_WEEK_LIMIT };
  });
  const [y, m] = ym.split('-').map(Number);
  const monthDays = eachDay(`${ym}-01`, `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`);
  const absenceWorkdays = monthDays.filter((d) => {
    const a = ctx.absence.get(d);
    return a && a.kind === 'event' && ['urlop', 'urlop_zadanie', 'l4', 'opieka', 'bezplatny'].includes(a.type)
      && !isWeekend(d) && !statutoryOff(ctx, d);
  }).length;
  const dutyWeeks = buckets.filter((b) => b.dutyWeek).length;
  const reduction = Math.floor(absenceWorkdays / 5) * DUTY_WEEK_LIMIT;
  const norm = Math.max(0, dutyWeeks * DUTY_WEEK_LIMIT - reduction);
  const total = duties.reduce((a, x) => a + Number(x.minutes || 0), 0);

  const warnings = [];
  for (const b of buckets) {
    if (b.minutes > b.limit) warnings.push({ level: 'warn', text: `Tydzień ${b.i} (${b.start.slice(8)}–${b.end.slice(8)}): ${fmtHM(b.minutes)} – limit ${fmtHM(b.limit)}` });
  }
  if (duties.length > DUTY_COUNT_MAX) warnings.push({ level: 'warn', text: `${duties.length} dyżurów – maksymalnie ${DUTY_COUNT_MAX} w miesiącu` });
  if (total > DUTY_MONTH_MAX) warnings.push({ level: 'warn', text: `Suma ${fmtHM(total)} – maksymalnie ${fmtHM(DUTY_MONTH_MAX)} w miesiącu` });
  for (const x of duties) {
    const dd = `${x.date.slice(8)}.${x.date.slice(5, 7)}`;
    // Informacja USK2 dla stażysty, pkt 2 i 6: dyżury tylko pn–pt, nie w soboty, niedziele i święta
    if (isWeekend(x.date) || statutoryOff(ctx, x.date)) warnings.push({ level: 'warn', text: `${dd}: dyżurów nie pełni się w soboty, niedziele i święta (USK2) – tylko pn–pt` });
    const br = DUTY_BREAKS.find((r) => r.start <= x.date && x.date <= r.end);
    if (br) warnings.push({ level: 'warn', text: `${dd}: ${br.label} – bez dyżurów` });
    const a = ctx.absence.get(x.date);
    if (a) warnings.push({ level: 'warn', text: `${x.date.slice(8)}.${x.date.slice(5, 7)}: dyżur w dniu ${a.kind === 'course' ? 'kursu' : 'nieobecności'} (${a.label})` });
    const b = blockOf(x.date);
    if (b && !b.duties) warnings.push({ level: 'info', text: `${x.date.slice(8)}.${x.date.slice(5, 7)}: w bloku ${b.short} zwykle nie ma dyżurów` });
  }
  return { ym, duties, buckets, norm, total, left: norm - total, count: duties.length, absenceWorkdays, reduction, dutyWeeks, warnings };
}

/** Ile minut można jeszcze dyżurować w „tygodniu” danego dnia (bez danego dyżuru – przy edycji). */
export function dutyRoomOn(state, date, exceptId = null) {
  const ym = date.slice(0, 7);
  const bk = dutyBuckets(ym).find((b) => b.start <= date && date <= b.end);
  const used = (state.duties || []).filter((x) => x.id !== exceptId && x.date >= bk.start && x.date <= bk.end)
    .reduce((a, x) => a + Number(x.minutes || 0), 0);
  return { bucket: bk, used, room: Math.max(0, DUTY_WEEK_LIMIT - used) };
}

/** Suma dyżurów w całym stażu (max 41 tyg. × 10 h 05 min = 413 h 25 min wg poradnika OIL). */
export function dutyTotals(state) {
  const total = (state.duties || []).reduce((a, x) => a + Number(x.minutes || 0), 0);
  return { total, count: (state.duties || []).length, max: 41 * DUTY_WEEK_LIMIT };
}
