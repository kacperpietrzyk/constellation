// KROK MERGE'A WPISU 11-2 (lista notatek pokazuje urywek treści) —
// PRZEPISANIE `.ui-craft/patterns.md`.
//
// PO CO TEN PLIK ISTNIEJE. `/.ui-craft/` jest gitignorowany (`.gitignore:5`),
// więc przepisania kontraktu nie da się dowieźć commitem — a reguła fali mówi,
// że kiedy prototyp wygrywa z kontraktem, kontrakt przepisuje się W TYM SAMYM
// PRZEBIEGU. Ten sam kształt zadziałał w lotach L3, L4 i przy wpisie 10-3:
// dosłowne „BYŁO → MA BYĆ" w pliku ŚLEDZONYM plus mechaniczny aplikator
// z twardymi kotwicami.
//
// WSZYSTKO ALBO NIC. Skrypt najpierw sprawdza WSZYSTKIE kotwice, potem pisze
// raz. Kotwica nietrafiona = wyjątek i ZERO zapisu — kontrakt przepisany
// w połowie byłby gorszy niż nieprzepisany, bo czytałby się jak dokończony.
//
// IDEMPOTENTNY. Uruchomiony drugi raz stwierdza, że tekst docelowy już stoi,
// i kończy się zerem, nie dopisując niczego po raz drugi.
//
//   node scripts/apply-ui-craft-11-2.mjs            # z korzenia głównego repo
//   UI_CRAFT_ROOT=/inna/sciezka node scripts/apply-ui-craft-11-2.mjs
//
// JEDNA ZMIANA, I JEST SKUTKIEM POMIARU, NIE REDAKCJI. Wzorzec „Pattern:
// Narrow switching column" opisuje dziś głowę kolumny, dwa piętra chromu,
// wyściółkę wiersza, stopkę i pigułki — czyli KAŻDĄ część wiersza notatki
// oprócz tej jednej, po której notatkę da się poznać. Prototyp rysuje pod
// tytułem dwuwierszowy fragment jej własnej treści (`.kn-row-excerpt`,
// `v3/screens/knowledge.css:158-161`, wołany dla KAŻDEGO wiersza
// w `knowledge.js:719`), a aplikacja rysowała tytuł, rodzaj i datę. Kontrakt
// milczał, więc ten stan nie łamał żadnej zapisanej reguły — i dokładnie
// dlatego przeżył trzy loty nad tym samym ekranem. Milczenie kontraktu jest
// tu wadą kontraktu, nie licencją dla aplikacji.
//
// Nowe ograniczenie mówi TRZY rzeczy naraz, bo rozdzielone dawałyby się
// spełnić po jednej i minąć cel (pierwsza z nich ma dwie połowy):
//   • wiersz niesie POCZĄTEK tekstu notatki (nie streszczenie, nie etykietę)
//     i NIGDY nie otwiera się powtórzeniem tytułu — dopisane przy odbiorze,
//     bo pierwsza wersja tego wzorca milczała o echu, a echo zjadało całą
//     widoczną klamrę i jest stanem, który przynosi import z Obsidiana;
//   • przycina KLAMRA, nie kernel — więc widoczna długość zależy od kolumny
//     i pisma czytelnika, a nie od liczby wpisanej w kod;
//   • wiersz notatki BEZ urywka ma o jeden pas mniej, a nie pusty pas.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root =
  process.env.UI_CRAFT_ROOT ?? "/Users/kacper/Projects/Constellation";
const file = path.join(root, ".ui-craft", "patterns.md");

if (!existsSync(file))
  throw new Error(
    `UI_CRAFT_MISSING: ${file} does not exist. Run this from a tree that HAS the ` +
      "contract, or point UI_CRAFT_ROOT at one.",
  );

const edits = [
  {
    what: "the narrow switching column says what a row carries, not only how it is chromed",
    // BYŁO — dosłownie, `.ui-craft/patterns.md` na 2026-08-16.
    was: `- **A row's stopper is its footer's right end.** Two outlined pills on the left,`,
    // MA BYĆ.
    willBe: `- **A row says what the note is ABOUT, not only what it is called.** Under the
  title stands the OPENING OF THE NOTE'S OWN TEXT, clamped to two lines: the
  reference draws it on every row (\`.kn-row-excerpt\`,
  \`v3/screens/knowledge.css:158-161\`, emitted for each row at
  \`knowledge.js:719\`) and this contract had no rule for it at all, which is why
  three lots passed over the same column and left a list of titles. Written down
  2026-08-16 (Phase III, entry 11-2), and it carries three halves that only work
  together:

  - **The text is the note's, and it is the BEGINNING of it.** Not a summary,
    not the kind, not a phrase-centred search snippet — those answer a question
    the reader did not ask. A reader scanning a column is deciding which note to
    open, and the first sentence is what that decision is made of.
  - **And it never opens by repeating the title.** A body whose first block
    restates the note's own name would otherwise spend the whole visible clamp
    saying what the row already says one line above — measured on acceptance of
    this entry: 50 of the 67 characters a two-line clamp let through were the
    title a second time. This is a production shape, not a fixture accident: an
    Obsidian import takes the title from the FILE NAME and keeps the \`# Title\`
    line as a heading node, so the echo arrives with the first import. The
    reference never does it — every excerpt in \`v3/data.js:557-576\` is body
    prose.
  - **The clamp cuts, not the read.** The projection bounds what crosses the
    process boundary because a Space carries every note's excerpt in one answer;
    what a reader SEES is two lines of their own column at their own text size
    (\`-webkit-line-clamp: 2\` over \`display: -webkit-box\` — the clamp is inert
    without the box, and a rule declaring only the first clamps nothing). Two
    cuts written in two places are one decision that will disagree with itself
    the first time somebody reads the app at 200% text.
  - **A note with no excerpt gets one row less, never an empty band.** A note
    whose body was never written through this application has no indexed text,
    and an empty band under its title reads as „this note says nothing" — a
    claim about the note the screen has not earned. The same rule this column's
    own reading pane already applies when the structure read is refused.

- **A row's stopper is its footer's right end.** Two outlined pills on the left,`,
  },
];

const before = readFileSync(file, "utf8");
let after = before;
const applied = [];
const already = [];

for (const edit of edits) {
  if (after.includes(edit.willBe)) {
    already.push(edit.what);
    continue;
  }
  const hits = after.split(edit.was).length - 1;
  if (hits !== 1)
    throw new Error(
      `UI_CRAFT_ANCHOR: „${edit.what}" — the anchor matched ${hits} time(s), and exactly one ` +
        "is required. NOTHING has been written: a contract rewritten halfway reads as finished. " +
        "Re-read the file and fix the anchor before running this again.",
    );
  after = after.replace(edit.was, edit.willBe);
  applied.push(edit.what);
}

if (after === before) {
  console.log(
    `ui-craft 11-2: nothing to do — ${already.length} edit(s) already in place.`,
  );
} else {
  writeFileSync(file, after, "utf8");
  console.log(`ui-craft 11-2: wrote ${applied.length} edit(s) to ${file}`);
  for (const what of applied) console.log(`  applied: ${what}`);
  for (const what of already) console.log(`  already: ${what}`);
}
