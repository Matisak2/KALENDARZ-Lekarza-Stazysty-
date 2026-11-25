// Karta „Terminy Kadr” (Więcej) i okno „Wklej mail z Kadr”.
import { hrDeadlines } from './engine.js';
import { parseHrMail } from './hrmail.js';
import { fmtDayShort, fmtFull } from './dates.js';
import { esc } from './blocks-ui.js';

/** Karta z najbliższymi terminami Kadr (z odhaczaniem) i przyciskiem wklejania maila. */
export function hrCard(state, today) {
  const done = state.settings.hrDone || {};
  const list = hrDeadlines(state).filter((d) => d.due >= today).slice(0, 6);
  const custom = (state.settings.hrCustom || []).filter((d) => d.due >= today);
  return `<div class="card fade"><div class="card-label">📋 Terminy Kadr</div>
    ${list.map((d) => `<div class="val-row"><span class="${done[d.id] ? 'muted' : ''}">${done[d.id] ? '✓ ' : ''}<b>${esc(fmtDayShort(d.due))}</b> · ${esc(d.title)}${d.guess ? ' <small class="muted">(szacunek)</small>' : ''}</span>
      ${d.custom ? `<button class="chip danger-chip" data-hr-del="${esc(d.id)}">Usuń</button>` : ''}</div>`).join('') || '<p class="sub">Brak nadchodzących terminów.</p>'}
    <button class="btn" data-act="hr-mail">📩 Wklej mail z Kadr</button>
    <p class="hint small">Wklej treść maila – aplikacja znajdzie daty i zaproponuje terminy. Zapisane terminy pokażą się na Dziś, w „Ten tydzień” i w eksporcie do Kalendarza.${custom.length ? ` Z maili: ${custom.length}.` : ''}</p>
  </div>`;
}

/** Okno: wklejenie maila → lista znalezionych terminów do zaznaczenia i poprawienia → Zapisz. */
export function openHrMail(state, ctx) {
  const today = ctx.today();
  let found = [];
  const root = document.createElement('div');
  root.className = 'sheet-wrap';
  document.body.appendChild(root);
  document.body.classList.add('no-scroll');
  const close = () => { root.classList.add('closing'); document.body.classList.remove('no-scroll'); setTimeout(() => root.remove(), 220); };
  root.innerHTML = `<div class="sheet-backdrop" data-close></div><div class="sheet" role="dialog" aria-label="Wklej mail z Kadr">
    <div class="sheet-head"><button class="link" data-close>Anuluj</button><b>Mail z Kadr</b><button class="link strong" data-ok>Zapisz</button></div>
    <div class="sheet-body"><div class="form-card">
      <p class="sub" style="margin-top:0">Skopiuj treść maila z Kadr (w Poczcie: przytrzymaj tekst → Zaznacz wszystko → Kopiuj) i wklej poniżej.</p>
      <textarea data-mail rows="8" placeholder="np. „Karty czasu pracy za listopad prosimy złożyć do 03.12…”"></textarea>
    </div><div data-found></div></div></div>`;
  const box = root.querySelector('[data-found]');
  const draw = () => {
    box.innerHTML = found.length ? `<div class="form-card"><div class="card-label">Znalezione terminy · ${found.length}</div>
      ${found.map((f, i) => `<div class="mid-row">
        <label class="skill ${f.on ? 'on' : ''}"><input type="checkbox" data-on="${i}" ${f.on ? 'checked' : ''}><span class="box"></span><span class="nm">Zapisz ten termin${f.past ? ' <small>(data już minęła)</small>' : ''}</span></label>
        <label>Data<input type="date" data-due="${i}" value="${f.due}"></label><label>Tytuł<input data-title="${i}" value="${esc(f.title)}"></label>
        <p class="hint small">„${esc(f.detail)}”</p></div>`).join('')}
      <p class="hint small">Sprawdź daty – aplikacja szuka ich w tekście i może się pomylić (np. data wysłania maila).</p></div>`
      : (root.querySelector('[data-mail]').value.trim() ? '<p class="hint">Nie znalazłem w tekście żadnej daty.</p>' : '');
  };
  root.addEventListener('input', (e) => {
    if (e.target.dataset.mail !== undefined) { found = parseHrMail(e.target.value, today).map((f) => ({ ...f, on: !f.past })); draw(); return; }
    if (e.target.dataset.title !== undefined) found[Number(e.target.dataset.title)].title = e.target.value;
  });
  root.addEventListener('change', (e) => {
    const i = e.target.dataset.on ?? e.target.dataset.due;
    if (e.target.dataset.on !== undefined) { found[Number(i)].on = e.target.checked; e.target.closest('.skill').classList.toggle('on', e.target.checked); }
    if (e.target.dataset.due !== undefined && e.target.value) found[Number(i)].due = e.target.value;
  });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    if (!e.target.closest('[data-ok]')) return;
    const pick = found.filter((f) => f.on && f.due);
    if (!pick.length) { ctx.toast('Zaznacz co najmniej jeden termin'); return; }
    const st = ctx.state.settings;
    const prev = st.hrCustom || [];
    const stamp = Date.now();
    const add = pick.map((f, k) => ({ id: `mail-${stamp}-${k}`, due: f.due, title: f.title.trim() || 'Termin z maila Kadr', detail: f.detail, custom: true }));
    st.hrCustom = [...prev, ...add];
    ctx.save(); ctx.render(); close();
    ctx.toast(`Dodano ${add.length} ${add.length === 1 ? 'termin' : 'terminy'} Kadr ✓`, () => { ctx.state.settings.hrCustom = prev; ctx.save(); ctx.render(); });
  });
}

/** Usunięcie terminu dopisanego z maila (z „Cofnij”). */
export function deleteHrCustom(ctx, id) {
  const st = ctx.state.settings;
  const prev = st.hrCustom || [];
  const d = prev.find((x) => x.id === id);
  if (!d) return;
  st.hrCustom = prev.filter((x) => x.id !== id);
  ctx.save(); ctx.render();
  ctx.toast(`Usunięto: ${d.title} (${fmtFull(d.due)})`, () => { ctx.state.settings.hrCustom = prev; ctx.save(); ctx.render(); });
}
