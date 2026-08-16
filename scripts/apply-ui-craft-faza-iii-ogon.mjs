// KROK MERGE'A OGONA FAZY III — DWA PRZEPISANIA `.ui-craft/tokens.md`.
//
// TO NIE JEST RZECZ ZROBIONA, tylko rzecz DO ZROBIENIA PRZY MERGE'U, i powód
// jest mechaniczny: `/.ui-craft/` jest gitignorowany (`.gitignore:5`) i NIE
// ISTNIEJE w drzewie roboczym tego lotu, więc żadna edycja tamtego pliku nie
// pojedzie w diffie. Precedens i kształt: `scripts/apply-ui-craft-l3.mjs`,
// `scripts/apply-ui-craft-10-3.mjs`. Ten plik jest ŚLEDZONY, leży w `scripts/`
// i poza `.gitignore`, więc commit merge'a bierze go razem z resztą i JEDNA
// kopia dosłownego tekstu wystarcza.
//
//   node scripts/apply-ui-craft-faza-iii-ogon.mjs            # sprawdza i pisze
//   node scripts/apply-ui-craft-faza-iii-ogon.mjs --dry-run  # tylko sprawdza
//
// WSZYSTKO ALBO NIC: skrypt najpierw sprawdza OBA fragmenty „BYŁO" (każdy musi
// trafić dokładnie raz) i dopiero potem zapisuje plik. Częściowo przepisany
// kontrakt jest gorszy niż nieprzepisany — mówi wtedy dwie sprzeczne rzeczy
// o jednej regule i nie da się poznać, która jest nowa.
//
// ── DLACZEGO TE DWIE REGUŁY, A NIE ZERO ─────────────────────────────────────
//
// Zasada fali brzmi: prototyp wygrywa z kontraktem, a `.ui-craft/` przepisuje
// się W TYM SAMYM PRZEBIEGU. Ogon trafił w to dwa razy.
//
// (1) WPIS 3-4 — kontrakt POZWALA na monospace „tylko dla czasu, skrótów,
//     wersji i identyfikatorów", a prototyp składa monospace'em NADTYTUŁ
//     WIERSZA SKRZYNKI (`v3/screens/inbox.css:66-70` — `.ib-reason
//     { font-family: var(--font-mono) }`), który nie jest żadną z tych czterech
//     rzeczy. Poprawka zrobiona bez przepisania kontraktu byłaby dostawą
//     ŁAMIĄCĄ zapisaną regułę, a para `FIII3-03a` cytowałaby sekcję, która jej
//     zabrania.
//
// (2) WPIS 5-2 — ograniczenie 3 mówi, ile akcji akcentowych WOLNO („one per
//     container that owns a main action"), i nigdzie nie mówi, że akcja
//     tworząca w paśmie kolekcji jedną MIEĆ MUSI. Dokładnie w tej luce
//     mieszkała usterka: spis powszechny bramki po piętnastu ekranach pokazał
//     siedem akcji tworzących w paśmie, sześć akcentowych i `New project`
//     jedyną drugorzędną — czyli ekran wypadał z reguły, której nikt nie
//     zapisał, więc wypadał po cichu. Kierunek „wolno" bez kierunku „musi" jest
//     regułą, której nie da się złamać.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, ".ui-craft", "tokens.md");

/** BYŁO → MA BYĆ, dosłownie. Nic poza tymi napisami nie jest ruszane. */
const rewrites = [
  {
    what: "sekcja `### Type` — do czego wolno użyć kroju maszynowego",
    marker: "the kicker that names WHY a row is on a list",
    was: "- UI: platform system stack; mono only for time, shortcuts, versions, and IDs.",
    willBe: `- UI: platform system stack; mono for time, shortcuts, versions, IDs — and
  for the kicker that names WHY a row is on a list, which the reference sets in
  mono and in lower case (\`v3/screens/inbox.css:66-70\` — \`.ib-reason
  { font-family: var(--font-mono); font-size: var(--text-2xs);
  letter-spacing: 0.02em }\`, drawing \`comment mention\`, \`renewal due\`,
  \`waiting review elapsed\`). Written down 2026-08-16 by the phase III tail
  (entry 3-4), under the standing ruling that the reference wins over this
  contract and the contract is rewritten in the same pass: the previous
  wording said "only for time, shortcuts, versions, and IDs", and a signal's
  reason is none of the four. The distinction the reference is drawing is not
  "these four data types" but MACHINE-GENERATED against WRITTEN: the kicker is
  the system saying what it noticed, and it is set apart from the title beside
  it — which a person wrote — by face rather than by shouting it in caps. The
  application shouted it in caps in the interface face, which reads as a third
  kind of object rather than as a quieter one.`,
  },
  {
    what: "ograniczenie 3 — akcja tworząca w paśmie kolekcji MUSI być akcentowa",
    marker: "AND IT NOW REQUIRES",
    was: `   primary action. "Low area" is not the constraint that holds the accent down
   — form is. See the ink/wash split in "Accent rule".`,
    willBe: `   primary action. "Low area" is not the constraint that holds the accent down
   — form is. See the ink/wash split in "Accent rule".

   AND IT NOW REQUIRES, which is the half that was missing until 2026-08-16:
   **a collection screen's create action, standing in that screen's title band,
   TAKES the accent fill.** Not "may" — takes. Written down by the phase III
   tail (entry 5-2) off a census rather than a sample: the layout gate prints
   the action class for all fifteen declared screens, and that print held seven
   create actions in a collection band, six \`primary-button\`
   (\`New opportunity\`, \`New organization\`, \`New person\`, \`New renewal\`,
   \`New task\`, \`New note\`) and one \`secondary-button\` — \`New project\`.
   The reference paints all of them alike (\`v3/screens/projects.js:343\` —
   \`btn("New project", { cls: "primary", icon: "plus" })\`).

   THE PERMISSION DIRECTION ALONE CANNOT BE BROKEN, and that is why one screen
   fell out of the family in silence: "one per container that owns a main
   action" is satisfied by a container that owns none. The gate HAD the class in
   its report and had no question that read it. The obligation is measured by
   pair \`FIII3-04\` (\`scripts/visual-language-pairs.mjs\`), which asks the
   Projects band for at least one accent-painted button rather than naming which
   node carries it.

   WHAT THIS DOES NOT SAY: nothing here promotes a second action in the same
   band. \`Areas and initiatives\` stays a ghost button and \`Cancel\` — the
   same trigger once the form is open — stays secondary, because the accent
   belongs to the action that CREATES, not to the toggle that closes a form.
   The forbidding half above is untouched.`,
  },
];

const dryRun = process.argv.includes("--dry-run");

const readContract = () => {
  try {
    return readFileSync(target, "utf8");
  } catch {
    return null;
  }
};

const text = readContract();
if (text === null) {
  // KOD WYJŚCIA, NIE WYJĄTEK: brak kontraktu jest ODMOWĄ z powodem, a nie awarią
  // skryptu, i ślad stosu nad tym zdaniem czytałby się jak zepsuty przyrząd.
  console.error(
    `${target} does not exist in this tree. That is expected in a worktree that ` +
      "never had `.ui-craft/` (it is gitignored) — run this at merge time, in the " +
      "clone that carries the contract.",
  );
  process.exit(1);
}

// SPRAWDZENIE WSZYSTKICH FRAGMENTÓW PRZED JAKIMKOLWIEK ZAPISEM.
const problems = [];
for (const rewrite of rewrites) {
  // DWIE PRÓBY, NIE JEDNA, i druga istnieje przez asymetrię tych przepisań:
  // pierwsze ZASTĘPUJE zdanie (więc jego „was" znika i drugi przebieg sam się
  // odbija), a drugie DOPISUJE akapit pod nietkniętą kotwicą (więc jego „was"
  // dalej trafia i bez tego sprawdzenia dopisałoby akapit po raz drugi).
  // Znacznik jest pierwszą linią wstawki i mówi, że robota już stoi.
  if (text.includes(rewrite.marker)) {
    problems.push(
      `${rewrite.what}: the rewrite is ALREADY IN the contract (found „${rewrite.marker}"). ` +
        "Running it again would state the same rule twice.",
    );
    continue;
  }
  const hits = text.split(rewrite.was).length - 1;
  if (hits === 1) continue;
  problems.push(
    hits === 0
      ? `${rewrite.what}: the „was" text is not in the file. The contract moved under it — read ` +
          "the section by NAME and reconcile by hand."
      : `${rewrite.what}: the „was" text appears ${hits} times, so the edit would not land where ` +
          "it is aimed.",
  );
}
if (problems.length > 0) {
  for (const problem of problems) console.error(`REFUSED  ${problem}`);
  console.error(
    `\nNothing was written. ${rewrites.length} rewrite(s) declared, ${problems.length} refused — ` +
      "this applicator is all-or-nothing on purpose: a half-rewritten contract states two " +
      "contradictory rules and gives no way to tell which one is new.",
  );
  process.exitCode = 1;
} else {
  let next = text;
  for (const rewrite of rewrites)
    next = next.replace(rewrite.was, rewrite.willBe);
  if (!dryRun) writeFileSync(target, next, "utf8");
  for (const rewrite of rewrites)
    console.log(`${dryRun ? "WOULD APPLY" : "APPLIED"}  ${rewrite.what}`);
  console.log(
    `\n${rewrites.length} of ${rewrites.length} rewrite(s) ${dryRun ? "would be applied" : "applied"} to ${target}.\n` +
      "REMINDER — the line ranges in the `contract` fields of " +
      "`scripts/visual-language-pairs.mjs` shift with every insertion into this file, and the " +
      "file's own header says the recount is done in ONE pass over the whole document, not " +
      "per lot. The pairs this tail added cite section NAMES and no numbers, which is the " +
      "convention that header recommends.",
  );
}
