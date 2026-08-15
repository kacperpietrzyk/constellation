import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import {
  MeetingEvidenceSchema,
  type MeetingLoopSurface,
} from "@constellation/contracts";

import { createScenarioClient } from "../src/client/scenario-client.js";
import { evidenceKeyLabel, MeetingsSurface } from "../src/MeetingsSurface.js";
import { initialsOf } from "../src/initials.js";
import { meetingLoopFixture, spaceId } from "./meetings-fixture.js";

/* CO TEN PLIK MIERZY I DLACZEGO NIE ROBI TEGO BRAMKA UKŁADU.
 *
 * Przegląd adwersarialny wpisu 10-3 skasował po kolei CZTERY napisy widoczne
 * dla człowieka — imię uczestnika, nazwę dostawcy przy wierszu, klucz pozycji
 * przygotowania i etykietę pigułki celu — i bramka układu wróciła ZIELONA
 * w obu motywach, z werdyktami co do bajtu identycznymi z przelotem dostawy.
 * Cztery pary tamtego wpisu mierzyły OBECNOŚĆ POJEMNIKÓW, a dwie z nich miały
 * w tytule słowo „names”.
 *
 * PODZIAŁ PRACY JEST TAKI, JAKI ZAPISAŁ JUŻ RAZ TEN REPOZYTORIUM PRZY
 * `sidebar-identity` (para `L11-03a` liczy element, `L11-03b` odrzuca zakazany
 * zastępnik, a RÓWNOŚĆ z prawdziwym imieniem stoi w teście interakcji):
 *   • bramka mówi zdania o PRODUKCIE, których nie da się spełnić fikstura —
 *     `D7-01g` (imię istnieje i jest narysowane), `D7-02h` (plakietka niesie
 *     nazwę dostawcy);
 *   • ten plik mówi zdania, których bramka powiedzieć NIE MOŻE, bo chodzi po
 *     jednej fiksturze: RÓWNOŚĆ narysowanego napisu z danymi, WYCZERPANIE
 *     zamkniętego słownika i dwa ramiona puste, których fikstura bramki nie
 *     rysuje wcale.
 *
 * ŻADNA ASERCJA NIŻEJ NIE MÓWI „tekst niepusty”. „Tekst niepusty” spełnia też
 * kropka — to jest wprost zapisana lekcja tego repozytorium.
 */

let container: HTMLElement;
let inspectorHost: HTMLElement;
let root: Root;
let mounted = false;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  inspectorHost = document.createElement("div");
  document.body.append(container, inspectorHost);
});

afterEach(() => {
  if (mounted) act(() => root.unmount());
  mounted = false;
  container.remove();
  inspectorHost.remove();
});

const waitFor = async (
  predicate: () => boolean,
  message: string,
): Promise<void> => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
  assert.fail(message);
};

/* WSZYSTKIE INSTANTY Z ZEGARA, KTÓRY WŁAŚNIE TYKA. Wpisana data położyła
   `main` całej fali raz i zrobi to znowu. */
const evidence = (
  kind: (typeof MeetingEvidenceSchema.shape.kind.options)[number],
  label: string,
  fact: string,
  now: number,
) =>
  MeetingEvidenceSchema.parse({
    kind,
    recordId: `00000000-0000-4000-8000-0000000009${kind.length}0`.slice(0, 36),
    spaceId,
    label,
    fact,
    updatedAt: new Date(now).toISOString(),
  });

const mount = async (
  shape: (loop: MeetingLoopSurface) => MeetingLoopSurface,
): Promise<void> => {
  const now = Date.now();
  const base = createScenarioClient({ queries: {} });
  const client = {
    ...base,
    getJamieStatus: async () => ({
      configured: true,
      scope: "personal" as const,
    }),
    getMeetingLoop: async () => shape(meetingLoopFixture(now)),
  };
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(MeetingsSurface, {
        client,
        inspectorHost,
        onInspectorOpen: () => undefined,
        onMeetingSelected: () => undefined,
        onOpenConnections: () => undefined,
        onOpenSources: () => undefined,
      }),
    );
  });
  await waitFor(
    () => container.querySelector(".meeting-event") !== null,
    "the upcoming row never rendered",
  );
};

const texts = (selector: string): readonly string[] =>
  [...container.querySelectorAll(selector)].map((node) =>
    (node.textContent ?? "").trim(),
  );

test("the upcoming row prints each attendee's name, not only their initials", async () => {
  const attendees = [
    { name: "Marta Nowak", organizer: true, response: "accepted" as const },
    {
      name: "Piotr Zieliński",
      organizer: false,
      response: "accepted" as const,
    },
  ];
  await mount((loop) => ({
    ...loop,
    upcoming: loop.upcoming.map((entry) => ({
      ...entry,
      event: { ...entry.event, attendees },
    })),
  }));

  /* RÓWNOŚĆ, A NIE ZAWIERANIE. To jest zdanie, którego bramka powiedzieć nie
     może: równość z imieniem byłaby tam fiksturą przepisaną do przyrządu. */
  assert.deepEqual(
    texts(".meeting-event .meeting-person-name"),
    ["Marta Nowak", "Piotr Zieliński"],
    "the row does not print the attendees' names in the order the projection carries them",
  );
  /* AWATAR JEST SKRÓTEM IMIENIA, A NIE DRUGĄ IMPLEMENTACJĄ OBOK NIEGO —
     porównywane z `initialsOf`, czyli z jedyną funkcją, która to liczy. */
  assert.deepEqual(
    texts(".meeting-event .meeting-person-avatar"),
    attendees.map((attendee) => initialsOf(attendee.name)),
    "the initial tiles are not the initials of the names beside them",
  );
  assert.equal(
    texts(".meeting-event .meeting-person-avatar").join(" "),
    "MN PZ",
    "the avatars stopped being two-letter initials",
  );
});

test("the row badge names the provider of THAT event, not of the connection", async () => {
  /* ZDOLNOŚĆ MÓWI `eventkit`, WYDARZENIE MÓWI `fixture`. Do naprawy wiersz
     czytał dane SEKCJI, więc pod wydarzeniem z fikstury drukował „Apple
     Calendar” — plakietka mówiła nieprawdę dokładnie w tym przelocie, którym
     para `D7-02g` dowodziła, że wiersz nazywa dostawcę. */
  await mount((loop) => ({
    ...loop,
    capability: { ...loop.capability, provider: "eventkit" as const },
  }));
  assert.deepEqual(
    texts(".meeting-event .meeting-locked"),
    ["Calendar"],
    "the row badge reads the connection's provider instead of the event's",
  );
  assert.equal(
    texts(".meeting-sec-lock")[0],
    "Apple Calendar",
    "the section badge stopped naming the connection's provider",
  );
});

test("every evidence kind the contract knows gets its own worded key", async () => {
  /* WYCZERPANIE LICZONE ZE SŁOWNIKA KONTRAKTU, NIE Z RĘCZNEJ LISTY SZEŚCIU.
     Strażnik wyczerpania napisany nad przepisaniem dowodzi tylko tego, że
     przepisanie zgadza się samo ze sobą — lekcja fali D, zapisana. */
  const kinds = MeetingEvidenceSchema.shape.kind.options;
  const labels = kinds.map((kind) => evidenceKeyLabel(kind));
  for (const [index, label] of labels.entries())
    assert.match(
      label,
      /^[A-Z][A-Za-z]+(?: [a-z]+)*$/u,
      `the key for „${kinds[index]}" is not a worded label`,
    );
  assert.equal(
    new Set(labels).size,
    kinds.length,
    "two evidence kinds share one key, so the row cannot say which record it names",
  );

  const now = Date.now();
  await mount((loop) => ({
    ...loop,
    upcoming: loop.upcoming.map((entry) => ({
      ...entry,
      brief: {
        ...entry.brief,
        orientation: kinds.map((kind, index) =>
          evidence(kind, `Record ${index}`, `Fact ${index}`, now),
        ),
      },
    })),
  }));
  assert.deepEqual(
    texts(".meeting-prep-k"),
    [...labels],
    "the drawn keys are not the keys the contract's vocabulary maps to",
  );
});

test("the value prints the fact only when it says something the label does not", async () => {
  /* W PRODUKCJI `fact` NIEKONFLIKTOWEGO WORK-ITEMU RÓWNA SIĘ JEGO `label`
     (`packages/desktop-main/src/calendar-meeting-loop.ts:314-321`), więc przed
     naprawą każda pozycja z Jamie brzmiała „Tytuł · Tytuł”. Fikstura bramki ma
     te pola różne, więc nie dosięgał tego żaden przyrząd. */
  const now = Date.now();
  await mount((loop) => ({
    ...loop,
    upcoming: loop.upcoming.map((entry) => ({
      ...entry,
      brief: {
        ...entry.brief,
        orientation: [
          evidence("task", "Confirm the owner", "Confirm the owner", now),
          evidence(
            "project",
            "Northstar rollout",
            "Enters release review",
            now,
          ),
        ],
      },
    })),
  }));
  assert.deepEqual(
    texts(".meeting-prep-v"),
    ["Confirm the owner", "Northstar rollout · Enters release review"],
    "the value repeats the record's name instead of adding a fact to it",
  );
  assert.equal(
    container.querySelectorAll(".meeting-prep-dot").length,
    1,
    "the separator is drawn for a value that has nothing on its right",
  );
});

test("both empty arms say what is missing in words", async () => {
  /* TE DWA RAMIONA SĄ NIEOSIĄGALNE DLA BRAMKI UKŁADU: jej fikstura niesie
     dwoje uczestników i dwie pozycje przygotowania, a poszerzenie jej jest
     świadomie zabronione („JEDEN WIERSZ, NIE DWA”). Fikstura, która czegoś nie
     rysuje, nie tylko nie mierzy — ona CHOWA, więc zdania tych ramion są
     mierzone tutaj i tylko tutaj. Fikstura tego pliku ma zero uczestników
     i pusty brief, więc oba rysują się bez żadnego kształtowania. */
  await mount((loop) => loop);
  assert.deepEqual(
    texts(".meeting-room-none"),
    ["The calendar lists nobody for this meeting."],
    "the room with nobody in it says nothing, or says something else",
  );
  assert.deepEqual(
    texts(".meeting-prep-none"),
    ["Nothing exactly linked to bring into this room."],
    "the empty preparation column says nothing, or says something else",
  );
  assert.equal(
    container.querySelectorAll(".meeting-person").length,
    0,
    "the empty arm drew a person anyway",
  );
});
