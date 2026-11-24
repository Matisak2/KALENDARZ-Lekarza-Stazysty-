// Specjalizacje: miejsca i progi z naborów CMKP (data/nabory.json, aktualizowane skryptem scripts/nabory.py).
// Próg = najniższy wynik wśród zakwalifikowanych, ale tylko gdy wszystkie miejsca zostały obsadzone.
// Gdy zostały wolne miejsca, każdy chętny się dostał – wtedy progu konkurencyjnego nie było.

export const TRYBY = { rez: 'rezydentura', poz: 'pozarezydencki', dokt: 'doktorancki' };
export const MY_SPECS = ['Chirurgia plastyczna', 'Chirurgia naczyniowa', 'Urologia', 'Medycyna rodzinna'];

export function specNames(data) {
  const set = new Set();
  for (const s of data?.sessions || []) for (const w of Object.values(s.places || {})) for (const dz of Object.keys(w)) set.add(dz);
  return [...set].sort((a, b) => a.localeCompare(b, 'pl'));
}

export function wojNames(data) {
  const s = data?.sessions?.[0];
  return s ? Object.keys(s.places).sort((a, b) => a.localeCompare(b, 'pl')) : [];
}

/** Statystyki jednej specjalizacji w jednym województwie dla każdej sesji. */
export function specStats(data, dz, woj, tryb = 'rez') {
  return (data?.sessions || []).map((s) => {
    const pl = s.places?.[woj]?.[dz] || { rez: 0, dokt: 0, poz: 0 };
    const places = tryb === 'rez' ? pl.rez - pl.dokt : tryb === 'dokt' ? pl.dokt : pl.poz;
    const r = s.results?.[woj]?.[dz]?.[tryb] || null;
    const n = r ? r.n : 0;
    const filled = places > 0 && n >= places;
    return {
      session: s.label, id: s.id, places: Math.max(0, places), qualified: n,
      min: r ? r.min : null, med: r ? r.med : null, max: r ? r.max : null,
      filled, threshold: filled ? r.min : null,
      status: places <= 0 ? 'brak miejsc' : filled ? 'obsadzone' : n ? 'zostały wolne miejsca' : 'miejsce nieobsadzone',
    };
  });
}

/** Proponowany cel wyniku: najwyższy próg z ostatnich naborów (konkurencyjnych) + 1 pkt zapasu. */
export function suggestTarget(data, dz, woj, tryb = 'rez') {
  const th = specStats(data, dz, woj, tryb).map((x) => x.threshold).filter((x) => x != null);
  if (!th.length) {
    const other = specStats(data, dz, woj, tryb === 'rez' ? 'poz' : 'rez').map((x) => x.threshold).filter((x) => x != null);
    const note = other.length ? ` Uwaga: w trybie ${tryb === 'rez' ? 'pozarezydenckim' : 'rezydenckim'} progi sięgały ${Math.max(...other).toFixed(2)}%.` : '';
    return { target: null, basis: `w ostatnich naborach (${TRYBY[tryb]}) miejsca nie były w pełni obsadzone – wystarczyło zdać LEK (56%).${note}` };
  }
  const max = Math.max(...th);
  return { target: Math.min(100, Math.ceil(max + 1)), basis: `najwyższy próg z ${th.length} naborów: ${max.toFixed(2)}% (+1 pkt zapasu)` };
}

/** Ocena szans dla wyniku `pct`: w ilu ostatnich naborach wynik wystarczyłby. */
export function chance(data, dz, woj, pct, tryb = 'rez') {
  const st = specStats(data, dz, woj, tryb).filter((x) => x.places > 0);
  if (!st.length || pct == null) return null;
  const ok = st.filter((x) => !x.filled || pct >= x.threshold).length;
  return { ok, of: st.length, label: ok === st.length ? 'wysokie' : ok >= st.length / 2 ? 'średnie' : ok > 0 ? 'niskie' : 'bardzo niskie' };
}
