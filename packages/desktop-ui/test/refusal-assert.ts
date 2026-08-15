/**
 * CO MUSI ZOSTAĆ PRAWDĄ O PANELU ODMOWY — pytanie o WŁASNOŚĆ, nie o napis.
 *
 * SKĄD TO SIĘ WZIĘŁO. Przeliczenie ogona (wpis 7-2, 2026-08-15) zmierzyło, że
 * zdanie `radar.review was refused: query.not_available. …` niesie
 * identyfikatory kontraktu w treści pisanej dla człowieka, i że naprawa tego
 * copy przewróci testy. Sprawdzone w źródle, i sprawdzenie POPRAWIA tamten
 * zapis w jednym miejscu, które ma znaczenie dla wykonawcy:
 *
 *   • pięć „asercji" cytujących zdanie dosłownie w
 *     `projection-honesty.interaction.test.tsx` (`:309`, `:319`, `:422`,
 *     `:493`, `:547`) to nie asercje, tylko FIKSTURY — pola `message`
 *     wstrzykiwane do migawki. Zmiana copy w produkcie zostawiłaby je zielone
 *     i skamieniałe. Odtąd budują je przez `projectionRefusedMessage`, więc
 *     zmiana zdania w produkcie sama do nich dojeżdża;
 *   • WYMUSZA wyciek co innego: `assert.match(stated, /relationship\\.workspace/)`
 *     i `/authorization\\.denied/` nad tekstem, który przyszedł z prawdziwego
 *     klienta. To żąda identyfikatora W PROZIE, bo proza jest jedynym kanałem,
 *     jaki panel ma;
 *   • trzecia rzecz jest odwrotna i gorsza: `organizations-screen`
 *     asertowało `length > 20`, czyli „powód jest długi". Dowolne długie
 *     zdanie ją spełnia — także takie, które nie mówi, co się nie udało.
 *
 * CO ASERTUJE TEN PLIK. Że przyczyna jest ODZYSKIWALNA z panelu: nazwa
 * odmówionego odczytu i kod odmowy dają się z niego wyjąć — z treści ALBO
 * z atrybutu o ZADEKLAROWANEJ nazwie `data-refused-…` (stałą niesie
 * `REFUSAL_ATTRIBUTE_PREFIX` niżej). Dziś spełnia to treść; po poprawce copy ma
 * to spełniać atrybut, i wtedy ten sam test przechodzi bez jednej zmiany —
 * PRZY JEDNYM WARUNKU, który jest tu zapisany właśnie po to, żeby wykonawca
 * tamtej poprawki nie odkrył go z czerwonego przebiegu: atrybut musi nazywać
 * się `data-refused-query` / `data-refused-code` (dowolny sufiks po tym
 * prefiksie), a nie byle jak. Prefiks jest częścią obietnicy, nie szczegółem
 * implementacji. To jest cała różnica między asercją, która PILNUJE zdolności,
 * a asercją, która KONSERWUJE dzisiejsze zdanie.
 *
 * CZEGO NIE ZNACZY „ODZYSKIWALNA", ŻEBY NIKT NIE PRZECZYTAŁ TEGO SZERZEJ:
 * kanał atrybutowy jest kanałem dla ZGŁOSZENIA BŁĘDU i dla diagnostyki, nie dla
 * czytelnika patrzącego na ekran. Asercja o tym, że przyczynę widzi człowiek
 * BEZ narzędzi, byłaby zdaniem o prozie i musiałaby wyglądać inaczej —
 * dziś pilnuje jej osobno `assertRefusalReadsAsASentence` (panel mówi zdaniem,
 * co się stało), a nie ta funkcja.
 *
 * CZEGO NIE ASERTUJE, POWIEDZIANE WPROST: nie mówi, że proza jest wolna od
 * identyfikatora. Nie może — dziś nie jest, a asercja czerwona od pierwszego
 * dnia zostaje wyłączona, nie naprawiona. Kiedy tail przeniesie identyfikator
 * do atrybutu, warunek „proza go nie niesie" da się dopisać tutaj JEDNĄ
 * funkcją i będzie wtedy zielony — to jest zapisane zadanie, nie luka.
 */

/** Skąd wyjęto identyfikator — do komunikatu, żeby dowód był widoczny. */
type Channel = "text" | "attribute";

/**
 * NAZWA KANAŁU ATRYBUTOWEGO, i to jest wymóg, nie konwencja.
 *
 * Do naprawy lotu nasady Fazy III ta funkcja przyjmowała identyfikator
 * z DOWOLNEGO atrybutu `data-` gdziekolwiek w poddrzewie panelu. Przegląd
 * adwersarialny zmierzył, co to znaczy: panel
 * `<p data-x="relationship.workspace" data-y="authorization.denied">Nothing
 * readable here.</p>` PRZESZEDŁ. Asercja nie pytała wtedy o kanał — pytała
 * o obecność napisu w DOM, więc `data-testid` albo atrybut dołożony w zupełnie
 * innym celu spełniał ją przypadkiem.
 *
 * Kanał musi być ZADEKLAROWANY, bo cała treść tej asercji brzmi „produkt
 * UMYŚLNIE wystawia przyczynę". Prefiks jest tym umyślnym gestem: nikt nie
 * napisze `data-refused-…` przy okazji.
 */
const REFUSAL_ATTRIBUTE_PREFIX = "data-refused-";

const declaredAttributeValues = (panel: Element): string[] => {
  const values: string[] = [];
  const walk = (element: Element): void => {
    for (const attribute of element.attributes)
      if (attribute.name.startsWith(REFUSAL_ATTRIBUTE_PREFIX))
        values.push(attribute.value);
    for (const child of element.children) walk(child);
  };
  walk(panel);
  return values;
};

const findChannel = (panel: Element, needle: string): Channel | null => {
  if ((panel.textContent ?? "").includes(needle)) return "text";
  if (declaredAttributeValues(panel).some((value) => value.includes(needle)))
    return "attribute";
  return null;
};

/**
 * Panel odmowy niesie ODZYSKIWALNĄ przyczynę: który odczyt padł i z jakim
 * kodem. Rzuca zwykły `Error` (nie `assert.equal`) — do komunikatu wchodzi
 * wyłącznie tekst, nigdy węzeł; powód stoi w `dom-assert.ts`.
 */
export const assertRefusalIsRecoverable = (
  panel: Element | null,
  expected: { queryName: string; diagnosticCode: string; what: string },
): void => {
  if (panel === null)
    throw new Error(
      `${expected.what}: the screen drew no unavailable panel at all, so a refused read is ` +
        "indistinguishable from an empty one",
    );
  const said = (panel.textContent ?? "").trim();
  const channels: string[] = [];
  for (const [label, needle] of [
    ["the read that failed", expected.queryName],
    ["the kernel's refusal code", expected.diagnosticCode],
  ] as const) {
    const channel = findChannel(panel, needle);
    if (channel === null)
      // KOMUNIKAT MÓWI DOKŁADNIE TO, CO TA FUNKCJA SPRAWDZA, i to jest
      // poprawka, nie stylistyka. Stał tu argument „a reader with no DevTools
      // cannot tell this failure from any other" — nieprawdziwy o WŁASNEJ
      // asercji, bo przechodzi ona również wtedy, gdy identyfikator siedzi
      // WYŁĄCZNIE w atrybucie, którego czytelnik bez DevToolsów nie widzi.
      // Uzasadnienie szersze niż sprawdzana własność jest tą samą wadą, co
      // asercja szersza niż dowód: obiecuje zdolność, której nie pilnuje.
      throw new Error(
        `${expected.what}: ${label} („${needle}") cannot be recovered from the panel — neither ` +
          `from its text nor from a declared „${REFUSAL_ATTRIBUTE_PREFIX}…" attribute on it or ` +
          `inside it. Then nothing — not the reader, not a bug report, not a support transcript ` +
          `— can tell this failure from any other refusal the same screen can draw. Panel said: ` +
          `„${said.slice(0, 160)}".`,
      );
    channels.push(`${needle} via ${channel}`);
  }
  // DOWÓD KANAŁU JEST DRUKOWANY, i to nie jest ozdoba: kiedy tail przeniesie
  // identyfikatory z prozy do atrybutu, ta linia jest jedynym miejscem, po
  // którym widać, że przeniesienie ZASZŁO, a test nie przeszedł starą drogą.
  if (process.env.REFUSAL_ASSERT_TRACE === "1")
    console.log(
      `refusal recoverable\t${expected.what}\t${channels.join(", ")}`,
    );
};

/**
 * Zdanie dla człowieka MÓWI, CO SIĘ STAŁO — a nie jest samym identyfikatorem.
 *
 * Zastępuje `length > 20`. Pyta o rzecz, która przetrwa przepisanie copy:
 * panel niesie zdanie złożone ze SŁÓW, a nie sam zrzut identyfikatorów. To
 * jest własność, nie cytat — dowolne poprawne przepisanie zdania ją spełnia,
 * a napis „radar.review query.not_available" jej nie spełnia, mimo że ma ponad
 * 20 znaków.
 *
 * DROGI POWROTNEJ (przycisku „Try again") TA FUNKCJA NIE SPRAWDZA — pilnują
 * jej osobne asercje w miejscach wywołania, bo przycisk bywa RODZEŃSTWEM
 * panelu, a nie jego dzieckiem, i asercja o nim musiałaby dostać inny zakres
 * niż ten węzeł.
 */
export const assertRefusalReadsAsASentence = (
  panel: Element | null,
  what: string,
): void => {
  if (panel === null) throw new Error(`${what}: no unavailable panel`);
  const said = (panel.textContent ?? "").trim();
  const words = said
    .split(/\s+/u)
    .filter((word) => /^[A-Za-z][a-z]+$/u.test(word));
  if (words.length < 4)
    throw new Error(
      `${what}: the unavailable branch printed „${said.slice(0, 160)}", which carries ` +
        `${words.length} ordinary word(s). A reason made of identifiers is a log line, not a ` +
        "sentence — and the assertion this replaces (the string is longer than 20 characters) " +
        "is satisfied by any long string at all.",
    );
};
