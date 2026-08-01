/// <reference types="node" />

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { humanRecordKindRegistry } from "@constellation/contracts";
import { desktopSurfaceIds } from "@constellation/desktop-preload/surface-registry";

const findPackageRoot = (): string => {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(directory, "src", "RealApp.tsx"))) {
    const parent = path.dirname(directory);
    if (parent === directory)
      throw new Error("Could not locate the desktop-ui package root.");
    directory = parent;
  }
  return directory;
};

const uiRoot = findPackageRoot();
const packagesRoot = path.dirname(uiRoot);
const read = (file: string): string => readFileSync(file, "utf8");

test("one human record registry drives search defaults, labels, and inspector destinations", () => {
  const application = read(
    path.join(packagesRoot, "application", "src", "wave2.ts"),
  );
  const queryContract = read(
    path.join(packagesRoot, "contracts", "src", "query.ts"),
  );
  const labels = read(path.join(uiRoot, "src", "i18n.ts"));
  const surfaces = read(path.join(uiRoot, "src", "Wave2Surfaces.tsx"));

  assert.match(
    queryContract,
    /kinds: z\s*\.array\(GlobalSearchRecordKindSchema\)/,
  );
  assert.match(queryContract, /recordKind: GlobalSearchRecordKindSchema/);
  assert.match(
    application,
    /query\.parameters\.kinds \?\? globalSearchRecordKindIds/,
  );
  assert.match(application, /isGlobalSearchRecordKind\(record\.kind\)/);
  assert.match(labels, /humanRecordKindRegistry\.map\(\(descriptor\) =>/);
  assert.match(
    surfaces,
    /getHumanRecordKindDescriptor\(item\.recordKind\)\.inspectorSurface/,
  );
  assert.doesNotMatch(surfaces, /const relationshipKinds = new Set/);
});

// Asercja, której NIE BYŁO — z zakresem zmierzonym, a nie zapowiedzianym.
//
// `HumanRecordInspectorSurface` (`contracts/src/record-kind-registry.ts`) jest
// RĘCZNIE PRZEPISANĄ UNIĄ obok zamkniętego słownika `desktopSurfaceIds`
// i świadomie nie importuje rejestru powłoki: kontrakty nie mają zależeć od
// desktopu, a agent czyta ten katalog bez uruchomionej aplikacji. Nic zatem nie
// wiąże obu list wprost.
//
// SPROSTOWANIE, sprawdzone przez zepsucie przy wycofaniu `history`: dla
// rodzajów WYSZUKIWALNYCH kompilator jednak pomaga. `SearchOverlay.choose`
// (`Wave2Surfaces.tsx`) podaje `inspectorSurface` do `onNavigate`, którego
// parametr ma typ `SurfaceId` = `DesktopSurface`, więc `capture` zostawiony na
// wycofanym celu daje twardy błąd `tsc`, a nie cichy defekt runtime'owy.
//
// CO ZOSTAJE POZA ZASIĘGIEM KOMPILATORA i po co jest ten test: rodzaje
// NIEWYSZUKIWALNE (`fact`, `initiative`, `work_link`, `commitment`) nigdy nie
// docierają do tamtego wywołania. Ich cel może wskazywać w nicość bezkarnie —
// aż do dnia, w którym któryś stanie się wyszukiwalny i defekt wybuchnie
// w runtime jako skutek zupełnie innej zmiany. Sprawdzenie łapie rozejście
// także od drugiej strony: skasowanie celu z rejestru nawigacji, bez tknięcia
// kontraktów.
//
// Test mieszka TUTAJ, a nie w `contracts`, dokładnie z powodu tego zakazu
// importu: powłoka wolno czyta kontrakty, kontrakty powłoki nie.
test("every inspector destination in the record registry is a real navigation target", () => {
  const known = new Set<string>(desktopSurfaceIds);
  // Pusty zbiór po jednej ze stron jest AWARIĄ PRZYRZĄDU, nie wynikiem:
  // bez tego skasowanie rejestru dałoby zieleń nad zerem porównań.
  assert.ok(known.size > 0, "desktopSurfaceIds jest puste");
  assert.ok(
    humanRecordKindRegistry.length > 0,
    "humanRecordKindRegistry jest pusty",
  );
  const strays = humanRecordKindRegistry
    .filter((descriptor) => !known.has(descriptor.inspectorSurface))
    .map((descriptor) => `${descriptor.id} → ${descriptor.inspectorSurface}`);
  assert.deepEqual(
    strays,
    [],
    `Rodzaj rekordu wskazuje na cel, którego nie ma w rejestrze nawigacji: ${strays.join(", ")}.`,
  );
});
