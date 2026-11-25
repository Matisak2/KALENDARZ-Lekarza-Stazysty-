import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

test('Offline: lista SHELL w sw.js zawiera wszystkie moduły js/', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const files = readdirSync(new URL('../js/', import.meta.url)).filter((f) => f.endsWith('.js'));
  for (const f of files) assert.ok(sw.includes(`'js/${f}'`), `brak js/${f} w SHELL`);
});
