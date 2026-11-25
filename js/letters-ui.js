// Okno „Pisma i maile”: wybór szablonu, dane z aplikacji, podgląd → Kopiuj / E-mail / Drukuj (PDF).
import { LETTERS, letter } from './letters.js';
import { printHtml } from './timesheet-ui.js';
import { esc } from './blocks-ui.js';
import { fmtShort } from './dates.js';

const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];

/** preset: { kind, from, to, blockId, month } */
export function openLetters(state, ctx, preset = {}) {
  const today = ctx.today();
  const o = { kind: preset.kind || 'urlop', from: preset.from || today, to: preset.to || preset.from || today,
    blockId: preset.blockId || state.blocks.find((b) => b.end >= today)?.id || state.blocks[0]?.id, month: preset.month || today.slice(0, 7) };
  const months = [];
  for (let ym = state.settings.startDate.slice(0, 7); ym <= state.settings.endDate.slice(0, 7);) {
    months.push(ym);
    const [y, m] = ym.split('-').map(Number);
    ym = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
  }
  const root = document.createElement('div');
  root.className = 'sheet-wrap';
  document.body.appendChild(root);
  document.body.classList.add('no-scroll');
  const close = () => { root.classList.add('closing'); document.body.classList.remove('no-scroll'); setTimeout(() => root.remove(), 220); };

  const draw = () => {
    const def = LETTERS.find((x) => x.id === o.kind) || LETTERS[0];
    const L = letter(o.kind, state, { ...o, today });
    const f = def.fields;
    root.innerHTML = `<div class="sheet-backdrop" data-close></div><div class="sheet" role="dialog" aria-label="Pisma i maile">
      <div class="sheet-head"><button class="link" data-close>Zamknij</button><b>Pisma i maile</b><span></span></div>
      <div class="sheet-body"><div class="form-card">
        <label>Szablon<select data-lt="kind">${LETTERS.map((x) => `<option value="${x.id}" ${x.id === o.kind ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
        ${f.includes('from') ? `<div class="row2"><label>Od<input type="date" data-lt="from" value="${o.from}"></label><label>Do<input type="date" data-lt="to" value="${o.to}"></label></div>` : ''}
        ${f.includes('block') ? `<label>Blok<select data-lt="blockId">${state.blocks.map((b) => `<option value="${esc(b.id)}" ${b.id === o.blockId ? 'selected' : ''}>${esc(b.name)} (${fmtShort(b.start)}–${fmtShort(b.end)})</option>`).join('')}</select></label>` : ''}
        ${f.includes('month') ? `<label>Miesiąc<select data-lt="month">${months.map((m) => `<option value="${m}" ${m === o.month ? 'selected' : ''}>${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}</option>`).join('')}</select></label>` : ''}
        ${state.settings.personal?.name ? '' : '<p class="hint small">Imię i nazwisko wpiszesz w Więcej → Karta czasu pracy (zapisuje się tylko u Ciebie).</p>'}
      </div>
      <div class="form-card"><div class="card-label">Temat</div><div class="t-strong letter-subj">${esc(L.subject)}</div>
        <pre class="letter-body">${esc(L.body)}</pre></div>
      <div class="quick three">
        <button class="btn" data-lt-copy>📋 Kopiuj</button>
        <button class="btn" data-lt-mail>✉️ E-mail</button>
        <button class="btn" data-lt-print>🖨 PDF</button>
      </div>
      <p class="hint small">To propozycja treści – sprawdź ją przed wysłaniem. Kadry mogą mieć własny druk (np. wniosku urlopowego) – wtedy przepisz dane.</p>
      </div></div>`;
  };
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    const L = letter(o.kind, state, { ...o, today });
    if (e.target.closest('[data-lt-copy]')) {
      navigator.clipboard?.writeText(`${L.subject}\n\n${L.body}`).then(() => ctx.toast('Skopiowano ✓'), () => ctx.toast('Zaznacz tekst i skopiuj ręcznie'));
    } else if (e.target.closest('[data-lt-mail]')) {
      location.href = `mailto:?subject=${encodeURIComponent(L.subject)}&body=${encodeURIComponent(L.body)}`;
    } else if (e.target.closest('[data-lt-print]')) {
      printHtml(`<div class="letter-print"><pre>${esc(L.body)}</pre></div>`, L.title);
    }
  });
  root.addEventListener('change', (e) => {
    const k = e.target.dataset.lt;
    if (!k) return;
    o[k] = e.target.value;
    if (k === 'from' && o.to < o.from) o.to = o.from;
    draw();
  });
  draw();
}
