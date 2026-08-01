import type { LibraryReading } from "../client/shell-navigation.js";

// Napisy odczytów, i kolejność, w jakiej stoją w przełączniku.
//
// Sam SŁOWNIK mieszka w `client/shell-navigation.ts`, bo kontekst powłoki go
// niesie. Stamtąd bierzemy tu WYŁĄCZNIE TYP — import typu znika przy
// kompilacji, więc leniwy chunk Biblioteki nie dostaje krawędzi do modułu
// ścieżki gorącej. Krawędź w drugą stronę też odpada. Powód jest zmierzony:
// każda taka krawędź każe rolldownowi wydzielić z chunka wejściowego wspólny
// chunk preładowany, a ścieżka gorąca pocięta na więcej kawałków kompresuje
// się GORZEJ, nawet gdy sumarycznie maleje.
//
// Rekord jest TOTALNY nad unią, więc nowy odczyt bez napisu nie skompiluje
// się, a przełącznik czyta kolejność stąd, zamiast wypisywać przyciski ręką.
export const libraryReadingLabel: Readonly<Record<LibraryReading, string>> = {
  notes: "Notes",
  sources: "Sources",
  captures: "Capture history",
};

export const libraryReadingOrder = Object.keys(
  libraryReadingLabel,
) as readonly LibraryReading[];
