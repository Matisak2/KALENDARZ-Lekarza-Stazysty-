import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lessonDomains, explainLesson, allLessons, lessonKey, guessDomain } from '../js/lek.js';
import { findTerms, normalize } from '../js/lek-domains.js';

const same = (got, exp) => assert.deepEqual([...got].sort(), exp.split(',').filter(Boolean).sort());

// [dziedzina kursu, dział, pełna nazwa lekcji, oczekiwane dziedziny LEK] – ogólne nazwy tematów (nie materiały WNL)
const CASES = [
  // Audyt B5: dawniej szukanie fragmentu słowa dawało błędne dziedziny
  ['int', 'Kardiologia', 'Próba obciążeniowa i testy wysiłkowe', 'int'],
  ['chir', 'Ortopedia', 'Zespoły przeciążeniowe', 'chir'],
  ['int', 'Kardiologia', 'Obciążenie następcze i wstępne serca', 'int'],
  ['ped', 'Pediatria', 'Przeciążenie układu krążenia u niemowląt', 'ped'],
  ['rat', 'Anestezjologia', 'Depresja oddechowa po opioidach', 'rat'],
  ['rat', 'Intensywna terapia', 'Zasady żywienia pozajelitowego', 'rat'],
  ['chir', 'Chirurgia', 'Żywienie chorych chirurgicznych', 'chir'],
  ['int', 'Hematologia', 'Toczenie krwi i preparaty krwiopochodne', 'int'],
  ['int', 'Kardiologia', 'Choroby aorty piersiowej', 'int'],
  ['chir', 'Transplantologia', 'Przeszczepienie nerki', 'chir'],
  // Wyrażenia wielowyrazowe i odmiana
  ['int', 'Kardiologia', 'Ostre zespoły wieńcowe', 'int,rat'],
  ['int', 'Kardiologia', 'Przewlekłe zespoły wieńcowe', 'int,rodz'],
  ['int', 'Kardiologia', 'Ból w klatce piersiowej', 'int,rat'],
  ['int', 'Nefrologia', 'Ostre uszkodzenie nerek', 'int,rat'],
  ['int', 'Nefrologia', 'Przewlekła choroba nerek', 'int,rodz'],
  ['int', 'Gastroenterologia', 'Krwawienie z górnego odcinka przewodu pokarmowego', 'int,chir,rat'],
  ['int', 'Gastroenterologia', 'Ostre zapalenie trzustki', 'int,chir,rat'],
  ['int', 'Pulmonologia', 'Przewlekła obturacyjna choroba płuc', 'int,rodz'],
  ['int', 'Pulmonologia', 'Odma opłucnowa', 'int,rat'],
  ['int', 'Endokrynologia', 'Choroby tarczycy w ciąży', 'int,gin,rodz'],
  ['int', 'Choroby zakaźne', 'Sepsa i wstrząs septyczny', 'int,rat'],
  ['int', 'Choroby zakaźne', 'Zakażenia przenoszone drogą płciową', 'int,gin,rodz'],
  ['int', 'Reumatologia', 'Toczeń rumieniowaty układowy', 'int'],
  ['int', 'Kardiologia', 'Nadciśnienie płucne', 'int'],
  ['int', 'Kardiologia', 'Nadciśnienie tętnicze', 'int,rodz'],
  ['ped', 'Neonatologia', 'Żółtaczka noworodków', 'ped'],
  ['ped', 'Pediatria', 'Zapalenie płuc u dzieci', 'int,ped'],
  ['ped', 'Pediatria', 'Drgawki gorączkowe', 'ped'],
  ['ped', 'Pediatria', 'Choroby wysypkowe – odra, różyczka, płonica', 'ped'],
  ['ped', 'Pediatria', 'Szczepienia ochronne', 'ped,rodz'],
  ['chir', 'Chirurgia ogólna', 'Ostre zapalenie wyrostka robaczkowego', 'chir'],
  ['chir', 'Chirurgia ogólna', 'Niedrożność jelit', 'chir,rat'],
  ['chir', 'Chirurgia urazowa', 'Złamania kości długich', 'chir,rat'],
  ['chir', 'Urologia', 'Kamica układu moczowego', 'chir,rodz'],
  ['chir', 'Chirurgia naczyniowa', 'Ostre niedokrwienie kończyn dolnych', 'chir,rat'],
  ['rat', 'Medycyna ratunkowa', 'Postępowanie w urazach kręgosłupa', 'chir,rat'],
  ['rat', 'Medycyna ratunkowa', 'Rany i ich zaopatrywanie', 'chir,rat'],
  ['gin', 'Położnictwo', 'Krwotok poporodowy', 'gin,rat'],
  ['gin', 'Położnictwo', 'Cukrzyca ciążowa', 'int,gin'],
  ['gin', 'Położnictwo', 'Karmienie piersią', 'ped,gin,rodz'],
  ['gin', 'Ginekologia', 'Rak szyjki macicy', 'gin'],
  ['int', 'Onkologia', 'Rak piersi', 'int,chir,gin'],
  ['psych', 'Psychiatria', 'Depresja', 'psych,rodz'],
  ['psych', 'Psychiatria', 'Alkoholowy zespół abstynencyjny i majaczenie', 'psych'],
  ['psych', 'Psychiatria', 'Zaburzenia lękowe', 'psych,rodz'],
  ['rat', 'Medycyna ratunkowa', 'Resuscytacja krążeniowo-oddechowa – ALS', 'rat'],
  ['rodz', 'Dermatologia', 'Łuszczyca', 'rodz'],
  ['inne', 'Laryngologia', 'Zapalenie ucha środkowego', 'rodz'],
  ['inne', 'Okulistyka', 'Jaskra i zaćma', 'rodz'],
  ['inne', 'Neurologia', 'Padaczka', 'int,rat,rodz'], // neurologia = choroby wewnętrzne (decyzja właściciela 11.2026)
  ['inne', 'Neurologia', 'Stwardnienie rozsiane', 'int'],
  ['inne', 'Genetyka', 'Aberracje chromosomów', ''], // brak dopasowania – kurs trzeba przypisać do dziedziny
  // Nazwa specjalizacji w dziale nie zmienia dziedziny kursu (pkt 5 w lek-domains.js); liczy się treść tematu
  ['ped', 'Kardiologia dziecięca', 'Choroba Kawasakiego', 'ped'],
  ['ped', 'Pulmonologia dziecięca', 'Astma u dzieci', 'ped,int,rodz'],
  ['ped', 'Endokrynologia dziecięca', 'Zaburzenia wzrastania', 'ped'],
  ['ped', 'Choroby zakaźne', 'Odra, świnka, różyczka', 'ped'],
  ['chir', 'Chirurgia endokrynologiczna', 'Techniki operacyjne', 'chir'],
  ['gin', 'Endokrynologia ginekologiczna', 'Hiperprolaktynemia', 'gin'],
  ['gin', 'Ginekologia ogólna', 'Zaburzenia statyki i urologia ginekologiczna', 'gin,chir'],
  ['rat', 'Stany zagrożenia życia', 'Kardiologiczne stany nagłe', 'rat,int'], // w nazwie lekcji – liczy się
  ['rat', 'Traumatologia', 'Złamania kości kończyn i miednicy', 'rat,chir'],
  ['int', 'Pulmonologia', 'Zaburzenia oddychania w czasie snu', 'int'],
  ['int', 'Kardiologia', 'Wrodzone wady serca u dorosłych', 'int'],
  ['chir', 'Neurochirurgia', 'Chirurgia kręgosłupa', 'chir'],
  ['ped', 'Neonatologia', 'Zamartwica i uraz okołoporodowy', 'ped,gin'],
];

test('B5: dziedziny LEK z pełnej nazwy działu i lekcji (lista tematów)', () => {
  for (const [c, s, l, exp] of CASES) {
    assert.deepEqual([...lessonDomains(c, s, l)].sort(), exp.split(',').filter(Boolean).sort(), `${s} / ${l}`);
  }
});

test('B5: słowo musi ZACZYNAĆ się od wyrażenia – „ciąż” nie pasuje do „obciążenie”, „ospa” tak', () => {
  assert.deepEqual(findTerms('Obciążenie, przeciążenie, obciążeniowa').map((h) => h.phrase), []);
  assert.deepEqual(findTerms('Ciąża mnoga').map((h) => h.domains), [['gin']]);
  assert.equal(normalize('Chorób Ó'), 'chorob o');
});

test('B5: wyjaśnienie – które słowa zadecydowały', () => {
  const r = explainLesson('int', 'Kardiologia', 'Ostre zespoły wieńcowe');
  same(r.domains, 'int,rat');
  assert.ok(r.hits.some((h) => h.text === 'Ostre zespoły wieńcowe' && h.domains.includes('rat')));
});

test('B5: prawo, zdrowie publiczne i orzecznictwo – tylko z własnego kursu (baza CEM)', () => {
  same(lessonDomains('int', 'Ogólne', 'Zwolnienie lekarskie i orzekanie o niezdolności do pracy'), 'int');
  same(lessonDomains('orz', 'Orzecznictwo', 'Zwolnienie lekarskie'), 'orz');
});

test('B5: ręczna poprawka dziedzin lekcji ma pierwszeństwo i przetrwa ponowne wczytanie spisu', () => {
  const courses = [{ id: 'c1', name: 'Kurs z interny', domain: 'int', sections: [{ name: 'Kardiologia', lessons: [{ name: 'Kardiomiopatie', hMin: 1, hMax: 2 }] }] }];
  const key = lessonKey('Kurs z interny', 'Kardiologia', 'Kardiomiopatie');
  assert.deepEqual(allLessons({ courses })[0].domains, ['int']);
  const l = allLessons({ courses, domainFix: { [key]: ['int', 'rat', 'nieznana'] } })[0];
  assert.deepEqual(l.domains, ['int', 'rat']); // nieznane dziedziny pomijane
  assert.equal(l.manual, true);
  assert.deepEqual(allLessons({ courses, domainFix: { [key]: [] } })[0].domains, []); // „poza LEK” z wyboru
});

test('B6: kursy części interny (i neurologia – decyzja właściciela) rozpoznawane jako choroby wewnętrzne', () => {
  for (const n of ['Kurs z chorób zakaźnych', 'Kurs z hematologii', 'Kurs z endokrynologii', 'Kurs z onkologii', 'Kurs z nefrologii', 'Kurs z neurologii']) assert.equal(guessDomain(n), 'int', n);
  assert.equal(guessDomain('Kurs z onkologii ginekologicznej'), 'gin');
  assert.equal(guessDomain('Kurs z radiologii'), 'inne');
});
