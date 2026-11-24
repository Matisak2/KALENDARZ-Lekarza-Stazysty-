// Domyślne dane: harmonogram grupy 6 (staż 01.10.2026–31.10.2027, USK2 Szczecin).
// Wszystko można zmienić w aplikacji – to tylko punkt startowy.

export const SCHEMA_VERSION = 2;

/** Typy wpisów kalendarza (nieobecności i inne zdarzenia). */
export const EVENT_TYPES = {
  urlop: { label: 'Urlop wypoczynkowy', short: 'Urlop', icon: '🏖', vacation: true },
  urlop_zadanie: { label: 'Urlop na żądanie', short: 'Na żądanie', icon: '🏖', vacation: true },
  l4: { label: 'Zwolnienie lekarskie (L4)', short: 'L4', icon: '🤒', extends: true },
  opieka: { label: 'Opieka nad dzieckiem / rodziną', short: 'Opieka', icon: '👶', extends: true },
  bezplatny: { label: 'Urlop bezpłatny', short: 'Bezpłatny', icon: '⏸', extends: true },
  inne: { label: 'Inna nieobecność', short: 'Nieobecność', icon: '•' },
};

export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    settings: {
      startDate: '2026-10-01',
      endDate: '2027-10-31',
      group: '6',
      hospital: 'USK2 Szczecin',
      // 'zaliczane' – święta liczą się jako dni stażu (poradnik OIL Szczecin 2026, s. 36) – domyślnie
      // 'odrabiane' – święta w trakcie bloku przepadają i trzeba je odrobić
      holidayMode: 'zaliczane',
      // Pula urlopu wg poradnika OIL Szczecin 2026: 22 dni (5 w roku rozpoczęcia + 17 w kolejnym)
      vacationPool: { 2026: 5, 2027: 17 },
      // Dzień wolny za święto wypadające w sobotę: data święta -> data dnia wolnego (null = nieznana)
      saturdayDaysOff: { '2026-12-26': '2026-12-23', '2027-05-01': null },
      saturdayDaysOffNote: { '2026-12-26': 'do potwierdzenia w kadrach' },
      lek: {
        examDate: '2027-02-20',
        session: 'wiosna 2027',
        deadlines: [
          { date: '2026-11-30', label: 'Zgłoszenie na LEK (wiosna 2027) w SMK – ostatni dzień' },
          { date: '2027-02-06', label: 'CEM podaje miejsce i godzinę LEK (najpóźniej 14 dni przed)' },
          { date: '2027-07-15', label: 'Zgłoszenie na LEK (jesień 2027) w SMK – jeśli potrzebne' },
        ],
        registered: false,
      },
    },
    blocks: [
      { id: 'chir', name: 'Chirurgia ogólna', short: 'Chirurgia', color: 'navy', start: '2026-10-01', end: '2026-11-25', required: 40, duties: true },
      { id: 'pers1', name: 'Chirurgia dziecięca', short: 'Chir. dziecięca', color: 'green', group: 'Część personalizowana', start: '2026-11-26', end: '2026-12-16', required: 15, duties: true,
        segments: [{ id: 'pers1-a', start: '2026-11-26', end: '2026-12-16', hospital: 'zdroje', ward: 'Oddział Chirurgii Dziecięcej, Ortopedii i Urologii z Pododdziałem Centrum Leczenia Oparzeń' }] },
      { id: 'pers2', name: 'Chirurgia plastyczna', short: 'Chir. plastyczna', color: 'green', group: 'Część personalizowana', start: '2026-12-17', end: '2027-01-13', required: 20, duties: true,
        segments: [{ id: 'pers2-a', start: '2026-12-17', end: '2027-01-13', hospital: 'usk1-police', ward: 'Klinika Chirurgii Plastycznej, Endokrynologicznej i Ogólnej' }] },
      { id: 'pers3', name: 'Urologia', short: 'Urologia', color: 'green', group: 'Część personalizowana', start: '2027-01-14', end: '2027-02-03', required: 15, duties: true,
        segments: [{ id: 'pers3-a', start: '2027-01-14', end: '2027-02-03', hospital: 'arkonska', ward: 'Oddział Urologii Ogólnej i Onkologicznej' }] },
      { id: 'int', name: 'Choroby wewnętrzne', short: 'Interna', color: 'red', start: '2027-02-04', end: '2027-04-14', required: 50, duties: true },
      { id: 'anest', name: 'Intensywna terapia', short: 'Anestezjologia', color: 'wine', start: '2027-04-15', end: '2027-04-28', required: 10, duties: true },
      { id: 'rodz', name: 'Medycyna rodzinna', short: 'Med. rodzinna', color: 'yellow', start: '2027-04-29', end: '2027-06-09', required: 30, duties: false },
      { id: 'neo', name: 'Neonatologia', short: 'Noworodki', color: 'pink', start: '2027-06-10', end: '2027-06-23', required: 10, duties: true },
      { id: 'sor', name: 'Medycyna ratunkowa', short: 'Ratownictwo', color: 'gray', start: '2027-06-24', end: '2027-07-14', required: 15, duties: true },
      { id: 'ped', name: 'Pediatria', short: 'Pediatria', color: 'blue', start: '2027-07-15', end: '2027-08-25', required: 30, duties: true },
    ],
    // Kursy obowiązkowe z programu stażu (rozp. MZ 24.02.2023, zał. 1; poradnik OIL Szczecin 2026).
    // Terminy przydziela/ogłasza OIL Szczecin – zwykle ok. marca/kwietnia.
    courses: [
      { id: 'krew', name: 'Krwiodawstwo i krwiolecznictwo (transfuzjologia + bezpieczeństwo pacjenta)', days: 5, provider: 'RCKiK', mode: 'stacjonarnie', start: null, end: null },
      { id: 'onko', name: 'Profilaktyka onkologiczna', days: 1, provider: 'ZCO', mode: 'stacjonarnie', start: null, end: null },
      { id: 'bol', name: 'Leczenie bólu', days: 2, provider: 'ZCO', mode: 'stacjonarnie', start: null, end: null },
      { id: 'orzecz', name: 'Orzecznictwo lekarskie', days: 3, provider: 'OIL', mode: 'online', start: null, end: null },
      { id: 'prawo', name: 'Prawo medyczne', days: 4, provider: 'OIL', mode: 'online', start: null, end: null },
      { id: 'bioetyka', name: 'Bioetyka', days: 3, provider: 'OIL', mode: 'online', start: null, end: null },
      { id: 'zdrowie', name: 'Zdrowie publiczne', days: 3, provider: 'OIL', mode: 'online', start: null, end: null },
      { id: 'szczep', name: 'Profilaktyka szczepień ochronnych', days: 1, provider: 'OIL', mode: 'stacjonarnie', start: null, end: null },
      { id: 'komunik', name: 'Komunikacja z pacjentem i przeciwdziałanie wypaleniu', days: 3, provider: 'OIL', mode: 'stacjonarnie', start: null, end: null },
      { id: 'bls', name: 'BLS/ALS – czynności ratunkowe (organizuje szpital macierzysty, bez osobnego dnia)', days: 0, provider: 'USK2', mode: 'stacjonarnie', start: null, end: null },
    ],
    events: [],
    duties: [],
    notes: {},
    meta: { lastBackup: null, createdAt: null },
  };
}
