/// <reference types="node" />

import { readdirSync, statSync } from "node:fs";
import path from "node:path";

/** Jedna linia tekstu, który człowiek może zobaczyć na ekranie. */
export type CopyLine = {
  readonly line: number;
  readonly text: string;
};

/** Wszystkie pliki źródłowe renderera, rekurencyjnie. */
export const collectSourceFiles = (root: string): string[] => {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const full = path.join(directory, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (full.endsWith(".ts") || full.endsWith(".tsx")) {
        found.push(full);
      }
    }
  };
  walk(root);
  return found.sort();
};

type Mode = "code" | "line-comment" | "block-comment" | "string" | "template";

/**
 * Zwraca wyłącznie tekst, który może trafić na ekran: zawartość literałów
 * tekstowych i treść JSX. Komentarze są wycinane świadomie — polskie komentarze
 * w kodzie są decyzją, nie długiem, a strażnik, który je liczy, mierzyłby coś
 * innego niż interfejs.
 *
 * To nie jest parser TypeScriptu i nie udaje nim być. Jest to maszyna stanu nad
 * znakami, wystarczająco dokładna, żeby odróżnić `"tekst"` od `// tekst`, plus
 * jedno wyrażenie na treść JSX. Ryzyko fałszywej pozytywki jest znikome, bo
 * wołający i tak szuka POLSKICH znaczników, a nie dowolnego tekstu.
 */
export const stripCommentsAndCode = (source: string): CopyLine[] => {
  const copy: CopyLine[] = [];
  let mode: Mode = "code";
  let quote = "";
  let buffer = "";
  let bufferLine = 1;
  let line = 1;
  // Kod bez komentarzy i bez literałów — zostaje w nim struktura JSX, z której
  // druga faza wyciąga treść między znacznikami.
  let skeleton = "";
  // Ostatni znak niebędący białym — rozstrzyga, czy apostrof otwiera literał,
  // czy stoi w środku angielskiego słowa.
  let previousMeaningful = "";

  const flushBuffer = (): void => {
    if (buffer.trim().length > 0) {
      copy.push({ line: bufferLine, text: buffer });
    }
    buffer = "";
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (character === "\n") {
      line += 1;
    }

    switch (mode) {
      case "code": {
        if (character === "/" && next === "/") {
          mode = "line-comment";
          index += 1;
          continue;
        }
        if (character === "/" && next === "*") {
          mode = "block-comment";
          index += 1;
          continue;
        }
        // Apostrof w PROZIE JSX ("the record's permissions", "don't") nie
        // otwiera literału. Bez tego wyjątku maszyna stanu wchodzi w tryb
        // stringa na środku zdania i połyka wszystko do następnego apostrofu —
        // a to ukrywa polską treść, czyli psuje pomiar w stronę fałszywego
        // spokoju. Rozróżnienie: literał zaczyna się PO znaku, który nie jest
        // literą ani cyfrą (`=`, `(`, `,`, `[`, `{`, `:`, `?`), apostrof w
        // prozie stoi zaraz po literze. Prettier w tym repo normalizuje stringi
        // do cudzysłowów, więc `'` po literze nie jest tu literałem nigdy.
        if (character === "'" && /[A-Za-z0-9]/.test(previousMeaningful)) {
          skeleton += character;
          continue;
        }
        if (character === '"' || character === "'" || character === "`") {
          mode = character === "`" ? "template" : "string";
          quote = character;
          buffer = "";
          bufferLine = line;
          continue;
        }
        if (!/\s/.test(character)) previousMeaningful = character;
        skeleton += character;
        continue;
      }
      case "line-comment": {
        if (character === "\n") {
          mode = "code";
          skeleton += "\n";
        }
        continue;
      }
      case "block-comment": {
        if (character === "*" && next === "/") {
          mode = "code";
          index += 1;
        }
        if (character === "\n") {
          skeleton += "\n";
        }
        continue;
      }
      case "string":
      case "template": {
        if (character === "\\") {
          buffer += source[index + 1] ?? "";
          index += 1;
          continue;
        }
        if (character === quote) {
          flushBuffer();
          mode = "code";
          quote = "";
          continue;
        }
        // `${…}` w szablonie to kod, nie tekst — inaczej nazwa zmiennej
        // zostałaby policzona jako copy.
        if (mode === "template" && character === "$" && next === "{") {
          let depth = 1;
          index += 2;
          while (index < source.length && depth > 0) {
            const inner = source[index] ?? "";
            if (inner === "{") depth += 1;
            if (inner === "}") depth -= 1;
            if (inner === "\n") line += 1;
            index += 1;
          }
          index -= 1;
          continue;
        }
        buffer += character;
        continue;
      }
    }
  }
  flushBuffer();

  // Treść JSX: to, co stoi między `>` a `<` i nie jest wyrażeniem. Numer linii
  // odtwarzamy licząc końce linii w szkielecie do miejsca trafienia.
  //
  // Białe znaki po `>` obejmują KOŃCE LINII, bo prettier łamie dłuższą treść
  // do własnej linii — `<button>\n  Otwórz w nowej karcie\n</button>`. Wersja
  // wymagająca treści zaraz po `>` przepuszczała dokładnie te napisy, czyli
  // te dłuższe, czyli te, na których najbardziej zależy. Nadmiarowe złapanie
  // (`a > b && c < d`) jest tu nieszkodliwe: wołający szuka POLSKICH
  // znaczników, a identyfikatory w tym repo są angielskie.
  const jsxText = />\s*([^<>{}][^<>{}]*?)\s*</g;
  let match: RegExpExecArray | null;
  while ((match = jsxText.exec(skeleton)) !== null) {
    const text = match[1] ?? "";
    if (!/[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/.test(text)) {
      continue;
    }
    const before = skeleton.slice(0, match.index);
    copy.push({
      line: before.split("\n").length,
      text,
    });
  }

  return copy.sort((left, right) => left.line - right.line);
};
