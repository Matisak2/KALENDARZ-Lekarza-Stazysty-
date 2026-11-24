// Książeczka stażowa lekarza (wzór OIL) – rubryki do podpisu przy każdym bloku.
// Odwzorowanie stron książeczki; stan w state.booklet[blockId][key] = { date?, text?, from?, to? }.
// Imiona i nazwiska (opiekun, koordynator) zapisują się tylko w telefonie – nie w kodzie.

const part = (key, title, extra = []) => [
  { key: `${key}.termin`, label: `${title}: termin od–do`, kind: 'range', sign: false },
  { key: `${key}.opiekun`, label: `${title}: opiekun (imię i nazwisko)`, kind: 'text', sign: false },
  ...extra,
  { key: `${key}.dyzury`, label: `${title}: „Odbył wymaganą w programie liczbę dyżurów” – podpis opiekuna`, kind: 'check', sign: true },
  { key: `${key}.program`, label: `${title}: „Odbył staż cząstkowy zgodnie z programem” – podpis opiekuna`, kind: 'check', sign: true },
];
const end = (key, who = 'ordynatora') => [
  { key: `${key}.kolokwium`, label: 'Złożył kolokwium końcowe – data', kind: 'date', sign: true },
  { key: `${key}.pieczatki`, label: `Pieczątka oddziału + pieczątka i podpis ${who}`, kind: 'check', sign: true },
];
const skills = (key, label = 'Umiejętności – data, pieczątka i podpis opiekuna') => ({ key: `${key}.umiejetnosci`, label, kind: 'check', sign: true });

export const BOOKLET = {
  chir: {
    page: 'Staż cząstkowy w dziedzinie chirurgii ogólnej',
    items: [
      ...part('ogolna', 'Chirurgia ogólna'),
      ...part('urazowa', 'Chirurgia urazowa'),
      ...end('chir'),
      skills('chir', 'Umiejętności (8 pozycji) – data, pieczątka i podpis opiekuna'),
      { key: 'chir.gips', label: 'Założenie podstawowych opatrunków gipsowych i unieruchamiających – osobny podpis', kind: 'check', sign: true },
    ],
  },
  int: {
    page: 'Staż cząstkowy w dziedzinie chorób wewnętrznych',
    items: [
      { key: 'int.termin', label: 'Termin stażu od–do', kind: 'range', sign: false },
      { key: 'int.opiekun', label: 'Opiekun (imię i nazwisko)', kind: 'text', sign: false },
      { key: 'int.transf', label: 'Szkolenie z transfuzjologii klinicznej – pieczątka RCKiK i prowadzącego', kind: 'check', sign: true },
      { key: 'int.transfSpr', label: 'Sprawdzian z transfuzjologii klinicznej – podpis', kind: 'check', sign: true },
      { key: 'int.bezp', label: 'Szkolenie z bezpieczeństwa pacjenta (HIV, AIDS, HCV) – podpis prowadzącego', kind: 'check', sign: true },
      { key: 'int.bezpSpr', label: 'Sprawdzian z bezpieczeństwa pacjenta – podpis', kind: 'check', sign: true },
      { key: 'int.dyzury', label: '„Odbył wymaganą w programie liczbę dyżurów” – podpis opiekuna', kind: 'check', sign: true },
      { key: 'int.program', label: '„Odbył staż cząstkowy zgodnie z programem” – podpis opiekuna', kind: 'check', sign: true },
      ...end('int'),
      skills('int', 'Umiejętności (9 pozycji) – data, pieczątka i podpis opiekuna'),
    ],
  },
  neo: {
    page: 'Staż cząstkowy w dziedzinie pediatrii – część neonatologiczna',
    items: [
      ...part('neo', 'Neonatologia'),
      skills('neo', 'Postępowanie z noworodkiem i pozostałe umiejętności – data i podpis opiekuna'),
    ],
    note: 'Kolokwium końcowe i pieczątki są wspólne z pediatrią – odhaczysz je w bloku Pediatria.',
  },
  ped: {
    page: 'Staż cząstkowy w dziedzinie pediatrii',
    items: [
      ...part('ped', 'Pediatria'),
      ...end('ped'),
      skills('ped', 'Umiejętności z pediatrii – data, pieczątka i podpis opiekuna'),
    ],
  },
  anest: {
    page: 'Staż cząstkowy w dziedzinie intensywnej terapii oraz medycyny ratunkowej – część IT',
    items: [...part('it', 'Intensywna terapia')],
    note: 'Kolokwium, pieczątki i umiejętności są wspólne z medycyną ratunkową – odhaczysz je w bloku Ratownictwo.',
  },
  sor: {
    page: 'Staż cząstkowy w dziedzinie intensywnej terapii oraz medycyny ratunkowej – część MR',
    items: [
      ...part('mr', 'Medycyna ratunkowa'),
      ...end('itmr'),
      skills('itmr', 'Umiejętności (resuscytacja, czynności przedszpitalne…) – data i podpis opiekuna'),
      { key: 'bls.miejsce', label: 'Kurs ALS/BLS: miejsce', kind: 'text', sign: false },
      { key: 'bls.termin', label: 'Kurs ALS/BLS: termin', kind: 'range', sign: false },
      { key: 'bls.wykladowca', label: 'Kurs ALS/BLS: wykładowca', kind: 'text', sign: false },
      { key: 'bls.podpis', label: 'Kurs ALS/BLS – data, pieczątka i podpis', kind: 'check', sign: true },
    ],
  },
  rodz: {
    page: 'Staż cząstkowy w dziedzinie medycyny rodzinnej',
    items: [
      { key: 'rodz.termin', label: 'Termin stażu od–do', kind: 'range', sign: false },
      { key: 'rodz.opiekun', label: 'Opiekun (imię i nazwisko)', kind: 'text', sign: false },
      { key: 'rodz.organizacja', label: '„Zapoznał się z organizacją i metodami praktyki lekarza rodzinnego” – podpis opiekuna', kind: 'check', sign: true },
      { key: 'rodz.program', label: '„Odbył staż cząstkowy zgodnie z programem” – podpis opiekuna', kind: 'check', sign: true },
      ...end('rodz', 'kierownika poradni'),
      skills('rodz', 'Umiejętności (19 pozycji) – data, pieczątka i podpis opiekuna'),
    ],
  },
};

/** Część personalizowana – strony „Staż cząstkowy w dziedzinie (1–3)”. */
function personalized(n) {
  return {
    page: `Staż cząstkowy w dziedzinie (${n}) – część personalizowana`,
    items: [
      ...part('pers', `Dziedzina (${n})`),
      ...end('pers'),
      skills('pers', 'Umiejętności wpisane ręcznie – data, pieczątka i podpis opiekuna'),
    ],
  };
}

/** Rubryki książeczki dla bloku (część personalizowana: kolejność bloków w grupie). */
export function bookletFor(state, block) {
  if (BOOKLET[block.id]) return BOOKLET[block.id];
  if (block.group) {
    const group = state.blocks.filter((b) => b.group === block.group).sort((a, b) => (a.start < b.start ? -1 : 1));
    return personalized(group.findIndex((b) => b.id === block.id) + 1);
  }
  return null;
}

/** Szkolenia w książeczce (strony z „Organizator / Termin / Wykładowca / Data i podpis”). */
export const BOOKLET_COURSES = [
  { key: 'onko', label: 'Profilaktyka onkologiczna', course: 'onko' },
  { key: 'bol', label: 'Leczenie bólu', course: 'bol' },
  { key: 'orzecz', label: 'Orzecznictwo lekarskie', course: 'orzecz' },
  { key: 'prawo', label: 'Prawo medyczne', course: 'prawo' },
  { key: 'bioetyka', label: 'Bioetyka', course: 'bioetyka' },
  { key: 'zdrowie', label: 'Zdrowie publiczne', course: 'zdrowie' },
  { key: 'szczep', label: 'Profilaktyka dotycząca szczepień ochronnych', course: 'szczep' },
  { key: 'komunik', label: 'Komunikacja z pacjentem i zespołem terapeutycznym', course: 'komunik' },
  { key: 'wypalenie', label: 'Przeciwdziałanie wypaleniu zawodowemu', course: 'komunik' },
];

export function bookletProgress(state, block) {
  const def = bookletFor(state, block);
  if (!def) return { total: 0, done: 0, missing: [] };
  const data = state.booklet?.[block.id] || {};
  const signs = def.items.filter((i) => i.sign);
  const missing = signs.filter((i) => !data[i.key]?.date);
  return { total: signs.length, done: signs.length - missing.length, missing };
}

export function coursesSigned(state) {
  const c = state.booklet?.courses || {};
  return { total: BOOKLET_COURSES.length, done: BOOKLET_COURSES.filter((x) => c[x.key]?.date).length };
}

/** Podpowiedź terminu z harmonogramu (chirurgia: 6 tyg. ogólnej + 2 tyg. urazowej wg programu). */
export function suggestedRange(block, key, addDaysFn) {
  if (key.startsWith('bls.')) return null;
  if (key === 'ogolna.termin') return { from: block.start, to: addDaysFn(block.start, 6 * 7 - 1) };
  if (key === 'urazowa.termin') return { from: addDaysFn(block.start, 6 * 7), to: block.end };
  return { from: block.start, to: block.end };
}
