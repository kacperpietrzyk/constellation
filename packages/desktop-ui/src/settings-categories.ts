// Jedna lista sekcji Ustawień dla OBU stron trybu: powłoka rysuje ją w lewej
// kolumnie, a sam ekran w swoim nawigatorze i w kontrolce natywnej.
//
// Dlaczego osobny plik, a nie eksport z `SettingsSurface.tsx`: ten ekran jest
// LENIWY i ma nim zostać. Statyczny import z powłoki wciągnąłby go na ścieżkę
// gorącą, a bramka rozmiaru renderera pilnuje właśnie tego. Tutaj są same dane,
// więc kosztują tyle, ile ważą.
export const settingsCategories = [
  { id: "workspace", label: "Workspace" },
  {
    id: "data",
    label: "Data and privacy",
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
  { id: "notes", label: "Notes" },
  { id: "appearance", label: "Appearance" },
  { id: "access", label: "Access and connections" },
  { id: "application", label: "Setup and app" },
] as const;

export type SettingsCategoryId = (typeof settingsCategories)[number]["id"];

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
