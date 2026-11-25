import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patientDataWarnings, casesOf } from '../js/cases.js';

test('Przypadki: ostrzeżenie przy danych pacjenta, czysty opis bez ostrzeżeń', () => {
  assert.deepEqual(patientDataWarnings('68 l., ból w klatce, STEMI ściany dolnej, PCI RCA. Nauka: odprowadzenia prawokomorowe.'), []);
  assert.ok(patientDataWarnings('PESEL 85010112345').some((w) => w.includes('PESEL')));
  assert.ok(patientDataWarnings('tel. 601 234 567').some((w) => w.includes('telefon')));
  assert.ok(patientDataWarnings('ur. 01.02.1950').some((w) => w.includes('urodzenia')));
  assert.ok(patientDataWarnings('mieszka ul. Unii Lubelskiej').some((w) => w.includes('adres')));
  assert.ok(patientDataWarnings('Pani Kowalska, 70 l.').some((w) => w.includes('nazwisko')));
});

test('Przypadki bloku – najnowsze pierwsze', () => {
  const st = { cases: [{ id: 'a', blockId: 'int', date: '2027-02-05' }, { id: 'b', blockId: 'int', date: '2027-03-01' }, { id: 'c', blockId: 'ped', date: '2027-07-20' }] };
  assert.deepEqual(casesOf(st, 'int').map((c) => c.id), ['b', 'a']);
});
