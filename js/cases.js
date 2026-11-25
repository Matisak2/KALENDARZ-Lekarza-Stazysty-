// Przypadki z oddziału – notatki do nauki BEZ danych pacjenta. Czysta logika (wykrywanie danych osobowych).

/**
 * Ostrzeżenia, gdy tekst wygląda na dane pacjenta: PESEL (11 cyfr), telefon, data urodzenia, adres, „Pan/Pani Nazwisko”,
 * inicjały z nazwiskiem. To tylko podpowiedź – odpowiedzialność za treść jest po stronie piszącego.
 */
export function patientDataWarnings(text) {
  const t = String(text || '');
  const out = [];
  if (/(^|\D)\d{11}(\D|$)/.test(t)) out.push('ciąg 11 cyfr – wygląda na PESEL');
  if (/(^|\D)(\+?48[\s-]?)?\d{3}[\s-]?\d{3}[\s-]?\d{3}(\D|$)/.test(t)) out.push('numer telefonu');
  if (/\bur(\.|odzon[aey])\s*\d{1,2}[./-]\d{1,2}[./-](19|20)\d{2}/i.test(t) || /\bdata urodzenia\b/i.test(t)) out.push('data urodzenia');
  if (/\b(ul\.|ulica|al\.|os\.)\s*[A-ZĄĆĘŁŃÓŚŹŻ]/.test(t)) out.push('adres');
  if (/(^|[^A-Za-ząćęłńóśźż])([Pp]an|[Pp]ani|[Pp]acjent|[Pp]acjentka)\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]{2,}/.test(t)) out.push('nazwisko („Pan/Pani …”)');
  if (/\bnr\s*(historii|hist\.|księgi|ks\.)/i.test(t)) out.push('numer historii choroby/księgi');
  return out;
}

/** Przypadki danego bloku (najnowsze pierwsze). */
export function casesOf(state, blockId) {
  return (state.cases || []).filter((c) => c.blockId === blockId).sort((a, b) => (a.date < b.date ? 1 : -1));
}
