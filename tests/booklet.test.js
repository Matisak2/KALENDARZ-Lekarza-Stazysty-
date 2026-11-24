import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/defaults.js';
import { BOOKLET, bookletFor, bookletProgress, coursesSigned, BOOKLET_COURSES } from '../js/booklet.js';
import { summarize, alerts } from '../js/engine.js';

const S = () => defaultState();
const blk = (st, id) => st.blocks.find((b) => b.id === id);

test('Chirurgia: ogólna + urazowa, kolokwium, pieczątki, umiejętności i osobny podpis za gips', () => {
  const st = S();
  const p = bookletProgress(st, blk(st, 'chir'));
  assert.equal(p.total, 8);
  assert.equal(p.done, 0);
  assert.ok(BOOKLET.chir.items.some((i) => i.key === 'chir.gips'));
});

test('Część personalizowana: dziedzina (1), (2), (3) wg kolejności bloków', () => {
  const st = S();
  assert.match(bookletFor(st, blk(st, 'pers1')).page, /\(1\)/);
  assert.match(bookletFor(st, blk(st, 'pers3')).page, /\(3\)/);
});

test('Podpisy liczą się po dacie', () => {
  const st = S();
  st.booklet = { chir: { 'ogolna.dyzury': { date: '2026-11-20' }, 'chir.kolokwium': { date: '2026-11-25' } } };
  assert.equal(bookletProgress(st, blk(st, 'chir')).done, 2);
});

test('Przypomnienie: chirurgia kończy się za 1 dzień i brakuje podpisów; interna jeszcze nie', () => {
  const st = S();
  const a = alerts(summarize(st, '2026-11-24')).find((x) => x.icon === '📘');
  assert.ok(a);
  assert.match(a.title, /Chirurgia: brakuje 8 podpisów/);
  for (const k of BOOKLET.chir.items.filter((i) => i.sign)) {
    st.booklet.chir = { ...(st.booklet.chir || {}), [k.key]: { date: '2026-11-25' } };
  }
  assert.ok(!alerts(summarize(st, '2026-11-24')).some((x) => x.icon === '📘'));
  assert.ok(!alerts(summarize(S(), '2026-10-15')).some((x) => x.icon === '📘'));
});

test('Szkolenia w książeczce: 9 stron (komunikacja i wypalenie osobno)', () => {
  const st = S();
  assert.equal(BOOKLET_COURSES.length, 9);
  st.booklet = { courses: { onko: { date: '2027-05-11' } } };
  assert.deepEqual(coursesSigned(st), { total: 9, done: 1 });
});

import { suggestedRange } from '../js/booklet.js';
import { addDays } from '../js/dates.js';

test('Podpowiedź terminów: chirurgia ogólna 01.10–11.11, urazowa 12.11–25.11', () => {
  const st = S();
  const chir = blk(st, 'chir');
  assert.deepEqual(suggestedRange(chir, 'ogolna.termin', addDays), { from: '2026-10-01', to: '2026-11-11' });
  assert.deepEqual(suggestedRange(chir, 'urazowa.termin', addDays), { from: '2026-11-12', to: '2026-11-25' });
  assert.equal(suggestedRange(chir, 'bls.termin', addDays), null);
});
