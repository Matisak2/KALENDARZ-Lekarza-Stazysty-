# Prompt: pełny audyt aplikacji „Kalendarz Stażysty”

Skopiuj wszystko poniżej linii do nowej rozmowy z Claude (Claude Code, repozytorium Matisak2/KALENDARZ-Lekarza-Stazysty-).

---

Jesteś audytorem aplikacji „Kalendarz Stażysty” (PWA dla lekarza stażysty, repozytorium Matisak2/KALENDARZ-Lekarza-Stazysty-, publikacja: https://matisak2.github.io/KALENDARZ-Lekarza-Stazysty-/). Właściciel jest lekarzem i nie programuje – raport pisz po polsku, prosto, bez żargonu (a jeśli musisz użyć terminu technicznego, wyjaśnij go jednym zdaniem).

## Zasada nadrzędna: TYLKO CZYTASZ I SPRAWDZASZ
- Nie zmieniaj żadnego pliku w repozytorium, nie rób commitów, nie publikuj, nie zmieniaj ustawień środowiska ani zaplanowanych zadań.
- Wolno Ci: czytać kod, uruchamiać testy (`npm test`), uruchamiać aplikację lokalnie (`python3 -m http.server`) i klikać ją w przeglądarce (Playwright jest zainstalowany), pisać skrypty pomocnicze w katalogu tymczasowym (scratchpad), czytać źródła w internecie.
- Każdą zmianę tylko proponujesz. Wprowadzisz ją dopiero, gdy właściciel napisze, które punkty zatwierdza (np. „rób 1, 3, 7”).

## Krok 0 – kontekst
1. Przeczytaj CLAUDE.md (zasady projektu, przepisy stażu, ustalenia z Kadr USK2), README i PLAN.md.
2. Wypisz sobie: moduły (js/*.js), ekrany, model danych (`state` i jego wersje w js/store.js), testy (tests/*), automaty (zaplanowane zadania opisane w CLAUDE.md).

## Krok 1 – błędy (pierwsze przejście)
Sprawdź i dla każdego problemu podaj: plik:linia, co się dzieje, przykład (dane wejściowe → zły wynik), jak poważne.
1. **Testy**: uruchom `npm test`; czy wszystkie przechodzą; czego testy NIE sprawdzają, a powinny.
2. **Wyliczenia (najważniejsze)** – policz niezależnie, własnym skryptem, i porównaj z aplikacją:
   - dni robocze bloków, święta 2026–2027 (Wielkanoc, Boże Ciało, Wigilia), dni wolne za soboty, rezerwa 26.08–31.10.2027 = 47 dni, 282 = 235 + 25 + 22,
   - urlop (22 dni: 5 + 17), odrabianie po harmonogramie, tryb świąt „zaliczane”/„odrabiane”,
   - dyżury: tygodnie 1–7/8–14/15–21/22–koniec, limit 10 h 05/tydzień, 40 h 20/mies., max 8, redukcja za urlop/L4, tylko pn–pt, przerwa 23–27.12.2026, propozycja dyżurów (`proposeDuties`),
   - karta czasu pracy: nominał XI i XII 2026 = 151 h 40, październik 2026 jak na wzorze (RA 166.50, dyżury 40.20, M 207.10), kody ZL/UW/OP/UB/NU/SZ,
   - planer LEK: wagi dziedzin (200 pytań), dni przerwy, przypisanie lekcji do dziedzin (`lessonDomains` – szukaj błędnych dopasowań na prawdziwych nazwach lekcji), pokrycie, import WNL (telefon, komputer, plik .json, `mergeCourses` bez dublowania),
   - specjalizacje: progi z data/nabory.json (próg = min. wynik zakwalifikowanych, gdy miejsca obsadzone).
3. **Daty i strefy czasowe**: przełom miesięcy/lat, lata przestępne, czas letni/zimowy, `?dzis=RRRR-MM-DD`.
4. **Dane właściciela**: czy jakakolwiek ścieżka może skasować lub nadpisać wpisy (import, synchronizacja Firebase, migracje, „Cofnij”); czy każda zmiana modelu danych ma migrację w js/store.js.
5. **Interfejs** – przeklikaj w przeglądarce w rozmiarze iPhone'a (390×844) i komputera (1280×800), w trybie jasnym i ciemnym, z pustymi danymi i z dużą ilością danych (np. 14 kursów, 800 lekcji, 8 dyżurów/miesiąc): każdy ekran (Dziś, Bloki, Kalendarz, Dyżury, LEK, Więcej), każde okno i przycisk; błędy w konsoli; nachodzące się elementy; za małe przyciski (czuły ekran właściciela – czy przypadkowe dotknięcie może coś zmienić bez „Zapisz”/„Cofnij”).
6. **Wydruki/PDF**: karta czasu pracy i karta dyżurów – czy mieszczą się na A4 i wyglądają jak wzory USK2 (opisane w CLAUDE.md).
7. **Offline i aktualizacje**: sw.js – czy lista SHELL zawiera wszystkie potrzebne pliki, czy CACHE był podbijany, czy po aktualizacji użytkownik dostanie nową wersję.
8. **Eksport .ics**: poprawność formatu (RFC 5545), zawijanie linii, alarmy, dyżury z godziną.
9. **Bezpieczeństwo i prywatność**: repozytorium i strona są PUBLICZNE – szukaj w kodzie i historii git danych osobowych (imiona, nazwiska, PESEL, e-maile, telefony), treści materiałów WNL (spisy lekcji), kluczy/haseł; sprawdź zasady Firestore (firebase/firestore.rules), wstrzykiwanie HTML (czy wszystko, co wpisuje użytkownik, przechodzi przez esc()).
10. **Przepisy**: porównaj zasady z CLAUDE.md z aktualnymi źródłami (OIL Szczecin – poradnik stażysty, ISAP – ustawa o zawodach lekarza i rozporządzenie o stażu, CEM – LEK, CMKP). Podaj link i stronę/artykuł do każdej rozbieżności. Nie zgaduj przepisów z pamięci.

## Krok 2 – co jest niepotrzebne
Wskaż funkcje, kod lub pliki, które: nie są używane, dublują się, komplikują aplikację bez korzyści, albo są nieaktualne (np. stare formaty, martwy kod). Dla każdej rzeczy: co się stanie po usunięciu i czy coś na tym traci właściciel.

## Krok 3 – czego brakuje
Pomyśl jak lekarz stażysta w USK2 Szczecin w roku 2026/27: czego potrzebuje na co dzień (staż, dyżury, Kadry, książeczka, kursy OIL, LEK, specjalizacja, finanse/wynagrodzenie stażysty, zdrowie), a czego aplikacja nie robi albo robi niewygodnie. Uwzględnij też dostępność (czytelność, kontrast, VoiceOver) i wydajność.

## Krok 4 – propozycje zmian i dodatków
Lista ponumerowana. Przy każdej propozycji:
- **Co** (1–2 zdania prostym językiem) i **dlaczego** (korzyść dla właściciela),
- **Ryzyko** (czy może coś zepsuć/skasować dane),
- **Wysiłek**: mały / średni / duży,
- **Priorytet**: teraz / niedługo / kiedyś.

## Krok 5 – drugie przejście po błędach
Jeszcze raz, świeżym okiem, przejdź przez kod i aplikację, szczególnie: miejsca, które w Kroku 1 wyglądały podejrzanie, przypadki brzegowe (pusty stan, 31. dzień miesiąca, ostatni dzień stażu, blok kończący się w święto, dyżur w ostatnim dniu miesiąca, import uszkodzonego pliku, brak internetu). Zaznacz, które błędy z Kroku 1 potwierdziłeś, a które okazały się fałszywym alarmem.

## Krok 6 – raport końcowy
Zapisz raport jako plik `raport-audytu.md` w katalogu tymczasowym (nie w repozytorium) i wyślij go właścicielowi; w czacie pokaż skrót. Układ raportu:
1. **Podsumowanie w 5 zdaniach** – ogólna ocena aplikacji (np. w skali 1–10 dla: poprawność wyliczeń, bezpieczeństwo danych, wygląd, wygoda).
2. **Błędy** – tabela: nr | waga (🔴 krytyczny / 🟠 ważny / 🟡 drobny) | gdzie | opis | jak naprawić | potwierdzony w 2. przejściu (tak/nie).
3. **Do usunięcia / uproszczenia**.
4. **Brakujące rzeczy**.
5. **Propozycje** – ponumerowane, z ryzykiem, wysiłkiem i priorytetem.
6. **Przepisy** – co się zmieniło lub wymaga potwierdzenia, ze źródłami.
7. **Co sprawdziłem, a czego nie dało się sprawdzić** (i dlaczego).
8. Na końcu pytanie: „Które punkty mam wprowadzić? Napisz numery.”

NIE wprowadzaj żadnych zmian, dopóki właściciel nie odpowie z numerami. Po jego odpowiedzi pracuj według CLAUDE.md (testy, podbicie CACHE w sw.js, commit i `git push origin HEAD:main HEAD:gh-pages`).
