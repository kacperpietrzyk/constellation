import type {
  DocumentId,
  ProjectId,
  StrategicRecordId,
  TaskId,
} from "@constellation/contracts";

import {
  desktopNavigationSurfaceIds,
  desktopSurfaceIds,
  desktopSurfaceLabel,
  resolveDesktopSurface,
  type DesktopSurface as SurfaceId,
} from "@constellation/desktop-preload/surface-registry";

import {
  settingsCategories,
  type SettingsCategoryId,
} from "../settings-categories.js";

const MAX_TABS = 7;

const settingsCategoryIds: readonly string[] = settingsCategories.map(
  ({ id }) => id,
);

const isSettingsCategory = (value: unknown): value is SettingsCategoryId =>
  typeof value === "string" && settingsCategoryIds.includes(value);

// TRZY EKRANY WIEDZY. Nazwa `LibraryReading` jest starsza niż to, czym te trzy
// rzeczy są dzisiaj, i zostaje ŚWIADOMIE — od lotu D3 nie są to „odczyty
// jednego celu", tylko trzy pozycje nawigacji (decyzja Kacpra z 2026-08-15,
// wpisy 11-1 i C-1 rejestru przejścia). Poprzednia wersja tej noty powoływała
// się na decyzję D-1 fali Knowledge i na segmentowany przełącznik prototypu
// (`v3/app.js:1371-1374`) — tamten przełącznik siedzi na ekranie, do którego
// w prototypie NIE PROWADZI żadna pozycja nawigacji, i to jest pomiar, który
// odwrócił tamtą decyzję.
//
// SŁOWNIK ZOSTAJE PRZY ŻYCIU Z DWÓCH POWODÓW, oba bieżące: niesie etykiety
// trzech ekranów (`library-readings.ts`, a przez nie `h1` w paśmie) i jest
// jedynym walidatorem pola `libraryReading` w ZAPISANYM STANIE sprzed tego
// lotu. Identyfikatory odczytów są dokładnie identyfikatorami trzech nowych
// powierzchni, i to nie jest zbieg okoliczności — na tej równości stoi migracja
// zakładek w `migrateRestoredContext`.
//
// Słownik stoi TUTAJ, a nie w `src/library/`, i to jest decyzja ZMIERZONA:
// powłoka nawigacji leży na ścieżce gorącej, więc import z leniwego katalogu
// Biblioteki kazał rolldownowi wydzielić z chunka wejściowego wspólny chunk
// preładowany. Zmierzone: ścieżka gorąca spadła o 3 177 B surowych, a URosła
// o 606 B po gzipie — bo dwadzieścia jeden chunków kompresuje się gorzej niż
// dwadzieścia. Kierunek zależności idzie więc od Biblioteki do powłoki i nigdy
// odwrotnie.
export const libraryReadings = ["notes", "sources", "captures"] as const;

export type LibraryReading = (typeof libraryReadings)[number];

export const isLibraryReading = (value: unknown): value is LibraryReading =>
  typeof value === "string" &&
  (libraryReadings as readonly string[]).includes(value);

const MAX_HISTORY = 32;

export interface ShellContext {
  readonly key: string;
  readonly label: string;
  readonly surface: SurfaceId;
  readonly taskId?: TaskId;
  readonly projectId?: ProjectId;
  readonly documentId?: DocumentId;
  readonly organizationId?: StrategicRecordId;
  /** The deal opened AS A RECORD. No `record` flag beside it, and the absence is
   *  the design: a task context is built at eleven call sites that mostly mean
   *  "take me to this task", so the promotion there has to be asked for. Every
   *  opportunity context in this program is built by somebody who means the
   *  record — the board holds a merely-SELECTED deal in the inspector instead,
   *  and never in a context. So carrying the id IS the request, and a second
   *  boolean would only be a way to build a context that asks for nothing. */
  readonly opportunityId?: StrategicRecordId;
  /** Set when the context was opened AS A RECORD rather than merely navigated
   *  to. See `taskContext` for why the promotion has to be asked for. */
  readonly record?: boolean;
  /** POLE TYLKO DO ODCZYTU ZAPISANEGO STANU — od lotu D3 nic go już nie pisze.
   *
   *  Znaczyło „który odczyt Biblioteki ma się otworzyć", kiedy Biblioteka była
   *  jednym celem o trzech odczytach: wrzutka głosowa i wrzutka otwarta
   *  z Inboxa musiały poprosić o Historię wrzutek, bo samo
   *  `surface: "library"` kompilowało się i wysyłało człowieka na Notatki.
   *  Dziś proszą o powierzchnię `captures` wprost, więc pytanie nie ma jak
   *  zostać niezadane.
   *
   *  ZOSTAJE, BO ZAPIS ZOSTAJE. Każdy build 0.2.0 zapisywał to pole do
   *  `localStorage`, a `migrateRestoredContext` jest jedynym miejscem, które
   *  potrafi z niego odtworzyć, KTÓRY z trzech nowych ekranów był otwarty —
   *  mapa wycofań widzi sam identyfikator powierzchni i umie odpowiedzieć
   *  tylko „Notatki". Skasowanie pola razem z funkcją, która je pisała,
   *  przeniosłoby po cichu każdą zapisaną zakładkę Źródeł i Historii wrzutek
   *  na Notatki.
   *
   *  Nie wymagało podbicia `NAVIGATION_STATE_VERSION`, gdy wchodziło, i nie
   *  wymaga go teraz, gdy przestaje być pisane: walidacja nie odrzuca
   *  nadmiarowych kluczy, a jego brak był legalny od pierwszego dnia. */
  readonly libraryReading?: LibraryReading;
  /** Która KATEGORIA Ustawień ma być na wierzchu po otwarciu.
   *
   *  Ustawienia są jednym celem o sześciu kategoriach — dokładnie ta sama
   *  relacja co Biblioteka i jej trzy odczyty, więc pole siedzi tu, a nie
   *  w stanie powłoki, i z tego samego powodu: zakładka ma się otworzyć jako
   *  to, czym była.
   *
   *  Bez tego pola głębokiego linku po prostu NIE MA: `openSettings` buduje
   *  goły `destinationContext("settings", …)`, a kategorię wybiera wewnętrzny
   *  stan ekranu. Cofnięcie potwierdzone w oknie dialogowym i cel palety
   *  „Activity" potrzebują obie tej samej rzeczy, więc jest to jeden mechanizm
   *  na dwie potrzeby, a nie nowa powierzchnia.
   *
   *  Nie wymaga podbicia `NAVIGATION_STATE_VERSION` z tego samego powodu co
   *  `libraryReading`: zapis bez tego pola czyta się dalej, a ten z nim czyta
   *  starsza wersja, bo walidacja nie odrzuca nadmiarowych kluczy. */
  readonly settingsCategory?: SettingsCategoryId;
  /** Który ZAPISANY WIDOK Zadań ma być otwarty po wejściu.
   *
   *  Ta sama relacja co przy Bibliotece i jej trzech odczytach: Zadania są
   *  jednym celem o wielu zapisanych widokach, więc pole siedzi na kontekście,
   *  a nie w stanie powłoki — drugi poziom lewej kolumny musi umieć POWIEDZIEĆ,
   *  który widok otwiera, a nie tylko zaprowadzić na ekran, gdzie czytelnik
   *  wybierze go drugi raz sam.
   *
   *  Identyfikator jest tu zwykłym napisem, a nie znakowanym typem, i to jest
   *  ta sama decyzja co przy `taskId`/`projectId` wyżej: kontekst przeżywa
   *  serializację, więc walidacja przy odczycie i tak sprawdza NAPIS. Widok
   *  skasowany między sesjami nie zwraca nic i ekran otwiera się na „All work"
   *  — to jest ta sama degradacja co przy `activeViewId` wybranym z listy.
   *
   *  Nie wymaga podbicia `NAVIGATION_STATE_VERSION` z tego samego powodu co
   *  `libraryReading` i `settingsCategory`. */
  readonly savedViewId?: string;
}

// Wpisy historii pochodzące z nawigacji w obrębie jednej karty niosą marker
// inCard: tylko takie wpisy wolno z powrotem zmaterializować w aktywnej
// karcie. Wpisy dopisane przy otwieraniu, przełączaniu i zamykaniu kart są
// pomijane, gdy ich karta nie jest już otwarta — Wstecz nie podmienia wtedy
// cudzej karty.
export interface ShellHistoryEntry extends ShellContext {
  readonly inCard?: boolean;
}

export interface ShellNavigationState {
  readonly tabs: readonly ShellContext[];
  readonly activeKey: string;
  readonly history: readonly ShellHistoryEntry[];
  readonly historyIndex: number;
}

export interface ShellOpenOutcome {
  readonly state: ShellNavigationState;
  readonly evictedContext?: ShellContext;
}

const RESTORABLE_SURFACES = new Set<SurfaceId>(desktopSurfaceIds);

const isRestorableShellContext = (value: unknown): value is ShellContext => {
  if (typeof value !== "object" || value === null) return false;
  const context = value as ShellContext;
  if (typeof context.key !== "string" || typeof context.label !== "string")
    return false;
  if (!RESTORABLE_SURFACES.has(context.surface)) return false;
  if (context.taskId !== undefined && typeof context.taskId !== "string")
    return false;
  if (context.record !== undefined && typeof context.record !== "boolean")
    return false;
  if (context.projectId !== undefined && typeof context.projectId !== "string")
    return false;
  if (
    context.documentId !== undefined &&
    typeof context.documentId !== "string"
  )
    return false;
  if (
    context.organizationId !== undefined &&
    typeof context.organizationId !== "string"
  )
    return false;
  if (
    context.opportunityId !== undefined &&
    typeof context.opportunityId !== "string"
  )
    return false;
  // Odczyt spoza słownika odrzuca CAŁY zapis, tak samo jak nieznana
  // powierzchnia: napis, którego powłoka nie zna, wpadłby do przełącznika
  // i nie wyrenderował żadnego z trzech odczytów.
  if (
    context.libraryReading !== undefined &&
    !isLibraryReading(context.libraryReading)
  )
    return false;
  // Kategoria spoza słownika odrzuca CAŁY zapis, tak samo jak odczyt
  // Biblioteki: ekran Ustawień przewijałby do identyfikatora, którego nie ma,
  // i otwierał się na kategorii wybranej po cichu przez własny stan.
  if (
    context.settingsCategory !== undefined &&
    !isSettingsCategory(context.settingsCategory)
  )
    return false;
  // Identyfikator widoku nie ma słownika, więc sprawdzany jest KSZTAŁT — tak
  // samo jak przy identyfikatorach rekordów wyżej. Widok, którego już nie ma,
  // nie unieważnia zapisu: ekran otwiera się wtedy na „All work".
  if (
    context.savedViewId !== undefined &&
    typeof context.savedViewId !== "string"
  )
    return false;
  // Prefiks klucza musi być spójny z obecnością identyfikatora — inaczej
  // wpis nigdy nie zostałby przycięty przez pruneInaccessibleShellContexts.
  if (context.key.startsWith("task:") && context.taskId === undefined)
    return false;
  if (context.key.startsWith("project:") && context.projectId === undefined)
    return false;
  if (context.key.startsWith("document:") && context.documentId === undefined)
    return false;
  if (
    context.key.startsWith("organization:") &&
    context.organizationId === undefined
  )
    return false;
  if (
    context.key.startsWith("opportunity:") &&
    context.opportunityId === undefined
  )
    return false;
  return true;
};

// Wersja 3 przyszła z przebudową 0.2.0: osiem identyfikatorów powierzchni
// zmieniło nazwę. Zapis idzie już w nowej wersji, ODCZYT przyjmuje obie —
// stan zapisany przez 0.1.9 ma się otworzyć, a nie wyparować.
const NAVIGATION_STATE_VERSION = 3;

export const serializeShellNavigation = (state: ShellNavigationState): string =>
  JSON.stringify({ version: NAVIGATION_STATE_VERSION, state });

// Kontekst zapisany pod starym identyfikatorem celu, przeniesiony na nowy.
// Cel, którego nie da się umiejscowić, zostaje nietknięty — odsiewa go dopiero
// `isRestorableShellContext`, a wołający traktuje to jako „nie ufam całemu
// zapisowi" i wraca na start. To jest świadomie mocniejsze niż wyrzucenie
// pojedynczej zakładki: zapis, którego połowy nie rozumiemy, mógł zostać
// napisany przez wersję, o której nic nie wiemy.
//
// Etykieta zakładki-celu jest odczytywana Z REJESTRU, a nie z zapisu. Zapis
// niesie własną kopię napisu sprzed aktualizacji, więc bez tego pierwsze
// uruchomienie po przebudowie pokazywałoby angielską nawigację i polskie
// zakładki naraz. Zakładki rekordów (`task:`, `project:`, …) zachowują swój
// tytuł — tam napis to nazwa cudzej pracy, nie etykieta interfejsu.
// ROZDZIAŁ JEDNEJ ZAPISANEJ ZAKŁADKI NA TRZY CELE (lot D3) — i to jest jedyne
// miejsce, w którym da się go zrobić.
//
// `resolveDesktopSurface` widzi WYŁĄCZNIE identyfikator powierzchni, więc na
// pytanie „czym jest zapisany `library`" umie odpowiedzieć tylko `notes`. Ale
// zakładka zapisana przez build 0.2.0 niesie obok niego pole `libraryReading`
// z odczytem, który był na wierzchu — i dla `sources` oraz `captures` wynik
// z samej mapy byłby CICHYM przeniesieniem czytelnika na inny ekran niż ten,
// który zamknął. Kontekst w całości widać dopiero tutaj, więc tutaj mieszka
// pierwszeństwo: odczyt bije mapę wycofań, a mapa odpowiada, gdy pola nie ma
// albo jest nierozpoznawalne.
//
// KIERUNEK NIE JEST SYMETRYCZNY i to nie jest przeoczenie: pole czyta się
// wyłącznie wtedy, gdy zapisana powierzchnia to `library`. Zapis z
// `surface: "sources"` i `libraryReading: "notes"` nie powstaje w tej wersji
// i nie powstawał w żadnej poprzedniej — czytanie go dawałoby regułę
// pilnującą stanu, którego nikt nie zapisuje.
const migrateRestoredContext = (value: unknown): unknown => {
  if (typeof value !== "object" || value === null) return value;
  const context = value as {
    readonly surface?: unknown;
    readonly key?: unknown;
    readonly libraryReading?: unknown;
  };
  const resolved =
    context.surface === "library" && isLibraryReading(context.libraryReading)
      ? context.libraryReading
      : resolveDesktopSurface(context.surface);
  if (resolved === undefined) return value;
  const isDestination =
    typeof context.key === "string" && context.key.startsWith("destination:");
  if (!isDestination) {
    return resolved === context.surface
      ? value
      : { ...context, surface: resolved };
  }
  // KLUCZ IDZIE Z `resolved`, A NIE Z `migrateContextKey` NA STARYM KLUCZU,
  // i to jest cała różnica po locie D3. Tamta funkcja rozwiązuje SAM NAPIS
  // klucza, więc dla zapisanej zakładki Historii wrzutek dałaby
  // `destination:notes` (bo `library → notes`) przy powierzchni `captures`:
  // zakładka pokazywałaby jeden ekran pod kluczem drugiego, a otwarcie Notatek
  // podmieniłoby ją zamiast otworzyć nową. Zgodność klucza z powierzchnią jest
  // tu niezmiennikiem, nie zbieżnością — `openShellContext` porównuje właśnie
  // klucze.
  return {
    ...context,
    key: `destination:${resolved}`,
    surface: resolved,
    label: desktopSurfaceLabel(resolved),
  };
};

// Klucz zakładki-celu niesie identyfikator powierzchni, więc przeniesienie
// celu MUSI przenieść też klucz — inaczej zapisany `activeKey` nie wskazuje
// żadnej z odtworzonych zakładek i cała sesja jest odrzucana. Drugi powód:
// zakładka zostawiona pod starym kluczem zdublowałaby się, gdy człowiek otworzy
// ten sam cel jeszcze raz.
const migrateContextKey = (key: string): string => {
  if (!key.startsWith("destination:")) return key;
  const resolved = resolveDesktopSurface(key.slice("destination:".length));
  return resolved === undefined ? key : `destination:${resolved}`;
};

export const restoreShellNavigation = (
  value: string | null,
  fallback: ShellContext,
): ShellNavigationState => {
  if (value === null) return createShellNavigation(fallback);
  try {
    const parsed = JSON.parse(value) as {
      readonly version?: unknown;
      readonly state?: Partial<ShellNavigationState>;
    };
    const state = parsed.state;
    if (
      (parsed.version !== 2 && parsed.version !== NAVIGATION_STATE_VERSION) ||
      state === undefined ||
      !Array.isArray(state.tabs) ||
      state.tabs.length === 0 ||
      state.tabs.length > MAX_TABS ||
      typeof state.activeKey !== "string" ||
      !Array.isArray(state.history) ||
      typeof state.historyIndex !== "number"
    )
      return createShellNavigation(fallback);
    const migrated = state.tabs
      .map(migrateRestoredContext)
      .filter(isRestorableShellContext);
    if (migrated.length !== state.tabs.length)
      return createShellNavigation(fallback);
    // SCALENIE DUBLI, I KOLEJNOŚĆ TYCH DWÓCH LINII JEST CAŁĄ POPRAWKĄ.
    //
    // `access` i `activity` są PIERWSZYM przypadkiem w historii tego repo,
    // w którym DWA wycofane identyfikatory schodzą się na JEDEN cel. Sesja
    // z obiema zakładkami otwartymi odtwarzała dwie zakładki o identycznym
    // kluczu `destination:settings`: dwa identyczne `key` Reacta w pasku,
    // `activeKey` pasujący do obu i zamykanie, które nie umie ich rozróżnić.
    // Nic nie rzucało. Wcześniejsze wycofania (`cockpit`, `attention`,
    // `documents`, `history`, `relationships`, `work`) trafiały każde
    // w INNY cel, więc przypadek nigdy nie był ćwiczony.
    //
    // Scalenie MUSI stać PO bramce długości wyżej, nie przed nią — bramka
    // czyta „mniej zakładek niż w zapisie" jako „zapisu nie rozumiem"
    // i odrzuca CAŁĄ sesję. Dedup wpięty tam, gdzie czyta się najnaturalniej,
    // wywołałby dokładnie tę awarię, przed którą ten lot broni.
    //
    // ZOSTAJE PIERWSZA. Zakładki-cele nie niosą stanu poza etykietą, którą
    // `migrateRestoredContext` i tak czyta z rejestru, więc „pierwsza" znaczy
    // „ta, którą człowiek otworzył wcześniej" i nic się nie gubi.
    // HISTORIA NIE JEST SCALANA, świadomie: powtórzony klucz jest tam
    // NORMALNY — `appendHistory` skleja tylko sąsiadujące wpisy, więc dwa
    // odwiedzenia tego samego celu z czymś pomiędzy to prawidłowy łańcuch,
    // a nie dubel.
    const tabs = migrated.filter(
      (tab, index) =>
        migrated.findIndex((other) => other.key === tab.key) === index,
    );
    // AKTYWNY KLUCZ BIERZE SIĘ Z ZAKŁADKI, KTÓRA GO NIOSŁA, a nie z drugiego
    // przeliczenia samego napisu — i to jest różnica, którą wymusił rozdział
    // Biblioteki na trzy cele (lot D3). Napis `destination:library` rozwiązuje
    // się do `destination:notes`, więc sesja, w której na wierzchu stały
    // Źródła albo Historia wrzutek, miała po aktualizacji `activeKey`
    // niepasujący do ŻADNEJ odtworzonej zakładki — a wtedy warunek niżej
    // odrzuca CAŁĄ sesję: każdą zakładkę i całą historię, bez błędu i bez
    // śladu. Ta sama rodzina awarii, co brak wpisu w `retiredDesktopSurfaces`,
    // i wcześniej nie mogła wystąpić, bo żadne wycofanie nie rozdzielało
    // jednego identyfikatora na kilka.
    //
    // `migrated` jest INDEKSOWO ZGODNE z `state.tabs` — bramka długości wyżej
    // zwraca wcześniej, gdy którakolwiek zakładka odpadła — więc indeks
    // zapisanej zakładki jest legalnym adresem w zmigrowanej tablicy.
    // `migrateContextKey` zostaje jako gałąź awaryjna: `activeKey` wskazujący
    // na nic nie jest tu nowym przypadkiem i dalej odrzuca sesję niżej.
    const savedActiveIndex = state.tabs.findIndex(
      (tab) => (tab as { readonly key?: unknown }).key === state.activeKey,
    );
    const activeKey =
      savedActiveIndex >= 0
        ? (tabs.find((tab) => tab.key === migrated[savedActiveIndex]?.key)
            ?.key ?? migrateContextKey(state.activeKey))
        : migrateContextKey(state.activeKey);
    if (!tabs.some((tab) => tab.key === activeKey))
      return createShellNavigation(fallback);
    const history = state.history
      .map(migrateRestoredContext)
      .filter(isRestorableShellContext);
    if (history.length !== state.history.length || history.length === 0)
      return createShellNavigation(fallback);
    // Indeks klamrowany PO przycięciu historii i skorygowany o wpisy odcięte
    // z przodu — inaczej przerośnięta historia zostawia indeks poza zakresem.
    const bounded = history.slice(-MAX_HISTORY);
    const dropped = history.length - bounded.length;
    return {
      tabs,
      activeKey,
      history: bounded,
      historyIndex: Math.min(
        Math.max(0, Math.trunc(state.historyIndex) - dropped),
        bounded.length - 1,
      ),
    };
  } catch {
    return createShellNavigation(fallback);
  }
};

// Przypięcia, gdy zapis pochodzi sprzed przebudowy. Stan URZĄDZENIA, nie stan
// grafu — leży w `localStorage`, nie w danych — więc naprawa należy TUTAJ,
// tam gdzie się go odtwarza, a nie w domenie i nie przy rysowaniu szyny.
//
// TRZY REGUŁY, W TEJ KOLEJNOŚCI, I KOLEJNOŚĆ JEST CAŁĄ POPRAWKĄ.
//
// 1. Najpierw WYCOFANE IDENTYFIKATORY. Przypięcie do `history` ma przejść na
//    `library`, tak samo jak zakładka — inaczej pierwsze uruchomienie po
//    aktualizacji ma o jedną pinezkę mniej niż wczoraj, bez błędu i bez śladu.
// 2. Potem CHROME. Przypiąć da się tylko cel, który RYSUJE SIĘ W LEWEJ
//    KOLUMNIE, bo gwiazdka odpinająca stoi przy pozycji nawigacji i nigdzie
//    indziej. Ustawienia przestały być pozycją nawigacji w tej fali, więc
//    przypięcie zapisane wcześniej zostawało w szynie NA ZAWSZE: rysowało się,
//    a odpiąć go nie było czym. Ta sama rodzina co `retiredDesktopSurfaces` —
//    ZAPISANY STAN URZĄDZENIA WSKAZUJĄCY NA COŚ, CO PRZESTAŁO BYĆ CELEM.
//    Reguła jest WYPROWADZONA z pola `chrome` przez `desktopNavigationSurfaceIds`
//    — to ta sama jedna nazwa, po której iteruje powłoka, test renderu powłoki
//    i smoke spakowanej apki. Lista „czego nie wolno przypiąć" byłaby
//    dwudziestym piątym miejscem ręcznie przepisanego zbioru obok zamkniętego
//    słownika i rozjechałaby się przy pierwszym następnym wycofaniu.
// 3. Na końcu DUBLE, bo dwa wycofane identyfikatory mogą wskazywać jeden cel.
//
// Odwrotna kolejność 1↔2 też przechodzi test z Ustawieniami — i jest błędna:
// odsiewa `access` dlatego, że nie ma go w rejestrze, a nie dlatego, że jego
// następca jest trybem. Dowodzi tego przypięcie do `history`, które PRZEŻYWA.
//
// Naprawa jest TRWAŁA, a nie kosmetyczna: `RealApp` zapisuje ten wynik z
// powrotem do `localStorage` przy pierwszym renderze, więc zablokowana pinezka
// znika z dysku, zamiast być co uruchomienie chowana przed rysowaniem.
const DEFAULT_FAVORITE_SURFACES: readonly SurfaceId[] = ["today", "tasks"];

const FAVORITABLE_SURFACES = new Set<SurfaceId>(desktopNavigationSurfaceIds);

export const restoreFavoriteSurfaces = (
  value: string | null,
): readonly SurfaceId[] => {
  try {
    const parsed = JSON.parse(value ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_FAVORITE_SURFACES;
    return [
      ...new Set(
        parsed.flatMap((item) => {
          const resolved = resolveDesktopSurface(item);
          return resolved !== undefined && FAVORITABLE_SURFACES.has(resolved)
            ? [resolved]
            : [];
        }),
      ),
    ];
  } catch {
    return DEFAULT_FAVORITE_SURFACES;
  }
};

export const pruneInaccessibleShellContexts = (
  state: ShellNavigationState,
  access: {
    readonly taskIds: ReadonlySet<TaskId>;
    readonly projectIds: ReadonlySet<ProjectId>;
    readonly documentIds: ReadonlySet<DocumentId>;
    readonly organizationIds: ReadonlySet<StrategicRecordId>;
    readonly opportunityIds: ReadonlySet<StrategicRecordId>;
  },
  fallback: ShellContext,
): ShellNavigationState => {
  const accessible = (context: ShellContext): boolean =>
    (context.taskId === undefined || access.taskIds.has(context.taskId)) &&
    (context.projectId === undefined ||
      access.projectIds.has(context.projectId)) &&
    (context.documentId === undefined ||
      access.documentIds.has(context.documentId)) &&
    (context.organizationId === undefined ||
      access.organizationIds.has(context.organizationId)) &&
    // A deal removed, or in a Space this reader lost, must not leave a tab that
    // reopens onto a record nothing can find. The record screen's own gate is
    // "the surface found it"; this is the gate for the tab that outlived it.
    (context.opportunityId === undefined ||
      access.opportunityIds.has(context.opportunityId));
  const tabs = state.tabs.filter(accessible);
  if (tabs.length === 0) return createShellNavigation(fallback);
  const activeKey = tabs.some((tab) => tab.key === state.activeKey)
    ? state.activeKey
    : tabs[0]!.key;
  const active = tabs.find((tab) => tab.key === activeKey)!;
  let history = state.history.filter(accessible);
  let historyIndex = Math.min(state.historyIndex, history.length - 1);
  if (history.length === 0) {
    history = [active];
    historyIndex = 0;
  } else if (history[historyIndex]!.key !== activeKey) {
    history = [...history.slice(0, historyIndex + 1), active];
    historyIndex = history.length - 1;
  }
  if (
    tabs.length === state.tabs.length &&
    history.length === state.history.length &&
    activeKey === state.activeKey &&
    historyIndex === state.historyIndex
  ) {
    return state;
  }
  return { tabs, activeKey, history, historyIndex };
};

export const destinationContext = (
  surface: SurfaceId,
  label: string,
): ShellContext => ({ key: `destination:${surface}`, label, surface });

/**
 * Biblioteka otwarta NA KONKRETNYM ODCZYCIE.
 *
 * Klucz jest ten sam co u zwykłego celu (`destination:library`), i to jest
 * zamierzone: Biblioteka to jeden cel, więc otwarcie jej z inną etykietą
 * podmienia tę samą zakładkę, zamiast robić drugą pod tym samym ekranem.
 * `openShellContextReportingEviction` podmienia istniejącą zakładkę CAŁYM
 * nowym kontekstem, więc żądany odczyt dojeżdża także wtedy, gdy Biblioteka
 * jest już otwarta.
 */
/**
 * Ustawienia otwarte NA KONKRETNEJ KATEGORII.
 *
 * Klucz jest ten sam co u zwykłego celu (`destination:settings`), i to jest
 * zamierzone — dokładnie jak przy {@link libraryReadingContext}: Ustawienia to
 * jeden cel, więc otwarcie ich na innej kategorii podmienia tę samą zakładkę,
 * zamiast robić drugą pod tym samym ekranem.
 *
 * ETYKIETA ZOSTAJE „Settings", a nie nazwa kategorii, i to jest decyzja:
 * `migrateRestoredContext` czyta etykietę zakładki-celu Z REJESTRU, więc
 * kategoria w napisie i tak nie przeżyłaby zapisania sesji — a zakładka, która
 * po restarcie zmienia nazwę, wygląda jak utrata miejsca, w którym się było.
 */
export const settingsCategoryContext = (
  category: SettingsCategoryId,
): ShellContext => ({
  key: "destination:settings",
  label: desktopSurfaceLabel("settings"),
  surface: "settings",
  settingsCategory: category,
});

/**
 * `libraryReadingContext` STAŁ TU DO LOTU D3 i został skasowany, a nie
 * przepisany. Budował `destination:library` z polem `libraryReading`, bo
 * Biblioteka była jednym celem o trzech odczytach: dwa wywołania — wrzutka
 * głosowa i wrzutka otwarta z Inboxa — musiały poprosić o Historię wrzutek,
 * inaczej lądowały na Notatkach.
 *
 * Po rozdziale na trzy cele proszenie o odczyt jest zwykłym
 * `destinationContext("captures", …)`, a warunek, którego tamta funkcja
 * pilnowała, pilnuje teraz TYP: nie da się już zbudować kontekstu, który
 * mówi „wiedza" i nie mówi którą.
 */

/**
 * Zadania otwarte NA KONKRETNYM ZAPISANYM WIDOKU.
 *
 * Klucz jest ten sam co u zwykłego celu (`destination:tasks`) — dokładnie jak
 * przy {@link libraryReadingContext} i {@link settingsCategoryContext}:
 * Zadania to jeden cel, więc otwarcie ich na innym widoku podmienia tę samą
 * zakładkę, zamiast robić drugą pod tym samym ekranem.
 *
 * ETYKIETA ZOSTAJE „Tasks", z tego samego powodu co przy Ustawieniach:
 * `migrateRestoredContext` czyta etykietę zakładki-celu Z REJESTRU, więc nazwa
 * widoku i tak nie przeżyłaby zapisania sesji.
 */
export const tasksSavedViewContext = (savedViewId: string): ShellContext => ({
  key: "destination:tasks",
  label: desktopSurfaceLabel("tasks"),
  surface: "tasks",
  savedViewId,
});

/**
 * A task in context — and, when it is asked for, the task opened as a RECORD.
 *
 * The promotion is OPT-IN, and that is the whole point of the flag. Eleven call
 * sites build a task context and most of them mean "take me to this task": a
 * capture that just became one, a signal activated from the operating system, a
 * reference followed out of a document. Those want the collection with the task
 * in hand. Only a deliberate open — Enter or a double click on a row, or a
 * subtask followed out of a record — means "show me this task instead of the
 * list".
 *
 * It was not opt-in for one CI cycle, and every one of those eleven started
 * landing on a record: the packaged smoke turned a capture into a task and then
 * looked for its row on a screen that had replaced the list with the record.
 * The flag lives on the CONTEXT rather than in the shell's own state because a
 * tab has to reopen as what it was; it survives serialization for the same
 * reason.
 */
export const taskContext = (
  taskId: TaskId,
  label: string,
  options: { readonly record?: boolean } = {},
): ShellContext => ({
  key: `task:${taskId}`,
  label,
  surface: "tasks",
  taskId,
  ...(options.record === true ? { record: true } : {}),
});

export const projectContext = (
  projectId: ProjectId,
  label: string,
): ShellContext => ({
  key: `project:${projectId}`,
  label,
  surface: "projects",
  projectId,
});

export const documentContext = (
  documentId: DocumentId,
  label: string,
): ShellContext => ({
  key: `document:${documentId}`,
  label,
  // NOTATKA OTWIERA SIĘ NA `notes`, a nie na jednym z trzech ekranów wiedzy
  // „jakimkolwiek": czytelnia dokumentu jest trzecim panelem TEGO ekranu
  // (`NotesReading.tsx`), a Źródła i Historia wrzutek nie mają gdzie jej
  // narysować. Do lotu D3 stało tu `library` i było to prawdą przez zwinięcie,
  // nie przez wybór.
  surface: "notes",
  documentId,
});

export const organizationContext = (
  organizationId: StrategicRecordId,
  label: string,
): ShellContext => ({
  key: `organization:${organizationId}`,
  label,
  surface: "organizations",
  organizationId,
});

/**
 * A deal in context, and it is always the RECORD.
 *
 * The surface is `pipeline` because that is where the record lives — a context
 * on the board exactly as the task record is a context on `tasks`. It is not a
 * destination of its own: a nav target that is a record is a display case, and
 * `DesktopSurface` is the only vocabulary `ShellContext.surface` accepts.
 */
export const opportunityContext = (
  opportunityId: StrategicRecordId,
  label: string,
): ShellContext => ({
  key: `opportunity:${opportunityId}`,
  label,
  surface: "pipeline",
  opportunityId,
});

export const createShellNavigation = (
  initial: ShellContext,
): ShellNavigationState => ({
  tabs: [initial],
  activeKey: initial.key,
  history: [initial],
  historyIndex: 0,
});

export const activeShellContext = (state: ShellNavigationState): ShellContext =>
  state.tabs.find((tab) => tab.key === state.activeKey) ?? state.tabs[0]!;

export const destinationShortcutIndex = (code: string): number | undefined => {
  const match = /^Digit([1-9])$/.exec(code);
  return match?.[1] === undefined ? undefined : Number(match[1]) - 1;
};

const appendHistory = (
  state: ShellNavigationState,
  context: ShellHistoryEntry,
): Pick<ShellNavigationState, "history" | "historyIndex"> => {
  const current = state.history[state.historyIndex];
  if (current?.key === context.key) {
    if (current === context) return state;
    return {
      history: state.history.map((entry, index) =>
        index === state.historyIndex ? context : entry,
      ),
      historyIndex: state.historyIndex,
    };
  }
  const history = [
    ...state.history.slice(0, state.historyIndex + 1),
    context,
  ].slice(-MAX_HISTORY);
  return { history, historyIndex: history.length - 1 };
};

export const openShellContextReportingEviction = (
  state: ShellNavigationState,
  context: ShellContext,
): ShellOpenOutcome => {
  const existing = state.tabs.findIndex((tab) => tab.key === context.key);
  let tabs =
    existing < 0
      ? [...state.tabs, context]
      : state.tabs.map((tab, index) => (index === existing ? context : tab));
  let evictedContext: ShellContext | undefined;
  if (tabs.length > MAX_TABS) {
    const removable = tabs.findIndex(
      (tab, index) => index > 0 && tab.key !== state.activeKey,
    );
    const removeIndex = removable < 0 ? 1 : removable;
    evictedContext = tabs[removeIndex];
    tabs = tabs.filter((_, index) => index !== removeIndex);
  }
  const next: ShellNavigationState = {
    ...state,
    ...appendHistory(state, context),
    tabs,
    activeKey: context.key,
  };
  return evictedContext === undefined
    ? { state: next }
    : { state: next, evictedContext };
};

export const openShellContext = (
  state: ShellNavigationState,
  context: ShellContext,
): ShellNavigationState =>
  openShellContextReportingEviction(state, context).state;

export const navigateShellContext = (
  state: ShellNavigationState,
  context: ShellContext,
): ShellNavigationState => {
  const existing = state.tabs.findIndex((tab) => tab.key === context.key);
  if (existing >= 0) {
    const tabs = state.tabs.map((tab, index) =>
      index === existing ? context : tab,
    );
    return {
      ...state,
      ...appendHistory(state, context),
      tabs,
      activeKey: context.key,
    };
  }
  const activeIndex = state.tabs.findIndex(
    (tab) => tab.key === state.activeKey,
  );
  if (activeIndex < 0) return openShellContext(state, context);
  const tabs = state.tabs.map((tab, index) =>
    index === activeIndex ? context : tab,
  );
  // Nawigacja w obrębie karty: zarówno opuszczany, jak i nowy wpis historii
  // należą do łańcucha tej karty, więc oba wolno przywrócić przez Wstecz.
  const marked: ShellNavigationState = {
    ...state,
    history: state.history.map((entry, index) =>
      index === state.historyIndex && entry.inCard !== true
        ? { ...entry, inCard: true }
        : entry,
    ),
  };
  return {
    ...state,
    ...appendHistory(marked, { ...context, inCard: true }),
    tabs,
    activeKey: context.key,
  };
};

export const activateShellContext = (
  state: ShellNavigationState,
  key: string,
): ShellNavigationState => {
  const tab = state.tabs.find((entry) => entry.key === key);
  if (tab === undefined) return state;
  return {
    ...state,
    ...appendHistory(state, tab),
    activeKey: key,
  };
};

export const moveShellHistory = (
  state: ShellNavigationState,
  direction: -1 | 1,
): ShellNavigationState => {
  let index = state.historyIndex + direction;
  while (index >= 0 && index < state.history.length) {
    const target = state.history[index];
    if (target === undefined) return state;
    if (state.tabs.some((tab) => tab.key === target.key)) {
      return { ...state, activeKey: target.key, historyIndex: index };
    }
    if (target.inCard === true) {
      const activeIndex = state.tabs.findIndex(
        (tab) => tab.key === state.activeKey,
      );
      const tabs =
        activeIndex < 0
          ? [...state.tabs, target]
          : state.tabs.map((tab, tabIndex) =>
              tabIndex === activeIndex ? target : tab,
            );
      return { ...state, tabs, activeKey: target.key, historyIndex: index };
    }
    // Wpis z zamkniętej lub eksmitowanej karty — pomijamy go, żeby Wstecz
    // nie podmieniał aktywnej karty na cudzy kontekst.
    index += direction;
  }
  return state;
};

export const closeShellContext = (
  state: ShellNavigationState,
  key: string,
): ShellNavigationState => {
  if (state.tabs.length === 1) return state;
  const closingIndex = state.tabs.findIndex((tab) => tab.key === key);
  if (closingIndex < 0) return state;
  const tabs = state.tabs.filter((tab) => tab.key !== key);
  if (state.activeKey !== key) return { ...state, tabs };
  const fallback = tabs[Math.min(closingIndex, tabs.length - 1)]!;
  return openShellContext(
    { ...state, tabs, activeKey: fallback.key },
    fallback,
  );
};

// Pomijanie wpisów w moveShellHistory sprawia, że sam zakres indeksu nie
// wystarcza — przycisk jest aktywny tylko, gdy ruch faktycznie coś zmienia.
export const canMoveShellHistory = (
  state: ShellNavigationState,
  direction: -1 | 1,
): boolean => moveShellHistory(state, direction) !== state;
