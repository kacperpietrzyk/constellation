// Czy PRZEPEŁNIENIE POTOMKA jest dozwolone — decyzja wyjęta z przeglądarki.
//
// Po co osobny moduł: `verify-renderer-layout.mjs` potrzebuje przeglądarki
// i serwera dev, więc nie chodzi w `npm run check` — ma w CI WŁASNE zadanie
// `layout`, na jednym systemie (uzasadnienie w nagłówku tamtego pliku). Sama
// reguła „wolno czy nie wolno" jest zwykłą funkcją nad liczbami i napisami,
// więc mieszka tutaj i ma testy, które chodzą w `check` na wszystkich trzech
// systemach — reguła jest przenośna, PIKSELE nie są.
//
// DLACZEGO TO W OGÓLE POWSTAŁO. Bramka układu mierzyła PIERWSZE DZIECKO
// powierzchni (`scrollWidth` kontra `clientWidth`) i nic poniżej. Zmierzone
// przy rekonesansie fali D, przy tekście skalowanym do 200%: bramka zwracała
// „brak przepełnienia" na WSZYSTKICH PIĘTNASTU celach, podczas gdy sześć z nich
// miało potomka wychodzącego poza własne pudełko o 53–341 px. Kontenery
// przewijania tej powłoki są zrobione tak, żeby wchłaniać szeroką treść, więc
// korzeń raportuje `scrollWidth === clientWidth` niezależnie od tego, co się
// dzieje w środku. Ekran o trzech panelach — drzewo │ lista │ treść — jest
// dokładnie tym kształtem, który się tak prześlizguje.
//
// CZTERY WYNIKI, i są to CZTERY RÓŻNE rzeczy, celowo nie jedna lista wyjątków:
//
//   "contained" — pudełko samo obcina treść (`overflow-x: hidden` albo `clip`).
//                 Nic nie wychodzi na zewnątrz, więc UKŁAD jest cały; długi
//                 tytuł ucięty wielokropkiem to ZAMIERZONE traktowanie, a nie
//                 defekt (`styles.css` — `.knowledge-document-list strong`
//                 i `.history-row-copy strong` mają wprost
//                 `overflow: hidden; text-overflow: ellipsis`). Gdyby to padało,
//                 najtańszą naprawą byłoby SKRÓCENIE FIKSTURY — czyli zabicie
//                 dokładnie tego pomiaru, dla którego ta bramka powstała.
//                 Wypisywane w trybie raportu, nieegzekwowane.
//   "declared"  — element deklaruje, że przewija się w poziomie
//                 (`[data-scrolls-horizontally]`). To KONTRAKT powierzchni:
//                 tablica lejka i szeroka tabela zadań mają prawo być szersze
//                 niż okno, ale muszą to POWIEDZIEĆ. Element z `overflow-x:
//                 auto` BEZ tej deklaracji jest przewinięciem PRZYPADKOWYM
//                 i pada — „powłoka to wchłonie" przestaje być wymówką dopiero
//                 wtedy, kiedy region sam mówi, że tak ma być.
//   "known"     — DŁUG, nie kontrakt. Wpis w rejestrze niżej z nazwanym
//                 wątkiem, który jest jego właścicielem, i ZMIERZONYM sufitem.
//                 Wpis nie zwalnia elementu z pomiaru: przekroczenie zmierzonej
//                 wartości dalej pada, więc następna fala nie pogorszy tego po
//                 cichu.
//   "violation" — treść WYCHODZI ze swojego pudełka (`overflow-x: visible`)
//                 albo przewija się bez deklaracji. To jest defekt układu.
//
// Rejestr długu jest ITEMIZOWANY i każdy wpis wskazuje właściciela. Zbiorcze
// zwolnienie („powierzchnie sprzed fali D nie liczą się") przeszłoby przez tę
// samą bramkę i nie znaczyłoby nic.

/** Atrybut, którym element deklaruje, że przewija się w poziomie z założenia. */
export const HORIZONTAL_SCROLL_ATTRIBUTE = "data-scrolls-horizontally";

/**
 * Zapas nad zmierzoną wartością długu. Układ przeglądarki potrafi się różnić
 * o pojedyncze piksele między wersjami Chromium i między maszynami, a rejestr,
 * który pada od jednego piksela zaokrąglenia, zostanie skasowany przy pierwszym
 * czerwonym przebiegu — czyli przestanie pilnować czegokolwiek. Zapas jest
 * MAŁY świadomie: 8 px nie ukryje regresji układu, a łapie zaokrąglenie.
 */
export const KNOWN_OVERFLOW_TOLERANCE_PX = 8;

/**
 * DŁUG UKŁADU ZMIERZONY, NIE ZGADNIĘTY. Każdy wpis pochodzi z przebiegu
 * `npm run test:renderer-layout` na `main` @3cfc099 i niesie wątek, do którego
 * należy. Nic tutaj nie jest robotą fali D — fala D ma tego NIE POGARSZAĆ,
 * i po to jest sufit przy każdym wpisie.
 *
 * `surface` dopasowuje się do etykiety pomiaru z prefiksu: `tasks` łapie
 * `tasks`, `tasks:board` i `tasks:task:overview`, bo to ta sama powierzchnia
 * oglądana w innym obiektywie, a rozbicie na etykiety dałoby rejestr, którego
 * nikt nie przeczyta.
 *
 * SUFIT JEST OSOBNY DLA KAŻDEGO PRZELOTU, i to nie jest ozdoba. Jeden sufit
 * wzięty z najgorszego przelotu przepuszczałby po cichu wzrost na pozostałych:
 * `span._chipDashed` ma 56 px przy 200% i 32 px przy pełnym oknie, więc wspólna
 * liczba 56 dawałaby 24 px darmowego wzrostu dokładnie tam, gdzie ten defekt
 * jest najbardziej dotkliwy — przy szerokości, przy której ekranu się używa.
 * Przelot NIEWYMIENIONY w `ceilings` znaczy „ten element NIE PRZEPEŁNIA się
 * tutaj" i przepełnienie na nim pada, tak jak każde nowe.
 */
export const KNOWN_DESCENDANT_OVERFLOWS = [
  // ── wątek skalowania interfejsu (recon fali D §3e) ────────────────────────
  // Widoczne WYŁĄCZNIE przy tekście 200% albo w oknie 320 px, czyli poniżej
  // własnego minimum produktu (`BrowserWindow minWidth: 760`). Mechanizm jest
  // wspólny dla dziewięciu powierzchni i nie jest knowledge-specific: odstępy
  // powłoki i `--surface-measure` są w `rem`, więc żądana szerokość rośnie
  // z rozmiarem czcionki, a okno nie.
  {
    surface: "projects",
    signature: "div._row",
    ceilings: {
      "text scaled to 200%": 194,
    },
    thread: "skalowanie interfejsu (recon fali D §3e) — wiersz kolekcji",
  },
  {
    surface: "tasks",
    signature: "span._plan._plan_unplanned",
    ceilings: {
      "text scaled to 200%": 65,
      "a 320 px window": 15,
    },
    thread: "skalowanie interfejsu (recon fali D §3e) — znacznik planu",
  },
  {
    surface: "tasks",
    signature: "div._cellHead",
    ceilings: {
      "text scaled to 200%": 86,
    },
    thread: "skalowanie interfejsu (recon fali D §3e) — nagłówek dnia",
  },
  {
    surface: "access",
    signature: "div.member-list",
    ceilings: {
      "a 320 px window": 18,
    },
    thread: "fala E — powierzchnia `access`, poza zakresem fali D",
  },
  {
    surface: "activity",
    signature: "h3",
    ceilings: {
      "text scaled to 200%": 53,
    },
    thread: "fala E — powierzchnia `activity`, poza zakresem fali D",
  },
  {
    surface: "activity",
    signature: "p",
    ceilings: {
      "text scaled to 200%": 33,
    },
    thread: "fala E — powierzchnia `activity`, poza zakresem fali D",
  },
  {
    surface: "settings",
    signature: "form.status-create",
    ceilings: {
      "text scaled to 200%": 117,
      "a 320 px window": 117,
    },
    thread: "Settings poza sekcją Notes fali D",
  },
  // ── Library: powłoka o STAŁYCH torach nie mieści się w wąskim oknie ───────
  // ZNALEZISKO TEGO LOTU, i widać je dopiero od tego PR-a. Powłoka Library ma
  // `grid-template-columns: minmax(17rem, 20rem) minmax(0, 1fr)`
  // (`styles.css`), więc sama biblioteka żąda 17 rem niezależnie od okna:
  // przy 320 px kolumna robocza ma 256 px, a przy tekście 200% te 17 rem to
  // 544 px w 584 px. Bramka nie mogła tego zobaczyć, bo harness rysował
  // Library PUSTĄ — bez wybranego dokumentu zamiast edytora rysuje się panel
  // powitalny, więc PŁASZCZYZNA PISANIA NIE BYŁA MIERZONA ANI RAZU.
  //
  // WŁAŚCICIEL JEST W TEJ FALI, i brief już go nazwał: ekran Notatek ma
  // dowieźć ZADEKLAROWANĄ KOLEJNOŚĆ ZWIJANIA paneli dla 364 px (300%)
  // i ~540 px (własne minimum okna produktu). Ten pomiar jest dowodem, że
  // wymaganie dotyczy już DWÓCH torów, nie dopiero trzech. Wpis znika,
  // kiedy ta kolejność wyląduje — nie wcześniej i nie przez podniesienie
  // sufitu.
  //
  // BYŁ TU DRUGI WPIS: `div.knowledge-layout` z sufitami 470 · 262, ten sam
  // defekt widziany metryką PIERWSZEGO DZIECKA. Został USUNIĘTY, i nie
  // dlatego, że dług spłacono. Wpis zmierzono na drzewie SPRZED PR #201:
  // lot S2 odbił się od `main` @3cfc099, a powłoka Biblioteki (#201) weszła
  // do `main` PRZED nim, więc rejestr wylądował opisując korzeń, którego
  // już nie było. Od #201 pierwszym dzieckiem powierzchni jest `div._shell`
  // (`library/LibraryShell.tsx`), a pole odczytu `.reading` ma `overflow:
  // auto` (`library/library.module.css`) — więc korzeń WCHŁANIA to
  // przepełnienie i nie da się go tam już zmierzyć. Zmierzone: żaden przelot
  // nie melduje przepełnienia korzenia na żadnej powierzchni.
  //
  // Dług NIE ZNIKNĄŁ i dalej pada z tego samego miejsca: `document-editor-shell`
  // mierzy się na `main` @1edcf40 dokładnie na swoich sufitach (+494 przy 200%,
  // +274 przy 320 px). Jeden wpis zamiast dwóch, ten sam pomiar.
  //
  // To jest STRAŻNIK REJESTRU, który zadziałał: „ten wpis nie został ani razu
  // dopasowany" to dokładnie ta wiadomość, którą miał wysłać, kiedy bramka
  // przestaje widzieć ekran. Nie należy go wyciszać — należy wpis poprawić.
  {
    surface: "library",
    signature: "div.document-editor-shell",
    ceilings: {
      "text scaled to 200%": 494,
      "a 320 px window": 274,
    },
    thread:
      "fala D, lot ekranu Notatek — ta sama wada widziana od strony płaszczyzny pisania",
  },
  // ── ekran rekordu Zadania: przepełnienie przy DOMYŚLNYM rozmiarze ─────────
  // Te trzy NIE SĄ artefaktem skalowania i wpisy mówią to wprost, bo inaczej
  // trafią do wątku skalowania interfejsu i zostaną odłożone drugi raz.
  // Wychodzą poza swoje pudełka już przy oknie 1440 px (+32, +44, +89) —
  // czyli przy szerokości, przy której ten ekran jest naprawdę używany —
  // i nic tego dotąd nie mierzyło. Sufity poniżej są z przelotu 200%, bo tam
  // są największe; powód istnienia wpisu jest przy pełnym oknie.
  // Fala D ich NIE NAPRAWIA: to jest ekran zbudowany przez falę B, a lot,
  // który zacznie go naprawiać, nie skończy przyrządów. Sufit jest po to,
  // żeby nie urosły po cichu.
  {
    surface: "tasks",
    signature: "span._chipDashed",
    ceilings: {
      "text scaled to 200%": 56,
      "a full-size window": 32,
    },
    thread:
      "fala E — ekran rekordu Zadania, defekt przy DOMYŚLNYM rozmiarze okna",
  },
  {
    surface: "tasks",
    signature: "p._unavailable",
    ceilings: {
      "text scaled to 200%": 78,
      "a full-size window": 44,
    },
    thread:
      "fala E — ekran rekordu Zadania, defekt przy DOMYŚLNYM rozmiarze okna",
  },
  {
    surface: "tasks",
    signature: "article._entry",
    ceilings: {
      "text scaled to 200%": 162,
      "a full-size window": 89,
    },
    thread:
      "fala E — komentarze na rekordzie Zadania, defekt przy DOMYŚLNYM rozmiarze okna",
  },
];

/** Czy etykieta pomiaru należy do powierzchni z wpisu. */
export const matchesSurface = (label, surface) =>
  label === surface || label.startsWith(`${surface}:`);

/**
 * Jedna decyzja o jednym przepełnieniu. Świadomie NIE przyjmuje elementu DOM —
 * bierze to, co z niego odczytano, żeby dała się przetestować bez przeglądarki.
 */
export const classifyDescendantOverflow = (
  { surface, signature, overflowPx, overflowX, declaresHorizontalScroll, pass },
  registry = KNOWN_DESCENDANT_OVERFLOWS,
) => {
  if (overflowPx <= 0) return { verdict: "fits" };
  if (overflowX === "hidden" || overflowX === "clip")
    return { verdict: "contained" };
  if (declaresHorizontalScroll) return { verdict: "declared" };
  const entry = registry.find(
    (candidate) =>
      matchesSurface(surface, candidate.surface) &&
      candidate.signature === signature,
  );
  if (entry === undefined) return { verdict: "violation" };
  // Brak sufitu DLA TEGO PRZELOTU nie znaczy „wolno": znaczy, że ten element
  // się tutaj nie przepełniał, więc właśnie zaczął.
  const ceiling = entry.ceilings[pass];
  if (ceiling === undefined)
    return { verdict: "violation", thread: entry.thread };
  if (overflowPx > ceiling + KNOWN_OVERFLOW_TOLERANCE_PX) {
    return {
      verdict: "violation",
      // Osobny komunikat, bo to inna wiadomość niż „nowe przepełnienie":
      // ten element jest w rejestrze i właśnie zrobił się GORSZY.
      regressedFrom: ceiling,
      thread: entry.thread,
    };
  }
  return { verdict: "known", thread: entry.thread };
};

/**
 * Rejestr, który przestał opisywać cokolwiek, jest gorszy niż jego brak —
 * wygląda jak księga długu, a jest listą zdań o nieistniejących elementach.
 * Dlatego przebieg, w którym wpis NIE ZOSTAŁ ANI RAZU DOPASOWANY, jest błędem:
 * albo dług został spłacony i wpis ma zniknąć, albo pomiar przestał widzieć ten
 * ekran i wtedy zieleń całej bramki nic nie znaczy.
 */
export const unusedRegistryEntries = (
  matchedSignatures,
  registry = KNOWN_DESCENDANT_OVERFLOWS,
) =>
  registry.filter(
    (entry) => !matchedSignatures.has(`${entry.surface}|${entry.signature}`),
  );
