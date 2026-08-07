// JEDEN WŁAŚCICIEL ODPOWIEDZI „ILE WYNOSI TEN TOKEN W TYM MOTYWIE".
//
// Ten plik nie powstał z chęci porządku. Powstał, bo drugą bramkę kontrastu
// (`consumer-contrast.test.mjs`, mierzącą KONSUMENTÓW z arkuszy powierzchni)
// dało się napisać tylko na dwa sposoby: przepisując tu kaskadę motywów
// i podstawianie `var()` po raz drugi, albo wyjmując je z `status-contrast.test.mjs`
// do wspólnego miejsca. To repozytorium ma już nazwaną klasę defektu „ten sam
// kształt przepisany w kilku schematach" — trafiła w nie trzy razy w jednej fali.
// Kaskada `:root` + `[data-theme]` jest dokładnie takim kształtem: przepisana
// drugi raz, milczałaby osobno w każdej z dwóch bramek.
//
// PRZENIESIENIE BYŁO CZYSTE. Ciała funkcji są tu bajt w bajt takie, jak stały
// w `status-contrast.test.mjs`; zmieniło się WYŁĄCZNIE to, że domykają się przez
// argumenty fabryki zamiast przez moduł (`rules`, `tokensPath`). Sprawdzone
// przez porównanie CAŁEGO wyjścia `node --test scripts/status-contrast.test.mjs`
// przed i po: 223 wiersze, 27/27, tabele identyczne co do znaku.
//
// CZEGO TU NIE MA I DLACZEGO: `resolve` NIE obsługuje `var(--x, zapas)`.
// `tokens.css` nie używa ani jednej wartości zapasowej (sprawdzone grepem),
// a arkusze powierzchni owszem — więc dołożenie tego tutaj rozszerzyłoby
// zachowanie ZIELONEJ bramki po to, żeby obsłużyć wejście, którego ona nigdy
// nie dostaje. Zapas rozwiązuje strona, która go ma: `consumer-contrast`.
import { parseColor } from "./color-contrast.mjs";

/** Reguły najwyższego poziomu, po selektorze i ciele. */
export const topLevelRules = (css) => {
  const rules = [];
  let depth = 0;
  let selectorStart = 0;
  let bodyStart = -1;
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (character === "{") {
      depth += 1;
      if (depth === 1) bodyStart = index + 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        rules.push({
          selector: css.slice(selectorStart, bodyStart - 1).trim(),
          body: css.slice(bodyStart, index),
        });
        selectorStart = index + 1;
      }
    }
  }
  return rules;
};

/** Deklaracje `--token: wartość` z ciała reguły; wartości bywają wielowierszowe. */
export const customProperties = (body) => {
  const declarations = [];
  let depth = 0;
  let start = 0;
  const push = (chunk) => {
    const text = chunk.trim();
    const colon = text.indexOf(":");
    if (colon < 0) return;
    const name = text.slice(0, colon).trim();
    if (!name.startsWith("--")) return;
    declarations.push([name, text.slice(colon + 1).trim()]);
  };
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === ";" && depth === 0) {
      push(body.slice(start, index));
      start = index + 1;
    }
  }
  push(body.slice(start));
  return declarations;
};

/**
 * Arkusz tokenów → zestaw narzędzi rozwiązujących. `sourcePath` wchodzi
 * WYŁĄCZNIE do komunikatów błędów: bramka, która nie umie powiedzieć, w którym
 * pliku brakuje tokenu, zamienia porażkę w zagadkę.
 */
export const tokenSheet = ({ css, sourcePath }) => {
  const rules = topLevelRules(css);

  // Kaskada, nie „blok motywu". Pierwszy blok arkusza ma selektor
  // `:root, [data-theme="dark"]`, więc na `<html data-theme="light">` DALEJ się
  // stosuje — przez `:root`. Motyw jasny nadpisuje tylko to, co wymienia u siebie.
  const themeTokens = (themeName) => {
    const map = new Map();
    for (const { selector, body } of rules) {
      const selects = selector
        .split(",")
        .map((part) => part.trim())
        .some(
          (part) => part === ":root" || part === `[data-theme="${themeName}"]`,
        );
      if (!selects) continue;
      for (const [name, value] of customProperties(body)) {
        map.set(name, { value, from: selector.replace(/\s+/g, " ") });
      }
    }
    return map;
  };

  /** `var(--x)` rozwiązywane w obrębie motywu; brak definicji = GŁOŚNY błąd. */
  const resolve = (tokens, name, themeName, seen = new Set()) => {
    const entry = tokens.get(name);
    if (!entry) {
      throw new Error(
        `Motyw „${themeName}" nie definiuje ${name} w ${sourcePath}. ` +
          "Bramka kontrastu nie ma czego zmierzyć — nazwa tokenu zmieniła kształt " +
          "albo token zniknął.",
      );
    }
    if (seen.has(name)) {
      throw new Error(`Cykl var() na ${name} w motywie „${themeName}".`);
    }
    seen.add(name);
    // Bloki, które DOŁOŻYŁY SIĘ do wartości — nie tylko blok tokenu nazwanego
    // w rodzinie. `--action-primary-bg` jest zadeklarowane raz, w `:root`, ale
    // w motywie jasnym jego wartość przychodzi przez `--accent` remapowany
    // w bloku jasnym. Sama prowieniencja głowy łańcucha czytałaby się wtedy jak
    // sprzeczność („blok ciemny, a wartość jasna") — dlatego ślad jest z całej
    // ścieżki podstawień.
    const blocks = [entry.from];
    const substituted = entry.value.replace(
      /var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g,
      // Każde podstawienie dostaje WŁASNĄ kopię śladu. Wspólny zbiór między
      // rodzeństwem znaczyłby, że wartość wymieniająca ten sam token dwa razy
      // (np. cień z `var(--accent)` w dwóch warstwach) melduje „cykl var()",
      // którego nie ma. Kłamiąca diagnoza jest gorsza od braku diagnozy;
      // prawdziwy cykl dalej rośnie wzdłuż ŁAŃCUCHA i zostaje złapany.
      (_match, referenced) => {
        const inner = resolve(tokens, referenced, themeName, new Set(seen));
        blocks.push(...inner.blocks);
        return inner.literal;
      },
    );
    return { literal: substituted.trim(), from: entry.from, blocks };
  };

  /** Rozwiązany token → kolor. Wszystko, czego nie umiem rozłożyć, ma krzyknąć. */
  const colorOf = (tokens, name, themeName) => {
    const { literal, from, blocks } = resolve(tokens, name, themeName);
    let color;
    try {
      color = parseColor(literal);
    } catch (cause) {
      throw new Error(
        `Motyw „${themeName}", token ${name} = „${literal}" — nie umiem tego rozłożyć ` +
          `na kolor, więc NIE ZGADUJĘ. (${cause.message})`,
      );
    }
    return { ...color, token: name, literal, from, blocks };
  };

  /** Wszystkie nazwy tokenów zadeklarowane GDZIEKOLWIEK w arkuszu. */
  const declaredTokenNames = new Set(
    rules.flatMap(({ body }) => customProperties(body).map(([name]) => name)),
  );

  return { rules, declaredTokenNames, themeTokens, resolve, colorOf };
};

/** Czy literał daje się rozłożyć na kolor przez `color-contrast.mjs`. */
export const looksLikeAColor = (literal) => {
  try {
    parseColor(literal);
    return true;
  } catch {
    return false;
  }
};
