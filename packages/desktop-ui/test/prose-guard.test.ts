/// <reference types="node" />

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { collectSourceFiles } from "./copy-scan.js";
import {
  PROSE_LIMIT,
  extractVisibleProse,
  isSentence,
  lecturesIn,
} from "./prose-scan.js";

// Wykłady (#21) wróciły TRZY razy, bo asercja pilnowała jedenastu konkretnych
// zdań — a każdy nowy ekran mógł napisać nowe. Ten strażnik patrzy na KSZTAŁT:
// angielskie zdanie dłuższe niż próg, stojące poza pustym stanem, toastem
// i blokiem kodu, jest wykładem niezależnie od tego, co mówi.
//
// Wyjątki są dwa i oba są świadome:
//   • USTAWIENIA są poza zasięgiem. Tam długi tekst przy kontrolce mówi, co się
//     stanie po jej ruszeniu, a wykładu od skutku nie odróżni żaden wzorzec.
//     Ta sekcja jest oceniana ręką i tak ma być nazwana.
//   • POMOC NA ŻĄDANIE (#35) ma własny, twardszy kontrakt: temat mieści się
//     w 180 znakach. Pomoc, która może rosnąć, wraca do bycia wykładem
//     schowanym o klik dalej.
//
//     ZAKRES TEGO ZDANIA, dopisany przez lot pomocy, bo do dziś obiecywało
//     więcej, niż ktokolwiek mierzył. Sufit 180 znaków NA TEMAT obowiązuje
//     NOWE tematy CRM-u (`src/crm/help-topics.ts`) i jest sprawdzany
//     w `concept-help.test.ts`. Sześć tematów okna pojęć powstało wcześniej
//     i ma inny kształt — `explanation` + `boundary`, każde z podłogą ≥80
//     znaków i BEZ sufitu, czyli ~215-280 znaków tak, jak je czyta człowiek.
//     Świadomie zostają nietknięte; przepisanie ich to osobna robota.
//     Test niżej mierzy ZDANIA w obu plikach pomocy, nie tematy.

const packageRoot = ((): string => {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(directory, "src", "styles.css"))) {
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error("desktop-ui package root not found from the test file");
    }
    directory = parent;
  }
  return directory;
})();
const sourceRoot = path.join(packageRoot, "src");

// Ścieżki porównujemy WYŁĄCZNIE w formie ukośnikowej. Windowsowy `path.sep`
// zamienia `components/Foo.tsx` w `components\Foo.tsx`, przez co i wyjątek na
// Ustawienia, i lista odstępstw przestają pasować — a strażnik pada na jednym
// z trzech systemów z listą rzeczy, których nikt nie dodał. Złapane przez CI
// za pierwszym razem, więc zamiana jest tu, a nie w komentarzu.
// Rozdziela po OBU separatorach, nie po `path.sep`: inaczej asercja niżej
// przechodziłaby na macOS nie sprawdzając niczego, bo windowsowa ścieżka
// wyglądałaby tam jak jeden długi człon.
const slashed = (file: string): string => file.split(/[\\/]/u).join("/");

/** Powierzchnie DEV-only znikają razem z falami ekranowymi. */
const DEV_ONLY = "src/dev/";
/** Ekran Ustawień i jego lista sekcji — patrz komentarz wyżej. */
const SETTINGS_BY_HAND = /(^|\/)([Ss]ettings[A-Za-z-]*)\.tsx?$/;
/** Pomoc kontekstowa ma własny limit, nie ten — i oba pliki, w których żyje. */
const HELP_SOURCES = [
  "components/ConceptHelpDialog.tsx",
  "crm/help-topics.ts",
] as const;

const isHelpSource = (file: string): boolean =>
  HELP_SOURCES.some((source) => slashed(file).endsWith(source));

const inScope = (file: string): boolean =>
  !slashed(file).includes(DEV_ONLY) &&
  !SETTINGS_BY_HAND.test(slashed(file)) &&
  !isHelpSource(file);

/**
 * Zdania dłuższe niż próg, które BYŁY w drzewie, zanim strażnik powstał —
 * wypisane co do sztuki, z powodem. Lista może wyłącznie MALEĆ: nowy wykład
 * nie ma tu wpisu i pada, a wpis, który przestał pasować, też pada, żeby
 * skasowany dług nie udawał, że dalej istnieje.
 *
 * Wszystkie trzynaście to okna dialogowe zgody, odzyskiwania i skutków
 * nieodwracalnych — czyli miejsca, gdzie zdanie tłumaczy KONSEKWENCJĘ, a nie
 * obsługę. Wchodzą do przeglądu razem z falą, która dotyka danego przepływu.
 */
const KNOWN_LECTURES: readonly {
  readonly file: string;
  readonly starts: string;
}[] = [
  {
    file: "AccessSurface.tsx",
    starts: "This workspace has no Space yet, so there is no data scope",
  },
  {
    file: "CaptureDialog.tsx",
    starts: "Keep the audio after transcription. By default it is deleted",
  },
  {
    file: "CaptureDialog.tsx",
    starts: "Constellation does not transcribe or record meetings.",
  },
  {
    file: "CaptureDialog.tsx",
    starts: "Constellation keeps an encrypted copy in this workspace",
  },
  {
    file: "RealApp.tsx",
    starts: "The system keychain is unavailable. Unlock the system",
  },
  {
    file: "RealApp.tsx",
    starts: "This access changed meanwhile, so the write did not go through",
  },
  {
    file: "WorkspaceRecovery.tsx",
    starts: "The Hub accepted the device but did not store the credential",
  },
  {
    file: "WorkspaceRecovery.tsx",
    starts: "On the first install, export the authorization file",
  },
  {
    file: "WorkspaceRecovery.tsx",
    starts: "The copy passed verification. Confirming keeps the current",
  },
  {
    file: "components/CalendarConsentDialog.tsx",
    starts: "This one-time consent covers these values and expires",
  },
  {
    file: "components/ReleaseContinuity.tsx",
    starts: ". Uninstalling removes the app but keeps the encrypted workspace",
  },
  {
    file: "components/TaskRemovalSection.tsx",
    starts: "This task has subtasks. Delete or move them first",
  },
  {
    file: "components/TaskReservationSection.tsx",
    starts: "The block is in the calendar but was not recorded on the task",
  },
];

const scanned = collectSourceFiles(sourceRoot).filter(inScope);

test("no screen outside Settings lectures the reader (Settings is reviewed by hand, on purpose)", () => {
  assert.ok(
    scanned.length > 20,
    `expected the renderer sweep to find files, found ${scanned.length} — a scan that finds nothing passes vacuously`,
  );

  const unexplained: string[] = [];
  const matched = new Set<number>();

  for (const file of scanned) {
    const relative = slashed(path.relative(sourceRoot, file));
    for (const lecture of lecturesIn(file, readFileSync(file, "utf8"))) {
      const known = KNOWN_LECTURES.findIndex(
        (entry) =>
          entry.file === relative && lecture.text.startsWith(entry.starts),
      );
      if (known >= 0) {
        matched.add(known);
        continue;
      }
      unexplained.push(
        `${relative}:${lecture.line} [${lecture.within}] ${lecture.text.length} chars — ${lecture.text.slice(0, 120)}`,
      );
    }
  }

  assert.deepEqual(
    unexplained,
    [],
    `Sentences longer than ${PROSE_LIMIT} characters reached a screen:\n${unexplained.join("\n")}\n\nA row that needs a paragraph is a row that does not say what it is. Shorten it, or move the explanation behind a “?” button.`,
  );

  const stale = KNOWN_LECTURES.filter((_, index) => !matched.has(index)).map(
    (entry) => `${entry.file}  ${entry.starts}`,
  );
  assert.deepEqual(
    stale,
    [],
    `These waivers no longer match anything — delete them, so paid-off debt stops looking outstanding:\n${stale.join("\n")}`,
  );
});

// NAZWA MÓWI, CO ZMIERZONO: pojedyncze ZDANIA w plikach pomocy, w obu.
// Wersja sprzed lotu pomocy nazywała się „temat" i mówiła w komunikacie
// „Help topics must fit in 180 characters", a liczyła zdania w jednym pliku —
// więc na zielono twierdziła coś, czego nie sprawdziła. Sufit NA TEMAT jest
// w `concept-help.test.ts` i dotyczy nowych tematów CRM-u.
test("every sentence in the help copy fits the 180-character limit (#35)", () => {
  const HELP_LIMIT = 180;
  const helpFiles = HELP_SOURCES.map((source) =>
    path.join(sourceRoot, ...source.split("/")),
  );
  const sentences = helpFiles.flatMap((helpFile) =>
    extractVisibleProse(helpFile, readFileSync(helpFile, "utf8"))
      .filter((candidate) => isSentence(candidate.text))
      .map((candidate) => ({
        ...candidate,
        file: slashed(path.relative(sourceRoot, helpFile)),
      })),
  );

  assert.ok(
    sentences.length > 5,
    `expected help copy to be found, got ${sentences.length} — an empty measurement is a broken instrument, not a pass`,
  );
  // Obie strony pomocy są naprawdę czytane, nie tylko ta większa.
  for (const source of HELP_SOURCES) {
    assert.ok(
      sentences.some((candidate) => candidate.file === source),
      `no sentence was read from ${source} — the sweep did not reach it`,
    );
  }

  const overlong = sentences
    .filter((candidate) => candidate.text.length > HELP_LIMIT)
    .map(
      (candidate) =>
        `${candidate.file}:${candidate.line} ${candidate.text.length} chars`,
    );

  assert.deepEqual(
    overlong,
    [],
    `Help sentences must fit in ${HELP_LIMIT} characters:\n${overlong.join("\n")}`,
  );
});

test("the scope filter reads the same path on every system", () => {
  // To NIE jest hipoteza: pierwsza wersja porównywała ścieżki w formie danej
  // przez system, więc na Windowsie `components\Foo.tsx` nie pasowało do
  // `components/Foo.tsx`, a wyjątek na Ustawienia w ogóle nie działał. Zielono
  // na macOS i Linuksie, czerwono na trzecim systemie po dwóch minutach.
  assert.equal(
    inScope("C:\\repo\\packages\\desktop-ui\\src\\dev\\Harness.tsx"),
    false,
  );
  assert.equal(
    inScope("C:\\repo\\packages\\desktop-ui\\src\\SettingsSurface.tsx"),
    false,
  );
  assert.equal(
    inScope(
      "C:\\repo\\packages\\desktop-ui\\src\\components\\ConceptHelpDialog.tsx",
    ),
    false,
  );
  assert.equal(
    inScope("C:\\repo\\packages\\desktop-ui\\src\\WorkSurface.tsx"),
    true,
  );
});

test("the guard fires on a lecture and stays quiet on the places that may explain", () => {
  // Sprawdzone przez zepsucie. Strażnik, który nigdy nie pada, jest ozdobą —
  // a strażnik, który pada na wszystkim, zostaje wyłączony po trzecim
  // fałszywym alarmie. Ten przypadek pilnuje OBU stron naraz.
  const lecture =
    "This surface collects everything that needs your attention today and explains how to work through it.";
  const sample = [
    "export const Sample = () => (",
    "  <section>",
    `    <p>${lecture}</p>`,
    `    <p className="empty-state">${lecture}</p>`,
    `    <code>${lecture}</code>`,
    "    <p>Short enough to read at a glance.</p>",
    `    <div className="row row--wide row--picked row--with-a-very-long-class-list-that-is-not-prose">x</div>`,
    "  </section>",
    ");",
  ].join("\n");

  const hits = lecturesIn("Sample.tsx", sample).map((hit) => hit.line);
  assert.deepEqual(
    hits,
    [3],
    `only the bare paragraph is a lecture; the empty state, the code block and the class list are not — got ${JSON.stringify(lecturesIn("Sample.tsx", sample))}`,
  );
});

test("the guard sees copy that never touches JSX text", () => {
  // Wykład równie dobrze siedzi w stałej wyrenderowanej przez `{explanation}`.
  // Wersja licząca wyłącznie treść między znacznikami przepuściłaby go
  // w całości, meldując zero.
  const sample = [
    'const explanation = "Every workspace keeps its own encrypted database, and switching between them restarts the app safely.";',
    'const thrown = () => { throw new Error("This message is long enough to trip the threshold but nobody reads it on a screen."); };',
    'const title = "Fine";',
  ].join("\n");

  const hits = lecturesIn("Sample.tsx", sample);
  assert.deepEqual(
    hits.map((hit) => hit.line),
    [1],
    `the constant is copy, the thrown message is not — got ${JSON.stringify(hits)}`,
  );
});
