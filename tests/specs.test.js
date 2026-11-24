import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { specStats, suggestTarget, chance, specNames, wojNames } from '../js/specs.js';

const data = JSON.parse(readFileSync(new URL('../data/nabory.json', import.meta.url)));

test('Dane naboru: 4 sesje, 16 województw, specjalizacje', () => {
  assert.ok(data.sessions.length >= 4);
  assert.equal(wojNames(data).length, 16);
  assert.ok(specNames(data).includes('Urologia'));
});

test('Urologia, zachodniopomorskie, jesień 2026: 5 miejsc obsadzonych, próg 87,50%', () => {
  const s = specStats(data, 'Urologia', 'Zachodniopomorskie').find((x) => x.id === '2026-jesien');
  assert.equal(s.places, 5);
  assert.equal(s.qualified, 5);
  assert.ok(s.filled);
  assert.equal(s.threshold, 87.5);
});

test('Medycyna rodzinna ZP jesień 2026: zostały wolne miejsca -> brak progu konkurencyjnego', () => {
  const s = specStats(data, 'Medycyna rodzinna', 'Zachodniopomorskie').find((x) => x.id === '2026-jesien');
  assert.equal(s.places, 30);
  assert.equal(s.qualified, 28);
  assert.equal(s.threshold, null);
  assert.equal(s.status, 'zostały wolne miejsca');
});

test('Cel i szanse', () => {
  const t = suggestTarget(data, 'Urologia', 'Zachodniopomorskie');
  assert.equal(t.target, 90); // najwyższy próg 88,24% + zapas
  assert.deepEqual(chance(data, 'Urologia', 'Zachodniopomorskie', 88.5), { ok: 4, of: 4, label: 'wysokie' });
  assert.equal(chance(data, 'Urologia', 'Zachodniopomorskie', 88.1).ok, 3);
  // Rodzinna ZP wiosna 2026: 10/10 miejsc obsadzonych, próg 70,19% -> 60% nie wystarcza w tym naborze
  assert.deepEqual(chance(data, 'Medycyna rodzinna', 'Zachodniopomorskie', 60), { ok: 3, of: 4, label: 'średnie' });
});

test('Chirurgia naczyniowa ZP: rezydentura nieobsadzona, ale informacja o progach pozarezydenckich', () => {
  const t = suggestTarget(data, 'Chirurgia naczyniowa', 'Zachodniopomorskie', 'rez');
  assert.equal(t.target, null);
  assert.match(t.basis, /pozarezydenckim progi sięgały 88\.86%/);
});
