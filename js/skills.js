// Umiejętności do opanowania w stażach cząstkowych – dosłownie z programu stażu
// (rozporządzenie MZ z 24.02.2023, Dz.U. 2023 poz. 377, załącznik nr 1).
// Klucz = id bloku w aplikacji. Do każdego bloku można dopisać własne pozycje.

export const SKILLS = {
  int: {
    source: 'Program stażu cząstkowego w zakresie chorób wewnętrznych – „Opanowanie następujących umiejętności i czynności”',
    items: [
      'Wkłucie dożylne i dotętnicze w celu podania leku lub pobrania krwi do badań, kaniulacja żył',
      'Dożylne przetaczanie krwi i innych płynów',
      'Badanie EKG',
      'Nakłucie opłucnej i otrzewnej',
      'Cewnikowanie pęcherza moczowego',
      'Pobranie materiału do badań mikrobiologicznych',
      'Płukanie żołądka',
      'Pomiar i interpretacja ciśnienia tętniczego krwi, w tym pomiar ciśnienia na kostce',
      'Pomiar glikemii',
    ],
  },
  ped: {
    source: 'Program stażu cząstkowego w zakresie pediatrii – „Opanowanie następujących umiejętności i czynności” (pkt 6–15)',
    items: [
      'Zbieranie wywiadu od rodziny dziecka',
      'Ocena stanu ogólnego niemowlęcia i dziecka starszego (z badaniem otoskopowym i pomiarem ciśnienia krwi)',
      'Ocena rozwoju psychoruchowego i psychicznego niemowlęcia i dziecka starszego',
      'Ocena rozwoju fizycznego na siatkach centylowych',
      'Ocena dojrzałości płciowej',
      'Badanie neurologiczne niemowlęcia i dziecka starszego',
      'Wkłucie dożylne i pobranie krwi u niemowlęcia i dziecka starszego',
      'Pobranie płynu mózgowo-rdzeniowego przy podejrzeniu zapalenia opon',
      'Pobranie materiałów do badań mikrobiologicznych',
      'Założenie zgłębnika do żołądka lub odbytnicy i cewnika do pęcherza moczowego',
      'Resuscytacja i pierwsza pomoc w stanach zagrożenia życia u dzieci',
    ],
  },
  neo: {
    source: 'Program stażu cząstkowego w zakresie pediatrii – część noworodkowa (pkt 1–5)',
    items: [
      'Ocena noworodka w skali Apgar',
      'Ocena dojrzałości noworodka',
      'Resuscytacja noworodka',
      'Testy przesiewowe u noworodka',
      'Rozpoznawanie wad wrodzonych u noworodka i postępowanie',
      'Pielęgnacja i karmienie noworodka i niemowlęcia',
    ],
  },
  chir: {
    source: 'Program stażu cząstkowego w zakresie chirurgii ogólnej – „Opanowanie następujących umiejętności i czynności”',
    items: [
      'Mycie chirurgiczne rąk i pola operacyjnego',
      'Chirurgiczne opracowanie i zeszycie niewielkich ran',
      'Znieczulenie miejscowe',
      'Założenie podstawowych opatrunków gipsowych i unieruchamiających',
      'Postępowanie w krwotoku zewnętrznym',
      'Założenie zgłębnika nosowo-żołądkowego',
      'Dożylne przetaczanie krwi i płynów infuzyjnych',
      'Postępowanie w oparzeniach',
      'Badanie per rectum i ocena gruczołu krokowego',
    ],
  },
  anest: {
    source: 'Program stażu cząstkowego w zakresie intensywnej terapii – wybrane zagadnienia (pkt 1 i 3)',
    items: [
      'Ocena stanu chorego w okresie przedoperacyjnym',
      'Dostępy naczyniowe',
      'Monitorowanie dynamiki układu krążenia',
      'Monitorowanie oddychania',
      'Sedacja i analgosedacja na OIT',
      'Wentylacja mechaniczna – zasady działania i obsługa respiratora',
      'Rodzaje i podział wstrząsu',
      'Postępowanie po nagłym zatrzymaniu krążenia',
      'Sepsa i wstrząs septyczny – pakiety resuscytacyjne',
      'Płynoterapia',
      'Leczenie preparatami krwi i krwiopochodnymi',
      'Żywienie w intensywnej terapii',
      'Orzekanie o nieodwracalnym ustaniu czynności mózgu',
    ],
  },
  sor: {
    source: 'Program stażu cząstkowego w zakresie medycyny ratunkowej – „lekarskie umiejętności leczenia ratunkowego”',
    items: [
      'Udrożnienie dróg oddechowych metodami bezprzyrządowymi',
      'Intubacja dotchawicza',
      'Udrożnienie dróg oddechowych technikami alternatywnymi (maska krtaniowa, rurka krtaniowa)',
      'Udrożnienie dróg oddechowych technikami chirurgicznymi (konikotomia, tracheotomia)',
      'Wspomaganie oddechu i sztuczna wentylacja zastępcza',
      'Defibrylacja elektryczna i kardiowersja',
      'Pośredni masaż serca',
      'Centralny dostęp dożylny',
      'Resuscytacja płynowa',
      'Odbarczenie odmy opłucnowej (zwłaszcza prężnej)',
      'Zabezpieczenie rannego przy wyjmowaniu z uszkodzonego pojazdu',
      'Unieruchomienie kręgosłupa szyjnego i piersiowo-lędźwiowego',
      'Unieruchomienie złamań i tamowanie krwotoków na miejscu zdarzenia',
      'Monitorowanie funkcji życiowych w transporcie i na SOR',
      'Zaopatrywanie ran powierzchownych',
      'Znieczulenia przewodowe i analgosedacja w procedurach ratunkowych',
      'Postępowanie w porodzie nagłym',
      'Kurs ALS/BLS',
    ],
  },
  rodz: {
    source: 'Program stażu cząstkowego w zakresie medycyny rodzinnej – „Opanowanie następujących umiejętności i czynności”',
    items: [
      'Badanie niemowlęcia i małego dziecka',
      'Badanie bilansowe dzieci w różnym wieku',
      'Kwalifikacja do szczepień dzieci i dorosłych',
      'Porada laktacyjna',
      'Całościowa ocena geriatryczna',
      'Porada profilaktyczna u pacjenta dorosłego',
      'Porada edukacyjna',
      'Ocena kliniczna bólu standaryzowanymi narzędziami',
      'Badanie stanu psychicznego z użyciem skal i kwestionariuszy',
      'Podstawowe badanie neurologiczne',
      'Badanie otoskopowe',
      'Wziernikowanie nosa (rynoskopia przednia)',
      'Orientacyjne badanie ostrości wzroku',
      'Orientacyjne badanie pola widzenia',
      'Badanie per rectum, w tym ocena gruczołu krokowego',
      'Usuwanie szwów i drenów',
      'Usuwanie woskowiny z ucha',
      'Cewnikowanie pęcherza moczowego',
      'Zakładanie opatrunków',
    ],
  },
};

/** Lista umiejętności bloku: z programu + własne. Każda z kluczem do zapisu w state.skills. */
export function skillsFor(state, blockId) {
  const base = (SKILLS[blockId]?.items || []).map((name, i) => ({ key: `${blockId}:${i}`, name, own: false }));
  const own = (state.customSkills?.[blockId] || []).map((s) => ({ key: `${blockId}:own:${s.id}`, name: s.name, own: true, id: s.id }));
  return [...base, ...own].map((s) => ({ ...s, done: state.skills?.[s.key] || null }));
}

export function skillProgress(state, blockId) {
  const list = skillsFor(state, blockId);
  return { total: list.length, done: list.filter((s) => s.done).length };
}
