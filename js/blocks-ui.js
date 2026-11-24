// Ekran „Bloki”: oś czasu bloków, oddziały (podział na tygodnie) i edycja bloku.
import { summarize, blockWeeks, checkSegments } from './engine.js';
import { HOSPITALS, hospitalOf } from './hospitals.js';
import { fmtShort, fmtDayShort, fmtFull, toNum, plural, todayIso } from './dates.js';
import { SKILLS, skillProgress } from './skills.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const color = (b) => `var(--c-${b.color || 'gray'})`;
export const COLORS = ['navy', 'green', 'red', 'wine', 'yellow', 'pink', 'gray', 'blue'];
const STATUS = { past: 'Zakończony', current: 'W trakcie', future: 'Przyszły' };

/** Zakres tygodni bloku dla odcinka, np. „tydz. 1–3”. */
function weekLabel(weeks, seg) {
  const a = weeks.find((w) => w.start <= seg.start && seg.start <= w.end);
  const b = weeks.find((w) => w.start <= seg.end && seg.end <= w.end);
  if (!a || !b) return `${fmtShort(seg.start)}–${fmtShort(seg.end)}`;
  return a.i === b.i ? `tydz. ${a.i}` : `tydz. ${a.i}–${b.i}`;
}

function segmentsHtml(state, b) {
  const weeks = blockWeeks(b, state.settings.startDate);
  const segs = [...(b.segments || [])].sort((x, y) => (x.start < y.start ? -1 : 1));
  const chk = checkSegments(b);
  if (!segs.length) {
    return `<div class="seg-row empty"><span class="seg-w">cały blok</span><span class="muted">Oddział nie przypisany · stuknij, aby wybrać</span></div>`;
  }
  const rows = segs.map((s) => {
    const h = hospitalOf(s);
    return `<div class="seg-row"><span class="seg-w">${weekLabel(weeks, s)}</span>
      <span class="seg-t"><b>${esc(s.ward || 'Oddział nie wybrany')}</b><small>${esc(h?.short || '')}${h?.address ? ` · ${esc(h.address)}` : ''}</small></span></div>`;
  });
  for (const g of chk.gaps) {
    rows.push(`<div class="seg-row empty"><span class="seg-w">${weekLabel(weeks, g)}</span><span class="muted">bez oddziału</span></div>`);
  }
  if (!chk.ok) rows.push('<div class="seg-err">⚠️ Odcinki nachodzą na siebie albo wychodzą poza blok</div>');
  return rows.join('');
}

export function renderBlocks(state, today) {
  const sum = summarize(state, today);
  let lastGroup = null;
  const cards = sum.stats.map((s) => {
    const b = s.block;
    const pct = s.required ? Math.min(s.done, s.required) / s.required : 0;
    const weeks = Math.round((toNum(b.end) - toNum(b.start) + 1) / 7);
    let head = '';
    if (b.group && b.group !== lastGroup) head = `<div class="group-head">${esc(b.group)}</div>`;
    lastGroup = b.group || null;
    return `${head}<button class="card block-card fade ${s.status}" data-edit-block="${esc(b.id)}" style="--block:${color(b)}">
      <div class="bc-top">
        <div class="bc-name"><span class="dot"></span>${esc(b.name)}</div>
        <span class="status ${s.status}">${STATUS[s.status]}</span>
      </div>
      <div class="bc-dates">${fmtDayShort(b.start)} – ${fmtDayShort(b.end)} · ${weeks} ${plural(weeks, 'tydzień', 'tygodnie', 'tygodni')}</div>
      <div class="bc-bar"><div style="width:${pct * 100}%"></div></div>
      <div class="bc-nums"><span><b>${s.done}</b> z ${s.required} dni roboczych</span>
        ${s.makeUp ? `<span class="neg">↺ ${s.makeUp} do odrobienia</span>` : `<span class="muted">${Math.round(pct * 100)}%</span>`}</div>
      <div class="segs">${segmentsHtml(state, b)}</div>
      ${state.notes?.['block:' + b.id] ? `<div class="bc-note">📝 ${esc(state.notes['block:' + b.id])}</div>` : ''}
      ${(() => { const sp = skillProgress(state, b.id); return sp.total ? `<div class="bc-skills"><span>✓ Umiejętności</span><b>${sp.done}/${sp.total}</b>
        <div class="bc-bar sm"><div style="width:${(sp.done / sp.total) * 100}%"></div></div></div>` : ''; })()}
    </button>`;
  }).join('');

  const plan = sum.makeUpPlan.length ? `<div class="card fade">
      <div class="card-label">Plan odrabiania · od ${fmtShort(sum.reserve.start)}</div>
      ${sum.makeUpPlan.map((m) => {
        const b = state.blocks.find((x) => x.id === m.blockId);
        return `<div class="list-item"><span class="dot" style="--block:${color(b)}"></span>
          <div class="grow"><div class="t">${esc(b.short)}</div></div><div class="s">${fmtDayShort(m.date)}${m.beyondEnd ? ' <span class="neg">(po końcu umowy)</span>' : ''}</div></div>`;
      }).join('')}
    </div>` : `<div class="card fade note-card">✓ Nic do odrobienia – wszystkie bloki mieszczą się w swoich terminach.</div>`;

  return `
    <header class="page-head">
      <div class="eyebrow">Grupa ${esc(state.settings.group)} · ${sum.stats.length} bloków</div>
      <h1 class="large-title">Bloki</h1>
    </header>
    <p class="hint">Stuknij blok, aby zmienić daty albo przypisać oddział. Blok możesz rozbić na kilka oddziałów – po tygodniach.</p>
    <div class="desk-2"><div>${cards}</div><div>${plan}</div></div>`;
}

/* ---------- Edycja bloku (arkusz) ---------- */

function hospitalOptions(sel) {
  const opts = HOSPITALS.map((h) => `<option value="${h.id}" ${h.id === sel ? 'selected' : ''}>${esc(h.name)}</option>`);
  return `<option value="" ${!sel ? 'selected' : ''}>— wybierz szpital —</option>${opts.join('')}
    <option value="custom" ${sel === 'custom' ? 'selected' : ''}>Inne miejsce (wpiszę sam)…</option>`;
}

function wardOptions(state, hospitalId, sel) {
  const h = HOSPITALS.find((x) => x.id === hospitalId);
  const used = new Set();
  for (const b of state.blocks) for (const s of b.segments || []) if (s.hospital === hospitalId && s.ward) used.add(s.ward);
  const list = [...new Set([...(h?.wards || []), ...used])];
  const known = list.includes(sel);
  return `<option value="" ${!sel ? 'selected' : ''}>— wybierz oddział —</option>
    ${list.map((w) => `<option ${w === sel ? 'selected' : ''}>${esc(w)}</option>`).join('')}
    <option value="__other" ${sel && !known ? 'selected' : ''}>Inny oddział (wpiszę sam)…</option>`;
}

function weekOptions(weeks, selIdx, kind) {
  return weeks.map((w, k) => `<option value="${k}" ${k === selIdx ? 'selected' : ''}>
    Tydz. ${w.i} (${kind === 'from' ? fmtShort(w.start) : fmtShort(w.end)})</option>`).join('');
}

function segEditorHtml(state, draft, weeks, seg, k) {
  const fromIdx = Math.max(0, weeks.findIndex((w) => w.start <= seg.start && seg.start <= w.end));
  const toIdx = Math.max(0, weeks.findIndex((w) => w.start <= seg.end && seg.end <= w.end));
  const h = HOSPITALS.find((x) => x.id === seg.hospital);
  const wardKnown = !seg.ward || (h?.wards || []).includes(seg.ward)
    || state.blocks.some((b) => (b.segments || []).some((s) => s.hospital === seg.hospital && s.ward === seg.ward && s !== seg));
  return `<div class="seg-edit" data-seg="${k}">
    <div class="seg-edit-head"><b>Oddział ${k + 1}</b>
      ${draft.segments.length > 1 ? `<button class="link danger" data-seg-del="${k}">Usuń</button>` : ''}</div>
    <div class="row2">
      <label>Od<select data-f="from">${weekOptions(weeks, fromIdx, 'from')}</select></label>
      <label>Do<select data-f="to">${weekOptions(weeks, toIdx, 'to')}</select></label>
    </div>
    <label>Szpital<select data-f="hospital">${hospitalOptions(seg.hospital)}</select></label>
    ${seg.hospital === 'custom' ? `
      <label>Nazwa miejsca<input data-f="customName" value="${esc(seg.customName || '')}" placeholder="np. Przychodnia Rodzinna X"></label>
      <label>Adres<input data-f="customAddress" value="${esc(seg.customAddress || '')}" placeholder="ulica, numer, miasto"></label>
      <label>Oddział / komórka<input data-f="ward" value="${esc(seg.ward || '')}" placeholder="np. Poradnia POZ"></label>`
    : seg.hospital ? `
      <label>Oddział<select data-f="wardSel">${wardOptions(state, seg.hospital, seg.ward)}</select></label>
      ${!wardKnown || seg._otherWard ? `<label>Nazwa oddziału<input data-f="ward" value="${esc(seg.ward || '')}" placeholder="wpisz nazwę oddziału"></label>` : ''}
      ${h?.note ? `<div class="hint small">${esc(h.note)}</div>` : ''}
      <div class="addr">📍 ${esc(h?.address || '')}</div>` : ''}
  </div>`;
}

/**
 * Otwiera arkusz edycji bloku. onSave(updatedBlock) zapisuje zmiany.
 */
export function openBlockEditor(state, blockId, onSave) {
  const orig = state.blocks.find((b) => b.id === blockId);
  if (!orig) return;
  const draft = JSON.parse(JSON.stringify(orig));
  if (!draft.segments || !draft.segments.length) {
    draft.segments = [{ id: `${draft.id}-${Date.now()}`, start: draft.start, end: draft.end, hospital: '', ward: '' }];
  }

  const root = document.createElement('div');
  root.className = 'sheet-wrap';
  document.body.appendChild(root);
  document.body.classList.add('no-scroll');

  const close = () => {
    root.classList.add('closing');
    document.body.classList.remove('no-scroll');
    setTimeout(() => root.remove(), 220);
  };

  const errors = () => {
    const tmp = { ...draft, segments: draft.segments.filter((s) => s.hospital) };
    const out = [];
    if (draft.start > draft.end) out.push('Data końca jest przed datą początku.');
    const chk = checkSegments(tmp);
    if (chk.overlaps.length) out.push('Dwa oddziały nachodzą na siebie – popraw tygodnie.');
    if (chk.outside.length) out.push('Któryś oddział wychodzi poza daty bloku.');
    return out;
  };

  let noteDraft = state.notes?.['block:' + draft.id] || '';
  const skillsDraft = { ...(state.skills || {}) };
  const customDraft = [...(state.customSkills?.[draft.id] || [])];
  let newSkill = '';
  const skillsHtml = () => {
    const base = (SKILLS[draft.id]?.items || []).map((name, i) => ({ key: `${draft.id}:${i}`, name }));
    const own = customDraft.map((c) => ({ key: `${draft.id}:own:${c.id}`, name: c.name, id: c.id }));
    const all = [...base, ...own];
    const done = all.filter((x) => skillsDraft[x.key]).length;
    return `<div class="section-title small-title">Umiejętności ${all.length ? `<span class="muted">${done}/${all.length}</span>` : ''}</div>
      ${SKILLS[draft.id] ? `<p class="hint">${esc(SKILLS[draft.id].source)} (Dz.U. 2023 poz. 377).</p>` : '<p class="hint">Dla tego bloku program nie wymienia listy – możesz dopisać własne pozycje.</p>'}
      <div class="form-card skills">
        ${all.map((x) => `<label class="skill ${skillsDraft[x.key] ? 'on' : ''}">
          <input type="checkbox" data-skill="${esc(x.key)}" ${skillsDraft[x.key] ? 'checked' : ''}>
          <span class="box"></span><span class="nm">${esc(x.name)}${skillsDraft[x.key]?.date ? `<small>${fmtShort(skillsDraft[x.key].date)}</small>` : ''}</span>
          ${x.id ? `<button class="link danger" data-skill-del="${esc(x.id)}">Usuń</button>` : ''}</label>`).join('')}
        <div class="row-add"><input data-newskill value="${esc(newSkill)}" placeholder="Dopisz własną umiejętność / procedurę"><button class="link strong" data-skill-add>Dodaj</button></div>
      </div>`;
  };
  const draw = () => {
    const nEl = root.querySelector('[data-blocknote]');
    if (nEl) noteDraft = nEl.value;
    const nsEl = root.querySelector('[data-newskill]');
    if (nsEl) newSkill = nsEl.value;
    const scroll = root.querySelector('.sheet-body')?.scrollTop || 0;
    queueMicrotask(() => { const b2 = root.querySelector('.sheet-body'); if (b2) b2.scrollTop = scroll; });
    const weeks = blockWeeks(draft, state.settings.startDate);
    const errs = errors();
    root.innerHTML = `<div class="sheet-backdrop" data-close></div>
    <div class="sheet" role="dialog" aria-label="Edycja bloku">
      <div class="sheet-head">
        <button class="link" data-close>Anuluj</button>
        <b>${esc(draft.short || draft.name)}</b>
        <button class="link strong" data-save ${errs.length ? 'disabled' : ''}>Zapisz</button>
      </div>
      <div class="sheet-body">
        <div class="form-card">
          <label>Nazwa bloku<input data-b="name" value="${esc(draft.name)}"></label>
          <label>Krótka nazwa<input data-b="short" value="${esc(draft.short)}"></label>
          <div class="row2">
            <label>Początek<input type="date" data-b="start" value="${draft.start}"></label>
            <label>Koniec<input type="date" data-b="end" value="${draft.end}"></label>
          </div>
          <label>Wymagane dni robocze<input type="number" inputmode="numeric" min="0" data-b="required" value="${draft.required}"></label>
          <div class="swatches">${COLORS.map((c) => `<button class="sw ${c === draft.color ? 'on' : ''}" data-color="${c}" style="background:var(--c-${c})" aria-label="${c}"></button>`).join('')}</div>
        </div>
        <div class="form-card"><label class="note-label">📝 Notatki do bloku
          <textarea data-blocknote rows="3" placeholder="np. co nadrobić, kolokwium, opiekun stażu">${esc(noteDraft)}</textarea></label></div>
        <div class="section-title small-title">Oddziały</div>
        <p class="hint">Na każdy okres wybierz szpital i oddział. Jeśli robisz blok na kilku oddziałach, dodaj kolejny i ustaw tygodnie.</p>
        ${draft.segments.map((s, k) => segEditorHtml(state, draft, weeks, s, k)).join('')}
        <button class="add-btn" data-seg-add>＋ Dodaj kolejny oddział (podział bloku)</button>
        ${errs.length ? `<div class="seg-err">${errs.map(esc).join('<br>')}</div>` : ''}
        ${skillsHtml()}
        <div class="hint small">Daty bloku: ${fmtFull(draft.start)} – ${fmtFull(draft.end)} · ${weeks.length} ${plural(weeks.length, 'tydzień', 'tygodnie', 'tygodni')}
          (tydzień stażu ${weeks[0]?.n ?? '–'}–${weeks.at(-1)?.n ?? '–'})</div>
      </div>
    </div>`;
  };

  const clampSegs = () => {
    for (const s of draft.segments) {
      if (s.start < draft.start) s.start = draft.start;
      if (s.end > draft.end) s.end = draft.end;
      if (s.start > draft.end) s.start = draft.start;
      if (s.end < draft.start || s.end < s.start) s.end = draft.end;
    }
  };

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    if (e.target.closest('[data-save]')) {
      if (errors().length) return;
      draft.segments = draft.segments.filter((s) => s.hospital).map(({ _otherWard, ...s }) => s);
      state.skills = skillsDraft;
      state.customSkills = { ...(state.customSkills || {}), [draft.id]: customDraft };
      const bn = root.querySelector('[data-blocknote]')?.value.trim();
      state.notes = state.notes || {};
      if (bn) state.notes['block:' + draft.id] = bn; else delete state.notes['block:' + draft.id];
      draft.required = Number(draft.required) || 0;
      onSave(draft);
      return close();
    }
    if (e.target.closest('[data-skill-add]')) {
      const v = (root.querySelector('[data-newskill]')?.value || '').trim();
      if (v) { customDraft.push({ id: String(Date.now()), name: v }); newSkill = ''; }
      return draw();
    }
    const sd = e.target.closest('[data-skill-del]');
    if (sd) {
      e.preventDefault();
      const i = customDraft.findIndex((c) => c.id === sd.dataset.skillDel);
      delete skillsDraft[`${draft.id}:own:${sd.dataset.skillDel}`];
      customDraft.splice(i, 1);
      return draw();
    }
    const sw = e.target.closest('[data-color]');
    if (sw) { draft.color = sw.dataset.color; return draw(); }
    if (e.target.closest('[data-seg-add]')) {
      const weeks = blockWeeks(draft, state.settings.startDate);
      const last = [...draft.segments].sort((a, b) => (a.start < b.start ? -1 : 1)).at(-1);
      // Nowy odcinek: druga połowa ostatniego (albo od następnego tygodnia do końca)
      const lw = weeks.findIndex((w) => w.start <= last.start && last.start <= w.end);
      const le = weeks.findIndex((w) => w.start <= last.end && last.end <= w.end);
      let split = le + 1;
      if (split >= weeks.length) split = Math.max(lw + 1, Math.ceil((lw + le + 1) / 2));
      if (split >= weeks.length || split <= lw) return;
      last.end = weeks[split - 1].end;
      draft.segments.push({ id: `${draft.id}-${Date.now()}`, start: weeks[split].start, end: draft.end, hospital: last.hospital, ward: '' });
      return draw();
    }
    const del = e.target.closest('[data-seg-del]');
    if (del) { draft.segments.splice(Number(del.dataset.segDel), 1); return draw(); }
  });

  root.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.skill) {
      if (el.checked) skillsDraft[el.dataset.skill] = { date: todayIso() }; else delete skillsDraft[el.dataset.skill];
      return draw();
    }
    if (el.dataset.newskill !== undefined) { newSkill = el.value; return; }
    if (el.dataset.b) {
      draft[el.dataset.b] = el.value;
      if (el.dataset.b === 'start' || el.dataset.b === 'end') clampSegs();
      return draw();
    }
    const box = el.closest('[data-seg]');
    if (!box) return;
    const seg = draft.segments[Number(box.dataset.seg)];
    const weeks = blockWeeks(draft, state.settings.startDate);
    const f = el.dataset.f;
    if (f === 'from') { seg.start = weeks[Number(el.value)].start; if (seg.end < seg.start) seg.end = weeks[Number(el.value)].end; }
    else if (f === 'to') { seg.end = weeks[Number(el.value)].end; if (seg.start > seg.end) seg.start = weeks[Number(el.value)].start; }
    else if (f === 'hospital') { seg.hospital = el.value; seg.ward = ''; seg._otherWard = false; }
    else if (f === 'wardSel') {
      if (el.value === '__other') { seg._otherWard = true; seg.ward = ''; } else { seg._otherWard = false; seg.ward = el.value; }
    } else { seg[f] = el.value; return; }
    draw();
  });
  root.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.b && el.type !== 'date') { draft[el.dataset.b] = el.value; return; }
    const box = el.closest('[data-seg]');
    if (box && el.tagName === 'INPUT') draft.segments[Number(box.dataset.seg)][el.dataset.f] = el.value;
  });

  draw();
}
