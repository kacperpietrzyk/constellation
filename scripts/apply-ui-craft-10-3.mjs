// KROK MERGE-A WPISU 10-3 (wiersz spotkania zbudowany od nowa) —
// PRZEPISANIE `.ui-craft/patterns.md`.
//
// PO CO TEN PLIK ISTNIEJE. `/.ui-craft/` jest gitignorowany i w drzewie
// roboczym tego wpisu (`/private/tmp/claude-501/wt-c`) NIE ISTNIEJE — lot nie
// może więc przepisać kontraktu u siebie, choć reguła fali mówi, że kontrakt
// przepisuje się W TYM SAMYM PRZEBIEGU, w którym prototyp wygrywa. Ten sam
// kształt zadziałał w lotach L3 i L4: dosłowne „BYŁO → MA BYĆ" w pliku
// ŚLEDZONYM plus mechaniczny aplikator z twardymi kotwicami.
//
// WSZYSTKO ALBO NIC. Skrypt najpierw sprawdza WSZYSTKIE kotwice, potem pisze
// raz. Kotwica nietrafiona = wyjątek i ZERO zapisu — kontrakt przepisany
// w połowie byłby gorszy niż nieprzepisany, bo czytałby się jak dokończony.
//
// IDEMPOTENTNY. Uruchomiony drugi raz stwierdza, że tekst docelowy już stoi,
// i kończy się zerem, nie dopisując niczego po raz drugi.
//
//   node scripts/apply-ui-craft-10-3.mjs            # z korzenia głównego repo
//   UI_CRAFT_ROOT=/inna/sciezka node scripts/apply-ui-craft-10-3.mjs
//
// TRZY ZMIANY, WSZYSTKIE W „Pattern: Section head over a list card", wszystkie
// SKUTEK POMIARU, nie redakcja:
//
//  (1) Ograniczenie o głębi mówiło, że wpuszczenie zawsze idzie z glifem
//      i słowem, i że referencja daje mu plakietkę z nazwą dostawcy — ale NIE
//      MÓWIŁO GDZIE. Aplikacja czytała to jako „gdziekolwiek na ekranie"
//      i postawiła plakietkę wyłącznie przy nagłówku sekcji, podczas gdy
//      wpuszczony jest WIERSZ. Zdanie o miejscu jest jedyną rzeczą, która
//      odróżnia dostawę od półstanu, w którym głębia wiersza nie ma podpisu.
//
//  (2) Ograniczenie o rekompozycji pisało o wnętrzu wiersza „key/value pairs
//      inside the body carrying their own label track (`:107-112`)" — czyli
//      DWIE ścieżki. Cytowane linie niosą TRZY (`13rem minmax(0, 1fr) auto`);
//      trzecia jest celem pozycji. Kontrakt czytał własny cytat o jedną
//      ścieżkę za mało, a aplikacja poszła dokładnie za tym odczytem
//      i zbudowała pozycję bez drogi do rzeczy, o której ta pozycja mówi.
//
//  (3) Wzorzec nie miał ANI SŁOWA o tym, co wiersz mówi o ludziach, a to jest
//      pierwsza oś wpisu 10-3 i jedyna, która niesie ustalenie o kontrakcie
//      danych. Nowe ograniczenie mówi regułę (imiona, nie licznik) RAZEM
//      z granicą, której nie wolno przekroczyć zgadywaniem.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root =
  process.env.UI_CRAFT_ROOT ?? "/Users/kacper/Projects/Constellation";
const file = path.join(root, ".ui-craft", "patterns.md");

if (!existsSync(file))
  throw new Error(
    `UI_CRAFT_MISSING: ${file} does not exist. Run this from a tree that HAS the ` +
      "contract, or point UI_CRAFT_ROOT at one. The lot's worktree does not.",
  );

const edits = [
  {
    what: "(1) the depth constraint says WHERE the lock pill stands",
    // BYŁO — dosłownie, `.ui-craft/patterns.md` na 2026-08-15.
    was: `  hole in the page. Depth is invisible to a reader who cannot see it, so it
  always ships with a glyph and a worded label — the reference pairs it with a
  lock pill naming the provider.`,
    // MA BYĆ.
    willBe: `  hole in the page. Depth is invisible to a reader who cannot see it, so it
  always ships with a glyph and a worded label — the reference pairs it with a
  lock pill naming the provider. THE PILL STANDS WHERE THE DEPTH DOES, and the
  sentence needs that half or it buys nothing: the reference sinks the ROW
  (\`.mt-up\`, \`v3/screens/meetings.css:54-62\`) and puts a lock pill in that
  row's own third track (\`meetings.js:246-248\`), while the pill on the section
  head (\`:437-438\`) speaks for the SECTION and is a second, separate thing —
  the reference carries both. An application that keeps only the head pill has
  a sunken row nobody labelled, and every placement pair over the head stays
  green above it. Measured on this project 2026-08-15, before entry 10-3: one
  provider pill on the screen, at the head, over a row sunk by
  \`--surface-sunken\`. AND EACH PILL NAMES ITS OWN SUBJECT: the head pill
  speaks for the connection, the row pill for THAT event, and the two are
  separate fields in the projection (\`CalendarCapability.provider\` against
  \`CalendarEventProjection.provider\`). A row pill fed from the section reads
  as a fact about the event and is not one — measured on this project the same
  day, where a row carrying \`provider: "fixture"\` printed "Apple Calendar",
  and the placement pair above it counted the pill and saw nothing.`,
  },
  {
    what: "(2) the recomposition constraint reads its own citation as three tracks",
    was: `  "when" stacked as a column inside its own track (\`:70-73\`) and key/value pairs
  inside the body carrying their own label track (\`:107-112\`). A row still`,
    willBe: `  "when" stacked as a column inside its own track (\`:70-73\`) and, inside the
  body, preparation items that are THEMSELVES three-track grids —
  \`13rem minmax(0, 1fr) auto\` (\`:107-112\`): a named key, the thing, and the
  WAY OUT to it. The third track was misread here as absent until 2026-08-15,
  and the application followed the misreading exactly: it built the item with
  a label and a value and no route to the record the value names. A key/value
  pair is not the pattern; a named row that can be walked to is. THE WAY OUT IS
  DATA BEFORE IT IS PAINT, and this is the same limit the room's role carries
  below: a route may only be drawn where the projection carries an identifier
  that ADDRESSES the record the item names. Measured on this project
  2026-08-15: the evidence a meeting brief carries puts the work item's own id
  in \`recordId\`, never the task's, and the branded id schema is a type-only
  brand — both sides are plain uuids, so no runtime guard can tell them apart
  and a route drawn from it opens a screen at an address that holds nothing.
  Until the reader carries the addressed id, the third track stands empty and
  the gap is written down; a button that goes nowhere is worse than a track
  that admits it is waiting. A row still`,
  },
  {
    what: "(3) the pattern gains the constraint about who is in the room",
    was: `- **Both twins of a stacked set get the head, and BOTH get measured.** Where a`,
    willBe: `- **A row about a meeting says WHO, and a count is not an answer.** The
  reference writes the reason into its own stylesheet
  (\`v3/screens/meetings.css:84-91\`): "z rolą, bo »MN · PZ« nie przygotowuje
  nikogo do rozmowy" — the room is an avatar, a name and a role per person
  (\`meetings.js:239-242\`), because a number prepares nobody for a conversation
  and initials alone are the same number wearing letters. TWO LIMITS COME WITH
  THE RULE, and they are what keeps it honest rather than decorative. First,
  the role is DATA: if the projection does not carry a job title, the row draws
  the avatar and the name and STOPS — a meeting-level flag such as "organizer"
  put in the role slot reads as a job title and is a lie the next reader
  inherits. Second, the reference's dashed \`unlinked\` shape asserts that the
  attendee is not yet a person in the graph; a surface that never looks the
  graph up may not wear it. Silence is cheaper than an unbacked claim.
  Measured on this project 2026-08-15: \`CalendarAttendeeSchema\`
  (\`packages/contracts/src/meeting-loop.ts:43-53\`) is \`.strict()\` and carries
  \`name\` but no title and no person id, so names ship and roles are written
  down as a contract finding instead of being invented.
- **Both twins of a stacked set get the head, and BOTH get measured.** Where a`,
  },
];

const before = readFileSync(file, "utf8");

// KROK 1 — SPRAWDŹ WSZYSTKO, ZANIM ZAPISZESZ COKOLWIEK.
const alreadyDone = edits.every((edit) => before.includes(edit.willBe));
if (alreadyDone) {
  console.log(
    `apply-ui-craft-10-3: all ${edits.length} edit(s) already stand in ${file}; nothing written.`,
  );
  process.exit(0);
}

const missed = [];
for (const edit of edits) {
  if (before.includes(edit.willBe)) continue;
  const hits = before.split(edit.was).length - 1;
  if (hits !== 1)
    missed.push(
      `${edit.what}: its anchor matched ${hits} time(s) in ${file}, and an all-or-nothing ` +
        "rewrite needs exactly one. The contract moved under this step — re-read it and " +
        "rewrite the anchor by hand rather than loosening it.",
    );
}
if (missed.length > 0)
  throw new Error(
    `UI_CRAFT_ANCHOR_MISS (${missed.length} of ${edits.length}): NOTHING WAS WRITTEN.\n` +
      missed.map((line) => `  - ${line}`).join("\n"),
  );

// KROK 2 — DOPIERO TERAZ PISZ, RAZ.
let after = before;
let applied = 0;
for (const edit of edits) {
  if (after.includes(edit.willBe)) continue;
  after = after.replace(edit.was, edit.willBe);
  applied += 1;
}
writeFileSync(file, after, "utf8");
console.log(
  `apply-ui-craft-10-3: ${applied} of ${edits.length} edit(s) written to ${file}.`,
);
for (const edit of edits) console.log(`  ✓ ${edit.what}`);
