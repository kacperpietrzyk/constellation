import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import type { ScenarioFixtures } from "../src/client/scenario-client.js";

import {
  populatedShellQueries,
  principalId,
  projectionResponse,
} from "./shell-fixture.js";

// KTO CZYTA — I CO STOI W TYM MIEJSCU, KIEDY NIE DA SIĘ TEGO ZAPYTAĆ.
//
// PO CO OSOBNY PLIK, choć stopka paska bocznego ma już parę w bramce układu.
// Bo tamta para mierzyła ATRYBUT. Przegląd adwersarialny lotu L11 złamał SAME
// SŁOWA — `{viewerName}` → `{"You"}`, ani jednej zmiany w strukturze — i bramka
// wróciła ZIELONA w obu motywach: `[data-sidebar-identity]` dalej istniał
// i dalej był narysowany. Ograniczenie, które ten sam lot dopisał do
// `.ui-craft/patterns.md` („An unavailable identity draws nothing … no »You«,
// and never the workspace's initial in the person's place — a tile with
// somebody else's letter looks like an answer"), nie miało ANI JEDNEGO
// przyrządu, a dokładnie zakazany napis przechodził.
//
// CZEGO BRAMKA NIE ZMIERZY NIGDY, i dlatego ta połowa musi stać tutaj:
//   * RÓWNOŚCI z imieniem z `workspace.access` — bramka chodzi po jednej
//     fiksturze, więc wpisanie tam imienia byłoby wpisaniem fikstury do
//     przyrządu, a nie regułą. Tutaj imię jest WEJŚCIEM testu, więc równość
//     jest regułą: „to, co narysowane, pochodzi z tego odczytu";
//   * gałęzi ODMOWY — harness bramki zawsze oddaje `workspace.access`, więc
//     stanu „nie dało się zapytać" nie umie pokazać. Fikstura interakcyjna
//     oddaje go za darmo: `populatedShellQueries` NIE MA tego zapytania, więc
//     klient scenariuszowy odmawia `query.not_available`.
//
// Imię czytelnika jest tu CELOWO na inną literę niż nazwa przestrzeni
// („Praca"): kafel z literą „P" w miejscu człowieka przeszedłby test, w którym
// obie zaczynają się tak samo, i to jest dokładnie ta awaria, którą kontrakt
// nazywa po imieniu.
const READER_NAME = "Kacper";
const WORKSPACE_INITIAL = "P";

const accessQueries: ScenarioFixtures["queries"] = {
  ...populatedShellQueries,
  "workspace.access": projectionResponse({
    kind: "workspace.access",
    policyVersion: 1,
    currentPrincipalId: principalId,
    canManage: true,
    members: [
      {
        membershipId: "00000000-0000-4000-8000-0000000000a1",
        principalId,
        displayName: READER_NAME,
        role: "owner",
        status: "active",
        version: 1,
        spaces: [],
      },
    ],
  }),
};

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

const mountShell = async (
  queries: ScenarioFixtures["queries"],
  accessReady: boolean,
): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({ queries });
  const snapshot = await loadDesktopSnapshot(client);
  // FIKSTURA, KTÓREJ NIE WIDAĆ, CHOWA. Gdyby literał projekcji nie przeszedł
  // ścisłego parsowania, slice byłby „niedostępny" i OBA testy tego pliku
  // czytałyby ten sam, pusty stan — jeden z nich nadal na zielono.
  assert.equal(
    snapshot.access.kind === "ready",
    accessReady,
    accessReady
      ? "the workspace.access fixture never reached the snapshot, so the positive case measures the refusal branch twice"
      : "workspace.access resolved even though the fixture does not carry it, so the refusal case measures nothing",
  );
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(createElement(RealApp, { client, initialSnapshot: snapshot }));
  });
};

test("the foot of the left column prints the reader's own name, and derives the letter beside it from that name", async () => {
  await mountShell(accessQueries, true);

  const identity = container.querySelector<HTMLElement>(
    "[data-sidebar-identity]",
  );
  assert.ok(identity, "the sidebar foot draws no identity at all");
  assert.equal(
    identity.textContent,
    READER_NAME,
    "the sidebar foot prints something other than the display name the access read carries",
  );

  const avatar = container.querySelector<HTMLElement>(".sidebar-foot-avatar");
  assert.ok(avatar, "the identity draws no letter tile beside the name");
  assert.equal(
    avatar.textContent,
    READER_NAME.slice(0, 1).toUpperCase(),
    "the letter beside the reader's name is not the first letter of that name",
  );
  // TA ASERCJA JEST OSOBNA OD POPRZEDNIEJ, choć przy tej fiksturze wynika
  // z niej: kontrakt zakazuje litery PRZESTRZENI w miejscu człowieka po
  // imieniu, a nie „jakiejś nie tej". Zapisana wprost przeżyje zmianę fikstury,
  // w której obie litery przestaną być różne.
  assert.notEqual(
    avatar.textContent,
    WORKSPACE_INITIAL,
    "the letter tile carries the workspace's initial where the person's belongs — somebody else's letter looks like an answer",
  );
});

test("a refused access read draws nothing in the reader's place — no name, no „You”, no letter", async () => {
  await mountShell(populatedShellQueries, false);

  const foot = container.querySelector<HTMLElement>(".sidebar-foot");
  assert.ok(
    foot,
    "the sidebar lost its whole foot, so this measures nothing about the identity in it",
  );
  assert.equal(
    container.querySelector("[data-sidebar-identity]"),
    null,
    "the shell drew an identity over a read that was refused",
  );
  assert.equal(
    container.querySelector(".sidebar-foot-avatar"),
    null,
    "the shell drew a letter tile over a read that was refused",
  );
  const text = foot.textContent ?? "";
  assert.equal(
    text.includes("You"),
    false,
    `the foot fell back to a placeholder instead of drawing nothing: „${text}"`,
  );
  // KONTROLKI ZOSTAJĄ. „Rysuje nic" dotyczy tożsamości, nie stopki — gdyby
  // zniknęła cała stopka, czytelnik straciłby zwijanie kolumny i Ustawienia,
  // czyli degradację gorszą niż brak imienia.
  assert.ok(
    foot.querySelector("[data-sidebar-collapse]"),
    "the collapse control went away with the identity, which is a bigger loss than the name",
  );
});
