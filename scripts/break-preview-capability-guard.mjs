// DOWÓD, że kompletność zakresu preview naprawdę jest pilnowana.
//
// Ten lot zastąpił RĘCZNĄ TABLICĘ 150 pozycji stojącą obok zamkniętego
// słownika 162 pozycji totalnym `Record`-em nad tym słownikiem. Zdanie
// „sto sześćdziesiąta trzecia zdolność nie skompiluje się bez swojego
// ramienia" jest DEKLARACJĄ, dopóki ktoś nie spróbuje. Dwanaście pozycji
// wypadło z tamtej tablicy przez cztery niezależne wydania i nic nigdzie nie
// zapaliło się na czerwono — więc przyrząd, który ma to zatrzymać, musi zostać
// złamany jawnie, w OBIE STRONY.
//
// PIĘĆ ZŁAMAŃ, dwie rodziny dowodu:
//
//   ODMOWA KOMPILATORA (`expect: "build-refuses"`, dowodem jest brak budowy,
//   a udana budowa jest PORAŻKĄ typu) — dwa kierunki tej samej totalności:
//   ramię ZNIKA z rekordu, oraz do słownika DOCHODZI 163. zdolność. Drugi
//   kierunek jest tym, który stara tablica przegapiła cztery razy.
//
//   CZERWONA ASERCJA (`expect: "assertion-fails"`, złamanie MA SIĘ
//   SKOMPILOWAĆ) — trzy złamania nad tym, czego sam typ nie utrzyma: totalny
//   `Record` wymusza DECYZJĘ, nie wymusza DOBREJ decyzji, bo
//   `{ withheld: … }` kompiluje się dokładnie tak samo jak `"granted"`.
//   Zdolność wstrzymana wbrew sesji desktopu, zdolność przyznana ponad nią
//   i powód wstrzymania sprowadzony do napisu, z którego nikt nic nie zrobi.
//
// KIERUNEK „163. ZDOLNOŚĆ" EDYTUJE JEDEN PLIK I DOPISUJE DWA MIEJSCA — do
// `CapabilitySchema` ORAZ do `CAPABILITY_DELEGATION` — i to nie jest wygoda,
// tylko PRZYPISYWALNOŚĆ. Bez wpisu w klasyfikacji czerwień przyszłaby ze
// strażnika, który stał tam przede mną, i nie dowodziłaby nic o tym locie.
// Zdolność sklasyfikowana, a nierozdysponowana, kładzie WYŁĄCZNIE
// `PREVIEW_CAPABILITY_DISPOSITION`.
//
// I dlatego to złamanie mieszka w `packages/contracts`, a pada w
// `packages/desktop-main`: gdyby `tsc -b` nie przebudował contractów, desktop
// czytałby STARE `.d.ts`, w których 163. zdolności nie ma, i break-test
// wróciłby zielony na złamaniu, które powinno być twardym błędem typu.
// Budową jest `npm run typecheck` z KORZENIA, więc referencje projektów
// przebudowują się w kolejności, a `break-test.mjs` osobno dowodzi, że
// przebudowa w ogóle się odbyła.
//
// Pętla jest ta z `break-test.mjs` (#211) i NIE JEST pisana od nowa.
//
// CHODZI RĘCZNIE, nie w `npm run check`: pięć obiegów × trzy budowy to minuty.
//
//   node scripts/break-preview-capability-guard.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runBreakTests } from "./break-test.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Podmiana, która PADA, kiedy nie trafiła.
 *
 * Napis, który zwietrzał, to najczęstszy powód, dla którego break-test wraca
 * zielony nie zepsuwszy niczego — a ta fala widziała to już trzy razy.
 */
const replaceOnce = (text, needle, replacement, what) => {
  const at = text.indexOf(needle);
  if (at === -1)
    throw new Error(
      `${what}: the text this break edits is no longer in the file, so the ` +
        "break would be a no-op and a green run would mean nothing.",
    );
  if (text.indexOf(needle, at + needle.length) !== -1)
    throw new Error(
      `${what}: the text this break edits appears more than once, so the edit ` +
        "would not land where it is aimed.",
    );
  return text.slice(0, at) + replacement + text.slice(at + needle.length);
};

const PREVIEW = "packages/desktop-main/src/preview-service.ts";
const CONTRACTS = "packages/contracts/src/execution-context.ts";
const compiled = "packages/desktop-main/dist/test/preview-service.test.js";

/** Weryfikator zawężony do jednej asercji, żeby czerwień była przypisywalna. */
const only = (pattern) => ({
  command: "node",
  args: ["--test", `--test-name-pattern=${pattern}`, compiled],
});

const outcome = runBreakTests({
  root,
  build: { command: "npm", args: ["run", "typecheck"] },
  verify: { command: "node", args: ["--test", compiled] },
  breaks: [
    {
      // ZŁAMANIE, DLA KTÓREGO TEN LOT ISTNIEJE — pierwszy kierunek
      // totalności. Ramię znika, `Record<Capability, …>` przestaje być
      // totalny i kompilator ma odmówić. Udana budowa znaczyłaby, że
      // „163. nie skompiluje się bez ramienia" jest nieprawdą.
      name: "delete an arm: the total Record must refuse to compile",
      file: PREVIEW,
      expect: "build-refuses",
      edit: (text) =>
        replaceOnce(
          text,
          '  "audit.receipt": "granted",\n',
          "",
          "the audit.receipt arm",
        ),
    },
    {
      // DRUGI KIERUNEK, i ten jest tym, po co ten lot powstał: słownik rośnie,
      // rekord nie. Dokładnie to zdarzyło się cztery razy (#28, #47, #48,
      // #119) i za każdym razem wszystko było zielone.
      name: "a 163rd capability enters the vocabulary: the Record must refuse to compile",
      file: CONTRACTS,
      expect: "build-refuses",
      edit: (text) =>
        replaceOnce(
          replaceOnce(
            text,
            '  "agent.handoff.submit",\n]);',
            '  "agent.handoff.submit",\n  "probe.capability",\n]);',
            "the vocabulary's last member",
          ),
          '  "agent.handoff.submit": "operate",\n};',
          '  "agent.handoff.submit": "operate",\n  "probe.capability": "operate",\n};',
          "the delegation classification",
        ),
    },
    {
      // TYP WYMUSZA DECYZJĘ, NIE DOBRĄ DECYZJĘ — pierwsza połowa. Zdolność,
      // którą operator desktopu trzyma, zostaje w preview wstrzymana. To jest
      // dokładnie kształt defektu, który ten lot zastał: dwanaście zdolności
      // nieobecnych w preview i obecnych na desktopie.
      name: "withhold a capability the desktop operator holds",
      file: PREVIEW,
      verify: only("withholds nothing"),
      edit: (text) =>
        replaceOnce(
          text,
          '  "agent.access": "granted",',
          '  "agent.access": {\n    withheld: "a reason long enough to satisfy the reason assertion alone",\n  },',
          "the agent.access arm",
        ),
    },
    {
      // DRUGA POŁOWA. Bez niej asercja „nic ponad sesję desktopu" nie mierzy
      // niczego, a jednostronne złamanie progu dowodzi połowy niczego.
      name: "grant a capability the desktop operator lacks",
      file: PREVIEW,
      verify: only("holds nothing"),
      edit: (text) =>
        replaceOnce(
          text,
          '  "agent.handoff.submit": {\n    withheld:\n      "agent lifecycle: a handoff is submitted by the agent, and `operator-parity.test.ts` records this as the second of that pair",\n  },',
          '  "agent.handoff.submit": "granted",',
          "the agent.handoff.submit arm",
        ),
    },
    {
      // POWÓD, KTÓRY NIE JEST POWODEM. Ramię wstrzymujące bez czytelnego
      // uzasadnienia to znowu przemilczenie — tyle że skompilowane. Ta
      // asercja istnieje po to, żeby wykluczenie zamierzone i wykluczenie
      // przez pomyłkę nie miały tej samej pisowni, więc musi umieć paść.
      name: "gut a withheld reason to something nobody could act on",
      file: PREVIEW,
      verify: only("written reason"),
      edit: (text) =>
        replaceOnce(
          text,
          '      "the runtime issues this to itself under a `maintenance` origin and no operator ever holds it (ADR-046; `CAPABILITY_DELEGATION` classifies it `runtime`)",',
          '      "not for preview",',
          "the capture.audioDeleteConfirm reason",
        ),
    },
  ],
});

for (const result of outcome.results)
  console.log(`${result.verdict.toUpperCase()}  ${result.name}`);
for (const result of outcome.failed) console.error(`FAILED: ${result.name}`);
if (!outcome.ok) process.exitCode = 1;
