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
// CZEGO TU JESZCZE NIE MA, świadomie: `calendar`, `pipeline`, `people`
// i `renewals`. Każde z nich wchodzi razem ze swoim ekranem, w swojej fali —
// cel w nawigacji, który prowadzi donikąd, jest gablotą, a nie zapowiedzią.
//
// `history` też jeszcze stoi osobno, choć docelowo wsiąka w `library`: to jest
// SCALENIE TREŚCI (dokumenty + źródła + historia wrzutek), a nie przemianowanie,
// więc należy do fali Knowledge. Ta zmiana ma być czysto strukturalna
// i językowa — mieszanie w nią jednego prawdziwego scalenia zrobiłoby z niej
// zmianę, której nie da się przejrzeć.
//
// `settings` i `access` zostają powierzchniami (routing, preload i menu natywne
// ich potrzebują), ale bez grupy i bez skrótu numerycznego: w Ustawienia wchodzi
// się kołem zębatym przy nazwisku albo `⌘,`, a wejście podmienia lewą kolumnę.
export const desktopSurfaceRegistry = [
  {
    id: "today",
    label: "Today",
    icon: "cockpit",
    group: null,
    shortcut: 1,
    loading: "eager",
  },
  {
    id: "inbox",
    label: "Inbox",
    icon: "attention",
    group: null,
    shortcut: 2,
    loading: "eager",
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: "tasks",
    group: "Work Management",
    shortcut: 3,
    loading: "eager",
  },
  {
    id: "projects",
    label: "Projects",
    icon: "project",
    group: "Work Management",
    shortcut: 4,
    loading: "eager",
  },
  {
    id: "work",
    label: "Saved views",
    icon: "work",
    group: "Work Management",
    shortcut: 5,
    loading: "lazy",
  },
  {
    id: "organizations",
    label: "Organizations",
    icon: "relationships",
    group: "CRM",
    shortcut: 6,
    loading: "lazy",
  },
  {
    id: "meetings",
    label: "Meetings",
    icon: "meetings",
    group: "Knowledge",
    shortcut: 7,
    loading: "lazy",
  },
  {
    id: "library",
    label: "Library",
    icon: "documents",
    group: "Knowledge",
    shortcut: 8,
    loading: "lazy",
  },
  {
    id: "history",
    label: "Capture history",
    icon: "history",
    group: "Knowledge",
    shortcut: 9,
    loading: "eager",
  },
  {
    id: "activity",
    label: "Activity",
    icon: "activity",
    group: "Knowledge",
    shortcut: null,
    loading: "lazy",
  },
  {
    id: "access",
    label: "Access",
    icon: "access",
    group: null,
    shortcut: null,
    loading: "lazy",
  },
  {
    id: "settings",
    label: "Settings",
    icon: "settings",
    group: null,
    shortcut: null,
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
    // „Relacje" były jedną zakładką na cztery różne pytania; ekran klienta jest
    // z nich najbliższy temu, po co ludzie tam wchodzili.
    relationships: "organizations",
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
