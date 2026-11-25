import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHrMail } from '../js/hrmail.js';
import { hrDeadlines } from '../js/engine.js';
import { defaultState } from '../js/defaults.js';

// Treść zmyślona, w stylu maila z działu kadr
const MAIL = `Dzień dobry,
uprzejmie przypominamy, że karty czasu pracy, karty dyżurów i listy obecności za listopad należy złożyć do czwartku 03.12.
Wyjątkowo kartę czasu pracy za grudzień prosimy przekazać do 15 grudnia.
Dyżury w godzinach 15.35-20.40. Badania okresowe – termin 12.01.2027.
Spotkanie było 2.10.2026. Pozdrawiamy, Dział Kadr`;

test('Mail z Kadr: daty liczbowe i słowne, bez godzin; rok dobrany do dzisiejszej daty', () => {
  const r = parseHrMail(MAIL, '2026-11-25');
  assert.deepEqual(r.map((x) => x.due), ['2026-10-02', '2026-12-03', '2026-12-15', '2027-01-12']);
  const k = r.find((x) => x.due === '2026-12-03');
  assert.match(k.title, /karta czasu pracy, karta dyżurów, lista obecności – do 03\.12/);
  assert.match(k.detail, /za listopad/);
  assert.equal(r.find((x) => x.due === '2026-10-02').past, true); // minione – nie zaznaczamy
  assert.match(r.find((x) => x.due === '2027-01-12').title, /badania lekarskie/);
  // bez roku po nowym roku: 05.01 w grudniu -> styczeń następnego roku
  assert.deepEqual(parseHrMail('do 05.01', '2026-12-20').map((x) => x.due), ['2027-01-05']);
  assert.deepEqual(parseHrMail('godz. 8.00 i 7,35 oraz 31.02', '2026-11-25'), []);
});

test('Terminy z maila trafiają do terminów Kadr (Dziś, tydzień, .ics)', () => {
  const st = defaultState();
  st.settings.hrCustom = [{ id: 'mail-1', due: '2027-01-12', title: 'Kadry: badania lekarskie – do 12.01', detail: 'x', custom: true }];
  assert.ok(hrDeadlines(st).some((d) => d.id === 'mail-1'));
});
