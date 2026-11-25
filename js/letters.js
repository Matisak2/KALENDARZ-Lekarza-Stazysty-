// Pisma i maile (szablony) – czysta logika: tekst z danymi z aplikacji. Imię i nazwisko tylko z ustawień (lokalnie).
// Treść to propozycja do sprawdzenia – Kadry USK2 mogą mieć własne druki (np. wniosek urlopowy).
import { eachDay, isWeekend, fmtFull } from './dates.js';
import { buildContext, statutoryOff, placeOn } from './engine.js';
import { hospitalOf } from './hospitals.js';

const MONTHS_GEN = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];

export const LETTERS = [
  { id: 'urlop', label: 'Wniosek o urlop wypoczynkowy', fields: ['from', 'to'] },
  { id: 'l4', label: 'Informacja o zwolnieniu lekarskim (Kadry + opiekun)', fields: ['from', 'to'] },
  { id: 'zewn-koord', label: 'Mail do koordynatora: zgoda na staż poza USK2', fields: ['block'] },
  { id: 'zewn-kadry', label: 'Informacja do Kadr: miejsce stażu poza USK2', fields: ['block'] },
  { id: 'dokumenty', label: 'Mail do Kadr: dokumenty za miesiąc', fields: ['month'] },
];

/** Dni robocze w zakresie (bez weekendów, świąt i dni wolnych za soboty). */
export function workdaysBetween(state, from, to) {
  if (!from || !to || to < from) return 0;
  const ctx = buildContext(state);
  return eachDay(from, to).filter((d) => !isWeekend(d) && !statutoryOff(ctx, d)).length;
}

function blockPlace(block) {
  const seg = [...(block?.segments || [])].sort((a, b) => (a.start < b.start ? -1 : 1))[0];
  const h = hospitalOf(seg);
  return { seg, h, where: h ? `${h.name}${h.address ? `, ${h.address}` : ''}` : '(placówka – uzupełnij)', ward: seg?.ward || '(oddział – uzupełnij)' };
}

const dni = (n) => `${n} ${n === 1 ? 'dzień roboczy' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'dni robocze' : 'dni roboczych'}`;

/**
 * Tekst pisma/maila. opts: { from, to, blockId, month (RRRR-MM), today }.
 * Zwraca { title, subject, body } – body jako zwykły tekst (do maila, kopiowania i druku).
 */
export function letter(kind, state, opts = {}) {
  const st = state.settings;
  const name = st.personal?.name || '[imię i nazwisko]';
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const sign = `\n\nZ poważaniem\n${name}\nlekarz stażysta, grupa stażowa ${st.group || '…'}`;
  const from = opts.from || today;
  const to = opts.to && opts.to >= from ? opts.to : from;
  const block = (state.blocks || []).find((b) => b.id === opts.blockId) || null;

  if (kind === 'urlop') {
    const n = workdaysBetween(state, from, to);
    const inBlock = [...new Set(eachDay(from, to).map((d) => placeOn(state, d)?.block?.name).filter(Boolean))];
    return {
      title: 'Wniosek o urlop wypoczynkowy',
      subject: `Wniosek urlopowy ${fmtFull(from)}–${fmtFull(to)} – ${name}`,
      body: `Szczecin, ${fmtFull(today)}\n\n${name}\nlekarz stażysta, grupa stażowa ${st.group || '…'}\n\n`
        + 'Dyrektor\nUniwersytecki Szpital Kliniczny nr 2 PUM w Szczecinie\n(za pośrednictwem Działu Kadrowo-Płacowego)\n\n'
        + 'WNIOSEK O URLOP WYPOCZYNKOWY\n\n'
        + `Proszę o udzielenie urlopu wypoczynkowego w dniach od ${fmtFull(from)} do ${fmtFull(to)} (${dni(n)}).`
        + (inBlock.length ? `\nUrlop przypada w trakcie stażu cząstkowego: ${inBlock.join(', ')}. Dni nieobecności odrobię po zakończeniu harmonogramu stażu.` : '')
        + `\n\n\n……………………………\npodpis wnioskodawcy\n\n……………………………\nopiekun stażu / koordynator\n\n……………………………\nzatwierdzam`,
    };
  }
  if (kind === 'l4') {
    const pl = placeOn(state, from);
    return {
      title: 'Informacja o zwolnieniu lekarskim',
      subject: `Zwolnienie lekarskie ${fmtFull(from)}–${fmtFull(to)} – ${name}`,
      body: 'Dzień dobry,\n\n'
        + `informuję, że od ${fmtFull(from)} do ${fmtFull(to)} przebywam na zwolnieniu lekarskim (e-ZLA trafi do pracodawcy elektronicznie).`
        + (pl?.block ? ` Jestem obecnie na stażu cząstkowym: ${pl.block.name}${pl.segment?.ward ? ` (${pl.segment.ward})` : ''}.` : '')
        + ' Dni nieobecności odrobię po zakończeniu harmonogramu stażu.' + sign,
    };
  }
  if (kind === 'zewn-koord' || kind === 'zewn-kadry') {
    const p = blockPlace(block);
    const dates = block ? `od ${fmtFull(block.start)} do ${fmtFull(block.end)}` : 'w dniach …';
    const what = block ? block.name : '(staż cząstkowy)';
    if (kind === 'zewn-koord') {
      return {
        title: 'Prośba o zgodę na staż poza USK2',
        subject: `Staż cząstkowy ${what} poza USK2 – prośba o pismo`,
        body: 'Szanowna Pani / Szanowny Panie Koordynatorze,\n\n'
          + `zgodnie z harmonogramem odbywam staż cząstkowy „${what}” ${dates} w placówce: ${p.where}, ${p.ward}.\n`
          + 'Uprzejmie proszę o pismo ze zgodą na odbycie tej części stażu poza USK2, które przekażę do placówki razem z kopią książeczki zdrowia (Informacja USK2 dla stażysty, pkt 10–11).' + sign,
      };
    }
    return {
      title: 'Informacja o miejscu odbywania stażu cząstkowego',
      subject: `Informacja o miejscu stażu cząstkowego ${dates} – ${name}`,
      body: `Szczecin, ${fmtFull(today)}\n\n${name}\nlekarz stażysta, grupa stażowa ${st.group || '…'}\n\nDział Kadrowo-Płacowy\nUniwersytecki Szpital Kliniczny nr 2 PUM w Szczecinie\n\n`
        + 'INFORMACJA O MIEJSCU ODBYWANIA STAŻU CZĄSTKOWEGO\n\n'
        + `Informuję, że staż cząstkowy „${what}” odbywam ${dates} w placówce:\n${p.where}\n${p.ward}.\n`
        + 'Zgoda koordynatora stażu w załączeniu.\n\n\n……………………………\npodpis',
    };
  }
  if (kind === 'dokumenty') {
    const ym = opts.month || today.slice(0, 7);
    const mon = `${MONTHS_GEN[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;
    return {
      title: `Dokumenty za ${mon}`,
      subject: `Karta czasu pracy, karta dyżurów i lista obecności – ${mon} – ${name}`,
      body: 'Dzień dobry,\n\n'
        + `w załączeniu przesyłam dokumenty za ${mon}: kartę czasu pracy, kartę dyżurów i listę obecności. Oryginały z podpisami dostarczę do Działu Kadrowo-Płacowego.` + sign,
    };
  }
  return { title: '', subject: '', body: '' };
}
