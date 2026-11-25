// Karta czasu pracy – podgląd i PDF (druk przeglądarki: na iPhonie „Udostępnij → Zapisz w Plikach”).
import { buildTimesheet, buildAttendance, hm } from './timesheet.js';
import { dutySheetHtml } from './duties-ui.js';
import { esc } from './blocks-ui.js';
import { todayIso } from './dates.js';

let curYm = null;

function shift(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/**
 * HTML karty – wierna kopia wzoru USK2 „WZÓR – KARTA.xlsx” (Wydanie 4, KP-WK 2023-11-27): logo, 10 kolumn,
 * zacienione dni wolne, kreska pod tygodniami rozliczeniowymi (1–7, 8–14, 15–21, 22–koniec), RA/ZE/M, podpisy.
 */
export function timesheetHtml(k) {
  const v = (x) => hm(x);
  const cols = [45, 110, 98, 69, 85, 85, 118, 86, 82, 44].map((w) => `<col style="width:${w}px">`).join('');
  const rows = k.rows.map((r) => `<tr class="${r.shaded ? 'sh' : ''} ${[7, 14, 21].includes(r.day) ? 'wk' : ''}">
    <td class="c">${r.day}</td><td>${esc(r.hours)}</td><td class="n">${v(r.nominal)}</td>
    <td class="n">${v(r.duty)}</td><td></td><td></td>
    <td class="n">${v(r.dutyHoliday)}</td><td class="n">${v(r.dutyNightHoliday)}</td><td class="n">${v(r.dutyPhone)}</td>
    <td class="note">${r.shaded ? '' : esc(r.note || '')}</td></tr>`).join('');
  const t = k.totals;
  const dots = (txt) => `<span class="dots">……</span>${esc(txt)}<span class="dots">……………………</span>`;
  return `<div class="ts">
    <table class="ts-g"><colgroup>${cols}</colgroup>
      <tr><td colspan="3" rowspan="2" class="ts-logo"><img src="img/usk2-logo.svg" alt="Uniwersytecki Szpital Kliniczny nr 2 PUM w Szczecinie"></td><td colspan="7"></td></tr>
      <tr><td colspan="7" class="ts-title">KARTA CZASU PRACY</td></tr>
      <tr><td colspan="4" class="c ts-name">${k.name ? dots(k.name.toUpperCase()) : '……………………………………………'}</td><td colspan="2"></td><td colspan="4" class="c ts-name">${dots(k.unit)}</td></tr>
      <tr class="lbl"><td colspan="4" class="c">Imię i nazwisko</td><td colspan="2"></td><td colspan="4" class="c">Komórka organizacyjna</td></tr>
      <tr><td colspan="2"></td><td colspan="5">Liczba godzin przepracowanych w miesiącu ${esc(k.monthLabel)} roku</td><td colspan="3">gr stażowa …${esc(k.group)}.</td></tr>
    </table>
    <table class="ts-t"><colgroup>${cols}</colgroup>
      <thead>
        <tr><th rowspan="2">Lp.</th><th rowspan="2" class="l"><b>Godziny pracy<br>od-do</b></th><th rowspan="2">Nominalne godziny pracy (proporcjonalnie do wymiaru czasu pracy)</th>
          <th colspan="3"><b>Dyżur medyczny zwykły</b></th><th colspan="2"><b>Dyżur medyczny świąteczny</b></th><th rowspan="2"><b>Dyżur pod telefonem</b></th><th rowspan="2">Uwagi</th></tr>
        <tr><th>godziny zwykłe dyżuru<br>(razem 5+6)</th><th>dodatek 50% za godziny dzienne do 22<br>(liczba godzin)</th><th>dodatek 100% za godziny nocne od 22 do 6<br>(liczba godzin)</th>
          <th>godziny zwykłe dyżuru z dodatkiem 100%</th><th>dodatek 20% za godziny nocne od 22 do 6<br>(liczba godzin)</th></tr>
        <tr class="num"><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td><td>7</td><td>8</td><td>9</td><td>10</td></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td><b>RA</b></td><td></td><td>${hm(t.nominal, '.')}</td><td>${hm(t.duty, '.')}</td><td></td><td></td>
          <td>${hm(t.dutyHoliday, '.')}</td><td>${hm(t.dutyNightHoliday, '.')}</td><td>${hm(t.dutyPhone, '.')}</td><td></td></tr>
        <tr><td><b>ZE</b></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td><b>M:</b></td><td></td><td class="big">${hm(t.all, '.')}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr class="blank"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
      </tfoot>
    </table>
    <table class="ts-g ts-s"><colgroup>${cols}</colgroup>
      <tr class="sp"><td colspan="10"></td></tr>
      <tr><td colspan="3" class="box">……………………………………………<br>podpis pracownika</td><td colspan="3"></td><td colspan="2" class="box">……………………………………………<br>podpis lekarza kierującego/ koordynatora</td><td colspan="2"></td></tr>
      <tr><td colspan="3">data i podpis…………………………<br>sprawdził (Dział Kadrowo-Płacowy)</td><td colspan="3"></td><td colspan="4"><br>……………………………………………<br>zatwierdził (Dyrektor)</td></tr>
    </table>
    <table class="ts-pay"><colgroup>${cols}</colgroup>
      <tr><td colspan="2" class="c">Liczba godzin<br>wypłaconych</td><td colspan="8">Dział Kadrowo-Płacowy (data i podpis)</td></tr>
      <tr><td colspan="2">&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    </table>
    <div class="ts-foot">Wydanie 4<br>Opracował:KP-WK, data 2023-11-27</div>
  </div>`;
}

/**
 * Lista obecności (do podpisu). Układ przybliżony – kody z legendy listy obecności USK2 (Wydanie 5).
 * Gdy będzie zdjęcie wzoru, można dopasować układ 1:1.
 */
export function attendanceHtml(a) {
  const rows = a.rows.map((r) => `<tr class="${r.shaded ? 'sh' : ''}"><td class="c">${r.day}</td><td class="c">${r.wd}</td>
    <td></td><td class="c"><b>${esc(r.code)}</b></td><td class="note">${r.shaded ? esc(r.note) : ''}</td></tr>`).join('');
  return `<div class="att">
    <div class="att-title">LISTA OBECNOŚCI</div>
    <div class="att-line">Lekarz stażysta: <b>${esc(a.name) || '……………………………………'}</b> · grupa stażowa ${esc(a.group)} · miesiąc: <b>${esc(a.monthLabel)}</b></div>
    <table class="att-t"><thead><tr><th>Dzień</th><th>Dz. tyg.</th><th>Podpis</th><th>Kod</th><th>Uwagi</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="att-legend">Kody: ZL – zwolnienie lekarskie, UW – urlop wypoczynkowy, OP – opieka, UB – urlop bezpłatny, NU – nieobecność usprawiedliwiona płatna, SZ – szkolenie, WD – wolne po dyżurze medycznym.</div>
    <div class="att-sign"><div>……………………………<br>podpis lekarza kierującego / koordynatora</div></div>
  </div>`;
}

const MON = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];

export function openTimesheet(state, today, ctx, ym) {
  curYm = ym || curYm || today.slice(0, 7);
  const root = document.createElement('div');
  root.className = 'sheet-wrap';
  document.body.appendChild(root);
  document.body.classList.add('no-scroll');
  const close = () => { root.classList.add('closing'); document.body.classList.remove('no-scroll'); setTimeout(() => root.remove(), 220); };
  const draw = () => {
    const k = buildTimesheet(state, curYm);
    const gen = state.timesheets?.[curYm]?.generatedAt;
    root.innerHTML = `<div class="sheet-backdrop" data-close></div><div class="sheet wide" role="dialog" aria-label="Karta czasu pracy">
      <div class="sheet-head"><button class="link" data-close>Zamknij</button><b>Dokumenty za miesiąc</b><button class="link strong" data-print>PDF</button></div>
      <div class="sheet-body">
        <div class="form-card">
          <div class="cal-nav ts-nav"><button class="round" data-m="-1">‹</button><b>${esc(k.monthLabel)}</b><button class="round" data-m="1">›</button></div>
          <div class="row2"><label>Imię i nazwisko<input data-p="name" value="${esc(state.settings.personal?.name || '')}" placeholder="zapisze się tylko u Ciebie"></label>
            <label>Komórka<input data-p="unit" value="${esc(state.settings.personal?.unit || 'LEKARZ STAŻYSTA')}"></label></div>
          <p class="hint small">Karta wypełnia się z kalendarza: dni pracy 8.00–15.35 (7 h 35 min), urlop (UW), L4, kursy, święta i dyżury. Sprawdź podgląd i stuknij <b>PDF</b> → na iPhonie „Udostępnij” → „Zapisz w Plikach” albo wyślij mailem.
          ${gen ? `<br>Ostatnio wygenerowana: ${gen}.` : ''}</p>
          ${k.warnings.map((w) => `<div class="imp-row warn">⚠️ ${esc(w)}</div>`).join('')}
          <div class="card-label" style="margin-top:12px">Komplet do Kadr (${esc(k.monthLabel)})</div>
          <button class="btn primary" data-pack>🖨 Wszystko naraz: karta czasu pracy + karta dyżurów + lista obecności</button>
          <div class="quick two"><button class="btn" data-print-duty>🖨 Karta dyżurów</button><button class="btn" data-print-att>🖨 Lista obecności</button></div>
          <p class="hint small">Lista obecności ma układ przybliżony (kody z legendy USK2). Prześlij zdjęcie wzoru, a dopasuję ją 1:1.</p>
        </div>
        <div class="ts-preview">${timesheetHtml(k)}</div>
      </div></div>`;
  };
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    const m = e.target.closest('[data-m]');
    if (m) { curYm = shift(curYm, Number(m.dataset.m)); return draw(); }
    const mark = () => {
      state.timesheets = { ...(state.timesheets || {}), [curYm]: { ...(state.timesheets?.[curYm] || {}), generatedAt: todayIso() } };
      ctx.save();
    };
    const label = `${MON[Number(curYm.slice(5)) - 1]} ${curYm.slice(0, 4)}`;
    if (e.target.closest('[data-pack]')) {
      mark();
      const page = (h) => `<div class="print-page">${h}</div>`;
      printHtml(page(timesheetHtml(buildTimesheet(state, curYm))) + page(dutySheetHtml(state, curYm)) + page(attendanceHtml(buildAttendance(state, curYm))), `Dokumenty ${label}`);
      return draw();
    }
    if (e.target.closest('[data-print-duty]')) return printHtml(dutySheetHtml(state, curYm), `Karta dyżurów ${label}`);
    if (e.target.closest('[data-print-att]')) return printHtml(attendanceHtml(buildAttendance(state, curYm)), `Lista obecności ${label}`);
    if (e.target.closest('[data-print]')) {
      const k = buildTimesheet(state, curYm);
      state.timesheets = { ...(state.timesheets || {}), [curYm]: { ...(state.timesheets?.[curYm] || {}), generatedAt: todayIso() } };
      ctx.save();
      printHtml(timesheetHtml(k), `Karta czasu pracy ${k.monthLabel}`);
      draw();
    }
  });
  root.addEventListener('change', (e) => {
    const f = e.target.dataset.p;
    if (!f) return;
    state.settings.personal = { ...(state.settings.personal || {}), [f]: e.target.value.trim() };
    ctx.save();
    draw();
  });
  draw();
}

/** Druk do PDF: tymczasowo pokazujemy tylko kartę i wywołujemy okno drukowania. */
export function printHtml(html, title) {
  let pr = document.getElementById('print-root');
  if (!pr) { pr = document.createElement('div'); pr.id = 'print-root'; document.body.appendChild(pr); }
  pr.innerHTML = html;
  const old = document.title;
  document.title = title;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); document.title = old; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(done, 1500); }, 50);
}
