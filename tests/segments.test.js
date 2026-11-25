import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/defaults.js';
import { blockWeeks, checkSegments, segmentAt, placeOn } from '../js/engine.js';
import { placeText, HOSPITALS } from '../js/hospitals.js';
import { buildIcs } from '../js/ics.js';

const S = () => defaultState();
const blk = (st, id) => st.blocks.find((b) => b.id === id);

test('Tygodnie bloku: chirurgia = tydzień stażu 1–8, interna 19–28, pediatria 42–47', () => {
  const st = S();
  const chir = blockWeeks(blk(st, 'chir'), st.settings.startDate);
  assert.equal(chir.length, 8);
  assert.deepEqual([chir[0].n, chir[7].n], [1, 8]);
  assert.deepEqual([chir[0].start, chir[0].end], ['2026-10-01', '2026-10-07']);
  const int = blockWeeks(blk(st, 'int'), st.settings.startDate);
  assert.deepEqual([int[0].n, int.at(-1).n, int.length], [19, 28, 10]);
  const ped = blockWeeks(blk(st, 'ped'), st.settings.startDate);
  assert.deepEqual([ped[0].n, ped.at(-1).n], [42, 47]);
  assert.equal(ped.at(-1).start, '2027-08-19');
});

test('Domyślne oddziały części wybranej: Zdroje, Police, Arkońska', () => {
  const st = S();
  assert.equal(segmentAt(blk(st, 'pers1'), '2026-12-01').hospital, 'zdroje');
  assert.equal(segmentAt(blk(st, 'pers2'), '2027-01-05').hospital, 'usk1-police');
  assert.equal(segmentAt(blk(st, 'pers3'), '2027-02-03').hospital, 'arkonska');
  for (const id of ['pers1', 'pers2', 'pers3']) {
    const c = checkSegments(blk(st, id));
    assert.ok(c.ok);
    assert.equal(c.gaps.length, 0);
  }
  const p = placeOn(st, '2026-12-01');
  assert.equal(p.block.id, 'pers1');
  assert.match(placeText(p.segment), /Mączna 4, 70-780 Szczecin$/);
});

test('Podział interny na dwa oddziały: luki, nakładanie i wyjście poza blok', () => {
  const st = S();
  const b = blk(st, 'int');
  b.segments = [
    { id: 'a', start: '2027-02-04', end: '2027-03-10', hospital: 'usk2', ward: 'Klinika Nefrologii, Transplantologii i Chorób Wewnętrznych' },
    { id: 'b', start: '2027-03-18', end: '2027-04-14', hospital: 'arkonska', ward: 'Oddział Hematologii' },
  ];
  let c = checkSegments(b);
  assert.ok(c.ok);
  assert.deepEqual(c.gaps, [{ start: '2027-03-11', end: '2027-03-17' }]);
  b.segments[1].start = '2027-03-10';
  c = checkSegments(b);
  assert.equal(c.overlaps.length, 1);
  assert.ok(!c.ok);
  b.segments[1].start = '2027-03-11';
  b.segments[1].end = '2027-04-20';
  assert.equal(checkSegments(b).outside.length, 1);
});

test('Własne miejsce (spoza listy) ma swój adres', () => {
  const seg = { hospital: 'custom', customName: 'NZOZ Przychodnia X', customAddress: 'ul. Testowa 1, Szczecin', ward: 'Poradnia POZ' };
  assert.equal(placeText(seg), 'Poradnia POZ, NZOZ Przychodnia X, ul. Testowa 1, Szczecin');
});

test('Każdy szpital ma adres i co najmniej jeden oddział', () => {
  for (const h of HOSPITALS) {
    assert.ok(h.address && h.wards.length, h.id);
    assert.equal(new Set(h.wards).size, h.wards.length, `duplikat w ${h.id}`);
  }
});

test('Eksport .ics: adres oddziału w polu LOCATION, daty całodniowe, poprawne zawijanie linii', () => {
  const st = S();
  const ics = buildIcs(st, '2026-11-24');
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
  const un = ics.replace(/\r\n /g, '');
  assert.match(un, /DTSTART;VALUE=DATE:20261126\r\nDTEND;VALUE=DATE:20261217/);
  assert.match(un, /LOCATION:Oddział Chirurgii Dziecięcej\\, Ortopedii i Urologii z Pododdziałem Centrum Leczenia Oparzeń\\, Szpital „Zdroje”\\, ul\. Mączna 4\\, 70-780 Szczecin/);
  assert.match(un, /SUMMARY:Zgłoszenie na LEK/);
  assert.match(un, /BEGIN:VALARM/);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, line);
});

import { migrate, parseBackup, backupText } from '../js/store.js';

test('Migracja v1 -> v3: dodaje oddziały domyślne, zachowuje wpisy użytkownika', () => {
  const v1 = defaultState();
  v1.version = 1;
  for (const b of v1.blocks) { delete b.segments; b.place = 'USK2'; }
  v1.events.push({ id: 'u1', type: 'urlop', start: '2027-09-06', end: '2027-09-10' });
  v1.blocks.find((b) => b.id === 'int').start = '2027-02-11'; // zmieniony przez użytkownika
  const m = migrate(v1);
  assert.equal(m.version, 5);
  assert.equal(m.events.length, 1);
  assert.equal(m.blocks.find((b) => b.id === 'pers1').segments[0].hospital, 'zdroje');
  assert.deepEqual(m.blocks.find((b) => b.id === 'int').segments, []);
  assert.equal(m.blocks.find((b) => b.id === 'int').start, '2027-02-11');
  assert.ok(!('place' in m.blocks[0]));
});

test('Kopia zapasowa: zapis i odczyt dają te same dane', () => {
  const st = defaultState();
  st.events.push({ id: 'l', type: 'l4', start: '2027-02-08', end: '2027-02-10' });
  const back = parseBackup(backupText(st));
  assert.deepEqual(back.events, st.events);
  assert.deepEqual(back.blocks, st.blocks);
  assert.throws(() => parseBackup('{"a":1}'), /nie wygląda/);
  assert.throws(() => parseBackup('nie json'), /błędny format/);
});

test('Przychodnie POZ do medycyny rodzinnej: każda filia osobno, z adresem; ID unikalne', () => {
  const poz = HOSPITALS.filter((h) => h.kind === 'poz');
  assert.ok(poz.length >= 17);
  assert.equal(new Set(HOSPITALS.map((h) => h.id)).size, HOSPITALS.length);
  for (const h of poz) assert.ok(h.address && h.source && h.wards.length, h.id);
  assert.equal(placeText({ hospital: 'pmr-gumience', ward: 'Poradnia lekarza POZ (medycyna rodzinna)' }),
    'Poradnia lekarza POZ (medycyna rodzinna), PMR „Szafera” – Przychodnia Gumieńce, ul. Lubelska 29, 71-043 Szczecin');
});

test('Eksport .ics: terminy Kadr z alarmami i dyżury z godziną 15:35–20:40', () => {
  const st = defaultState();
  st.duties = [{ id: 'x1', date: '2026-12-01', minutes: 305, start: '15:35' }];
  const ics = buildIcs(st, '2026-11-25');
  assert.ok(ics.includes('UID:kadry-kp-2026-11@kalendarz-stazysty'));
  assert.ok(ics.includes('DTSTART:20261201T153500\r\nDTEND:20261201T204000'));
  st.settings.hrDone = { 'kp-2026-11': true };
  assert.ok(!buildIcs(st, '2026-11-25').includes('UID:kadry-kp-2026-11@'));
});
