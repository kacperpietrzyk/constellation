import type { LibraryReading } from "../client/shell-navigation.js";

// Napisy trzech ekranów wiedzy — `h1` w paśmie każdego z nich.
//
// Sam SŁOWNIK mieszka w `client/shell-navigation.ts`, bo kontekst powłoki go
// niesie. Stamtąd bierzemy tu WYŁĄCZNIE TYP — import typu znika przy
// kompilacji, więc leniwy chunk Biblioteki nie dostaje krawędzi do modułu
// ścieżki gorącej. Krawędź w drugą stronę też odpada. Powód jest zmierzony:
// każda taka krawędź każe rolldownowi wydzielić z chunka wejściowego wspólny
// chunk preładowany, a ścieżka gorąca pocięta na więcej kawałków kompresuje
// się GORZEJ, nawet gdy sumarycznie maleje.
//
// Rekord jest TOTALNY nad unią, więc nowy odczyt bez napisu nie skompiluje się.
//
// TE SAME TRZY NAPISY STOJĄ W REJESTRZE POWIERZCHNI (`desktop-preload`), i tego
// duplikatu nie da się usunąć w tę stronę — powód stoi wyżej i jest w bajtach.
// Pilnuje go za to asercja chodząca po CAŁEJ unii odczytów:
// `desktop-ui/test/shell-navigation.test.ts`, „the knowledge h1 and the
// navigation label are one sentence". Bez niej podmiana wszystkich trzech
// napisów przechodziła przez cały `npm run check`.
//
// KOLEJNOŚCI TU NIE MA I NIE MA JEJ TU BYĆ. Do lotu D3 stał obok eksport
// `libraryReadingOrder`, którym przełącznik odczytów wypisywał zakładki;
// przełącznik zniknął razem z jednym celem, a kolejność trzech ekranów wiedzy
// ustala dziś rejestr powierzchni, bo to on rysuje pozycje nawigacji.
export const libraryReadingLabel: Readonly<Record<LibraryReading, string>> = {
  notes: "Notes",
  sources: "Sources",
  captures: "Capture history",
};
