#!/usr/bin/env python3
"""Aktualizacja danych naboru na specjalizacje (CMKP) -> data/nabory.json.

Źródło: https://www.cmkp.edu.pl/ksztalcenie/postepowania-kwalifikacyjne
Dla każdej sesji (wiosna/jesień) pobiera:
  * „Liczba miejsc szkoleniowych” (PDF) – miejsca rezydenckie (w tym doktoranckie) i pozarezydenckie,
  * „Ostateczna lista lekarzy zakwalifikowanych” (PDF) – wynik (%) każdej osoby, dziedzina, województwo, tryb.
Wymaga: python3, curl, pdftotext (poppler-utils). Uruchomienie:  python3 scripts/nabory.py [liczba_sesji=4]
"""
import json, re, statistics, subprocess, sys, tempfile, os, datetime, html

BASE = 'https://www.cmkp.edu.pl/ksztalcenie/postepowania-kwalifikacyjne'
UA = 'Mozilla/5.0 (kalendarz-stazysty; aktualizacja danych naboru)'


def get(url, path):
    subprocess.run(['curl', '-sS', '-L', '-m', '120', '-A', UA, '-o', path, url], check=True)


def page(url):
    with tempfile.NamedTemporaryFile(suffix='.html', delete=False) as f:
        get(url, f.name)
        return open(f.name, encoding='utf-8', errors='ignore').read()


def pdf_text(url):
    d = tempfile.mkdtemp()
    p = os.path.join(d, 'x.pdf')
    get(url, p)
    subprocess.run(['pdftotext', '-layout', p, p + '.txt'], check=True)
    return open(p + '.txt', encoding='utf-8').read()


def clean_woj(w):
    w = re.split(r'\s{3,}', w.strip())[0]
    doct = w.endswith('- Miejsca doktoranckie')
    return w.replace(' - Miejsca doktoranckie', '').strip(), doct


def parse_places(txt):
    out, woj = {}, None
    for line in txt.splitlines():
        m = re.match(r'\s*Województwo\s+(.+?)\s*$', line)
        if m:
            woj = clean_woj(m.group(1))[0]
            out.setdefault(woj, {})
            continue
        m = re.match(r'\s*([A-ZĄĆĘŁŃÓŚŹŻ][^\d]+?)\s{2,}(\d+)\s*\((\d+)\)\s+(\d+)\s*$', line)
        if m and woj:
            out[woj][m.group(1).strip()] = {'rez': int(m.group(2)), 'dokt': int(m.group(3)), 'poz': int(m.group(4))}
    return out


def parse_results(txt):
    rows, woj, doct = [], None, False
    for line in txt.splitlines():
        m = re.match(r'\s*Województwo\s+(.+?)\s*$', line)
        if m:
            woj, doct = clean_woj(m.group(1))
            continue
        m = re.match(r'\s*(\d+)\s+(.+?)\s{2,}(\d{4}/\d+)\s+(Rezydencki|Pozarezydencki)\s+([\d.]+)%', line)
        if m and woj:
            tryb = 'dokt' if doct else ('rez' if m.group(4) == 'Rezydencki' else 'poz')
            rows.append((woj, m.group(2).strip(), tryb, float(m.group(5))))
    res = {}
    for woj, dz, tryb, pkt in rows:
        res.setdefault(woj, {}).setdefault(dz, {}).setdefault(tryb, []).append(pkt)
    for woj in res:
        for dz in res[woj]:
            for tryb, xs in res[woj][dz].items():
                xs.sort()
                res[woj][dz][tryb] = {'n': len(xs), 'min': xs[0], 'med': round(statistics.median(xs), 2), 'max': xs[-1]}
    return res, len(rows)


def sessions(limit):
    """Zbiera PDF-y ze strony głównej (bieżąca sesja) i stron sesji; grupuje po (rok, sezon) z nazwy pliku."""
    idx = page(BASE)
    pages = [BASE] + sorted(set(re.findall(r'href="(' + re.escape(BASE) + r'/postepowanie-kwalifikacyjne-(?:wiosna|jesien)-\d{4})"', idx)))
    found = {}
    for url in pages:
        h = idx if url == BASE else page(url)
        for u in re.findall(r'href="([^"]+\.pdf)"', html.unescape(h)):
            m = re.search(r'(wiosna|jesien)[^0-9]{0,3}(\d{4})', u, re.I)
            if not m:
                continue
            key = (int(m.group(2)), m.group(1).lower())
            d = found.setdefault(key, {'page': url, 'places': [], 'final': []})
            if re.search(r'liczba[-_]mie', u, re.I):
                d['places'].append(u)
            elif re.search(r'zakwali', u, re.I) and not re.search(r'niezakwali', u, re.I):
                d['final'].append(u)
    out = []
    for (rok, sez) in sorted(found, key=lambda k: (k[0], 0 if k[1] == 'wiosna' else 1), reverse=True):
        d = found[(rok, sez)]
        if not d['places'] or not d['final']:
            continue  # sesja w toku – brak wyników
        final = sorted(d['final'], key=lambda u: (bool(re.search(r'ostateczn', u, re.I)), u))[-1]
        out.append({'id': f'{rok}-{sez}', 'label': f"{'Wiosna' if sez == 'wiosna' else 'Jesień'} {rok}",
                    'page': d['page'], 'placesPdf': sorted(d['places'])[-1], 'resultsPdf': final})
        if len(out) >= limit:
            break
    return out


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    data = {'updated': datetime.date.today().isoformat(), 'source': BASE, 'sessions': []}
    for s in sessions(limit):
        places = parse_places(pdf_text(s['placesPdf']))
        results, n = parse_results(pdf_text(s['resultsPdf']))
        print(f"{s['label']}: {sum(len(v) for v in places.values())} pozycji miejsc, {n} zakwalifikowanych", file=sys.stderr)
        if n == 0 or not places:
            raise SystemExit(f'Nie udało się odczytać danych sesji {s["label"]} – format PDF mógł się zmienić.')
        s.update({'places': places, 'results': results, 'qualified': n})
        data['sessions'].append(s)
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(root, 'data', 'nabory.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print('Zapisano data/nabory.json', file=sys.stderr)


if __name__ == '__main__':
    main()
