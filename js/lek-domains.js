// Rozpoznawanie dziedzin LEK po pełnej nazwie lekcji i działu (czysta logika, w całości testowana).
//
// Jak to działa:
//  1. Nazwa działu + nazwa lekcji są dzielone na słowa (małe litery, „ó” = „o”, żeby „chorób” = „choroba”).
//  2. Słownik to wyrażenia medyczne (1–4 słowa) przypisane do dziedzin. Każde słowo wyrażenia to POCZĄTEK
//     słowa z nazwy („zapal” pasuje do „zapalenie”, „zapalenia”), „=” oznacza całe słowo („=rko”),
//     a „|” – warianty słowa („nerk|nerek”: nerka, nerki, nerek).
//     Szukamy od początku słowa – dlatego „ciąż” (ciąża) NIE pasuje do „obciążenie” ani „przeciążenie”.
//  3. Najpierw dopasowujemy najdłuższe wyrażenia, a słowa raz użyte nie biorą udziału w kolejnych dopasowaniach.
//     Dzięki temu „depresja oddechowa” (ratunkowa) nie liczy się jako depresja (psychiatria),
//     a „żywienie pozajelitowe” (intensywna terapia) – jako żywienie w medycynie rodzinnej.
//  4. Między słowami wyrażenia mogą stać maks. 3 inne słowa („krwawienie z górnego odcinka przewodu pokarmowego”).
// Słownik zawiera wyłącznie ogólne pojęcia medyczne (nie materiały WNL).

const RAW = [
  // ---------- Choroby wewnętrzne ----------
  ['intern', 'int'], ['chorob wewnętrzn', 'int'], ['kardiolog', 'int'], ['pulmonolog', 'int'], ['gastroenterolog', 'int'],
  ['hepatolog', 'int'], ['nefrolog', 'int'], ['endokrynolog', 'int'], ['diabetolog', 'int'], ['hematolog', 'int'],
  ['reumatolog', 'int'], ['alergolog', 'int'], ['angiolog', 'int'], ['immunolog', 'int'], ['zakaźn', 'int'], ['infekcjolog', 'int'],
  ['nadciśnien', 'int,rodz'], ['nadciśnien płuc', 'int'], ['nadciśnien wrot', 'int'],
  ['niewydoln serc', 'int'], ['przewlekł niewydoln serc', 'int,rodz'], ['ostr niewydoln serc', 'int,rat'],
  ['wieńcow', 'int'], ['przewlekł zesp wieńcow', 'int,rodz'], ['ostr zesp wieńcow', 'int,rat'], ['=ozw', 'int,rat'],
  ['zawał', 'int,rat'], ['migotan przedsionk', 'int,rodz'], ['trzepot przedsionk', 'int'], ['zaburz rytm', 'int,rat'],
  ['arytmi', 'int'], ['bradykardi', 'int,rat'], ['tachykardi', 'int,rat'], ['blok przedsionkowo', 'int'],
  ['kardiomiopat', 'int'], ['zapal mięśni serc', 'int'], ['zapal wsierdz', 'int'], ['zapal osierdz', 'int'],
  ['zastawk', 'int'], ['wad zastawk', 'int'], ['stenoz aort', 'int'], ['niedomykaln', 'int'], ['miażdżyc', 'int'], ['aort', 'int'],
  ['dyslipidem', 'int,rodz'], ['hipercholesterolem', 'int,rodz'], ['hiperlipidem', 'int,rodz'],
  ['zatorow płuc', 'int,rat'], ['zakrzepic', 'int,rodz'], ['chorob zakrzepow', 'int,rodz'], ['trombofil', 'int'],
  ['astm', 'int,rodz'], ['=pochp', 'int,rodz'], ['przewlekł obturac', 'int,rodz'], ['rozstrzen oskrzel', 'int'],
  ['zapal płuc', 'int'], ['rak płuc', 'int'], ['śródmiąższ', 'int'], ['sarkoidoz', 'int'], ['mukowiscyd', 'int,ped'],
  ['niewydoln oddech', 'int,rat'], ['gruźlic', 'int'], ['płyn w jam opłuc', 'int'], ['opłucn', 'int'],
  ['cukrzyc', 'int,rodz'], ['kwasic ketonow', 'int,rat'], ['hipoglikem', 'int,rat'], ['hiperglikem', 'int,rat'],
  ['tarczyc', 'int,rodz'], ['nadczynn', 'int'], ['niedoczynn', 'int'], ['przysadk', 'int'], ['nadnercz', 'int'],
  ['cushing', 'int'], ['addison', 'int'], ['akromegal', 'int'], ['guz chromochłon', 'int'], ['przytarczyc', 'int'],
  ['osteoporoz', 'int,rodz'], ['gospodar wapn', 'int'], ['zaburz elektrolit', 'int,rat'], ['zaburz wodn', 'int,rat'],
  ['hiponatrem', 'int,rat'], ['hipernatrem', 'int,rat'], ['hiperkaliem', 'int,rat'], ['hipokaliem', 'int,rat'],
  ['niedokrwist', 'int,rodz'], ['białacz', 'int'], ['chłoniak', 'int'], ['szpiczak', 'int'], ['mielodysplast', 'int'],
  ['nowotwor mieloprolif', 'int'], ['czerwienic', 'int'], ['nadpłytkow', 'int'], ['skaz krwotoczn', 'int'], ['hemofil', 'int'],
  ['małopłytkow', 'int'], ['trombocytopen', 'int'], ['neutropen', 'int'], ['przetocz krwi', 'int'], ['krwiolecz', 'int'],
  ['chorob nerk|nerek', 'int'], ['niewydoln nerk|nerek', 'int'], ['przewlekł chorob nerk|nerek', 'int,rodz'], ['ostr uszkodz nerk|nerek', 'int,rat'],
  ['kłębuszk', 'int'], ['nerczyc', 'int'], ['zesp nerczyc', 'int'], ['zesp nerczow', 'int'], ['dializ', 'int'],
  ['zakażen układ moczow', 'int,rodz'], ['=zum', 'int,rodz'], ['odmiedniczk', 'int,rodz'],
  ['marsk', 'int'], ['wątrob', 'int'], ['alkoholow chorob wątrob', 'int'], ['=wzw', 'int'], ['żółtacz', 'int'], ['żółtacz noworod', 'ped'], ['żółtacz fizjolog', 'ped'],
  ['trzustk', 'int'], ['zapal trzustk', 'int,chir'], ['ostr zapal trzustk', 'int,chir,rat'],
  ['chorob wrzodow', 'int,rodz'], ['wrzod żołądk', 'int,rodz'], ['wrzod dwunast', 'int,rodz'], ['refluks', 'int,rodz'], ['=gerd', 'int,rodz'],
  ['nieswoist zapal jelit', 'int'], ['=nzj', 'int'], ['crohn', 'int'], ['wrzodziej zapal jelit', 'int'], ['celiaki', 'int,ped'],
  ['zesp jelit drażliw', 'int,rodz'], ['biegunk', 'int,rodz'], ['zapar', 'rodz'], ['dyspepsj', 'int,rodz'], ['=helicobacter', 'int'],
  ['przełyk', 'int'], ['zesp złego wchłan', 'int'],
  ['reumatoid', 'int'], ['=toczeń', 'int'], ['toczn', 'int'], ['twardzin', 'int'], ['zapal naczyń', 'int'], ['spondyloartropat', 'int'],
  ['zesztywn zapal staw', 'int'], ['=dna', 'int,rodz'], ['zapal staw', 'int'], ['fibromialg', 'int,rodz'], ['sjögren', 'int'],
  ['polimialg', 'int'], ['zapal skórn mięśn', 'int'], ['układow chorob tkank łączn', 'int'],
  ['borelioz', 'int,rodz'], ['=hiv', 'int'], ['=aids', 'int'], ['seps', 'int,rat'], ['septyczn', 'int,rat'],
  ['grzybic układ', 'int'], ['mononukleoz', 'int,ped'], ['malari', 'int'], ['drog płciow', 'int,gin,rodz'], ['gorączk o niejasn', 'int'], ['zakażen szpitaln', 'int'],
  ['antybiotykoterap', 'int'], ['zapal opon', 'int,ped'], ['tężec', 'int,rat'], ['wściekliz', 'int,rodz'],
  ['alergi', 'int'], ['pokrzywk', 'int,rodz'], ['obrzęk naczynioruch', 'int,rat'], ['anafilak', 'int,rat'],
  ['zesp metabol', 'int,rodz'], ['otyłoś', 'int,rodz'],

  // ---------- Pediatria z neonatologią ----------
  ['pediatr', 'ped'], ['neonatolog', 'ped'], ['noworod', 'ped'], ['niemowl', 'ped'], ['wcześniak', 'ped'], ['wcześniact', 'ped'],
  ['dzieci', 'ped'], ['dzieck', 'ped'], ['młodzież', 'ped'], ['krzywic', 'ped'], ['wad wrodz', 'ped'], ['wrodz wad', 'ped'],
  ['zesp down', 'ped'], ['nagł śmierć łóżeczk', 'ped'], ['=odra', 'ped'], ['=odry', 'ped'], ['różyczk', 'ped'], ['płonic', 'ped'],
  ['śwink', 'ped'], ['krztuś', 'ped'], ['krztusiec', 'ped'], ['zapal krtan', 'ped'], ['zapal oskrzelik', 'ped'],
  ['drgawk gorączk', 'ped'], ['rozwoj fizyczn', 'ped,rodz'], ['rozwoj psychoruch', 'ped,rodz'], ['siatk centyl', 'ped,rodz'],
  ['okres wiek', 'ped,rodz'], ['bilans zdrow', 'ped,rodz'], ['=bilanse', 'ped,rodz'], ['karmien piersi', 'ped,gin,rodz'],
  ['wiek rozwoj', 'ped'], ['pokwitan', 'ped'], ['dojrzewan płciow', 'ped'], ['fenyloketonur', 'ped'], ['badan przesiew noworod', 'ped'],

  // ---------- Chirurgia z chirurgią urazową ----------
  ['chirurg', 'chir'], ['ortoped', 'chir'], ['traumatolog', 'chir'], ['urolog', 'chir'], ['neurochirurg', 'chir'], ['kardiochirurg', 'chir'],
  ['transplant', 'chir'], ['przeszczep', 'chir'], ['ostr brzuch', 'chir,rat'], ['wyrost', 'chir'], ['przepuklin', 'chir'],
  ['niedrożn', 'chir,rat'], ['kamic żółciow', 'chir'], ['pęcherzyk żółciow', 'chir'], ['dróg żółciow', 'chir,int'],
  ['żylak', 'chir,rodz'], ['uraz', 'chir,rat'], ['obrażen', 'chir,rat'],
  ['złaman', 'chir,rat'], ['zwichn', 'chir'], ['skręcen', 'chir'], ['oparzen', 'chir,rat'], ['odmrożen', 'chir,rat'],
  ['tętniak', 'chir,int'], ['rozwarstw aort', 'chir,int,rat'], ['ostr niedokrwien kończyn', 'chir,rat'], ['niedokrwien kończyn', 'chir,int'],
  ['stop cukrzycow', 'chir,int'], ['prostat', 'chir'], ['gruczoł krokow', 'chir'], ['kamic nerkow', 'chir,rodz'],
  ['kamic moczow', 'chir,rodz'], ['kamic układ moczow', 'chir,rodz'], ['kolk nerkow', 'chir,rodz,rat'],
  ['rak jelit grub', 'chir,int'], ['nowotwor jelit grub', 'chir,int'], ['rak żołądk', 'chir,int'], ['rak trzustk', 'chir,int'],
  ['rak odbytnic', 'chir'], ['rak tarczyc', 'chir,int'], ['rak nerk|nerek', 'chir'], ['rak pęcherz', 'chir'], ['rak jąd', 'chir'],
  ['rak piersi', 'gin,chir'], ['=ran', 'chir'], ['=rana', 'chir'], ['=rany', 'chir'], ['gojen', 'chir'],
  ['zesp ciasnot', 'chir'], ['zesp przedział', 'chir'], ['zakażen chirurg', 'chir'], ['krwawien przewod pokarm', 'int,chir,rat'],
  ['odbyt', 'chir'], ['hemoroid', 'chir,rodz'], ['guzk krwawnicz', 'chir,rodz'], ['przetok', 'chir'], ['ropie', 'chir'], ['ropn', 'chir'],
  ['zapal otrzewn', 'chir,rat'], ['perforac', 'chir,rat'], ['endoprotez', 'chir'], ['amputac', 'chir'], ['skręt jąd', 'chir,rat'],
  ['wodonercz', 'chir'], ['zatrzym moczu', 'chir,rat'], ['=wodniak', 'chir'], ['wnętrostw', 'chir,ped'],

  // ---------- Położnictwo i ginekologia ----------
  ['ginekolog', 'gin'], ['położn', 'gin'], ['perinatolog', 'gin'], ['ciąż', 'gin'], ['pozamaciczn', 'gin'], ['poród', 'gin'],
  ['porod', 'gin'], ['połóg', 'gin'], ['połog', 'gin'], ['płód', 'gin'], ['płod', 'gin'], ['niepłodn', 'gin'], ['poronien', 'gin'],
  ['łożysk', 'gin'], ['przedrzucawk', 'gin'], ['rzucawk', 'gin'], ['=hellp', 'gin'], ['krwotok poporod', 'gin,rat'],
  ['macic', 'gin'], ['jajnik', 'gin'], ['jajowod', 'gin'], ['przydatk', 'gin'], ['pochw', 'gin'], ['srom', 'gin'],
  ['szyjk macic', 'gin'], ['endometri', 'gin'], ['mięśniak', 'gin'], ['menopauz', 'gin,rodz'], ['przekwit', 'gin,rodz'],
  ['antykoncep', 'gin,rodz'], ['miesiącz', 'gin'], ['krwawien drog rodn', 'gin'], ['=pierś', 'gin'], ['=piersi', 'gin'],
  ['sutk', 'gin'], ['mammograf', 'gin,rodz'], ['laktac', 'gin'], ['cukrzyc ciążow', 'gin,int'], ['cytolog', 'gin,rodz'],
  ['zesp policystyczn jajnik', 'gin'], ['=pcos', 'gin'], ['ciąż mnog', 'gin'], ['konflikt serolog', 'gin'],

  // ---------- Medycyna rodzinna ----------
  ['medycyn rodzinn', 'rodz'], ['rodzinn', 'rodz'], ['=poz', 'rodz'], ['podstaw opiek zdrowot', 'rodz'], ['profilaktyk', 'rodz'],
  ['przesiew', 'rodz'], ['szczepien', 'rodz'], ['szczepionk', 'rodz'], ['paliatywn', 'rodz'], ['geriatr', 'rodz'],
  ['podeszł wiek', 'rodz'], ['osob starsz', 'rodz'], ['nietrzym moczu', 'rodz'], ['przeziębien', 'rodz'], ['gryp', 'rodz'],
  ['infekcj górn drog oddech', 'rodz'], ['zapal gardł', 'rodz'], ['angin', 'rodz'], ['zapal migdał', 'rodz'], ['zapal zatok', 'rodz'],
  ['ucha', 'rodz'], ['=ucho', 'rodz'], ['uszu', 'rodz'], ['laryngolog', 'rodz'], ['otolaryngolog', 'rodz'], ['nieżyt nos', 'rodz'],
  ['alergiczn nieżyt nos', 'int,rodz'], ['krwawien z nos', 'rodz,rat'], ['ból głow', 'rodz'], ['migren', 'rodz'], ['zawrot głow', 'rodz'],
  ['ból plec', 'rodz'], ['ból krzyż', 'rodz'], ['kręgosłup', 'rodz'], ['uraz kręgosłup', 'chir,rat'], ['zwyrodnien', 'rodz'], ['niedożywien', 'rodz'],
  ['zdrow żywien', 'rodz'], ['racjonaln żywien', 'rodz'], ['żywien niemowl', 'ped,rodz'], ['żywien dzieci|dzieck', 'ped'], ['zaburz snu', 'rodz,psych'], ['bezsenn', 'rodz,psych'], ['palen tyton', 'rodz'], ['nikotyn', 'rodz'],
  ['alkohol', 'rodz'], ['leczen bólu', 'rodz'], ['ból przewlekł', 'rodz'], ['przeciwbólow', 'rodz'],
  ['dermatolog', 'rodz'], ['trądzik', 'rodz'], ['łuszczyc', 'rodz'], ['atopow zapal skór', 'rodz,ped'], ['=azs', 'rodz,ped'],
  ['grzybic skór', 'rodz'], ['grzybic paznok', 'rodz'], ['brodawk', 'rodz'], ['brodawk sutk', 'gin'], ['opryszczk', 'rodz'],
  ['półpaśc', 'rodz'], ['ospa', 'rodz,ped'], ['ospy', 'rodz,ped'], ['ospa wietrzn', 'rodz,ped'], ['świerzb', 'rodz'], ['wszaw', 'rodz'],
  ['czerniak', 'rodz'], ['rak skór', 'rodz'], ['znamion', 'rodz'], ['przydatk skór', 'rodz'], ['chorob skór', 'rodz'],
  ['pęcherzyc', 'rodz'], ['grudkow', 'rodz'], ['okulist', 'rodz'], ['wad refrakc', 'rodz'], ['jaskr', 'rodz'], ['zaćm', 'rodz'],
  ['spojówk', 'rodz'], ['czerwon oko', 'rodz'], ['soczewk', 'rodz'], ['pierwsz kontakt', 'rodz'], ['opiek długoterminow', 'rodz'],
  ['wizyt domow', 'rodz'], ['bóle staw', 'rodz'],

  // ---------- Medycyna ratunkowa i intensywna terapia ----------
  ['medycyn ratunk', 'rat'], ['ratunk', 'rat'], ['ratownic', 'rat'], ['anestezjolog', 'rat'], ['znieczul', 'rat'],
  ['intensywn terap', 'rat'], ['=oiom', 'rat'], ['=oit', 'rat'], ['stan nagł', 'rat'], ['stan zagroż', 'rat'],
  ['wstrząs', 'rat'], ['wstrząs kardiogen', 'rat,int'], ['wstrząs septyczn', 'rat,int'], ['wstrząs anafilakt', 'rat,int'],
  ['zatruc', 'rat'], ['toksykolog', 'rat'], ['resuscyt', 'rat'], ['=rko', 'rat'], ['=bls', 'rat'], ['=als', 'rat'], ['=acls', 'rat'],
  ['=pals', 'rat,ped'], ['zatrzym krążen', 'rat'], ['nagł zatrzym', 'rat'], ['defibryl', 'rat'], ['udar', 'rat'], ['udar ciepl', 'rat'],
  ['krwotok', 'rat'], ['ostr niewydoln', 'rat'], ['=odma', 'int,rat'], ['=odmy', 'int,rat'], ['=odmie', 'int,rat'],
  ['tamponad', 'rat,int'], ['kwasic', 'rat,int'], ['zasadowic', 'rat,int'], ['gazometr', 'rat,int'], ['równowag kwas', 'rat,int'],
  ['wentylac', 'rat'], ['intubac', 'rat'], ['respirator', 'rat'], ['tlenoterap', 'rat'], ['udrażn', 'rat'], ['ciał obc', 'rat'],
  ['drgawk', 'rat'], ['stan padaczkow', 'rat'], ['padaczk', 'rat,rodz'], ['śpiączk', 'rat'], ['zaburz świadom', 'rat'],
  ['hipotermi', 'rat'], ['utonię', 'rat'], ['porażen prąd', 'rat'], ['porażen piorun', 'rat'], ['ukąszen', 'rat'], ['użądlen', 'rat'],
  ['triaż', 'rat'], ['=triage', 'rat'], ['segregac', 'rat'], ['zdarzen masow', 'rat'], ['sedac', 'rat'],
  ['ból klat piersiow', 'rat,int'], ['dusznoś', 'rat,int'],
  ['uraz wielonarząd', 'chir,rat'], ['obrażen wielonarząd', 'chir,rat'], ['uraz czaszk', 'chir,rat'], ['uraz głow', 'chir,rat'],
  ['zesp zmiażdżen', 'chir,rat'], ['depres oddech', 'rat'], ['depres ośrodk oddech', 'rat'],
  ['żywien pozajelit', 'rat'], ['żywien dojelit', 'rat'], ['żywien enteral', 'rat'], ['żywien parenteral', 'rat'],
  ['bilans płyn', 'rat'], ['płynoterap', 'rat'], ['bilans wodn', 'rat,int'], ['=ekmo', 'rat'],

  // ---------- Psychiatria ----------
  ['psychiatr', 'psych'], ['depres', 'psych,rodz'], ['schizofren', 'psych'], ['psychoz', 'psych'], ['psychot', 'psych'],
  ['zaburz afektyw', 'psych'], ['dwubiegun', 'psych'], ['=mania', 'psych'], ['=manii', 'psych'], ['maniakaln', 'psych'],
  ['hipomani', 'psych'], ['zaburz lękow', 'psych,rodz'], ['lęk', 'psych'], ['nerwic', 'psych'], ['zaburz osobow', 'psych'],
  ['osobowoś', 'psych'], ['zaburz odżywian', 'psych,rodz'], ['anoreks', 'psych'], ['bulimi', 'psych'],
  ['uzależnien', 'psych,rodz'], ['zesp abstynenc', 'psych'], ['alkoholow zesp abstynenc', 'psych'], ['zatruc alkohol', 'rat,psych'], ['majaczen', 'psych'],
  ['delirium', 'psych'], ['otępien', 'psych,rodz'], ['demencj', 'psych,rodz'], ['samobój', 'psych'], ['autyzm', 'psych,ped'],
  ['autyst', 'psych,ped'], ['=adhd', 'psych,ped'], ['nadpobudliw', 'psych,ped'], ['zaburz obsesyj', 'psych'], ['natręctw', 'psych'],
  ['=ptsd', 'psych'], ['stres pourazow', 'psych'], ['psychoterap', 'psych'], ['przeciwdepres', 'psych'], ['neurolept', 'psych'],
  ['przeciwpsychot', 'psych'], ['zdrow psychicz', 'psych'], ['przymus bezpośred', 'psych'], ['zaburz psychicz', 'psych'],
  ['zaburz zachowan', 'psych'], ['zaburz dysocjac', 'psych'], ['zaburz somatyz', 'psych'], ['=alkoholizm', 'psych,rodz'],

  // ---------- Dziedziny „tylko z bazy CEM” (liczą się tylko w kursie przypisanym do tej dziedziny) ----------
  ['bioety', 'etyka'], ['prawo medyczn', 'etyka'], ['praw pacjent', 'etyka'], ['zgod na leczen', 'etyka'], ['tajemnic lekarsk', 'etyka'],
  ['zdrow publiczn', 'zp'], ['epidemiolog', 'zp'], ['organizac ochron zdrow', 'zp'],
  ['orzeczn', 'orz'], ['niezdoln do prac', 'orz'], ['zwolnien lekarsk', 'orz'], ['stwierdz zgon', 'orz'], ['karta zgon', 'orz'],
];

/** Małe litery, „ó” jak „o” (chorób = chorob, poród = porod). Pozostałe polskie litery zostają. */
export function normalize(s) {
  return String(s || '').toLowerCase().replace(/ó/g, 'o');
}

const words = (s) => normalize(s).split(/[^a-ząćęłńśźż0-9]+/).filter(Boolean);

// Słownik po przygotowaniu: najpierw najdłuższe wyrażenia (więcej słów, potem dłuższe rdzenie).
export const DICT = RAW.map(([phrase, doms]) => ({
  phrase,
  parts: phrase.split(' ').map((p) => (p.startsWith('=') ? { exact: true, s: p.slice(1).split('|').map(normalize) } : { exact: false, s: p.split('|').map(normalize) })),
  domains: doms.split(','),
})).sort((a, b) => b.parts.length - a.parts.length || b.parts.reduce((x, p) => x + p.s[0].length, 0) - a.parts.reduce((x, p) => x + p.s[0].length, 0));

const GAP = 3;
const fits = (part, w) => part.s.some((s) => (part.exact ? w === s : w.startsWith(s)));

/** Znajduje wyrażenie od słowa `i` (z przerwami do GAP słów); zwraca indeksy słów albo null. */
function matchAt(ws, used, entry, i) {
  if (used[i] || !fits(entry.parts[0], ws[i])) return null;
  const idx = [i];
  let pos = i;
  for (let k = 1; k < entry.parts.length; k++) {
    let found = -1;
    for (let j = pos + 1; j < ws.length && j <= pos + 1 + GAP; j++) {
      if (!used[j] && fits(entry.parts[k], ws[j])) { found = j; break; }
    }
    if (found < 0) return null;
    idx.push(found);
    pos = found;
  }
  return idx;
}

/**
 * Dopasowania w tekście: [{ phrase, domains, text }] – `text` to słowa z nazwy, które pasowały (do „Dlaczego?”).
 */
export function findTerms(text) {
  const raw = String(text || '').split(/[^A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż0-9]+/).filter(Boolean);
  const ws = raw.map(normalize);
  const used = new Array(ws.length).fill(false);
  const hits = [];
  for (const e of DICT) {
    for (let i = 0; i < ws.length; i++) {
      const idx = matchAt(ws, used, e, i);
      if (!idx) continue;
      idx.forEach((j) => { used[j] = true; });
      hits.push({ phrase: e.phrase, domains: e.domains, text: idx.map((j) => raw[j]).join(' ') });
    }
  }
  return hits;
}

/**
 * Dziedziny lekcji z pełnej nazwy działu i lekcji. `order` – kolejność dziedzin w wyniku,
 * `skip` – dziedziny, których nie dopisujemy z nazwy (tylko baza CEM).
 * Zwraca { domains, hits } – hits z wyjaśnieniem, które słowa zadecydowały.
 */
export function classifyLesson(courseDomain, section, name, order, skip = []) {
  const hits = [...findTerms(section), ...findTerms(name)];
  const found = new Set();
  for (const h of hits) for (const d of h.domains) if (!skip.includes(d)) found.add(d);
  const out = order.includes(courseDomain) ? [courseDomain] : [];
  for (const id of order) if (!out.includes(id) && found.has(id)) out.push(id);
  return { domains: out, hits: hits.filter((h) => h.domains.some((d) => out.includes(d))) };
}
