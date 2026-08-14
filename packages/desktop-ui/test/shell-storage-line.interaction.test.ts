import { strict as assert } from "node:assert";

import { DataHomeStatusSchema } from "@constellation/contracts";
import { beforeAll, test } from "vitest";

import type { DataHomeStatus } from "@constellation/desktop-preload/client";

import { createScenarioClient } from "../src/client/scenario-client.js";
import { workspaceStorageLine } from "../src/RealApp.js";

// DRUGA LINIA KAFLA PRZESTRZENI, WE WSZYSTKICH CZTERECH STANACH.
//
// Bramka układu mierzy z tej linii DOKŁADNIE JEDEN stan i nie da się jej
// namówić na więcej: harness stoi w podglądzie deweloperskim, gdzie `dataHome`
// jest `undefined`, a build trzyma sesję w pamięci, więc para `L11-02` czyta
// zawsze „Local · session memory". Tytuł tamtej pary obiecywał „in every
// state", a trzy pozostałe gałęzie — w tym USTERKOWA, dla której cała poprawka
// lotu L11 powstała — nie były dotknięte ŻADNYM pomiarem. Zmierzył to przegląd
// adwersarialny; tytuł pary został sprostowany, a gałęzie zjechały tutaj, gdzie
// stan jest WEJŚCIEM, a nie przypadkiem, w który wpadł harness.
//
// PLIK NOSI SUFIKS `.interaction.`, choć nic tu nie klika, i to nie jest
// pomyłka: `vitest.config.ts` zbiera WYŁĄCZNIE
// `test/**/*.interaction.test.ts?(x)`, a `scripts/run-tests.mjs` nie wchodzi do
// tej paczki. Plik nazwany inaczej nie uruchomiłby się w ŻADNYM z dwóch
// przebiegów i wyglądałby na przechodzący.
//
// STANY SĄ PARSOWANE SCHEMATEM, NIE RZUTOWANE. Rzutowany literał kasuje
// kompilator jako strażnika kształtu — a wtedy test mierzy stan, którego domena
// nigdy nie oddaje (w tym repozytorium nazwana klasa defektu). Baza pochodzi
// z klienta scenariuszowego, tak samo jak w `workspace-recovery.test.ts`,
// więc każdy wariant różni się od prawdziwego statusu DOKŁADNIE tym, co
// nazywa jego nazwa.

let localStatus: DataHomeStatus;

beforeAll(async () => {
  localStatus = await createScenarioClient({ queries: {} }).getDataHomeStatus();
});

const coordinated = (displayName: string): DataHomeStatus =>
  DataHomeStatusSchema.parse({
    ...localStatus,
    descriptor: {
      ...localStatus.descriptor,
      providerId: "constellation.self-hosted-hub/v1",
      providerInstanceId: "constellation.hub:example",
      providerKind: "coordinated",
      storageRole: "projection_with_outbox",
      displayName,
      location: "provider_managed",
      capabilities: {
        ...localStatus.descriptor.capabilities,
        ordered_changes: { support: "supported" },
      },
    },
  });

/** Ten sam magazyn, tylko zepsuty. `recoveryActions` jest tu wymuszone przez
 *  schemat: status inny niż `available` bez ani jednej drogi wyjścia to stan,
 *  którego domena nie pozwala zapisać. */
const troubled = (
  status: DataHomeStatus,
  availability: "locked" | "unavailable" | "recovery_required" | "degraded",
): DataHomeStatus =>
  DataHomeStatusSchema.parse({
    ...status,
    availability,
    recoveryActions: ["retry_open"],
  });

test("an unread storage slice says where the data is, never that something is wrong", () => {
  // TO JEST TA GAŁĄŹ, PRZEZ KTÓRĄ POWSTAŁ CAŁY WPIS. `dataHome` jest czytane
  // wyłącznie w kanale `local-alpha`, więc w podglądzie deweloperskim slice
  // jest `undefined` — a kafel meldował wtedy „Data Home needs attention",
  // czyli USTERKĘ magazynu, o który nikt nie zapytał.
  assert.equal(
    workspaceStorageLine(undefined, "in-memory"),
    "Local · session memory",
  );
  assert.equal(
    workspaceStorageLine(undefined, "encrypted-local"),
    "Local · encrypted",
  );
});

test("„encrypted” is said only by a build that actually encrypts", () => {
  // Obietnica bezpieczeństwa nad pamięcią sesji jest gorsza niż jej brak,
  // a rozstrzyga o niej `build.persistence`, nie odczyt magazynu.
  assert.equal(
    workspaceStorageLine(localStatus, "in-memory"),
    "Local · session memory",
  );
  assert.equal(
    workspaceStorageLine(localStatus, "encrypted-local"),
    "Local · encrypted",
  );
});

test("a troubled storage keeps saying WHERE the data is", () => {
  // Napis, który przy usterce przestaje mówić o miejscu, zabiera czytelnikowi
  // jedyną trwałą informację z tego kafla. Usterka jest stanem TEGO SAMEGO
  // magazynu, nie jego zamiennikiem — więc miejsce zostaje po lewej stronie
  // separatora w każdym z czterech stanów, jakie schemat dopuszcza.
  for (const availability of [
    "locked",
    "unavailable",
    "recovery_required",
    "degraded",
  ] as const) {
    const line = workspaceStorageLine(
      troubled(localStatus, availability),
      "encrypted-local",
    );
    assert.equal(
      line,
      "Local · needs attention",
      `availability „${availability}" produced „${line}"`,
    );
  }
});

test("a coordinated storage is named by its own name, and the fault still wins over it", () => {
  assert.equal(
    workspaceStorageLine(coordinated("Northstar Hub"), "in-memory"),
    "Northstar Hub · coordinated",
  );
  // KOLEJNOŚĆ GAŁĘZI JEST TREŚCIĄ: zepsuty Hub melduje usterkę, a nie
  // „coordinated". Gdyby porządek się odwrócił, kafel mówiłby, że wszystko
  // jest w porządku, nad magazynem, który nie odpowiada.
  assert.equal(
    workspaceStorageLine(
      troubled(coordinated("Northstar Hub"), "unavailable"),
      "in-memory",
    ),
    "Northstar Hub · needs attention",
  );
});
