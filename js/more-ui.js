// Ekran „Więcej”: eksport do Kalendarza, kopia zapasowa, ustawienia, źródła.
import { buildIcs } from './ics.js';
import { backupText, parseBackup } from './store.js';
import { fmtFull } from './dates.js';
import { esc } from './blocks-ui.js';

export function renderMore(state) {
  const mode = state.settings.holidayMode;
  const theme = state.settings.theme || 'auto';
  const last = state.meta?.lastBackup;
  return `
    <header class="page-head">
      <div class="eyebrow">Kalendarz Stażysty</div>
      <h1 class="large-title">Więcej</h1>
    </header>
    <div class="desk-2"><div>
      <div class="card fade">
        <div class="card-label">📅 Kalendarz iPhone'a</div>
        <div class="t-strong">Dodaj staż do Kalendarza</div>
        <p class="sub">Bloki i oddziały (z adresem w polu „Miejsce”), odrabianie, kursy, urlop oraz terminy LEK z przypomnieniami.</p>
        <button class="btn primary" data-act="ics">Eksportuj do Kalendarza (.ics)</button>
        <ol class="steps">
          <li>Stuknij przycisk powyżej.</li>
          <li>iPhone pokaże listę wydarzeń – stuknij <b>„Dodaj wszystko”</b>.</li>
          <li>Wybierz kalendarz (najlepiej nowy, np. „Staż”) i potwierdź.</li>
        </ol>
        <p class="hint small">Po zmianach w aplikacji najlepiej usuń stary kalendarz „Staż” i zaimportuj ponownie – inaczej wydarzenia mogą się zdublować.</p>
      </div>
      <div class="card fade">
        <div class="card-label">💾 Kopia zapasowa</div>
        <p class="sub">Dane są tylko na tym urządzeniu. Raz na jakiś czas zapisz kopię – np. w iCloud Drive albo wyślij przez AirDrop na komputer.</p>
        <button class="btn primary" data-act="backup">Zapisz kopię (.json)</button>
        <label class="btn">Wczytaj kopię…<input type="file" accept=".json,application/json" data-act="restore" hidden></label>
        <p class="hint small">${last ? `Ostatnia kopia: ${fmtFull(last.slice(0, 10))}` : 'Nie zapisano jeszcze żadnej kopii.'}</p>
      </div>
    </div><div>
      <div class="card fade">
        <div class="card-label">⚙️ Ustawienia</div>
        <div class="t-strong">Święta w trakcie bloku</div>
        <div class="segmented">
          <button data-holiday-mode="zaliczane" class="${mode === 'zaliczane' ? 'on' : ''}">Zaliczane</button>
          <button data-holiday-mode="odrabiane" class="${mode === 'odrabiane' ? 'on' : ''}">Odrabiane</button>
        </div>
        <p class="hint small">Zaliczane = wg poradnika OIL Szczecin 2026 (s. 36).</p>
        <div class="t-strong" style="margin-top:14px">Wygląd</div>
        <div class="segmented three">
          ${['auto', 'light', 'dark'].map((t) => `<button data-theme-set="${t}" class="${theme === t ? 'on' : ''}">${{ auto: 'Auto', light: 'Jasny', dark: 'Ciemny' }[t]}</button>`).join('')}
        </div>
      </div>
      <div class="card fade">
        <div class="card-label">📚 Źródła zasad</div>
        <ul class="links">
          <li><a href="https://oil.szczecin.pl/wp-content/uploads/2026/07/Poradnik-lekarza-stazysty-2026.pdf" target="_blank" rel="noopener">Poradnik lekarza stażysty 2026 – OIL Szczecin</a></li>
          <li><a href="https://oil.szczecin.pl/terminy-kursow-stazowych-lekarze/" target="_blank" rel="noopener">Terminy kursów stażowych – OIL Szczecin</a></li>
          <li><a href="https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20230000377" target="_blank" rel="noopener">Rozporządzenie MZ w sprawie stażu (Dz.U. 2023 poz. 377)</a></li>
          <li><a href="https://www.cem.edu.pl/" target="_blank" rel="noopener">CEM – Lekarski Egzamin Końcowy</a></li>
        </ul>
      </div>
    </div></div>`;
}

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function shareOrDownload(name, text, type) {
  try {
    const file = new File([text], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  download(name, text, type);
}

/** Obsługa kliknięć ekranu „Więcej”. Zwraca true, gdy obsłużono. */
export function handleMoreClick(e, ctx) {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'ics') {
    download('kalendarz-stazu.ics', buildIcs(ctx.state, ctx.today()), 'text/calendar;charset=utf-8');
    ctx.toast('Plik kalendarza gotowy – stuknij „Dodaj wszystko”.');
    return true;
  }
  if (act === 'backup') {
    const d = new Date().toISOString().slice(0, 10);
    ctx.state.meta.lastBackup = new Date().toISOString();
    ctx.save();
    shareOrDownload(`kalendarz-stazysty-${d}.json`, backupText(ctx.state), 'application/json');
    ctx.render();
    return true;
  }
  const th = e.target.closest('[data-theme-set]');
  if (th) {
    ctx.state.settings.theme = th.dataset.themeSet;
    ctx.save();
    ctx.applyTheme();
    ctx.render();
    return true;
  }
  return false;
}

export function handleMoreChange(e, ctx) {
  if (e.target.dataset.act !== 'restore') return false;
  const f = e.target.files?.[0];
  if (!f) return true;
  f.text().then((txt) => {
    try {
      const data = parseBackup(txt);
      if (!confirm('Wczytać kopię? Obecne dane na tym urządzeniu zostaną zastąpione danymi z pliku.')) return;
      ctx.replace(data);
      ctx.toast('Kopia wczytana ✓');
    } catch (err) {
      alert(err.message);
    }
  });
  return true;
}

export { esc };
