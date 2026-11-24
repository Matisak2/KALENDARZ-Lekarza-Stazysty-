// Eksport do Kalendarza (iPhone, Google, Outlook) – plik .ics (iCalendar, RFC 5545).
// Bloki i oddziały jako wydarzenia całodniowe z adresem w polu „Miejsce”,
// terminy LEK z przypomnieniami (alarmami).
import { addDays, eachDay, isWeekend } from './dates.js';
import { EVENT_TYPES } from './defaults.js';
import { summarize } from './engine.js';
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

function vevent({ uid, start, end, summary, location, description, alarms = [], stamp }) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}@kalendarz-stazysty`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(start)}`,
    `DTEND;VALUE=DATE:${ymd(addDays(end, 1))}`,
    `SUMMARY:${esc(summary)}`,
  ];
  if (location) lines.push(`LOCATION:${esc(location)}`);
  if (description) lines.push(`DESCRIPTION:${esc(description)}`);
  lines.push('TRANSP:TRANSPARENT');
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

export function buildIcs(state, today) {
  const sum = summarize(state, today);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const L = [];
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
  for (const [k, dl] of (lek?.deadlines || []).entries()) {
    L.push(...vevent({
      uid: `lek-termin-${k}`, start: dl.date, end: dl.date, summary: dl.label, stamp,
      alarms: [{ trigger: '-P7D', text: `Za tydzień: ${dl.label}` }, dayBefore(`Jutro: ${dl.label}`)],
    }));
  }

  // Koniec stażu
  L.push(...vevent({ uid: 'koniec-stazu', start: sum.estimatedEnd, end: sum.estimatedEnd, summary: '🎉 Koniec stażu', stamp }));

  const head = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kalendarz Stazysty//PL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Staż', 'X-WR-TIMEZONE:Europe/Warsaw'];
  return [...head, ...L, 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
}
