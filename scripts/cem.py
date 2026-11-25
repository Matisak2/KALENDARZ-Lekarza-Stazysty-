#!/usr/bin/env python3
"""Indeks tematów z publicznej bazy pytań LEK (CEM) -> data/cem.json.

Źródło: https://cem.edu.pl/pytcem/baza_lek.php – baza pytań prowadzona i udostępniana przez dyrektora CEM
(art. 14c ustawy o zawodach lekarza i lekarza dentysty). Dla każdej dziedziny: część 1 i część 2 (PDF).

Do aplikacji NIE trafia treść pytań – tylko dziedzina i zbiór „rdzeni słów” każdego pytania (np. „kardiom”, „niewydo”).
Aplikacja przypisuje u użytkownika każde pytanie do najbardziej pasującej lekcji z jego spisu kursów
(js/lek-freq.js) i liczy, ile pytań z danego tematu można się spodziewać na LEK.

Rdzeń słowa (musi być identyczny jak w js/lek-freq.js): małe litery, „ó” -> „o”, słowa z liter/cyfr,
min. 3 znaki, bez samych cyfr; rdzeń = pierwsze max(4, min(7, długość - 2)) znaków.

Wymaga: python3, curl, pdftotext (poppler-utils). Uruchomienie:  python3 scripts/cem.py
"""
import datetime, json, os, re, subprocess, sys, tempfile, urllib.parse

PAGE = 'https://cem.edu.pl/pytcem/baza_lek.php'
PDF = 'https://cem.edu.pl/pytcem/pdf/lek/LEK-{}.pdf'
UA = 'Mozilla/5.0 (kalendarz-stazysty; indeks tematow LEK)'
DOMAINS = {
    'choroby_wewnętrzne': 'int', 'pediatria': 'ped', 'chirurgia_ogólna': 'chir', 'położnictwo_i_ginekologia': 'gin',
    'medycyna_rodzinna': 'rodz', 'medycyna_ratunkowa_i_intensywna_terapia': 'rat', 'psychiatria': 'psych',
    'bioetyka_i_prawo_medyczne': 'etyka', 'zdrowie_publiczne': 'zp', 'orzecznictwo': 'orz',
}
WORD = re.compile(r'[a-ząćęłńśźż0-9]+')
SPLIT = re.compile(r'(?m)^\s*(?:Pytanie nr\s*\d+|Nr\s*\d+\.)')


def stem(w):
    return w[:max(4, min(7, len(w) - 2))]


def stems(text):
    words = WORD.findall(text.lower().replace('ó', 'o'))
    return sorted({stem(w) for w in words if len(w) >= 3 and not w.isdigit()})


def pdf_text(url):
    d = tempfile.mkdtemp()
    p = os.path.join(d, 'x.pdf')
    subprocess.run(['curl', '-sS', '-L', '-m', '180', '-A', UA, '-o', p, url], check=True)
    subprocess.run(['pdftotext', '-layout', p, p + '.txt'], check=True)
    return open(p + '.txt', encoding='utf-8').read()


def main(out='data/cem.json'):
    vocab, index, questions, by_dom, modified = [], {}, [], {}, {}
    for name, dom in DOMAINS.items():
        for part in ('', '_2'):
            url = urllib.parse.quote(PDF.format(name + part), safe=':/')
            txt = pdf_text(url)
            m = re.search(r'Zmodyfikowano\s+(\d{2}\.\d{2}\.\d{4})', txt)
            if m:
                modified[name + part] = m.group(1)
            qs = [q for q in SPLIT.split(txt)[1:] if q.strip()]
            for q in qs:
                ids = []
                for s in stems(q):
                    if s not in index:
                        index[s] = len(vocab)
                        vocab.append(s)
                    ids.append(index[s])
                questions.append(f"{dom}|{','.join(map(str, ids))}")
            by_dom[dom] = by_dom.get(dom, 0) + len(qs)
            print(f'{name}{part}: {len(qs)} pytań', file=sys.stderr)
    data = {
        'updated': datetime.date.today().isoformat(), 'source': PAGE,
        'note': 'Rdzenie słów pytań z publicznej bazy CEM (bez treści pytań) – do szacowania częstości tematów na LEK.',
        'modified': modified, 'total': len(questions), 'byDomain': by_dom, 'vocab': vocab, 'q': questions,
    }
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(f'Zapisano {out}: {len(questions)} pytań, {len(vocab)} rdzeni', file=sys.stderr)


if __name__ == '__main__':
    main(*sys.argv[1:])
