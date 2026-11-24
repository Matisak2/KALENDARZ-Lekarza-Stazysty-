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
- `js/calendar-ui.js` – ekran Kalendarz (miesiąc, okno dnia, formularz wpisu z podglądem `eventImpact`).
- Blok: `segments: [{id,start,end,hospital,ward,customName?,customAddress?}]` – oddziały; nie wpływają na liczenie dni.
- `js/app.js` – interfejs (zakładki: Dziś, Bloki, Kalendarz, Więcej).
- `sw.js` – offline; **przy każdej zmianie plików podbij `CACHE`**.
- Podgląd na inny dzień: `?dzis=RRRR-MM-DD`.

## Zasady stażu (stan na 11.2026, źródła w README)
- Bloki sztywne (tydzień czw–śr). Blok wymaga tygodnie × 5 dni roboczych.
- Dni stracone w bloku (urlop, L4, kurs, dzień wolny za sobotnie święto, święto w trybie „odrabiane”) odrabia się po całym harmonogramie, na tym samym oddziale.
- Rezerwa 26.08–31.10.2027 = 47 dni roboczych. 282 dni robocze umowy = 235 bloki + 25 kursy + 22 urlop.
- Święta: `holidayMode` domyślnie `zaliczane` (poradnik OIL 2026, s. 36 – decyzja właściciela); `odrabiane` zostaje jako opcja.
- Urlop 22 dni (5 za 2026 + 17 za 2027). Kursy OIL: 25 dni, terminy dla rocznika 2026/27 jeszcze nieogłoszone.
- Dyżury 40 h 20 min/mies.; „tygodnie” miesiąca: 1–7, 8–14, 15–21, 22–koniec; max 10 h 05 min na tydzień, max 8 dyżurów;
  każde 5 dni urlopu/L4 w miesiącu zmniejsza normę o 10 h 05 min; brak dyżurów na med. rodzinnej i w dni kursów.
