import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Testy interakcji żyją WYŁĄCZNIE w tej paczce i wyłącznie tutaj chodzi Vitest.
// Pozostałe dziesięć paczek zostaje na `node:test` przez `scripts/run-tests.mjs`
// — to nie jest niezdecydowanie, tylko jedyna rzecz, której `node:test` nie
// potrafi: renderer potrzebuje DOM-u z pętlą zdarzeń, żeby dało się KLIKNĄĆ.
// `renderToStaticMarkup` (jedyne, co repo miało) nie uruchamia efektów, nie
// rozwiązuje `React.lazy` i nie zna zdarzeń, więc każda gwarancja o zachowaniu
// była dotąd sprawdzana regexem po pliku źródłowym.
//
// happy-dom, nie jsdom: mniejszy i szybszy, a niczego stąd nie potrzebujemy
// poza zdarzeniami, układem pudełkowym w wersji zerowej i `localStorage`.
export default defineConfig({
  plugins: [react()],
  // JEDEN KATALOG SPOZA PACZKI, WPUSZCZONY IMIENNIE. `empty-state-outline`
  // osądza konspekt nagłówków REGUŁĄ, która stoi w `scripts/heading-outline.mjs`
  // i jest tą samą, uzbrojoną regułą, co w bramce układu — przepisanie jej do
  // tej paczki byłoby drugą kopią kształtu obok pierwszej, czyli klasą defektu,
  // którą to repozytorium ma już nazwaną. Bez tego wpisu Vite odmawia
  // rozwiązania pliku spoza katalogu projektu, i to komunikatem „Cannot find
  // module" nad plikiem, który istnieje.
  //
  // WPUSZCZONY JEST `scripts`, A NIE KORZEŃ REPOZYTORIUM, bo szeroka reguła
  // pozwoliłaby każdemu przyszłemu testowi sięgnąć po dowolny plik projektu
  // i przestałaby cokolwiek znaczyć.
  server: { fs: { allow: [".", "../../scripts"] } },
  test: {
    environment: "happy-dom",
    include: ["test/**/*.interaction.test.ts?(x)"],
    // Domyślnie Vitest zbiera każdy `*.test.ts`, a w tym katalogu leży
    // dwadzieścia kilka plików `node:test`, których NIE wolno mu uruchomić:
    // wyglądałyby na przechodzące, nie wykonując ani jednej asercji.
    globals: false,
    restoreMocks: true,
  },
});
