// KROK MERGE-A LOTU L3 — PRZEPISANIE `.ui-craft/patterns.md`.
//
// PO CO TEN PLIK ISTNIEJE. `/.ui-craft/` jest gitignorowany i w drzewie
// roboczym tego lotu (`/private/tmp/claude-501/wt-b`) NIE ISTNIEJE — lot nie
// może więc przepisać kontraktu u siebie, choć reguła fali mówi, że kontrakt
// przepisuje się W TYM SAMYM PRZEBIEGU, w którym prototyp wygrywa. Ten sam
// kształt zadziałał w locie L4: dosłowne „BYŁO → MA BYĆ" w pliku ŚLEDZONYM
// plus mechaniczny aplikator z twardymi asercjami.
//
// WSZYSTKO ALBO NIC. Skrypt najpierw sprawdza WSZYSTKIE kotwice, potem pisze
// raz. Kotwica nietrafiona = wyjątek i ZERO zapisu — kontrakt przepisany
// w połowie byłby gorszy niż nieprzepisany, bo czytałby się jak dokończony.
//
// IDEMPOTENTNY. Uruchomiony drugi raz stwierdza, że tekst docelowy już stoi,
// i kończy się zerem, nie dopisując niczego po raz drugi.
//
//   node scripts/apply-ui-craft-l3.mjs            # z korzenia głównego repo
//   UI_CRAFT_ROOT=/inna/sciezka node scripts/apply-ui-craft-l3.mjs
//
// CO ZMIENIA I DLACZEGO — obie zmiany są SKUTKIEM POMIARU, nie redakcją:
//
//  (1) „Pattern: Surface title band", ograniczenie „A band names the screen;
//      it does not open it" kończyło się zdaniem o stanie aplikacji, które ten
//      lot unieważnił. Zdanie zostaje, ale mówi teraz, co jest, i przy jakim
//      przyrządzie — bo kontrakt, który opisuje wczorajszą aplikację, jest
//      pierwszym miejscem, w którym następny lot się pomyli.
//
//  (2) „Pattern: Reading surface" opisywał głowę czytelni jako „tytuł, wiersz
//      metadanych, rząd pigułek akcji" i NIE MIAŁ ograniczenia zakazującego
//      nadtytułu — a nadtytuł tam stał (wpis 11-4). Nie miał też ani słowa
//      o tym, że rząd akcji nie ma prawa stanąć OBOK tytułu, a to jest
//      przyczyna drugiej połowy tego wpisu i rzecz, której żadna bramka tego
//      repozytorium nie widzi.

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
    what: "(1) the band constraint stops describing an application that no longer exists",
    // BYŁO — dosłownie, z `.ui-craft/patterns.md:233-234` na 2026-08-15.
    was: `  Measured by instrument P3 on 2026-08-13: neither Today nor Calendar opens at
  \`--text-2xl\` in this application, and no other screen does either.`,
    // MA BYĆ.
    willBe: `  Measured by instrument P3 on 2026-08-13: neither Today nor Calendar opened
  at \`--text-2xl\` in this application, and no other screen did either. Lot L3
  closed both on 2026-08-15 — Today opens with \`h2\` \`[data-today-greeting]\`
  and Calendar with \`h2\` \`[data-week-title]\`, both at \`--text-2xl\` — and the
  axis is \`enforced\` since (\`TITLE_BAND_OPENING_STATUS\`,
  \`scripts/title-band-action.mjs\`). The count is the rule and it is asserted:
  exactly TWO screens answer \`OPENING_2XL\` on either side of the comparison,
  and a third one added anywhere fails \`scripts/title-band-action.test.mjs\`
  before it reaches a browser. Two things the axis does NOT ask, and which
  therefore belong here: the opening must be a HEADING (a 28px paragraph looks
  identical and is not an opening), and Calendar's words come from the week
  being shown, not from the reference's fixed "This week" — the reference has
  no week navigation, so a screen that pins those words lies over the next
  week's grid.`,
  },
  {
    what: "(2) the reading surface gains the two constraints entry 11-4 was about",
    // BYŁO — koniec listy ograniczeń „Pattern: Reading surface"
    // (`.ui-craft/patterns.md:915-918` na 2026-08-15), cytowany w całości,
    // żeby kotwica nie mogła trafić w sąsiedni wzorzec.
    was: `- **The metadata line says only what the projection knows.** \`document.list\`
  (\`packages/contracts/src/query.ts:1747-1762\`) carries no author, so the note
  reader states WHEN and WHERE and nothing about WHO. An initials avatar drawn
  from anything else would be an assertion about authorship the read cannot make.
`,
    willBe: `- **The metadata line says only what the projection knows.** \`document.list\`
  (\`packages/contracts/src/query.ts:1747-1762\`) carries no author, so the note
  reader states WHEN and WHERE and nothing about WHO. An initials avatar drawn
  from anything else would be an assertion about authorship the read cannot make.
- **Nothing stands above the title, and the KIND is not an exception.** The
  reference answers this twice and differently, so both addresses belong here:
  the NOTE reader is \`<header class="kn-reader-head"><h2 class="kn-reader-title">\`
  with nothing above it (\`v3/screens/knowledge.js:744-745\`), while the SOURCE
  reader does put \`<p class="kn-reader-kind">\` over its title
  (\`:909-911\`, styled at \`v3/screens/knowledge.css:236-241\`). The rule is
  therefore "an overline names the KIND OF SOURCE", not "a reading head has no
  overline" — a lot that sweeps every overline out of every head is reading
  this page wrong. Added Phase II lot L3 from entry 11-4: the note reader
  carried an uppercase \`NOTE\` over its title while the source reader was
  already right. The kind did not vanish with it — it moved into the metadata
  line as its first member, because \`roleCopy\` has three values and the list
  row beside the reader states the role ONLY when the note has neither a folder
  nor references, so deleting it outright would take "this is a deliverable"
  off the screen entirely.
- **The action row is its own row, always — not "when it does not fit".** The
  reference gives \`.kn-actions\` a \`margin-top\` under the metadata line
  (\`v3/screens/knowledge.css:253\`) and no condition at all. A head that lets
  the actions share a line with the title when the window is wide enough takes
  space AWAY from the title as the window GROWS, and the title wraps. Measured
  before lot L3 on the Library fixture, one 58-character note title at
  \`--text-xl\`: at 1440 px the title had 660 px and needed 567.5 → one line; at
  1662 px it had 353 px and needed the same → TWO lines. That is entry 11-4's
  second half, and it is invisible to every gate in this repository, whose
  widest stop is 1440 px — so the rule is asserted twice, and neither assertion
  is the wrap itself (\`test/reading-head-shape.interaction.test.tsx\`): once as
  a scan of EVERY rule in the stylesheet whose subject is that row, which is
  independent of where in the file — or in which \`@media\`/\`@container\` — the
  rule stands, and once as the value the cascade actually delivers, read at
  320 / 760 / 1440 / 1662 / 1920 px. One assertion over the FIRST occurrence of
  the selector in the file is not enough and was measured not to be: an
  override placed after the base left it green on the restored defect. The
  limit is stated rather than hidden — the wrap itself stays unmeasured.
`,
  },
];

const original = readFileSync(file, "utf8");

// IDEMPOTENCJA SPRAWDZANA PRZED KOTWICAMI, bo po udanym przebiegu kotwic
// „BYŁO" już w pliku nie ma i skrypt musiałby paść na własnym sukcesie.
const alreadyDone = edits.filter((edit) => original.includes(edit.willBe));
if (alreadyDone.length === edits.length) {
  console.log(`UI_CRAFT_L3: already applied — ${file} carries both rewrites.`);
  process.exit(0);
}
if (alreadyDone.length !== 0)
  throw new Error(
    `UI_CRAFT_HALF_APPLIED: ${alreadyDone.length} of ${edits.length} rewrites are ` +
      "already in the file and the rest are not. This script is all-or-nothing, so it " +
      "refuses to finish somebody else's half. Inspect the file by hand.",
  );

// FAZA 1 — SPRAWDZENIE WSZYSTKICH KOTWIC. Ani jednego zapisu w tej pętli.
for (const edit of edits) {
  const first = original.indexOf(edit.was);
  if (first === -1)
    throw new Error(
      `UI_CRAFT_ANCHOR_MISSING: ${edit.what} — the quoted "was" text is not in ` +
        `${file}. Nothing was written. The contract drifted since 2026-08-15, so the ` +
        "rewrite has to be re-read against the current text, not forced.",
    );
  if (original.indexOf(edit.was, first + edit.was.length) !== -1)
    throw new Error(
      `UI_CRAFT_ANCHOR_AMBIGUOUS: ${edit.what} — the quoted "was" text appears more ` +
        "than once, so the edit would not land where it is aimed. Nothing was written.",
    );
}

// FAZA 2 — ZŁOŻENIE W PAMIĘCI, dalej bez zapisu.
let next = original;
for (const edit of edits) next = next.replace(edit.was, edit.willBe);

// FAZA 3 — ASERCJE NA WYNIKU, i dopiero potem jeden zapis.
for (const edit of edits) {
  if (!next.includes(edit.willBe))
    throw new Error(
      `UI_CRAFT_RESULT_MISSING: ${edit.what} — the target text is absent from the ` +
        "composed result. Nothing was written.",
    );
  // STARY TEKST NIE MOŻE ZOSTAĆ — Z JEDNYM DOZWOLONYM WYJĄTKIEM. Edycja (2)
  // DOKŁADA ograniczenia po istniejącym akapicie, więc jej „BYŁO" jest
  // przedrostkiem „MA BYĆ" i musi w wyniku wystąpić DOKŁADNIE RAZ. Naiwne
  // „stary tekst zniknął" wywracało ten skrypt na jego własnym poprawnym
  // wyniku; naiwne „nie sprawdzajmy" przepuściłoby drugą kopię akapitu.
  const allowed = edit.willBe.split(edit.was).length - 1;
  const found = next.split(edit.was).length - 1;
  if (found !== allowed)
    throw new Error(
      `UI_CRAFT_STALE_TEXT: ${edit.what} — the old text appears ${found} time(s) in ` +
        `the result and should appear ${allowed}. Nothing was written.`,
    );
}
if (next === original)
  throw new Error(
    "UI_CRAFT_NO_CHANGE: the composed result equals the original.",
  );
// Dwa nagłówki, pod którymi te ograniczenia mają stać — gdyby kotwica trafiła
// w kopię tekstu poza swoim wzorcem, ta asercja tego nie wyłapie, ale
// zniknięcie któregoś z nagłówków owszem.
for (const heading of [
  "## Pattern: Surface title band",
  "## Pattern: Reading surface",
])
  if (!next.includes(heading))
    throw new Error(
      `UI_CRAFT_PATTERN_LOST: ${heading} is gone. Nothing was written.`,
    );

writeFileSync(file, next);
console.log(
  `UI_CRAFT_L3: applied ${edits.length} rewrite(s) to ${file}\n` +
    edits.map((edit) => `  ${edit.what}`).join("\n"),
);
