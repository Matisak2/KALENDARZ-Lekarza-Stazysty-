# Kalendarz Stażysty – kontekst projektu dla Claude

PWA dla lekarza stażysty (staż podyplomowy 01.10.2026–31.10.2027, grupa 6, USK2 Szczecin).
Pokazuje bloki stażu, dni robocze, święta, urlop, kursy OIL, odrabianie, dyżury i LEK.

## Jak pracować z właścicielem
- Właściciel jest lekarzem i **nie programuje**. Pisz po polsku, prosto, krok po kroku przy każdej czynności technicznej.
- Zmiany robisz sam: edytujesz, testujesz (`npm test`), robisz commit i push na `main` **oraz** na `gh-pages`
  (`git push origin HEAD:main HEAD:gh-pages`). GitHub Pages publikuje z gałęzi `gh-pages` w 1–2 min.
  Adres: https://matisak2.github.io/KALENDARZ-Lekarza-Stazysty-/. Właściciel tylko odświeża aplikację.
- Przed większą zmianą krótko zaproponuj plan; drobne poprawki rób od razu.
- **Dokładność wyliczeń jest najważniejsza.** Każda zmiana w `js/engine.js` / `js/holidays.js` = nowy test w `tests/`.
- Wygląd jest bardzo ważny: styl iOS, zaokrąglone karty, Nunito, pastelowe tła w kolorze bloku, tryb jasny i ciemny, czytelność.
- Dane wpisane przez właściciela nie mogą zniknąć: zmiana modelu danych = migracja w `js/store.js` (pole `version`).
- Nie zgaduj przepisów z pamięci – sprawdzaj źródła (OIL Szczecin, ISAP, CEM) i podawaj je.

## Architektura
- Bez build stepu i bez frameworków: `index.html`, `css/app.css`, moduły ES w `js/`.
- `js/dates.js` – daty 'RRRR-MM-DD' w UTC, odmiana polska.
- `js/holidays.js` – święta ustawowe PL (Wielkanoc algorytmem, Wigilia od 2025, flagi sobota/niedziela).
- `js/defaults.js` – domyślny harmonogram, kursy, terminy LEK, typy nieobecności.
- `js/engine.js` – czysta logika: `summarize(state, today)`, `blockStats`, rezerwa, plan odrabiania, urlop, `alerts`.
- `js/store.js` – zapis w `localStorage` (klucz `kalendarz-stazysty`), `migrate` (wersje danych), kopia .json.
- `js/hospitals.js` – szpitale Szczecin/Police z oddziałami i adresami (ze stron szpitali, 11.2026).
- `js/ics.js` – eksport do Kalendarza (.ics) z adresem oddziału w LOCATION i alarmami LEK.
- `js/blocks-ui.js` – ekran Bloki + arkusz edycji (podział bloku na oddziały po tygodniach).
- `js/more-ui.js` – ekran Więcej (kursy OIL z terminami, dni wolne za soboty, eksport .ics, kopia, ustawienia, źródła).
- `js/skills.js` – umiejętności z programu stażu (klucz = id bloku); stan w `state.skills` i `state.customSkills`.
- `js/booklet.js` – książeczka stażowa (rubryki per blok, szkolenia); stan w `state.booklet` (imiona tylko lokalnie, nigdy w kodzie).
- `js/sync-core.js` (czysta logika `decideSync`) + `js/sync.js` (Firebase 10.14.1 z gstatic, osobny projekt `kalendarz-stazysty`, dokument `stazysta/{uid}` = `{data: JSON, updatedAt, device}`).
  `store.save` ustawia `meta.updatedAt`; dane z chmury zapisuj z `keepTime`. Zasady Firestore (kopia): `firebase/firestore.rules`.
- `js/lek.js` (logika planera: wagi dziedzin LEK, import spisu WNL (telefon/komputer, plik .json), lekcja → kilka dziedzin LEK (`lessonDomains`), godziny z grafiku i dni przerwy, `buildPlan`, `domainCoverage`, szacunek wyniku) + `js/lek-ui.js` (zakładka LEK); stan w `state.study`.
  Spisy kursów WNL tylko w danych użytkownika (nigdy w kodzie – materiały WNL). Hasła do WNL nie przyjmujemy.
- `js/specs.js` + `data/nabory.json` (generuje `python3 scripts/nabory.py` z PDF-ów CMKP; wymaga pdftotext). Próg = min. wynik zakwalifikowanych, gdy miejsca obsadzone.
- `js/timesheet.js` (karta czasu pracy wg wzoru USK2: zapis „7,35” = 7 h 35 min, sumy „166.50”) + `js/timesheet-ui.js` (podgląd, PDF przez `window.print` i CSS @media print). Imię i nazwisko w `settings.personal` – tylko lokalnie.
- `js/duties-ui.js` – zakładka Dyżury (logika: `dutyMonth`, `dutyRoomOn`, `dutyTotals` w engine.js).
- `js/calendar-ui.js` – ekran Kalendarz (miesiąc, okno dnia, formularz wpisu z podglądem `eventImpact`).
- Blok: `segments: [{id,start,end,hospital,ward,customName?,customAddress?}]` – oddziały; nie wpływają na liczenie dni.
- `js/app.js` – interfejs (zakładki: Dziś, Bloki, Kalendarz, Dyżury, LEK, Więcej). Zmiany dat w ustawieniach tylko przez okienko „Zmień → Zapisz”, usuwanie z „Cofnij” (właściciel ma czuły ekran).
- `sw.js` – offline; **przy każdej zmianie plików podbij `CACHE`**.
- Podgląd na inny dzień: `?dzis=RRRR-MM-DD`.

## LEK i nabór (stan 11.2026, ustawa o zawodach lekarza t.j. Dz.U. 2026 poz. 37)
- LEK: 200 pytań, 70% z jawnej bazy CEM / 30% nowe (art. 14c ust. 4), próg 56% (art. 14e). Projekt UD384 (likwidacja bazy) – nieprzyjęty; ew. od 1.05.2027.
- Zapisy w SMK: do 30.11 (sesja lutowa) / do 15.07 (wrześniowa); opłata od 2. zgłoszenia (chyba że 1. niezdany/nieprzystąpienie), do 5 dni roboczych po terminie zapisów (art. 14a ust. 5, 8, 11).
- Nabór na specjalizacje: wynik = % punktów LEK (+ doktorat, publikacje), ranking w dziedzinie i województwie (art. 16c ust. 10–13), listy CMKP.

## Zasady stażu (stan na 11.2026, źródła w README)
- Bloki sztywne (tydzień czw–śr). Blok wymaga tygodnie × 5 dni roboczych.
- Dni stracone w bloku (urlop, L4, kurs, dzień wolny za sobotnie święto, święto w trybie „odrabiane”) odrabia się po całym harmonogramie, na tym samym oddziale.
- Rezerwa 26.08–31.10.2027 = 47 dni roboczych. 282 dni robocze umowy = 235 bloki + 25 kursy + 22 urlop.
- Święta: `holidayMode` domyślnie `zaliczane` (poradnik OIL 2026, s. 37 – decyzja właściciela); `odrabiane` zostaje jako opcja.
- Urlop 22 dni (5 za 2026 + 17 za 2027). Kursy OIL: 25 dni, terminy dla rocznika 2026/27 jeszcze nieogłoszone.
- Dyżury 40 h 20 min/mies.; „tygodnie” miesiąca: 1–7, 8–14, 15–21, 22–koniec; max 10 h 05 min na tydzień, max 8 dyżurów;
  każde 5 dni urlopu/L4 w miesiącu zmniejsza normę o 10 h 05 min; brak dyżurów na med. rodzinnej i w dni kursów.
- USK2 (Informacja dla stażysty + e-maile Kadr, 11.2026): dyżury tylko pn–pt (nie soboty, niedziele, święta), 2 w tygodniu:
  15:35–20:40 (5 h 05) i 15:35–20:35 (5 h); przerwa bez dyżurów 23–27.12.2026 (`DUTY_BREAKS`). Nominał XI i XII 2026 = 151 h 40.
  Terminy Kadr w `HR_DEADLINES` (odhaczanie: `settings.hrDone`). Kody nieobecności z legendy listy obecności (Wydanie 5):
  ZL, UW, OP, UB, NU, SZ (szkolenie), WD (wolne po dyżurze). Staż poza USK2: pismo ze zgodą koordynatora + kopia książeczki
  zdrowia, pisemna informacja do Kadr (pkt 10–11) – przypomnienie na Dziś.
