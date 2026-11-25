import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

test('Offline: lista SHELL w sw.js zawiera wszystkie moduły js/', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const files = readdirSync(new URL('../js/', import.meta.url)).filter((f) => f.endsWith('.js'));
  for (const f of files) assert.ok(sw.includes(`'js/${f}'`), `brak js/${f} w SHELL`);
});

test('Audyt B1: jedna kompletna wersja – instalacja całej listy, bez natychmiastowego przełączania, pamięć przed siecią', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const install = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('message'"));
  assert.ok(install.includes("cache: 'reload'"));
  assert.ok(!install.includes('skipWaiting')); // nowa wersja czeka na „Odśwież”
  assert.ok(sw.includes("e.data === 'skipWaiting'"));
  assert.ok(!sw.includes('setTimeout')); // bez wyścigu sieć/pamięć po 3 s (mieszanie wersji)
});
