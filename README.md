# Kalendarz Stażysty

Aplikacja (PWA) dla lekarza stażysty: bloki stażu, dni robocze, święta, urlop, kursy OIL, odrabianie i dyżury.
Działa w przeglądarce na iPhonie (po dodaniu do ekranu głównego) i na komputerze. Dane zostają tylko na urządzeniu.

- Bez instalacji i bez budowania – zwykłe pliki HTML/CSS/JS.
- Logika wyliczeń: `js/engine.js`, święta: `js/holidays.js`, domyślny harmonogram: `js/defaults.js`.
- Testy wyliczeń: `npm test` (Node 20+, bez zależności).
- Podgląd „na inny dzień”: dopisz do adresu `?dzis=2027-03-15`.

Źródła zasad: rozporządzenie MZ z 24.02.2023 (Dz.U. 2023 poz. 377), art. 15a ustawy o zawodach lekarza,
Poradnik lekarza stażysty 2026 – OIL w Szczecinie.
