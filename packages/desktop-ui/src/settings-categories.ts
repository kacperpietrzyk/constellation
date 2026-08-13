import type { IconName } from "./components/Icon.js";

// Jedna lista sekcji Ustawień dla OBU stron trybu: powłoka rysuje ją w lewej
// kolumnie, a sam ekran w swoim nawigatorze i w kontrolce natywnej.
//
// Dlaczego osobny plik, a nie eksport z `SettingsSurface.tsx`: ten ekran jest
// LENIWY i ma nim zostać. Statyczny import z powłoki wciągnąłby go na ścieżkę
// gorącą, a bramka rozmiaru renderera pilnuje właśnie tego. Tutaj są same dane,
// więc kosztują tyle, ile ważą.
//
// GRUPA I GLIF STOJĄ PRZY KATEGORII, nie w drugiej liście obok tej. Prototyp
// dzieli spis na trzy nazwane grupy i daje każdej pozycji ikonę
// (`v3/screens/settings.js:925-956`, `v3/screens/settings.css:57-71`), a jego
// deklaracja niesie oba pola w tym samym obiekcie, co sekcję. Ten plik robi
// dokładnie to samo z tego samego powodu: lista „która kategoria jest w której
// grupie" leżąca obok zamkniętego słownika kategorii milczy, kiedy się
// rozjedzie.
//
// KOLEJNOŚĆ TU JEST KOLEJNOŚCIĄ NA EKRANIE. Sekcje rysuje `SettingsSurface`
// wprost w JSX-ie, w tej samej kolejności, i to jest DRUGA lista — grupowanie,
// które by ją przestawiło, rozjechałoby znacznik bieżącej sekcji z kierunkiem
// przewijania (czytelnik jedzie w dół ekranu, a znacznik skacze po kolumnie).
// Dlatego grupy powstają ze SKLEJENIA SĄSIADÓW, a nie z sortowania: nazwy
// dobrane są tak, żeby dzisiejsza kolejność rozpadła się na trzy ciągłe
// odcinki bez przestawiania czegokolwiek.
//
// PODSTAWA NAZW — zawartość kategorii, nie analogia do prototypu (nasze sześć
// kategorii nie odwzorowuje jego dwunastu sekcji):
//   • „This workspace"      — tożsamość przestrzeni, jej statusy zadań,
//                             pieniądze, dzień pracy, pola rekordów, szablony
//                             i automatyzacje (`workspace`); granice danych,
//                             kopie i raport (`data`); eksport i import
//                             pisania (`notes`). Wszystkie trzy konfigurują
//                             TĘ przestrzeń i jej treść.
//   • „You"                 — motyw i gęstość (`appearance`), czyli jedyna
//                             kategoria o tym, jak aplikacja wygląda
//                             CZYTELNIKOWI, a nie o tym, co robi.
//   • „What the app runs on" — dostępy, granty agentów i połączenia
//                             z kalendarzem (`access`) oraz instalacja,
//                             paczka wymiany i aktualizacja (`application`).
export const settingsCategories = [
  {
    id: "workspace",
    label: "Workspace",
    group: "This workspace",
    icon: "organization",
  },
  {
    id: "data",
    label: "Data and privacy",
    group: "This workspace",
    icon: "fields",
    // TAFLE, KTÓRE MAJĄ WŁASNĄ NAZWĘ i dają się po niej znaleźć w palecie.
    //
    // Pole istnieje, bo wycofanie `activity` z rejestru powierzchni zabrałoby
    // mu wpis w palecie: `SearchOverlay` bierze cele z `navItems`, a `navItems`
    // pochodzi z rejestru. Zakopanie dziennika ma cenę, a ta cena nie może
    // brzmieć „zapamiętaj, w której kategorii Ustawień on leży".
    //
    // DEKLARACJA STOI TUTAJ, a nie obok, i to jest cała decyzja. Ręczna lista
    // celów palety leżąca obok zamkniętego słownika byłaby dwudziestym piątym
    // żywym miejscem rodziny, którą to repo przegrywa od trzech fal. Tafla jest
    // deklarowana RAZ: stąd bierze się i cel w palecie, i identyfikator kotwicy,
    // do której paleta przewija, i asercja mówiąca, że tafla jest naprawdę
    // zamontowana.
    panes: [{ id: "activity", label: "Activity" }],
  },
  // Po `data`, i osobno od niej: obie tafle tej sekcji dotyczą PRZENOSZENIA
  // czyjegoś pisania do środka i na zewnątrz, a to inne pytanie niż rezydencja
  // danych i prywatność. Eksport markdownu jest warunkiem (decyzja 17), nie
  // dodatkiem — format składowania to dokument ProseMirror w CRDT Yjs, więc
  // bez tej sekcji nie ma drzwi na zewnątrz.
  { id: "notes", label: "Notes", group: "This workspace", icon: "documents" },
  { id: "appearance", label: "Appearance", group: "You", icon: "panel" },
  {
    id: "access",
    label: "Access and connections",
    group: "What the app runs on",
    icon: "access",
  },
  {
    id: "application",
    label: "Setup and app",
    group: "What the app runs on",
    icon: "settings",
  },
] as const satisfies readonly {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  // TYP, NIE NAPIS. `IconName` jest zamkniętym słownikiem, więc glif wskazany
  // z nazwy, której `Icon` nie rysuje, nie kompiluje się — zamiast rysować
  // pustkę. Import jest `type`, czyli znika w transpilacji: ten plik ma NIE
  // wciągać komponentu na ścieżkę gorącą, i nie wciąga.
  readonly icon: IconName;
  // TAFLE SĄ POLEM OPCJONALNYM TEGO SAMEGO OBIEKTU — `satisfies` sprawdza
  // KAŻDY klucz literału, więc bez tego wiersza kategoria `data` przestałaby
  // się kompilować razem ze swoją taflą dziennika.
  readonly panes?: readonly { readonly id: string; readonly label: string }[];
}[];

export type SettingsCategoryId = (typeof settingsCategories)[number]["id"];

/**
 * Spis pocięty na grupy przez SKLEJENIE SĄSIADÓW o tej samej nazwie grupy.
 *
 * Sklejanie, a nie zbieranie po całej liście, jest tu asercją, nie skrótem:
 * gdyby kategorie tej samej grupy przestały ze sobą sąsiadować, powstałaby
 * DRUGA grupa o tej samej nazwie i widać to na ekranie od razu — zamiast
 * cichego przestawienia spisu względem kolejności sekcji, którą rysuje
 * `SettingsSurface`.
 */
export const settingsCategoryGroups: readonly {
  readonly label: string;
  readonly categories: readonly (typeof settingsCategories)[number][];
}[] = settingsCategories.reduce<
  { label: string; categories: (typeof settingsCategories)[number][] }[]
>((groups, category) => {
  const open = groups.at(-1);
  if (open !== undefined && open.label === category.group)
    open.categories.push(category);
  else groups.push({ label: category.group, categories: [category] });
  return groups;
}, []);

/** Identyfikator elementu sekcji — wspólny, bo powłoka do niego przewija. */
export const settingsCategoryElementId = (
  category: SettingsCategoryId,
): string => `settings-category-${category}`;

/**
 * Tafle wyprowadzone z kategorii, razem z kategorią, w której leżą.
 *
 * Klucz obcy jest STRUKTURALNY — tafla jest zagnieżdżona w swojej kategorii,
 * więc nie da się zadeklarować tafli w kategorii, której nie ma. To jest cała
 * różnica między tym kształtem a listą obok listy.
 */
export const settingsPanes: readonly {
  readonly id: string;
  readonly label: string;
  readonly category: SettingsCategoryId;
}[] = settingsCategories.flatMap((category) =>
  "panes" in category
    ? category.panes.map((pane) => ({ ...pane, category: category.id }))
    : [],
);

export type SettingsPaneId = (typeof settingsPanes)[number]["id"];

/**
 * Identyfikator kotwicy tafli. Ta sama rola co
 * {@link settingsCategoryElementId}: paleta do niego przewija, ekran go rysuje,
 * a asercja montażu go szuka — jedna nazwa dla trzech czytających.
 */
export const settingsPaneElementId = (pane: SettingsPaneId): string =>
  `settings-pane-${pane}`;
