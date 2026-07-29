/**
 * Porównywanie WĘZŁÓW DOM w asercjach — bez wsadzania węzła do błędu.
 *
 * `assert.equal(document.activeElement, opener, "…")` wygląda na oczywisty
 * sposób sprawdzenia, dokąd wróciło ognisko, i jest pułapką: przy NIEZGODNOŚCI
 * `AssertionError` niesie oba węzły w polach `actual` i `expected`, a
 * serializacja błędu w Vitescie obchodzi wtedy cały graf obiektów happy-doma.
 * Zmierzone na żywym workerze: 249% CPU, 32 GB RSS, szczyt 95,6 GB — proces
 * ginie od systemu, więc NIE MA ani komunikatu, ani nazwy testu, ani stosu.
 * `--max-old-space-size` tego nie ogranicza, bo rośnie pamięć poza stertą V8.
 *
 * Skutek jest gorszy niż sama awaria: przebieg kończy się kodem 1, wypisując
 * „13 passed" i ZERO porażek. Czytający log widzi flaka infrastruktury, nie
 * złamaną gwarancję — a to jest dokładnie ta klasa, przez którą asercja staje
 * się ozdobą.
 *
 * Dlatego porównanie tożsamości węzłów idzie przez ten plik: rozstrzyga
 * `===` na referencjach, a do komunikatu wchodzi wyłącznie OPIS tekstowy.
 */

/** Krótki, jednoznaczny opis węzła: tyle, żeby poznać, który to element. */
export const describeNode = (node: unknown): string => {
  if (node === null) return "null";
  if (node === undefined) return "undefined";
  if (!(node instanceof Element)) {
    return typeof node === "object" ? "a non-element node" : String(node);
  }
  const id = node.id === "" ? "" : `#${node.id}`;
  const classes =
    node.classList.length === 0 ? "" : `.${[...node.classList].join(".")}`;
  const label = node.getAttribute("aria-label");
  const named = label === null ? "" : ` aria-label="${label}"`;
  const text = (node.textContent ?? "").trim().slice(0, 40);
  const said = text === "" ? "" : ` text="${text}"`;
  return `<${node.localName}${id}${classes}${named}${said}>`;
};

/**
 * Ten sam węzeł, co do referencji. Przy niezgodności rzuca zwykły `Error`
 * z opisem obu stron — bez `actual`/`expected`, czyli bez węzła w błędzie.
 */
export const assertSameNode = (
  actual: unknown,
  expected: unknown,
  message: string,
): void => {
  if (actual === expected) return;
  throw new Error(
    `${message} — expected ${describeNode(expected)}, got ${describeNode(actual)}`,
  );
};

/**
 * Węzła NIE MA. `assert.equal(container.querySelector("…"), null, …)` wygląda
 * niewinnie i jest tą samą pułapką co wyżej: przy niezgodności — czyli
 * dokładnie wtedy, gdy gwarancja jest złamana — do błędu trafia znaleziony
 * węzeł i przebieg ginie zamiast zaczerwienić się z komunikatem. Zmierzone:
 * worker pada po ~105 s, a podsumowanie melduje „1 passed" z czterech testów.
 */
export const assertNoNode = (found: unknown, message: string): void => {
  if (found === null || found === undefined) return;
  throw new Error(`${message} — found ${describeNode(found)}`);
};

/**
 * Nazwa, która coś znaczy. Sam warunek „tekst niepusty" przechodzi na
 * nagłówku o treści `.` — sprawdzone przez zepsucie: skrócenie wszystkich
 * nagłówków punktu orientacyjnego do kropki zostawiło komplet zieleni. Punkt
 * orientacyjny nazwany kropką nie jest nazwany.
 */
export const assertNamed = (node: Element | null, message: string): void => {
  const text = (node?.textContent ?? "").trim();
  if (/\p{L}{2,}/u.test(text)) return;
  throw new Error(`${message} — its name reads ${JSON.stringify(text)}`);
};

/** Odwrotność powyższego: dwa RÓŻNE węzły. */
export const assertDifferentNode = (
  actual: unknown,
  expected: unknown,
  message: string,
): void => {
  if (actual !== expected) return;
  throw new Error(`${message} — both are ${describeNode(actual)}`);
};
