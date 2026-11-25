// Przypadki z oddziału: karta na ekranie Bloki + okno wpisu (zapis dopiero po „Zapisz”, usuwanie z „Cofnij”).
import { patientDataWarnings, casesOf } from './cases.js';
import { placeOn } from './engine.js';
import { esc } from './blocks-ui.js';
import { fmtDayShort } from './dates.js';

export function casesCard(state, today) {
  const blocks = state.blocks.filter((b) => b.start <= today || casesOf(state, b.id).length);
  const groups = blocks.map((b) => {
    const list = casesOf(state, b.id);
    if (!list.length) return '';
    return `<div class="sec-name"><span>${esc(b.short)} <span class="sec-n">(${list.length})</span></span></div>
      ${list.map((c) => `<button class="list-item ev-item" data-case-edit="${esc(c.id)}"><div class="ev-ic">🩺</div>
        <div class="grow"><div class="t">${esc(c.title || 'Przypadek')}</div><div class="s">${fmtDayShort(c.date)}${c.text ? ` · ${esc(c.text.slice(0, 80))}${c.text.length > 80 ? '…' : ''}` : ''}</div></div><span class="chev">›</span></button>`).join('')}`;
  }).join('');
  return `<div class="card fade"><div class="card-label">🩺 Przypadki z oddziału · ${(state.cases || []).length}</div>
    <p class="sub">Krótkie notatki do nauki: rozpoznanie, czego się nauczyłeś, co doczytać. <b>Bez danych pacjenta</b> (imię, nazwisko, PESEL, data urodzenia, adres).</p>
    ${groups || ''}
    <button class="btn" data-case-new>＋ Dodaj przypadek</button></div>`;
}

export function openCaseEditor(state, ctx, id = null) {
  const today = ctx.today();
  const cur = (state.cases || []).find((c) => c.id === id);
  const draft = cur ? { ...cur } : { id: `p${Date.now()}`, date: today, blockId: placeOn(state, today)?.block?.id || '', title: '', text: '' };
  const root = document.createElement('div');
  root.className = 'sheet-wrap';
  document.body.appendChild(root);
  document.body.classList.add('no-scroll');
  const close = () => { root.classList.add('closing'); document.body.classList.remove('no-scroll'); setTimeout(() => root.remove(), 220); };
  const warnBox = () => {
    const w = patientDataWarnings(`${draft.title} ${draft.text}`);
    return w.length ? `<div class="imp-row warn">⚠️ Wygląda na dane pacjenta: ${esc(w.join(', '))}. Usuń je – notatka ma służyć nauce, nie dokumentacji.</div>` : '';
  };
  root.innerHTML = `<div class="sheet-backdrop" data-close></div><div class="sheet" role="dialog" aria-label="Przypadek">
    <div class="sheet-head"><button class="link" data-close>Anuluj</button><b>${cur ? 'Przypadek' : 'Nowy przypadek'}</b><button class="link strong" data-ok>Zapisz</button></div>
    <div class="sheet-body"><div class="form-card">
      <div class="imp-row">🔒 Bez danych pacjenta: imienia, nazwiska, PESEL, daty urodzenia, adresu, numeru historii choroby.</div>
      <label>Dzień<input type="date" data-c="date" value="${esc(draft.date)}"></label>
      <label>Blok<select data-c="blockId"><option value="">—</option>${state.blocks.map((b) => `<option value="${esc(b.id)}" ${b.id === draft.blockId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
      <label>Tytuł<input data-c="title" value="${esc(draft.title)}" placeholder="np. STEMI ściany dolnej, 68 l."></label>
      <label>Opis i czego się nauczyłem<textarea data-c="text" rows="6" placeholder="objawy, badania, leczenie, co doczytać">${esc(draft.text)}</textarea></label>
      <div data-warn>${warnBox()}</div>
    </div>
    ${cur ? '<button class="btn danger-btn" data-del>Usuń przypadek</button>' : ''}</div></div>`;
  root.addEventListener('input', (e) => {
    const k = e.target.dataset.c;
    if (!k) return;
    draft[k] = e.target.value;
    if (k === 'date' && e.target.value) draft.blockId = placeOn(state, e.target.value)?.block?.id || draft.blockId;
    if (k === 'date') root.querySelector('[data-c="blockId"]').value = draft.blockId;
    root.querySelector('[data-warn]').innerHTML = warnBox();
  });
  root.addEventListener('change', (e) => { const k = e.target.dataset.c; if (k) draft[k] = e.target.value; });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    if (e.target.closest('[data-ok]')) {
      if (!draft.title.trim() && !draft.text.trim()) { ctx.toast('Wpisz tytuł albo opis'); return; }
      state.cases = state.cases || [];
      const i = state.cases.findIndex((c) => c.id === draft.id);
      if (i >= 0) state.cases[i] = draft; else state.cases.push(draft);
      ctx.save(); ctx.render(); ctx.toast('Zapisano ✓');
      return close();
    }
    if (e.target.closest('[data-del]')) {
      const i = state.cases.findIndex((c) => c.id === draft.id);
      if (i < 0) return close();
      const removed = state.cases.splice(i, 1)[0];
      ctx.save(); ctx.render();
      ctx.toast('Usunięto', () => { state.cases.push(removed); ctx.save(); ctx.render(); });
      return close();
    }
  });
}
