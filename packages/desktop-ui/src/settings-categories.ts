// Jedna lista sekcji Ustawień dla OBU stron trybu: powłoka rysuje ją w lewej
// kolumnie, a sam ekran w swoim nawigatorze i w kontrolce natywnej.
//
// Dlaczego osobny plik, a nie eksport z `SettingsSurface.tsx`: ten ekran jest
// LENIWY i ma nim zostać. Statyczny import z powłoki wciągnąłby go na ścieżkę
// gorącą, a bramka rozmiaru renderera pilnuje właśnie tego. Tutaj są same dane,
// więc kosztują tyle, ile ważą.
export const settingsCategories = [
  { id: "workspace", label: "Workspace" },
  { id: "data", label: "Data and privacy" },
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
