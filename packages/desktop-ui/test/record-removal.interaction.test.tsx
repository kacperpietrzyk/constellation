import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import { strategicRecordReferences } from "@constellation/contracts";

import { assertNoNode } from "./dom-assert.js";
import {
  populatedRelationshipWorkspace,
  populatedShellQueries,
  referencedOrganizationId,
  unreferencedOrganizationId,
} from "./shell-fixture.js";

// Gwarancja: rekordu, na który wskazuje inna praca, NIE DA SIĘ usunąć, a
// właściciel dowiaduje się tego PRZED kliknięciem — inspector nazywa pracę
// blokującą i nie daje w tym stanie żadnej kontrolki usuwania, zamiast pozwolić
// klikowi skończyć się odmową jądra. Tam, gdzie usunięcie jest dozwolone,
// treść nigdy nie obiecuje trwałości, bo cofnięcie przywraca rekord.
//
// Do tej pory pilnowała tego sekcja `interaction-recovery-contract` regexująca
// TRZY rzeczy w `RealApp.tsx`: `<RecordRemovalSection`, całe wyrażenie
// `dependentLabels={strategicDependentLabels(record, records)}` i wywołanie
// `strategicRecordReferences(candidate).includes(record.id)` — a gałąź
// zablokowaną brała jako wycinek pliku między dwoma literałami. Wszystkie trzy
// pękają na SAMYM PRZENIESIENIU tego skupiska do własnego pliku, przy
// niezmienionym zachowaniu. Ten plik montuje powłokę, wybiera rekord na
// powierzchni Relacje i czyta to, co widzi właściciel.
//
// Powłoka, nie sam komponent: `RecordRemovalSection` zamontowany wprost
// dostawałby `dependentLabels` policzone przez test, więc RealApp mógłby
// przestać je przekazywać i wszystko dalej świeciłoby na zielono. To
// przekazanie jest połową gwarancji.

let container: HTMLDivElement;
let root: Root;
let mounted = false;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  if (mounted) {
    mounted = false;
    act(() => {
      root.unmount();
    });
  }
  container.remove();
});

type StrategicRecord =
  (typeof populatedRelationshipWorkspace)["records"][number];

const records = populatedRelationshipWorkspace.records;

const recordById = (id: string): StrategicRecord => {
  const record = records.find((item) => item.id === id);
  assert.ok(record, `the fixture no longer carries the record ${id}`);
  return record;
};

/** Napis, pod którym rekord jest widoczny dla czytającego. */
const labelOf = (record: StrategicRecord): string => {
  if ("name" in record) return record.name;
  if ("title" in record) return record.title;
  // Ramię bez czytelnej nazwy przeszłoby jako pusty napis, a `includes("")`
  // jest prawdziwe zawsze — czyli asercja o nazwaniu blokady przestałaby
  // cokolwiek mierzyć.
  return assert.fail(
    `the fixture carries a record of kind "${record.kind}" this measurement cannot name`,
  );
};

/**
 * Praca, która blokuje usunięcie tego rekordu — liczona TĄ SAMĄ funkcją, którą
 * czyta jądro (`strategicRecordReferences`), a nie jej kopią przepisaną w
 * teście. Kopia rozjechałaby się po cichu i test dalej byłby zielony nad
 * inspectorem, który rozumie „zablokowane" inaczej niż jądro.
 */
const blockersOf = (record: StrategicRecord): readonly StrategicRecord[] =>
  records.filter(
    (candidate) =>
      candidate.id !== record.id &&
      strategicRecordReferences(candidate).includes(record.id),
  );

const mountShell = async (): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({ queries: populatedShellQueries });
  const initialSnapshot = await loadDesktopSnapshot(client);

  // Pomiar pusty to awaria pomiaru: gdyby projekcja rekordów zdegradowała się
  // do „dane niedostępne", powierzchnia Relacje pokazałaby stan pusty, a każda
  // asercja niżej padłaby na brakującym węźle — czyli daleko od przyczyny.
  assert.equal(
    initialSnapshot.relationships.kind,
    "ready",
    `the strategic-record fixture did not reach the snapshot: ${JSON.stringify(initialSnapshot.relationships)}`,
  );

  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(createElement(RealApp, { client, initialSnapshot }));
  });
};

/**
 * Przeczekanie wewnątrz `act`, żeby domknąć leniwy import. Musi być realną
 * zwłoką, nie samym obrotem mikrozadań: pierwszy import powierzchni idzie
 * przez transformację modułu i trwa setki milisekund, więc pętla po
 * `setTimeout(…, 0)` kończy dziesięć obrotów, zanim moduł w ogóle powstanie.
 */
const flush = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });
  });
};

/**
 * Wybiera rekord na powierzchni Relacje i zwraca sekcję usuwania z inspectora.
 *
 * Powierzchnia `organizations` jest ładowana leniwie (`loading: "lazy"` w
 * rejestrze), więc między kliknięciem w nawigację a pojawieniem się wiersza
 * stoi `Suspense`. Bez osobnego przeczekania i osobnego zdania o wierszu każda
 * awaria ładowania czytałaby się jako „brak sekcji usuwania".
 */
const openRemovalFor = async (
  record: StrategicRecord,
): Promise<HTMLElement> => {
  const item = [
    ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
  ].find((node) => node.dataset.surface === "organizations");
  assert.ok(item, "no navigation target rendered for organizations");
  await act(async () => {
    item.click();
  });

  // Found by the row's own data anchor. The retired CRM ledger drew every
  // record as a `button[aria-pressed]`; the rebuilt collection draws a client as
  // an option row carrying `aria-selected`, and the buttons left on the screen
  // belong to the filter and the create panel — so the old query would find a
  // filter chip and press it.
  const rowFor = (): HTMLElement | undefined => {
    const plane = container.querySelector<HTMLElement>('[role="tabpanel"]');
    if (!plane) return undefined;
    return [...plane.querySelectorAll<HTMLElement>("[data-org-row]")].find(
      (row) => (row.textContent ?? "").includes(labelOf(record)),
    );
  };

  let row = rowFor();
  for (let attempt = 0; attempt < 80 && row === undefined; attempt += 1) {
    await flush();
    row = rowFor();
  }
  assert.ok(
    row,
    `the Organizations plane never rendered a selectable row for “${labelOf(record)}” — the lazy surface did not resolve, so nothing below measures the inspector`,
  );

  await act(async () => {
    row.click();
  });
  // Bez tego zdania klik w niewłaściwy wiersz objawiłby się dopiero jako
  // niezgodny stan usuwania, czyli w miejscu, które nie wskazuje przyczyny.
  assert.equal(
    row.getAttribute("aria-selected"),
    "true",
    `selecting “${labelOf(record)}” did not mark its row as chosen`,
  );

  return removalRegion();
};

/**
 * Sekcja usuwania z zamontowanego inspectora. Zawsze przez to: inspector,
 * który się nie wyrenderował, spełnia KAŻDĄ asercję niżej w sposób pusty —
 * zero przycisków, zero zakazanych słów — więc jego brak musi być głośną
 * czerwienią, a nie cichą zielenią.
 */
const removalRegion = (): HTMLElement => {
  const region = container.querySelector<HTMLElement>("[data-record-removal]");
  assert.ok(
    region,
    "the inspector rendered no removal region at all, so every assertion about it would pass on nothing",
  );
  assert.ok(
    (region.textContent ?? "").trim().length > 0,
    "the removal region rendered without a single character",
  );
  return region;
};

test("a record other work points at explains the block and offers no control", async () => {
  const record = recordById(referencedOrganizationId);
  const blockers = blockersOf(record);
  assert.ok(
    blockers.length > 0,
    `nothing in the fixture references “${labelOf(record)}”, so the blocked branch is unprovable`,
  );

  await mountShell();
  const region = await openRemovalFor(record);

  assert.equal(
    region.dataset.removalState,
    "blocked",
    `the inspector offers removal in state “${region.dataset.removalState}” for a record ${blockers.length} other records point at`,
  );

  const shown = region.textContent ?? "";
  for (const blocker of blockers) {
    assert.ok(
      shown.includes(labelOf(blocker)),
      `the block does not name the work that causes it: “${labelOf(blocker)}” is missing from “${shown.trim()}”`,
    );
  }

  // Sedno „wyjaśnione przed kliknięciem": nie ma czego kliknąć. Że to fakt, a
  // nie sekcja bez przycisków w każdym stanie, dowodzi przypadek niżej —
  // w stanie wolnym ta sama sekcja niesie kontrolkę uzbrajającą.
  const controls = region.querySelectorAll("button");
  assert.equal(
    controls.length,
    0,
    `a blocked removal offers ${controls.length} control(s) that can only end in a precondition error`,
  );
});

test("a record nothing points at arms the removal and takes the arming back", async () => {
  const record = recordById(unreferencedOrganizationId);
  assert.equal(
    blockersOf(record).length,
    0,
    `“${labelOf(record)}” is referenced by other work, so the deletable branch is unprovable`,
  );

  await mountShell();
  const region = await openRemovalFor(record);
  assert.equal(
    region.dataset.removalState,
    "armable",
    `a record nothing points at sits in removal state “${region.dataset.removalState}”`,
  );

  const arm = region.querySelector<HTMLButtonElement>(
    '[data-removal-action="arm"]',
  );
  assert.ok(arm, "a removable record offers no way to start its removal");
  await act(async () => {
    arm.click();
  });

  const armed = removalRegion();
  assert.equal(
    armed.dataset.removalState,
    "confirming",
    `arming left the removal in state “${armed.dataset.removalState}”`,
  );
  assert.ok(
    armed.querySelector('[data-removal-action="confirm"]'),
    "arming the removal produced no control that performs it",
  );
  const disarm = armed.querySelector<HTMLButtonElement>(
    '[data-removal-action="disarm"]',
  );
  // Dwustopniowe potwierdzenie bez wyjścia jest pułapką: jedyne, co zostaje,
  // to kliknąć usunięcie albo odejść z ekranu.
  assert.ok(disarm, "an armed removal offers no way back out of it");

  await act(async () => {
    disarm.click();
  });
  const disarmed = removalRegion();
  // Nieobecność węzła idzie przez `assertNoNode`, nie przez
  // `assert.equal(węzeł, null)` (serializacja grafu happy-doma zabija workera
  // Vitesta bez komunikatu) ani przez `assert.ok(… === null, …)`, które co
  // prawda nie zabija, ale w czerwieni nie nazywa TEGO, co zostało na ekranie.
  // Sprawdzone przez zepsucie: przy obezwładnionym `onClick` przycisku „Cancel"
  // ta linia nazywa ocalały przycisk potwierdzenia.
  assertNoNode(
    disarmed.querySelector('[data-removal-action="confirm"]'),
    "backing out left the control that performs the removal on screen",
  );
  assert.equal(
    disarmed.dataset.removalState,
    "armable",
    `backing out left the removal in state “${disarmed.dataset.removalState}”`,
  );
});

/**
 * Zakazane słowa. Usunięcie jest miękkie — cofnięcie przywraca rekord — więc
 * ŻADNA treść tej sekcji nie ma prawa obiecać trwałości.
 */
const permanence = /permanent|irreversib|cannot be undone|forever/i;

/**
 * Korzeń paczki po ŚLADZIE NA DYSKU, nie po `import.meta.url`: w Vitescie moduł
 * testowy dostaje adres, którego `fileURLToPath` odrzuca („The URL must be of
 * scheme file") — sprawdzone, wywala cały plik przed pierwszym testem.
 */
const packageRoot = ((): string => {
  let directory = process.cwd();
  while (!existsSync(path.join(directory, "src", "styles.css"))) {
    const parent = path.dirname(directory);
    assert.notEqual(
      parent,
      directory,
      "could not locate the desktop-ui package root",
    );
    directory = parent;
  }
  return directory;
})();

const removalSource = readFileSync(
  path.join(packageRoot, "src", "components", "RecordRemovalSection.tsx"),
  "utf8",
);

/**
 * Komentarze w źródle mówią O REGULE („the copy never says permanently"), więc
 * zakaz nad surowym plikiem czerwieniłby uczciwy komponent. Wycinane są bloki i
 * WYŁĄCZNIE komentarze zajmujące całą linię: `//` w środku linii zjadłoby także
 * resztę linii prawdziwej treści (wystarczy adres `//docs…/`), a zakazane słowo
 * za nim przeszłoby niezauważone. Konsekwencja dla źródła: komentarz o trwałości
 * musi stać w osobnej linii.
 */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("no state of the removal copy promises permanence, including the ones no screen shows", () => {
  // Ta jedna asercja jest CELOWO nad plikiem, nie nad ekranem, i to nie jest
  // nawrót do regexowania źródła:
  //   1. mierzona jest ZAWARTOŚĆ pliku, nie układ JSX-a ani miejsce montażu, więc
  //      przeniesienie komponentu jej nie łamie — to właśnie na przenoszeniu
  //      pękły stare sekcje kontraktowe;
  //   2. odpowiednik przez montowanie musiałby wyrenderować KAŻDY stan KAŻDEGO
  //      rekordu, żeby powiedzieć to samo;
  //   3. dowód empiryczny, że sam montaż nie wystarcza: komunikat po usunięciu
  //      („Record deleted. Undo if that was a mistake.") NIGDY nie renderuje się
  //      wewnątrz sekcji — wychodzi przez `onRemoved` — więc dopisanie do niego
  //      słowa „permanently" zostawiało komplet asercji montujących na zielono.
  // Asercje montujące niżej zostają: bez nich ten zakaz przechodziłby też na
  // pliku, którego żaden stan nie dociera na ekran.
  assert.ok(
    removalSource.includes("export const RecordRemovalSection"),
    "the removal component was not read at all, so the ban below would pass on nothing",
  );
  const copy = withoutComments(removalSource);
  assert.ok(
    copy.trim().length > 0,
    "stripping comments left nothing of the component, so the ban below would pass on nothing",
  );

  // Pozytyw przed negatywem: sam zakaz przechodzi na pliku, który obietnicę
  // cofnięcia zgubił w ogóle. Dotyczy to zwłaszcza komunikatu po usunięciu,
  // którego żadna asercja montująca w tym pliku nie widzi.
  assert.match(
    copy,
    /Undo if that was a mistake\./,
    "the message the owner gets after the removal no longer says the record can be brought back",
  );
  // Nie `assert.doesNotMatch(copy, …)`: przy złamaniu wypisałoby CAŁY plik jako
  // „Received", w którym zakazanego zdania trzeba szukać wzrokiem. Wiersze
  // zbierane są ręcznie, żeby czerwień nazwała samo zdanie.
  const promisingLines = copy
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => permanence.test(line));
  assert.deepEqual(
    promisingLines,
    [],
    `the removal component promises permanence, though undo restores the record: ${promisingLines.join(" / ")}`,
  );
});

test("the removal copy promises undo and never promises permanence", async () => {
  // Drugi z dwóch testów w tym pliku, które są legalnie o SŁOWACH: usunięcie
  // jest miękkie, cofnięcie przywraca rekord, więc treść nie ma prawa obiecać
  // trwałości. Ten mierzy WYRENDEROWANY tekst każdego z trzech stanów sekcji —
  // zdanie, które istnieje w pliku, ale nie dociera na ekran, nie jest
  // obietnicą złożoną komukolwiek. Test wyżej mierzy plik i łapie odwrotność:
  // treść, która obiecuje trwałość, nie renderując się tutaj.
  const record = recordById(unreferencedOrganizationId);
  await mountShell();
  const region = await openRemovalFor(record);
  // Obietnica cofnięcia jest składana TYLKO tam, gdzie usunięcie jest w ogóle
  // możliwe. Bez tego zdania sekcja zablokowana czytałaby się jako „zgubiono
  // obietnicę cofnięcia", czyli czerwień nazwałaby niewłaściwą przyczynę.
  assert.equal(
    region.dataset.removalState,
    "armable",
    `the copy case ran against a removal in state “${region.dataset.removalState}”, which never promises anything`,
  );
  const offered = region.textContent ?? "";

  // Pozytyw przed negatywem: samo `/undo/i` przechodzi na zdaniu „cannot be
  // undone", a sam zakaz przechodzi na sekcji, która obietnicę cofnięcia
  // zgubiła. Dopiero para niesie gwarancję.
  assert.match(
    offered,
    /undo/i,
    `the removal never tells the owner the record can be brought back: “${offered.trim()}”`,
  );
  assert.doesNotMatch(
    offered,
    permanence,
    `a soft delete promised permanence: “${offered.trim()}”`,
  );

  // Stan uzbrojony to OSTATNI ekran przed kliknięciem, więc obowiązuje go ta
  // sama para, nie sam zakaz: zakaz przechodzi na ekranie, który obietnicę
  // cofnięcia zgubił, a to jest dokładnie ten ekran, na którym właściciel
  // decyduje. Rozstrzygnięte na rzecz „musi obiecywać" i komponent to teraz
  // renderuje; do tego przebiegu obietnicy tam po prostu nie było.
  const arm = region.querySelector<HTMLButtonElement>(
    '[data-removal-action="arm"]',
  );
  assert.ok(arm, "a removable record offers no way to start its removal");
  await act(async () => {
    arm.click();
  });
  const armed = removalRegion().textContent ?? "";
  assert.match(
    armed,
    /undo/i,
    `the last screen before the click never tells the owner the record can be brought back: “${armed.trim()}”`,
  );
  assert.doesNotMatch(
    armed,
    permanence,
    `the confirmation step promised permanence: “${armed.trim()}”`,
  );

  // Trzeci stan tej sekcji, w tej samej powłoce: zablokowany. Obietnicy
  // cofnięcia NIE ma prawa składać — nie ma czego cofać, dopóki usunięcie jest
  // odmawiane — ale zakaz trwałości obowiązuje go tak samo, bo to zdanie o
  // rekordzie, a nie o kliknięciu.
  const blocked = await openRemovalFor(recordById(referencedOrganizationId));
  assert.equal(
    blocked.dataset.removalState,
    "blocked",
    `the blocked copy case ran against a removal in state “${blocked.dataset.removalState}”`,
  );
  const refused = blocked.textContent ?? "";
  assert.doesNotMatch(
    refused,
    permanence,
    `the blocked explanation promised permanence: “${refused.trim()}”`,
  );
});
