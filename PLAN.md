# Plan rozwoju

## Etap 1 – MVP
- [x] Silnik wyliczeń + testy (święta, bloki, odrabianie, rezerwa, urlop, LEK)
- [x] Ekran „Dziś” (blok, postęp, następny blok, koniec stażu, Na dziś, rezerwa, urlop, LEK, święta)
- [x] Publikacja (GitHub Pages)
- [x] Bloki: lista ze statusem i postępem, edycja dat/nazw/kolorów, plan odrabiania
- [x] Oddziały: baza szpitali Szczecin/Police, przypisanie i podział bloku po tygodniach, adres w „Dziś”
- [x] Kalendarz miesięczny: kolory bloków, weekendy, święta, urlop, L4, kursy, odrabianie (dyżury – etap 2)
- [x] Wpisy: urlop, L4/opieka/bezpłatny z podglądem skutków, kursy z terminami, dzień wolny za sobotę, „Cofnij” po usunięciu
- [x] Kopia zapasowa: zapisz / wczytaj plik (AirDrop, iCloud Drive)
- [x] Przypomnienie o kopii (brak kopii albo > 30 dni, gdy są wpisy)

## Etap 2
- [x] Dyżury: wpisy, norma miesiąca (bloki z dyżurami, urlop/L4), limit 10 h 05 min na tydzień miesiąca, max 8, podsumowanie, karta na „Dziś”, 🌙 w kalendarzu
- [x] Eksport .ics z adresami oddziałów i alarmami (LEK, start bloku, zmiana oddziału, kursy)
- [x] Notatki do dnia (kalendarz) i do bloku (edycja bloku); LEK: odliczanie + terminy w .ics

## Etap 2 – dodatki
- [x] „Zrobione ✓” przy terminach LEK, pilne sprawy na górze ekranu Dziś

## Książeczka stażowa (ze zdjęć)
- [x] Rubryki do podpisu przy każdym bloku (chirurgia ogólna/urazowa, interna z transfuzjologią, IT+MR, neonatologia+pediatria, rodzinna, dziedziny 1–3)
- [x] Szkolenia (9 stron), koordynator, przedłużenia, zaliczenie stażu
- [x] Przypomnienie na „Dziś”, gdy blok się kończy, a brakuje podpisów

## Planer LEK i specjalizacje
- [x] Zakładka LEK: ankieta (termin, trening/na serio, cel/specjalizacja, poprzednie wyniki, godziny, styl, słabe/mocne dziedziny, baza CEM)
- [x] Import spisu kursów WNL (wklejony tekst), plan tygodniowy z grafiku stażu, pominięte tematy, szacunek wyniku, wiele planów
- [x] Wyniki: podejścia do LEK, egzaminy próbne z wykresem
- [x] Specjalizacje: miejsca i progi z 4 ostatnich naborów CMKP (scripts/nabory.py -> data/nabory.json), cel do planu
- [x] Automat: zaplanowane zadanie 2× w roku (koniec kwietnia i listopada) odświeża data/nabory.json

## Etap 3
- [x] Umiejętności z programu stażu (Dz.U. 2023 poz. 377) do odhaczania + własne pozycje (książeczka stażowa – do uzupełnienia ze zdjęć)
- [x] Synchronizacja telefon ↔ komputer: Firebase (osobny projekt kalendarz-stazysty), dokument stazysta/{uid}, nowsza wersja wygrywa, kopia przy konflikcie
- [ ] Powiadomienia push (automat GitHub Actions)
