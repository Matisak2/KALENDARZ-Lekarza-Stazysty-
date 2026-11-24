import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/defaults.js';
import { SKILLS, skillsFor, skillProgress } from '../js/skills.js';
import { migrate } from '../js/store.js';

test('Umiejętności z programu stażu: liczby pozycji', () => {
  assert.equal(SKILLS.int.items.length, 9);
  assert.equal(SKILLS.chir.items.length, 9);
  assert.equal(SKILLS.rodz.items.length, 19);
  assert.equal(SKILLS.ped.items.length, 12);
  assert.equal(SKILLS.neo.items.length, 6);
  assert.equal(SKILLS.ped.items[1], 'Pielęgnacja i karmienie niemowlęcia');
});

test('Odhaczanie i własne pozycje', () => {
  const st = defaultState();
  st.skills = { 'int:2': { date: '2027-02-10' } };
  st.customSkills = { int: [{ id: 'a', name: 'Gazometria' }] };
  const list = skillsFor(st, 'int');
  assert.equal(list.length, 10);
  assert.equal(list.at(-1).name, 'Gazometria');
  assert.deepEqual(skillProgress(st, 'int'), { total: 10, done: 1 });
  assert.deepEqual(skillProgress(st, 'pers1'), { total: 0, done: 0 });
});

test('Migracja uzupełnia pola skills/customSkills', () => {
  const st = defaultState();
  delete st.skills;
  delete st.customSkills;
  const m = migrate(st);
  assert.deepEqual(m.skills, {});
  assert.deepEqual(m.customSkills, {});
});

test('Migracja v2 -> v3: odhaczone umiejętności z pediatrii przechodzą na nowe miejsca', () => {
  const st = defaultState();
  st.version = 2;
  st.skills = { 'ped:0': { date: '2027-07-20' }, 'ped:10': { date: '2027-07-21' }, 'int:1': { date: '2027-02-10' } };
  const m = migrate(st);
  assert.equal(m.version, 4);
  assert.deepEqual(m.skills['ped:2'], { date: '2027-07-20' }); // wywiad
  assert.deepEqual(m.skills['ped:3'], { date: '2027-07-21' }); // resuscytacja
  assert.ok(!m.skills['ped:0']);
  assert.deepEqual(m.skills['int:1'], { date: '2027-02-10' });
});

test('Migracja v3 -> v4: planer LEK i przypomnienia o opłacie, bez dublowania terminów', () => {
  const st = defaultState();
  st.version = 3;
  delete st.study;
  st.settings.lek.deadlines = st.settings.lek.deadlines.filter((d) => !d.label.startsWith('Opłata'));
  st.settings.lek.deadlines[0].done = true;
  const m = migrate(st);
  assert.equal(m.version, 4);
  assert.deepEqual(m.study.plans, []);
  const dl = m.settings.lek.deadlines;
  assert.equal(dl.filter((d) => d.label.startsWith('Opłata')).length, 2);
  assert.equal(dl.filter((d) => d.date === '2026-11-30').length, 1);
  assert.ok(dl.find((d) => d.date === '2026-11-30').done);
});
