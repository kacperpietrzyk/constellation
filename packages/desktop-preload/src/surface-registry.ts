// Cele nawigacji. Ten plik jest jednocześnie strukturą nawigacji i źródłem
// etykiet, dlatego nowa architektura informacji i przejście na angielski wchodzą
// JEDNĄ zmianą — rozbicie ich na dwa kroki gwarantowałoby kolizję w każdym
// pliku, który stąd czyta.
//
// Dwie pozycje dnia stoją NAD modułami i nie mają grupy: to nie są filtry, tylko
// tryby pracy. Reszta leży w modułach, żeby było widać, że aplikacja ma moduły —
// „Relationships" opisywało model danych, a nie robotę, więc jest teraz „CRM",
// a „Work" nazywa się „Work Management", bo leżą tam też zadania bez projektu.
//
// LISTA „CZEGO TU JESZCZE NIE MA" JEST PUSTA i dlatego znikła: `pipeline`,
// `people` i `renewals` weszły, każde razem ze swoim ekranem. Reguła, która ją
// trzymała, zostaje — cel w nawigacji, który prowadzi donikąd, jest gablotą,
// a nie zapowiedzią.
//
// CYFRY SĄ WYCZERPANE i to jest decyzja, nie awaria. Docelowy zbiór ma
// jedenaście celów, a klawiatura daje dziewięć skrótów, więc numeracja jest
// przypisana raz, do KSZTAŁTU DOCELOWEGO (Today 1 · Calendar 2 · Inbox 3 ·
// Tasks 4 · Projects 5 · Pipeline 6 · Organizations 7 · People 8 · Meetings 9),
// a nie do tego, co akurat istnieje. Dzięki temu żadna fala nie przenumerowuje
// skrótów pod ręką — cyfra raz zapamiętana zostaje przy swoim celu. Cele bez
// cyfry (Library, Renewals i to, co jeszcze nie wsiąkło) osiąga się paletą.
//
// `history` WSIĄKŁ w `library` w fali Knowledge i to było SCALENIE TREŚCI,
// a nie przemianowanie: rejestr wrzutek przyjechał w całości jako trzeci
// odczyt Biblioteki (Notatki │ Źródła │ Historia wrzutek). Grupa Knowledge ma
// od tej pory dwa nawigowalne wpisy zamiast trzech, a `history` stoi niżej
// w `retiredDesktopSurfaces`, bo niesie go KAŻDY zapisany stan powłoki
// z 0.1.9 i z każdego builda 0.2.0.
//
// `access` WSIĄKŁ w `settings` w fali Wycofań i to było — tak samo jak przy
// `history` — SCALENIE TREŚCI, nie przemianowanie: kategoria „Access and
// connections" trzymała swój identyfikator od dnia, w którym Ustawienia
// wsiadły, a jedyną kontrolką w niej był przycisk nawigujący na tę
// powierzchnię. Przycisk znikł, treść stoi za nim, a `access` stoi niżej
// w `retiredDesktopSurfaces`, bo niesie go KAŻDY zapisany stan powłoki
// z builda 0.2.0.
//
// `activity` WSIĄKŁ w `settings` w tej samej fali i z tego samego powodu co
// `access`: rejestr wrzutek systemu nie jest lekturą i nie jest modułem pracy,
// tylko odpowiedzią na pytanie „co się stało z moimi danymi i jak to cofnąć" —
// a to jest pytanie kategorii „Data and privacy". Biblioteka znaczy MATERIAŁ
// DO CZYTANIA, i wstawienie tam dziennika audytu przedefiniowałoby ją na
// „listy rzeczy". Tafla NIE DODAJE ŻADNEGO USTAWIENIA, więc odznaka kategorii
// się nie rusza — i to jest test na to, czy coś należy DO kategorii, czy ma
// nią BYĆ.
//
// `settings` zostaje powierzchnią (routing, preload i menu natywne jej
// potrzebują), ale bez grupy i bez skrótu numerycznego: w Ustawienia wchodzi
// się kołem zębatym przy nazwisku albo `⌘,`, a wejście podmienia lewą kolumnę.
// TO ZDANIE JEST OD TEJ FALI PRAWDZIWE — nośnikiem jest pole `chrome` przy
// wpisie niżej, a nie warunek u czytającego rejestr.
export const desktopSurfaceRegistry = [
  {
    // WPIS #31 REJESTRU. „Today" i „Calendar" niosły ten sam glif `cockpit`
    // (czterokomórkowa siatka) na dwóch sąsiednich wierszach nawigacji —
    // zmierzone na powiększeniu. Prototyp stawia tam zegar (`v3/app.js:15`,
    // `today`), a ten zestaw ma zegar od 2026-08-07.
    id: "today",
    label: "Today",
    icon: "clock",
    group: null,
    shortcut: 1,
    chrome: "navigation",
    loading: "eager",
  },
  {
    // Ten sam materiał co Today, w powiększeniu tygodniowym. Zakładka
    // najwyższego poziomu, nie układ w Zadaniach: planowanie tygodnia bez
    // spotkań nie istnieje, a układ jest soczewką nad JEDNĄ kolekcją.
    id: "calendar",
    label: "Calendar",
    icon: "calendar",
    group: null,
    shortcut: 2,
    chrome: "navigation",
    loading: "lazy",
  },
  {
    id: "inbox",
    label: "Inbox",
    icon: "attention",
    group: null,
    shortcut: 3,
    chrome: "navigation",
    loading: "eager",
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: "tasks",
    group: "Work Management",
    shortcut: 4,
    chrome: "navigation",
    loading: "eager",
  },
  {
    id: "projects",
    label: "Projects",
    icon: "project",
    group: "Work Management",
    shortcut: 5,
    chrome: "navigation",
    loading: "eager",
  },
  {
    // Lejek jako tablica. Cyfra 6 była zarezerwowana od przebudowy nawigacji
    // i nic się przez nią nie przenumerowuje — wpis wchodzi razem ze swoim
    // ekranem, bo cel prowadzący donikąd jest gablotą.
    id: "pipeline",
    label: "Pipeline",
    icon: "pipeline",
    group: "CRM",
    shortcut: 6,
    chrome: "navigation",
    loading: "lazy",
  },
  {
    // WPIS #24 REJESTRU: cel nosił `relationships` — dwie sylwetki, czyli to
    // samo, co stojące pod nim „People". Glif `organization` jest budynkiem
    // z prototypu (`v3/app.js:19`).
    id: "organizations",
    label: "Organizations",
    icon: "organization",
    group: "CRM",
    shortcut: 7,
    chrome: "navigation",
    loading: "lazy",
  },
  {
    // Ludzie z grafu, nie użytkownicy aplikacji. Cyfra 8 była zarezerwowana od
    // przebudowy nawigacji i nic się przez nią nie przenumerowuje.
    id: "people",
    label: "People",
    icon: "people",
    group: "CRM",
    shortcut: 8,
    chrome: "navigation",
    loading: "lazy",
  },
  {
    // Kontrakty do odnowienia. Bez cyfry i to jest decyzja, nie przeoczenie:
    // dziewięć skrótów jest przypisanych do kształtu docelowego, 6 i 8 należą
    // do Pipeline i People, a Renewals osiąga się paletą — tak samo jak
    // Library. Cel bez cyfry i tak stoi w nawigacji.
    id: "renewals",
    label: "Renewals",
    icon: "renewals",
    group: "CRM",
    shortcut: null,
    chrome: "navigation",
    loading: "lazy",
  },
  {
    id: "meetings",
    label: "Meetings",
    icon: "meetings",
    group: "Knowledge",
    shortcut: 9,
    chrome: "navigation",
    loading: "lazy",
  },
  {
    id: "library",
    label: "Library",
    icon: "documents",
    group: "Knowledge",
    shortcut: null,
    chrome: "navigation",
    loading: "lazy",
  },
  {
    id: "settings",
    label: "Settings",
    icon: "settings",
    group: null,
    shortcut: null,
    // JEDYNY wpis, który NIE rysuje się w lewej kolumnie. Powód, dla którego
    // to jest POLE, a nie warunek u czytającego: przez dwie fale stał
    // w `RealApp.tsx` filtr `shortcut !== null`, który miał tu odsiać
    // Ustawienia i NIE ODSIEWAŁ NICZEGO — `nav-items.ts` opuszcza klucz
    // zamiast ustawiać `null`, więc `undefined !== null` jest prawdą.
    // Filtr oparty na zbieżności („bez grupy I bez cyfry") powtórzyłby ten
    // sam błąd w nowym przebraniu. Z polem czternasty wpis rejestru NIE MA
    // JAK się skompilować, dopóki ktoś nie powie, którymi drzwiami się w niego
    // wchodzi.
    chrome: "mode",
    loading: "lazy",
  },
] as const;

export type DesktopSurfaceDescriptor = (typeof desktopSurfaceRegistry)[number];
export type DesktopSurface = DesktopSurfaceDescriptor["id"];
export type LazyDesktopSurface = Extract<
  DesktopSurfaceDescriptor,
  { readonly loading: "lazy" }
>["id"];
export type DesktopNavigationGroup = Exclude<
  DesktopSurfaceDescriptor["group"],
  null
>;

export const desktopSurfaceIds: readonly DesktopSurface[] =
  desktopSurfaceRegistry.map((surface) => surface.id);

export const isDesktopSurface = (value: unknown): value is DesktopSurface =>
  typeof value === "string" &&
  desktopSurfaceIds.includes(value as DesktopSurface);

// Cele, które RYSUJĄ SIĘ W LEWEJ KOLUMNIE. Wyprowadzone z pola `chrome`, żeby
// reguła stała w JEDNYM miejscu: powłoka, test renderu powłoki i smoke
// spakowanej apki iterują po tej nazwie, a nie po trzech kopiach tego samego
// warunku. Przepisany kształt w dwóch miejscach jest w tym repo nazwaną klasą
// defektu i ta lista już raz do niej należała.
export const desktopNavigationSurfaceIds: readonly DesktopSurface[] =
  desktopSurfaceRegistry
    .filter((surface) => surface.chrome === "navigation")
    .map((surface) => surface.id);

// Kolejność modułów jest decyzją projektową, nie kolejnością wystąpień w tablicy.
export const desktopNavigationModules: readonly DesktopNavigationGroup[] = [
  "Work Management",
  "CRM",
  "Knowledge",
];

// Cele, które zniknęły w przebudowie 0.2.0, i ich następcy. Zapisany stan
// powłoki niesie identyfikator powierzchni w KAŻDEJ zakładce, a odczepione okno
// dostaje go w `?destination=`. Bez tej mapy pierwsze uruchomienie po
// aktualizacji pokazuje zakładki wskazujące w nicość — a to jest pierwsza rzecz,
// jaką człowiek zobaczy po podniesieniu wersji.
export const retiredDesktopSurfaces: Readonly<Record<string, DesktopSurface>> =
  {
    cockpit: "today",
    attention: "inbox",
    documents: "library",
    // Historia wrzutek jest teraz odczytem Biblioteki. Wpis jest tu, bo
    // `history` STAŁ W WYDANYM 0.1.9: niesie go zapisana sesja, ulubiona
    // pozycja i `?destination=` odczepionego okna. Bez niego pierwsza zakładka
    // z tym identyfikatorem odrzuca CAŁĄ zapisaną sesję — bez awarii, więc bez
    // śladu.
    history: "library",
    // „Relacje" były jedną zakładką na cztery różne pytania; ekran klienta jest
    // z nich najbliższy temu, po co ludzie tam wchodzili.
    relationships: "organizations",
    // Zarządzanie dostępem jest dziś sekcją Ustawień. Wpis jest OBOWIĄZKOWY,
    // a nie kosmetyczny: `retiredDesktopSurfaces` jest kluczowana `string`iem,
    // więc jego brak przechodzi `tsc` bez słowa, a przy pierwszym starcie po
    // aktualizacji pierwsza zakładka `access` odrzuca CAŁĄ zapisaną sesję —
    // każdą zakładkę, ulubioną pozycję i całą historię — bez awarii, więc bez
    // śladu.
    access: "settings",
    // Rejestr wrzutek systemu — co się zmieniło i jak to cofnąć — jest dziś
    // taflą w kategorii „Data and privacy". Wpis jest OBOWIĄZKOWY z dokładnie
    // tego samego powodu co `access` wyżej, i jest DRUGIM, który wskazuje na
    // `settings`: pierwszy raz w tym repo dwa wycofane identyfikatory schodzą
    // się na JEDEN cel, więc odtwarzanie zakładek musi je scalić, a nie
    // odtworzyć dwie zakładki o tym samym kluczu.
    activity: "settings",
    // „Zapisane widoki" były osobnym ekranem nad tą samą kolekcją co Zadania.
    // Zapisany widok otwiera się dziś NA Zadaniach — to ta sama praca, oglądana
    // przez soczewkę — więc zakładka wskazująca tam ma dokąd trafić.
    work: "tasks",
  };

// Cel wskazany identyfikatorem, który mógł pochodzić z poprzedniej wersji.
// Zwraca `undefined`, gdy nie da się go umiejscowić — wołający decyduje, czy to
// znaczy „odrzuć zakładkę", czy „wróć na start". Zgadywanie jest tu gorsze niż
// odmowa: zakładka otwarta na losowym ekranie wygląda jak utrata pracy.
export const resolveDesktopSurface = (
  value: unknown,
): DesktopSurface | undefined => {
  if (typeof value !== "string") return undefined;
  if (isDesktopSurface(value)) return value;
  return retiredDesktopSurfaces[value];
};

// Etykieta celu, wyprowadzona z rejestru. Zapisany stan powłoki niesie WŁASNĄ
// kopię etykiety sprzed aktualizacji, więc bez tego zakładka przeniesiona
// z `cockpit` na `today` otwierałaby się z napisem „Tydzień" — nawigacja po
// angielsku i zakładki po polsku, w tym samym oknie.
const labelsBySurface: Readonly<Record<DesktopSurface, string>> =
  Object.fromEntries(
    desktopSurfaceRegistry.map((surface) => [surface.id, surface.label]),
  ) as Record<DesktopSurface, string>;

export const desktopSurfaceLabel = (surface: DesktopSurface): string =>
  labelsBySurface[surface];
