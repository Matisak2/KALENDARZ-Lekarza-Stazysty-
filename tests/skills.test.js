import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/defaults.js';
import { SKILLS, skillsFor, skillProgress } from '../js/skills.js';
import { migrate } from '../js/store.js';

test('Umiejętności z programu stażu: liczby pozycji', () => {
  assert.equal(SKILLS.int.items.length, 9);
  assert.equal(SKILLS.chir.items.length, 9);
  assert.equal(SKILLS.rodz.items.length, 19);
  assert.ok(SKILLS.ped.items.length + SKILLS.neo.items.length >= 15);
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
