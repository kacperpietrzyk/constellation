// Break-testy lotu, który dał człowiekowi zmianę nazwy notatki.
//
// Pętla stoi w `scripts/break-test.mjs` (#211) i pilnuje, żeby złamanie
// naprawdę doszło do `dist` oraz żeby edycja cokolwiek zmieniła; ten plik mówi,
// CO w tym locie miało prawo paść i dlaczego. Precedens:
// `scripts/break-access-retirement.mjs`.
//
//   node scripts/break-note-rename.mjs
//
// WSZYSTKIE ZŁAMANIA WERYFIKUJE `test:interaction`, bo tam mieszka jedyna
// asercja, która potrafi zauważyć zdolność, KTÓREJ NIC NIE MONTUJE —
// `scripts/run-tests.mjs` świadomie nie bierze testów interakcji.
//
// NIE MA TU BRAMKI UKŁADU, tak samo jak w locie ACC i z tego samego powodu
// wzmocnionego o ustalenie LIBP: gate stawia własny serwer deweloperski, a dwa
// worktree biegnące równolegle mierzą sobie nawzajem aplikacje. Ten lot nie
// dopisał ANI JEDNEJ reguły CSS, więc nie ma tam czego łamać.
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runBreakTests } from "./break-test.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Podmiana JEDNEGO wystąpienia, z awarią przy zeru i przy wielu. */
const replaceOnce = (text, needle, replacement, what) => {
  const at = text.indexOf(needle);
  if (at === -1)
    throw new Error(
      `${what}: the text this break edits is not there any more, so the break ` +
        "would be a no-op and the loop would report green on nothing.",
    );
  if (text.indexOf(needle, at + needle.length) !== -1)
    throw new Error(
      `${what}: the text this break edits appears more than once, so the edit ` +
        "would not land where it is aimed.",
    );
  return text.slice(0, at) + replacement + text.slice(at + needle.length);
};

/** Wytnij tekst od `open` DO `close`, zostawiając `close` na miejscu. */
const cutUntil = (text, open, close, what) => {
  const from = text.indexOf(open);
  if (from === -1)
    throw new Error(`${what}: the opening text is not there any more`);
  const to = text.indexOf(close, from);
  if (to === -1)
    throw new Error(
      `${what}: the closing text is not where this break expects`,
    );
  return text.slice(0, from) + text.slice(to);
};

const EDITOR = "packages/desktop-ui/src/library/KnowledgeEditor.tsx";
const SCREEN = "packages/desktop-ui/src/library/NotesReading.tsx";

const { results, failed } = runBreakTests({
  root,
  build: { command: "npm", args: ["run", "build"] },
  verify: { command: "npm", args: ["run", "test:interaction"] },
  breaks: [
    {
      // ZŁAMANIE, DLA KTÓREGO TA LISTA ISTNIEJE — zdolność, której nic nie
      // montuje. Kasujemy KONTROLKĘ z nagłówka czytelni razem z jej definicją
      // i osieroconym importem, dokładnie tak, jak zrobiłby to ktoś, kto
      // „sprząta nieużywany komponent". Bez asercji montowanej PRZEZ EKRAN
      // taka edycja przechodzi całe `npm run check`: lot ACC zmierzył to
      // dziś po południu na własnej sekcji.
      name: "unmount the affordance: delete <DocumentRenameControl /> and its definition",
      file: EDITOR,
      edit: (text) => {
        const withoutElement = replaceOnce(
          text,
          "          <DocumentRenameControl onRename={onRename} title={document.title} />\n",
          "",
          "the rename element in the reading pane header",
        );
        const withoutComponent = cutUntil(
          withoutElement,
          "/**\n * CHANGING THE NAME OF THE NOTE YOU ARE READING.",
          "export const KnowledgeEditor = ({",
          "the rename control definition",
        );
        return replaceOnce(
          withoutComponent,
          'import {\n  InlinePopover,\n  reportFirstEmptyRequiredField,\n} from "../components/InlinePopover.js";',
          'import { InlinePopover } from "../components/InlinePopover.js";',
          "the orphaned import",
        );
      },
    },
    {
      // PIERWSZY KIERUNEK STRAŻNIKA PUSTEJ NAZWY: strażnik znika. Sam tytuł
      // z białych znaków i tak nie doleci do mostka, bo `execute()` parsuje
      // kopertę przez `CommandEnvelopeSchema` — i właśnie dlatego asercją
      // niosącą jest to, że POLE mówi dlaczego, a nie że nic nie wysłano.
      // Bez strażnika czytelnik dostaje komunikat schematu o własnej notatce.
      name: "drop the whitespace guard: a title of four spaces is submitted",
      file: EDITOR,
      edit: (text) =>
        replaceOnce(
          text,
          '          if (draft.trim() === "") {\n            reportFirstEmptyRequiredField(event.currentTarget);\n            return;\n          }\n',
          "",
          "the whitespace guard",
        ),
    },
    {
      // DRUGI KIERUNEK TEGO SAMEGO STRAŻNIKA: strażnik za ostry. Odmowa
      // przemianowania na nazwę, którą notatka JUŻ NOSI, wygląda jak
      // staranność — a jest wpisaniem do interfejsu reguły, której jądro
      // świadomie NIE ustanowiło (`wave2.ts` zapisuje powód: ponowiony zapis
      // nie może paść na przestrzeni, która już go zastosowała).
      name: "over-strict guard: refuse the title the note already carries",
      file: EDITOR,
      edit: (text) =>
        replaceOnce(
          text,
          'if (draft.trim() === "") {',
          'if (draft.trim() === "" || draft.trim() === title) {',
          "the whitespace guard",
        ),
    },
    {
      // TA SAMA RODZINA, DRUGA WYMYŚLONA REGUŁA: unikalność tytułu notatki.
      // Nic w tej dziedzinie jej nie ustanawia, więc ekran, który odmawia
      // duplikatu, mówi o danych coś nieprawdziwego.
      name: "invent uniqueness: refuse a title another note already carries",
      file: SCREEN,
      edit: (text) =>
        replaceOnce(
          text,
          "    if (!client || version === undefined) return false;\n    const result = await renameDocument(",
          "    if (!client || version === undefined) return false;\n" +
            "    if (\n" +
            "      items.some(\n" +
            "        (candidate) => candidate.id !== noteId && candidate.title === title,\n" +
            "      )\n" +
            "    )\n" +
            "      return false;\n" +
            "    const result = await renameDocument(",
          "the rename mutation",
        ),
    },
    {
      // WERSJA WZIĘTA Z NIEWŁAŚCIWEGO ODCZYTU. Oba odczyty niosą wersję TEGO
      // SAMEGO rekordu, a ekran woli `knowledge.list` — tak samo jak
      // `moveNote`. Odwrócenie kolejności kompiluje się, przechodzi typy
      // i na realnych danych wraca konfliktem wersji nad rekordem, którego
      // nikt inny nie tknął. Fikstura ma te dwie liczby RÓŻNE właśnie po to.
      name: "resolve the version from the wrong read: `document.list` first",
      file: SCREEN,
      edit: (text) =>
        replaceOnce(
          text,
          "    const version = summary?.version ?? item?.version;\n    if (!client || version === undefined) return false;",
          "    const version = item?.version ?? summary?.version;\n    if (!client || version === undefined) return false;",
          "the version resolution in the rename",
        ),
    },
    {
      // POLE, KTÓRE PAMIĘTA PORZUCONY SZKIC. Bez zasiania z aktualnego tytułu
      // przy każdym otwarciu kontrolka proponuje nazwę sprzed poprzedniego
      // zamknięcia — a po udanej zmianie albo po cudzej zmianie w tle
      // proponuje NADPISANIE tytułu, którego czytelnik już nie widzi.
      name: "keep the abandoned draft: stop reseeding the field from the current title",
      file: EDITOR,
      edit: (text) =>
        replaceOnce(
          text,
          "        if (opening) setDraft(title);\n",
          "",
          "the reseed on open",
        ),
    },
  ],
});

console.log(
  `\n${results.length - failed.length}/${results.length} breaks behaved as expected`,
);
if (failed.length > 0) {
  for (const result of failed)
    console.log(`  ${result.name}: ${result.verdict} — ${result.reason}`);
  process.exitCode = 1;
}
