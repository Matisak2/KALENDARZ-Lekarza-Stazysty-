// Eksport do Kalendarza (iPhone, Google, Outlook) – plik .ics (iCalendar, RFC 5545).
// Bloki i oddziały jako wydarzenia całodniowe z adresem w polu „Miejsce”,
// terminy LEK z przypomnieniami (alarmami).
import { addDays, eachDay, isWeekend } from './dates.js';
import { EVENT_TYPES } from './defaults.js';
import { summarize, placeOn, hrDeadlines } from './engine.js';
import { hospitalOf, placeText } from './hospitals.js';

const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const ymd = (iso) => iso.replace(/-/g, '');

/** Zawijanie linii do 75 bajtów (UTF-8), kontynuacja od spacji. */
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let curBytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = out.length ? 74 : 75;
    if (curBytes + b > limit) {
      out.push(cur);
      cur = '';
      curBytes = 0;
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.map((l, i) => (i ? ' ' + l : l)).join('\r\n');
}

/** Godzina lokalna (czas telefonu) – 935 -> "153500". */
const hms = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}${String(min % 60).padStart(2, '0')}00`;

function vevent({ uid, start, end, summary, location, description, alarms = [], stamp, from = null, to = null, status = null, seq = null }) {
  // Koniec po północy (np. dyżur 8:00 + 24 h) – następny dzień, godzina w zakresie 0–23 (audyt B10)
  const endDay = to != null ? addDays(start, Math.floor(to / 1440)) : null;
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}@kalendarz-stazysty`,
    `DTSTAMP:${stamp}`,
    ...(from != null
      ? [`DTSTART:${ymd(start)}T${hms(from % 1440)}`, `DTEND:${ymd(endDay)}T${hms(to % 1440)}`]
      : [`DTSTART;VALUE=DATE:${ymd(start)}`, `DTEND;VALUE=DATE:${ymd(addDays(end, 1))}`]),
    `SUMMARY:${esc(summary)}`,
  ];
  if (seq != null) lines.push(`SEQUENCE:${seq}`);
  if (status) lines.push(`STATUS:${status}`);
  if (location) lines.push(`LOCATION:${esc(location)}`);
  if (description) lines.push(`DESCRIPTION:${esc(description)}`);
  lines.push(from != null ? 'TRANSP:OPAQUE' : 'TRANSP:TRANSPARENT');
  for (const a of alarms) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(a.text || summary)}`, `TRIGGER:${a.trigger}`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

/** Grupuje kolejne dni w zakresy (np. dni odrabiania jednego bloku). */
function ranges(dates) {
  const out = [];
  for (const d of [...dates].sort()) {
    const last = out.at(-1);
    // Kolejny dzień albo przerwa tylko na weekend -> ten sam zakres
    if (last && eachDay(addDays(last.end, 1), addDays(d, -1)).every(isWeekend)) last.end = d;
    else out.push({ start: d, end: d });
  }
  return out;
}

const STAMP = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

/** Dyżur jako wydarzenie z godziną (czas lokalny telefonu). */
function dutyEvent(state, x, stamp) {
  const [hh, mm] = String(x.start || '15:35').split(':').map(Number);
  // „0:00” to prawidłowa godzina (audyt B12) – domyślnie 15:35 tylko, gdy godziny brak
  const from = Number.isFinite(hh) ? hh * 60 + (mm || 0) : 15 * 60 + 35;
  const pl = placeOn(state, x.date);
  return vevent({
    uid: `dyzur-${x.id}`, start: x.date, end: x.date, from, to: from + Number(x.minutes || 0),
    summary: `🌙 Dyżur ${String(x.start || '15:35')}`, location: pl?.segment ? placeText(pl.segment) : '',
    description: x.note || '', stamp, alarms: [{ trigger: '-PT6H', text: 'Dziś dyżur' }],
  });
}

const HEAD = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kalendarz Stazysty//PL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Staż', 'X-WR-TIMEZONE:Europe/Warsaw'];
const file = (lines) => [...HEAD, ...lines, 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';

/** Krótki skrót treści wydarzenia (bez DTSTAMP) – do eksportu „tylko nowe i zmienione”. */
function digest(lines) {
  const t = lines.filter((l) => !l.startsWith('DTSTAMP:') && !l.startsWith('SEQUENCE:')).join('\n');
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Plik .ics tylko z podanymi dyżurami (np. po dodaniu propozycji). */
export function buildDutiesIcs(state, duties) {
  const stamp = STAMP();
  return file(duties.flatMap((x) => dutyEvent(state, x, stamp)));
}

/**
 * Plik .ics. `sent` = { uid: skrót } z poprzedniego eksportu: wtedy w pliku są tylko wydarzenia nowe i zmienione
 * (iPhone nie dubluje tego, co już ma). Zwraca { text, sent: nowe skróty, count, total }.
 */
export function buildIcsExport(state, today, sent = null) {
  const events = icsEvents(state, today);
  const all = {};
  const pick = [];
  // SEQUENCE rośnie z każdym eksportem – iPhone przyjmuje zmianę istniejącego wydarzenia (ten sam UID)
  const seq = Math.floor(Date.now() / 1000);
  const field = (ev, k) => (ev.find((l) => l.startsWith(k)) || '').slice(k.length);
  for (const ev of events) {
    const uid = ev[1].slice(4);
    const d = digest(ev);
    // Zapamiętujemy też datę i tytuł – żeby móc wysłać „odwołane”, gdy wydarzenie zniknie z aplikacji (audyt B3)
    all[uid] = { h: d, s: field(ev, 'DTSTART'), e: field(ev, 'DTEND'), t: field(ev, 'SUMMARY:') };
    const prev = sent?.[uid];
    const prevH = typeof prev === 'string' ? prev : prev?.h;
    if (!sent || prevH !== d) pick.push(sent ? [...ev.slice(0, 3), `SEQUENCE:${seq}`, ...ev.slice(3)] : ev);
  }
  let cancelled = 0;
  if (sent) {
    const stamp = STAMP();
    const todayYmd = ymd(today);
    for (const [uid, prev] of Object.entries(sent)) {
      if (all[uid] || typeof prev !== 'object' || !prev?.s) continue; // stary zapis (sam skrót) – brak daty, nie odwołujemy
      const startYmd = prev.s.replace(/^[^:]*:/, '').slice(0, 8);
      if (startYmd < todayYmd) continue; // przeszłe wydarzenia zostają w kalendarzu
      pick.push(['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`, `DTSTART${prev.s}`, `DTEND${prev.e}`,
        `SUMMARY:❌ Odwołane: ${prev.t.replace(/^❌ Odwołane: /, '')}`, `SEQUENCE:${seq}`, 'STATUS:CANCELLED', 'TRANSP:TRANSPARENT', 'END:VEVENT']);
      cancelled++;
    }
  }
  return { text: file(pick.flat()), sent: all, count: pick.length, total: events.length, cancelled };
}

export function buildIcs(state, today) {
  return buildIcsExport(state, today).text;
}

/** Lista wydarzeń (każde jako tablica linii). */
function icsEvents(state, today) {
  const sum = summarize(state, today);
  const stamp = STAMP();
  const E = [];
  const L = { push: (...lines) => E.push(lines) };
  const dayBefore = (text) => ({ trigger: '-PT15H', text }); // dzień wcześniej ok. 9:00

  for (const b of state.blocks) {
    const segs = [...(b.segments || [])].sort((x, y) => (x.start < y.start ? -1 : 1));
    const parts = [];
    let cur = b.start;
    for (const s of segs) {
      if (s.start > cur) parts.push({ start: cur, end: addDays(s.start, -1), seg: null });
      parts.push({ start: s.start < b.start ? b.start : s.start, end: s.end > b.end ? b.end : s.end, seg: s });
      cur = addDays(s.end, 1);
    }
    if (cur <= b.end) parts.push({ start: cur, end: b.end, seg: null });

    parts.forEach((p, k) => {
      const h = hospitalOf(p.seg);
      const title = p.seg ? `🩺 ${b.short} – ${h?.short || ''}` : `🩺 Staż: ${b.name}`;
      const desc = [
        `Staż cząstkowy: ${b.name}${b.group ? ` (${b.group})` : ''}`,
        p.seg?.ward ? `Oddział: ${p.seg.ward}` : 'Oddział: nie przypisano',
        h ? `${h.name}\n${h.address}` : '',
        `Wymagane: ${b.required} dni robocze w bloku`,
      ].filter(Boolean).join('\n');
      L.push(...vevent({
        uid: `blok-${b.id}-${k}`, start: p.start, end: p.end, summary: title,
        location: p.seg ? placeText(p.seg) : '', description: desc, stamp,
        alarms: k === 0 ? [dayBefore(`Jutro zaczynasz: ${b.name}`)] : [dayBefore(`Jutro zmiana oddziału: ${p.seg?.ward || b.name}`)],
      }));
    });
  }

  // Plan odrabiania
  const byBlock = new Map();
  for (const m of sum.makeUpPlan) {
    if (!byBlock.has(m.blockId)) byBlock.set(m.blockId, []);
    byBlock.get(m.blockId).push(m.date);
  }
  for (const [blockId, dates] of byBlock) {
    const b = state.blocks.find((x) => x.id === blockId);
    const lastSeg = [...(b.segments || [])].sort((x, y) => (x.start < y.start ? -1 : 1)).at(-1);
    ranges(dates).forEach((r, k) => {
      L.push(...vevent({
        uid: `odrabianie-${blockId}-${k}`, start: r.start, end: r.end, summary: `↺ Odrabianie: ${b.short}`,
        location: lastSeg ? placeText(lastSeg) : '', description: `Odrabianie dni stażu: ${b.name}`, stamp,
      }));
    });
  }

  // Kursy z terminami
  for (const c of state.courses || []) {
    if (!c.start) continue;
    L.push(...vevent({
      uid: `kurs-${c.id}`, start: c.start, end: c.end, summary: `🎓 Kurs: ${c.name}`,
      location: c.location || '', description: `${c.provider} · ${c.mode}`, stamp, alarms: [dayBefore(`Jutro kurs: ${c.name}`)],
    }));
  }

  // Urlopy i nieobecności
  for (const ev of state.events || []) {
    const t = EVENT_TYPES[ev.type];
    L.push(...vevent({ uid: `wpis-${ev.id}`, start: ev.start, end: ev.end, summary: `${t?.icon || '•'} ${t?.label || ev.type}`, description: ev.note || '', stamp }));
  }

  // LEK
  const lek = state.settings.lek;
  if (lek?.examDate) {
    L.push(...vevent({
      uid: 'lek-egzamin', start: lek.examDate, end: lek.examDate, summary: `📝 LEK (${lek.session})`, stamp,
      alarms: [{ trigger: '-P7D', text: 'Za tydzień LEK' }, dayBefore('Jutro LEK – powodzenia!')],
    }));
  }
  for (const dl of lek?.deadlines || []) {
    L.push(...vevent({
      uid: `lek-termin-${dl.date}-${digest([dl.label])}`, start: dl.date, end: dl.date, summary: dl.label, stamp,
      alarms: [{ trigger: '-P7D', text: `Za tydzień: ${dl.label}` }, dayBefore(`Jutro: ${dl.label}`)],
    }));
  }

  // Terminy Kadr USK2 (karty czasu pracy, dyżurów, listy obecności)
  for (const d of hrDeadlines(state, sum.ctx)) {
    if (d.due < today) continue;
    // Zrobione – zostaje w kalendarzu jako „✓” bez przypomnień (żeby nie wyglądało na odwołane)
    if (state.settings.hrDone?.[d.id]) { L.push(...vevent({ uid: `kadry-${d.id}`, start: d.due, end: d.due, summary: `✓ ${d.title}`, description: d.detail, stamp })); continue; }
    L.push(...vevent({
      uid: `kadry-${d.id}`, start: d.due, end: d.due, summary: `🗂 ${d.title}`, description: d.detail, stamp,
      alarms: [{ trigger: '-P3D', text: `Za 3 dni: ${d.title}` }, dayBefore(`Jutro: ${d.title}`)],
    }));
  }

  // Dyżury (z godziną; czas lokalny telefonu)
  for (const x of state.duties || []) L.push(...dutyEvent(state, x, stamp));

  // Koniec stażu
  L.push(...vevent({ uid: 'koniec-stazu', start: sum.estimatedEnd, end: sum.estimatedEnd, summary: '🎉 Koniec stażu', stamp }));
  return E;
}
