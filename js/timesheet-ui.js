// Karta czasu pracy – podgląd i PDF (druk przeglądarki: na iPhonie „Udostępnij → Zapisz w Plikach”).
import { buildTimesheet, hm } from './timesheet.js';
import { esc } from './blocks-ui.js';
import { todayIso } from './dates.js';

let curYm = null;

function shift(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** HTML karty w układzie wzoru USK2 (do podglądu i druku). */
export function timesheetHtml(k) {
  const v = (x) => hm(x);
  const rows = k.rows.map((r) => `<tr class="${r.shaded ? 'sh' : ''}">
    <td>${r.day}</td><td class="${r.dutyRed ? 'red' : ''}">${esc(r.hours)}</td><td class="n">${v(r.nominal)}</td>
    <td class="n ${r.duty ? 'red' : ''}">${v(r.duty)}</td><td></td><td></td>
    <td class="n">${v(r.dutyHoliday)}</td><td class="n">${v(r.dutyNightHoliday)}</td><td class="n">${v(r.dutyPhone)}</td>
    <td class="note">${esc(r.note || '')}</td></tr>`).join('');
  const t = k.totals;
  return `<div class="ts">
    <div class="ts-top"><div class="ts-logo">Uniwersytecki Szpital Kliniczny nr 2<br>PUM w Szczecinie</div><div class="ts-title">KARTA CZASU PRACY</div></div>
    <div class="ts-who"><div><b>${esc(k.name || '……………………………')}</b><small>Imię i nazwisko</small></div>
      <div><b>${esc(k.unit)}</b><small>Komórka organizacyjna</small></div></div>
    <div class="ts-month">Liczba godzin przepracowanych w miesiącu <b>${esc(k.monthLabel)}</b> roku <span>gr stażowa <b>${esc(k.group)}</b></span></div>
    <table class="ts-t">
      <thead>
        <tr><th rowspan="2">Lp.</th><th rowspan="2">Godziny pracy<br>od-do</th><th rowspan="2">Nominalne godziny pracy (proporcjonalnie do wymiaru czasu pracy)</th>
          <th colspan="3">Dyżur medyczny zwykły</th><th colspan="2">Dyżur medyczny świąteczny</th><th rowspan="2">Dyżur pod telefonem</th><th rowspan="2">Uwagi</th></tr>
        <tr><th>godziny zwykłe dyżuru (razem 5+6)</th><th>dodatek 50% za godziny dzienne do 22 (liczba godzin)</th><th>dodatek 100% za godziny nocne od 22 do 6 (liczba godzin)</th>
          <th>godziny zwykłe dyżuru z dodatkiem 100%</th><th>dodatek 20% za godziny nocne od 22 do 6 (liczba godzin)</th></tr>
        <tr class="num"><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td><td>7</td><td>8</td><td>9</td><td>10</td></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td>RA</td><td></td><td class="n red">${hm(t.nominal, '.')}</td><td class="n red">${hm(t.duty, '.')}</td><td></td><td></td>
          <td class="n">${hm(t.dutyHoliday, '.')}</td><td class="n">${hm(t.dutyNightHoliday, '.')}</td><td class="n">${hm(t.dutyPhone, '.')}</td><td></td></tr>
        <tr><td>ZE</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>M:</td><td></td><td class="n red"><b>${hm(t.all, '.')}</b></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
      </tfoot>
    </table>
    <div class="ts-sign">
      <div>……………………………………<br><small>podpis pracownika</small><br><br>data i podpis……………………<br><small>sprawdził (Dział Kadrowo-Płacowy)</small></div>
      <div>……………………………………<br><small>podpis lekarza kierującego / koordynatora</small><br><br>……………………………………<br><small>zatwierdził (Dyrektor)</small></div>
    </div>
    <table class="ts-pay"><tr><td>Liczba godzin wypłaconych</td><td>Dział Kadrowo-Płacowy (data i podpis)</td></tr><tr><td>&nbsp;</td><td></td></tr></table>
    <div class="ts-foot">Wydanie 4 · Opracował: KP-WK, data 2023-11-27 · wygenerowano w Kalendarzu Stażysty</div>
  </div>`;
}

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
      <div class="sheet-head"><button class="link" data-close>Zamknij</button><b>Karta czasu pracy</b><button class="link strong" data-print>PDF</button></div>
      <div class="sheet-body">
        <div class="form-card">
          <div class="cal-nav ts-nav"><button class="round" data-m="-1">‹</button><b>${esc(k.monthLabel)}</b><button class="round" data-m="1">›</button></div>
          <div class="row2"><label>Imię i nazwisko<input data-p="name" value="${esc(state.settings.personal?.name || '')}" placeholder="zapisze się tylko u Ciebie"></label>
            <label>Komórka<input data-p="unit" value="${esc(state.settings.personal?.unit || 'LEKARZ STAŻYSTA')}"></label></div>
          <p class="hint small">Karta wypełnia się z kalendarza: dni pracy 8.00–15.35 (7 h 35 min), urlop (UW), L4, kursy, święta i dyżury. Sprawdź podgląd i stuknij <b>PDF</b> → na iPhonie „Udostępnij” → „Zapisz w Plikach” albo wyślij mailem.
          ${gen ? `<br>Ostatnio wygenerowana: ${gen}.` : ''}</p>
        </div>
        <div class="ts-preview">${timesheetHtml(k)}</div>
      </div></div>`;
  };
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    const m = e.target.closest('[data-m]');
    if (m) { curYm = shift(curYm, Number(m.dataset.m)); return draw(); }
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
