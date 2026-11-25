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

/**
 * Urlop nabyty do dnia `d`. W roku rozpoczęcia stażu (pierwsza praca) urlop narasta: 1/12 rocznego wymiaru za każdy
 * przepracowany miesiąc (art. 153 § 1 Kodeksu pracy) – pula tego roku (np. 5 dni za X–XII 2026) rozłożona na miesiące do końca roku.
 * Od 1 stycznia kolejnego roku cała pula tego roku jest dostępna od razu (decyzja właściciela 11.2026, art. 153 § 2 KP).
 */
export function vacationAccrued(settings, d) {
  const pool = settings.vacationPool || {};
  const start = settings.startDate;
  const y0 = Number(start.slice(0, 4));
  const y = Number(d.slice(0, 4));
  let total = 0;
  for (const [yy, n] of Object.entries(pool)) if (Number(yy) < y && Number(yy) !== y0) total += Number(n || 0);
  // rok rozpoczęcia: miesiące od startu do końca roku
  const m0 = Number(start.slice(5, 7));
  const months = 12 - m0 + 1;
  let full = 0; // pełne przepracowane miesiące do dnia d (miesiąc „mija” dzień przed tą samą datą w kolejnym miesiącu)
  for (let k = 1; k <= months; k++) {
    const mm = m0 - 1 + k;
    const anniv = `${y0 + Math.floor(mm / 12)}-${String((mm % 12) + 1).padStart(2, '0')}-${start.slice(8, 10)}`;
    if (anniv <= d) full = k;
  }
  if (d >= start) total += y > y0 ? Number(pool[y0] || 0) : (Number(pool[y0] || 0) * full) / months;
  if (y > y0 && pool[y] != null) total += Number(pool[y] || 0);
  return Math.round(total * 100) / 100;
}

/** Pierwszy dzień urlopu wypoczynkowego, którego w danym momencie jeszcze nie masz nabytego (null = wszystko w porządku). */
export function vacationAccrualIssue(ctx) {
  const days = [];
  for (const ev of ctx.state.events || []) {
    if (!EVENT_TYPES[ev.type]?.vacation || !ev.start || !ev.end) continue;
    for (const d of eachDay(ev.start, ev.end)) if (!isWeekend(d) && !statutoryOff(ctx, d)) days.push(d);
  }
  days.sort();
  let used = 0;
  for (const d of days) {
    used++;
    const acc = vacationAccrued(ctx.settings, d);
    if (used > acc + 1e-9) return { date: d, used, accrued: acc };
  }
  return null;
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
  return { total, pool, used, planned, left: total - used - planned, byYear, onDemand, accrual: vacationAccrualIssue(ctx) };
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

const MONTHS_GEN = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];

/** N-ty dzień roboczy miesiąca (bez weekendów, świąt i dni wolnych za soboty). */
export function nthWorkday(ctx, ym, n) {
  let d = `${ym}-01`;
  let k = 0;
  for (;;) {
    if (!isWeekend(d) && !statutoryOff(ctx, d) && ++k === n) return d;
    d = addDays(d, 1);
  }
}

/**
 * Terminy Kadr na cały staż: listopad i grudzień 2026 z e-maili Kadr (HR_DEADLINES), dalej co miesiąc
 * „dokumenty za miesiąc do 3. dnia roboczego następnego miesiąca” – tak jak za listopad (03.12). Do potwierdzenia w Kadrach.
 */
export function hrDeadlines(state, ctx = buildContext(state)) {
  const out = [...HR_DEADLINES];
  const known = new Set(HR_DEADLINES.map((d) => d.id.replace(/^[a-z]+-/, '')));
  const st = state.settings;
  let ym = st.startDate.slice(0, 7);
  const last = st.endDate.slice(0, 7);
  while (ym <= last) {
    const [y, m] = ym.split('-').map(Number);
    const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
    if (!known.has(ym) && ym > '2026-10') {
      out.push({ id: `kp-${ym}`, due: nthWorkday(ctx, next, 3), title: `Oddaj w Kadrach dokumenty za ${MONTHS_GEN[m - 1]}`,
        detail: 'Karta czasu pracy, karta dyżurów i lista obecności (z podpisami) – termin jak za listopad (3. dzień roboczy), potwierdź w Kadrach', guess: true });
    }
    ym = next;
  }
  return out.sort((a, b) => (a.due < b.due ? -1 : 1));
}

/** Lista ostrzeżeń i przypomnień do pokazania na ekranie "Dziś". */
export function alerts(sum) {
  const out = [];
  const { settings } = sum.ctx;
  const today = sum.today;

  const lek = settings.lek || {};
  (lek.deadlines || []).forEach((dl, idx) => {
    if (dl.done || (lek.registered && dl.label.startsWith('Zgłoszenie na LEK (wiosna'))) return;
    // Opłata: pomijamy, gdy wpisano „nie trzeba płacić” albo „opłacone”
    if (lek.registered && dl.label.startsWith('Opłata za LEK (wiosna') && (lek.feeNeeded === 'nie' || lek.feePaid)) return;
    const left = toNum(dl.date) - toNum(today);
    const reg = dl.label.startsWith('Zgłoszenie na LEK (wiosna');
    if (left >= 0 && left <= 30) out.push({ level: left <= 7 ? 'urgent' : 'warn', icon: '📝', title: dl.label, detail: left === 0 ? 'Dziś!' : `Zostało ${left} ${left === 1 ? 'dzień' : 'dni'}`, date: dl.date, idx, action: reg ? 'lek-reg' : 'deadline-done' });
  });
  // Po zapisie: czy trzeba zapłacić? (art. 14a ust. 8 i 11 – opłata od 2. zgłoszenia, chyba że 1. niezdany/nieprzystąpienie)
  if (lek.registered && !lek.feeNeeded && lek.examDate && today <= lek.examDate) {
    out.push({ level: 'info', icon: '💳', action: 'lek-reg', title: 'LEK: sprawdź w SMK, czy musisz zapłacić',
      detail: 'Pierwsze zgłoszenie jest bezpłatne; opłata od kolejnego – do 5 dni roboczych po końcu zapisów. Wpisz odpowiedź w „Zapis na LEK”.' });
  }
  // Terminy Kadr USK2 (karty czasu pracy, dyżurów, listy obecności)
  const hrDone = settings.hrDone || {};
  for (const d of hrDeadlines(sum.ctx.state)) {
    const left = toNum(d.due) - toNum(today);
    if (!hrDone[d.id] && left >= 0 && left <= 21) {
      const ym = /^kp-(\d{4}-\d{2})$/.exec(d.id)?.[1];
      out.push({ level: left <= 3 ? 'urgent' : 'warn', icon: '📋', title: d.title, detail: `${d.detail} · ${left === 0 ? 'dziś!' : `zostało ${left} ${left === 1 ? 'dzień' : 'dni'}`}`, action: 'hr-done', id: d.id,
        letter: ym ? { kind: 'dokumenty', month: ym } : null, pack: ym || (d.id.endsWith('2026-12') ? '2026-12' : null) });
    }
  }
  // Staż cząstkowy poza USK2: pismo ze zgodą koordynatora + kopia książeczki zdrowia, pisemna informacja do Kadr
  for (const b of sum.ctx.state.blocks || []) {
    const left = toNum(b.start) - toNum(today);
    const seg = [...(b.segments || [])].sort((x, y) => (x.start < y.start ? -1 : 1))[0];
    const h = hospitalOf(seg);
    const id = `ext-${b.id}-${b.start}`;
    if (h && h.id !== 'usk2' && left >= -7 && left <= 21 && !hrDone[id]) {
      out.push({ level: left <= 3 ? 'urgent' : 'warn', icon: '🏥', action: 'hr-done', id, letter: { kind: 'zewn-koord', blockId: b.id },
        title: `${b.short} (${h.short || h.name})${left > 0 ? ` od ${b.start.slice(8)}.${b.start.slice(5, 7)}` : ''} – formalności`,
        detail: 'Poinformuj koordynatora; do placówki pismo ze zgodą koordynatora + kopia książeczki zdrowia; pisemna informacja do Kadr USK2 o miejscu stażu (Informacja USK2, pkt 10–11)' });
    }
  }
  for (const [hDate, off] of Object.entries(settings.saturdayDaysOff || {})) {
    // Przypomnienie dopiero na 60 dni przed świętem (audyt B15)
    if (!off && hDate >= settings.startDate && hDate <= settings.endDate && toNum(hDate) - toNum(today) <= 60) {
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
  const acc = sum.vacation.accrual;
  if (acc && acc.date >= today) {
    out.push({ level: 'warn', icon: '🏖', title: `Urlop ${acc.date.slice(8, 10)}.${acc.date.slice(5, 7)} – jeszcze nienabyty`,
      detail: `Do tego dnia nabędziesz ok. ${String(acc.accrued).replace('.', ',')} dnia urlopu, a planujesz ${acc.used}. W 2026 urlop narasta co miesiąc (art. 153 § 1 KP) – przesuń urlop albo zapytaj w Kadrach.` });
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
    accrualIssue: EVENT_TYPES[ev.type]?.vacation ? after.vacation.accrual : null,
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
  // Urlop / L4 liczymy tylko w „tygodniach” z dyżurami – w tygodniu bez dyżurów (np. medycyna rodzinna) nie ma czego zmniejszać (audyt B2)
  const inDutyWeek = (d) => buckets.some((b) => b.dutyWeek && b.start <= d && d <= b.end);
  const absenceWorkdays = monthDays.filter((d) => {
    const a = ctx.absence.get(d);
    return a && a.kind === 'event' && ['urlop', 'urlop_zadanie', 'l4', 'opieka', 'bezplatny'].includes(a.type)
      && !isWeekend(d) && !statutoryOff(ctx, d) && inDutyWeek(d);
  }).length;
  // „Tydzień” w całości zajęty kursem (żadnego dnia na dyżur) – dyżury z tego tygodnia przepadają (decyzja właściciela 11.2026)
  for (const b of buckets) {
    if (!b.dutyWeek) continue;
    const work = eachDay(b.start, b.end).filter((d) => !isWeekend(d) && !statutoryOff(ctx, d) && !DUTY_BREAKS.some((r) => r.start <= d && d <= r.end));
    const course = work.filter((d) => ctx.absence.get(d)?.kind === 'course');
    b.courseWeek = course.length > 0 && course.length === work.length;
  }
  const courseWeeks = buckets.filter((b) => b.courseWeek).length;
  const dutyWeeks = buckets.filter((b) => b.dutyWeek).length;
  const reduction = Math.floor(absenceWorkdays / 5) * DUTY_WEEK_LIMIT;
  const courseReduction = courseWeeks * DUTY_WEEK_LIMIT;
  const norm = Math.max(0, dutyWeeks * DUTY_WEEK_LIMIT - reduction - courseReduction);
  const total = duties.reduce((a, x) => a + Number(x.minutes || 0), 0);

  const warnings = [];
  for (const b of buckets) {
    if (b.minutes > b.limit) warnings.push({ level: 'warn', text: `Tydzień ${b.i} (${b.start.slice(8)}–${b.end.slice(8)}): ${fmtHM(b.minutes)} – limit ${fmtHM(b.limit)}` });
  }
  if (duties.length > DUTY_COUNT_MAX) warnings.push({ level: 'warn', text: `${duties.length} dyżurów – maksymalnie ${DUTY_COUNT_MAX} w miesiącu` });
  if (total > DUTY_MONTH_MAX) warnings.push({ level: 'warn', text: `Suma ${fmtHM(total)} – maksymalnie ${fmtHM(DUTY_MONTH_MAX)} w miesiącu` });
  const issues = {};
  for (const x of duties) {
    const list = dutyDayIssues(state, x.date, ctx);
    if (![300, 305].includes(Number(x.minutes))) list.push({ level: 'info', text: `nietypowa długość ${fmtHM(Number(x.minutes) || 0)} – w USK2 dyżur trwa 5 h 05 min albo 5 h` });
    if (list.length) issues[x.id] = list;
    const dd = `${x.date.slice(8)}.${x.date.slice(5, 7)}`;
    for (const w of list) warnings.push({ level: w.level, text: `${dd}: ${w.text}`, id: x.id });
  }
  return { ym, duties, buckets, norm, total, left: norm - total, count: duties.length, absenceWorkdays, reduction, courseWeeks, courseReduction, dutyWeeks, warnings, issues };
}

/**
 * Dlaczego w danym dniu nie może być dyżuru (zasady USK2): weekend, święto/dzień wolny, przerwa świąteczna,
 * kurs albo nieobecność, poza stażem/rezerwa, blok bez dyżurów. Pusta lista = dzień w porządku.
 */
export function dutyDayIssues(state, d, ctx = buildContext(state)) {
  const out = [];
  const st = state.settings;
  // Informacja USK2 dla stażysty, pkt 2 i 6: dyżury tylko pn–pt, nie w soboty, niedziele i święta
  if (isWeekend(d)) out.push({ level: 'warn', text: 'weekend – w USK2 dyżurów nie pełni się w soboty, niedziele i święta (tylko pn–pt)' });
  const off = statutoryOff(ctx, d);
  if (off) out.push({ level: 'warn', text: `${off.label} – w święta i dni wolne nie ma dyżurów` });
  const br = DUTY_BREAKS.find((r) => r.start <= d && d <= r.end);
  if (br) out.push({ level: 'warn', text: `${br.label} – bez dyżurów` });
  const a = ctx.absence.get(d);
  if (a) out.push({ level: 'warn', text: `dzień ${a.kind === 'course' ? 'kursu' : 'nieobecności'} (${a.label}) – bez dyżuru` });
  if (d < st.startDate || d > st.endDate) out.push({ level: 'warn', text: 'poza okresem stażu' });
  else {
    const b = (state.blocks || []).find((x) => x.start <= d && d <= x.end);
    if (!b) out.push({ level: 'warn', text: 'poza blokami (rezerwa) – sprawdź, czy dyżur jest potrzebny' });
    else if (!b.duties) out.push({ level: 'warn', text: `blok ${b.short} jest bez dyżurów` });
  }
  return out;
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

/* ---------- Propozycja dyżurów na miesiąc (zasady USK2) ---------- */

/**
 * Proponuje dyżury, by zrobić normę miesiąca: w każdym „tygodniu” 2 dyżury – 15:35–20:40 (5 h 05) i 15:35–20:35 (5 h).
 * Tylko pn–pt, nie w święta, dni wolne, przerwy (DUTY_BREAKS), dni kursów i nieobecności, tylko w blokach z dyżurami.
 * Uwzględnia dyżury już wpisane (limit tygodnia 10 h 05, max 8 w miesiącu). Preferuje wt/czw/śr i odstęp między dyżurami.
 */
export function proposeDuties(state, ym, from = null) {
  const m = dutyMonth(state, ym);
  const ctx = buildContext(state);
  const taken = new Set((state.duties || []).map((x) => x.date));
  // `from` – najwcześniejszy dzień propozycji (np. dziś: nie proponujemy dni, które już minęły)
  const ok = (d) => (!from || d >= from) && !taken.has(d) && !dutyDayIssues(state, d, ctx).length;
  const PREF = { 2: 0, 4: 1, 3: 2, 1: 3, 5: 4 }; // wt, czw, śr, pn, pt
  const wd = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
  let need = Math.max(0, m.norm - m.total);
  let total = m.total;
  let count = m.count;
  const out = [];
  for (const b of m.buckets) {
    if (!b.dutyWeek) continue;
    let room = DUTY_WEEK_LIMIT - b.minutes;
    const inWeek = (state.duties || []).filter((x) => x.date >= b.start && x.date <= b.end).map((x) => x.date);
    while (need > 0 && count < DUTY_COUNT_MAX) {
      // Tylko pełne dyżury USK2: 5 h 05 min albo 5 h (nigdy „kawałek” dyżuru)
      const size = [305, 300].find((x) => x <= room && x <= need && total + x <= DUTY_MONTH_MAX);
      if (!size) break;
      const days = eachDay(b.start, b.end).filter((d) => ok(d) && !out.some((o) => o.date === d));
      if (!days.length) break;
      const near = (d) => [...inWeek, ...out.map((o) => o.date)].some((x) => Math.abs(toNum(x) - toNum(d)) <= 1);
      days.sort((a, c) => (near(a) - near(c)) || (PREF[wd(a)] - PREF[wd(c)]) || (a < c ? -1 : 1));
      const date = days[0];
      out.push({ date, minutes: size, start: '15:35' });
      inWeek.push(date);
      room -= size;
      need -= size;
      total += size;
      count++;
    }
  }
  return out.sort((a, c) => (a.date < c.date ? -1 : 1));
}

/** Ile normy zostanie niezrobione po dodaniu propozycji (np. tydzień kursu lub urlopu bez wolnych dni) – w minutach. */
export function proposalShortfall(state, ym, list = proposeDuties(state, ym)) {
  const m = dutyMonth(state, ym);
  return Math.max(0, m.norm - m.total - list.reduce((a, x) => a + x.minutes, 0));
}

/* ---------- Podsumowanie tygodnia ---------- */

/**
 * Tydzień (pn–nd) zawierający `today`: dla każdego dnia – gdzie jestem (blok, oddział), czy to dzień wolny/nieobecność,
 * dyżury; do tego terminy z tego tygodnia (LEK, Kadry, kursy, początek bloku).
 */
export function weekSummary(state, today) {
  const sum = summarize(state, today);
  const ctx = sum.ctx;
  const mon = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const sun = addDays(mon, 6);
  const days = eachDay(mon, sun).map((d) => {
    const pl = placeOn(state, d);
    const h = hospitalOf(pl?.segment);
    const off = statutoryOff(ctx, d);
    const abs = ctx.absence.get(d);
    const mk = sum.makeUpPlan.find((m) => m.date === d);
    let kind = 'work';
    let label = pl?.block ? `${pl.block.short}${h ? ` · ${h.short || h.name}` : ''}` : (d >= sum.reserve.start && d <= sum.estimatedEnd ? 'rezerwa' : '');
    if (isWeekend(d)) { kind = 'free'; label = 'weekend'; }
    else if (off) { kind = 'free'; label = off.label; }
    else if (abs) { kind = abs.kind === 'course' ? 'course' : 'absence'; label = abs.kind === 'course' ? `kurs: ${abs.label}` : abs.label; }
    else if (mk) { const b = state.blocks.find((x) => x.id === mk.blockId); label = `odrabianie: ${b?.short || ''}`; }
    if (d < state.settings.startDate || d > sum.estimatedEnd) { kind = kind === 'work' ? 'none' : kind; if (kind === 'none') label = ''; }
    const duties = (state.duties || []).filter((x) => x.date === d);
    return { date: d, kind, label, duties, ward: pl?.segment?.ward || '' };
  });
  const items = [];
  for (const dl of state.settings.lek?.deadlines || []) if (!dl.done && dl.date >= mon && dl.date <= sun) items.push({ date: dl.date, icon: '📝', text: dl.label });
  const lek = state.settings.lek;
  if (lek?.examDate >= mon && lek.examDate <= sun) items.push({ date: lek.examDate, icon: '📝', text: `LEK (${lek.session})` });
  for (const d of hrDeadlines(state, ctx)) if (!state.settings.hrDone?.[d.id] && d.due >= mon && d.due <= sun) items.push({ date: d.due, icon: '📋', text: d.title });
  for (const c of state.courses || []) if (c.start && c.start >= mon && c.start <= sun) items.push({ date: c.start, icon: '🎓', text: `Kurs: ${c.name}` });
  for (const b of state.blocks || []) if (b.start > mon && b.start <= sun) items.push({ date: b.start, icon: '🩺', text: `Nowy blok: ${b.name}` });
  items.sort((a, b) => (a.date < b.date ? -1 : 1));
  const dutyMin = days.reduce((a, d) => a + d.duties.reduce((x, y) => x + Number(y.minutes || 0), 0), 0);
  return { start: mon, end: sun, days, items, dutyMin, workdays: days.filter((d) => d.kind === 'work').length };
}

/* ---------- Pomysły na urlop: gdzie mało dni urlopu daje długi odpoczynek ---------- */

/**
 * Okna urlopowe od `from` do końca umowy: k (1–3) kolejnych dni roboczych, które razem z weekendem/świętem
 * dają długą przerwę. Zwraca {start, end, take:[daty urlopu], days, free, inBlock:[skróty bloków]} posortowane wg daty.
 */
export function vacationIdeas(state, from, limit = 8) {
  const ctx = buildContext(state);
  const end = state.settings.endDate;
  const isFree = (d) => isWeekend(d) || !!statutoryOff(ctx, d);
  const isWork = (d) => !isFree(d) && !ctx.absence.get(d);
  const cand = new Map();
  for (const d of eachDay(from, end)) {
    if (!isWork(d)) continue;
    for (let k = 1; k <= 3; k++) {
      const take = [];
      let cur = d;
      let bad = false;
      while (take.length < k) {
        if (cur > end) { bad = true; break; }
        if (isWork(cur)) take.push(cur);
        else if (!isFree(cur)) { bad = true; break; } // dzień już zajęty nieobecnością
        cur = addDays(cur, 1);
      }
      if (bad) break;
      let s = take[0];
      while (isFree(addDays(s, -1))) s = addDays(s, -1);
      let e = take.at(-1);
      while (isFree(addDays(e, 1)) && addDays(e, 1) <= end) e = addDays(e, 1);
      const free = toNum(e) - toNum(s) + 1;
      if (free - k < 3 || s < from) continue; // tylko gdy urlop „dokłada” wolne (most, długi weekend)
      const key = `${s}|${e}`;
      const prev = cand.get(key);
      if (!prev || k < prev.days) {
        const inBlock = [...new Set(take.map((x) => state.blocks.find((b) => b.start <= x && x <= b.end)?.short).filter(Boolean))];
        cand.set(key, { start: s, end: e, take, days: k, free, inBlock });
      }
    }
  }
  // Najlepszy stosunek wolnego do dni urlopu, potem bliższe; bez nakładających się okien
  const best = [...cand.values()].filter((x) => x.free / x.days >= 3)
    .sort((a, b) => (b.free / b.days - a.free / a.days) || (a.start < b.start ? -1 : 1));
  const chosen = [];
  for (const c of best) {
    if (chosen.some((x) => !(c.end < x.start || c.start > x.end))) continue;
    chosen.push(c);
    if (chosen.length >= limit) break;
  }
  return chosen.sort((a, b) => (a.start < b.start ? -1 : 1));
}
