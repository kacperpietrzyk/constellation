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

// WPIS 10-2 OGONA FAZY III — SEKCJA NAZYWA SIĘ TYM, CO ZNACZY, NIE DOSTAWCĄ.
//
// Nagłówek drugiej sekcji mówił `Jamie results` — nazwę integracji w miejscu,
// w którym sąsiedni nagłówek mówi `Coming up`, czyli o CZASIE spotkania.
// Prototyp nazywa ten zbiór robotą, która z niego została:
// `<h2>What is left of the ones that happened …` (`v3/screens/meetings.js:446`).
//
// SZEŚĆ PAR REJESTRU STOI NA TYM NAGŁÓWKU i ANI JEDNA nie czyta, co on mówi
// (`D7-03a` liczy jedną głowę, `D7-03b` zero w środku listy, `D7-03c` wyjście,
// `D7-03d` kreskę, `D7-03e` stopień pisma, `D7-03f/g` bliźniaka nadchodzących).
// Mylił też pierwszy kandydat spoza rejestru: test w
// `interaction-recovery-contract.test.ts` NAZYWAŁ się od tego napisu i asertował
// `className` oraz kolejność montażu.
//
// ASERCJA JEST O REGULE, NIE O NAPISIE, i to jest cała różnica: pyta, czy
// nagłówek sekcji nazywa DOSTAWCĘ — nad słownikiem, który ten sam ekran właśnie
// narysował, a nie nad listą przepisaną do testu. Przywrócenie `Jamie results`
// ją zapala; tak samo zapali ją `Apple Calendar results` albo `Calendar
// results`, bo obie te nazwy naprawdę stoją dziś w plakietkach.
//
// CZEGO TEN SŁOWNIK DZIŚ NIE UNIESIE, i to jest własność, nie brak:
// `providerLabel` (`MeetingsSurface.tsx:104-113`) jest funkcją totalną nad
// dwoma zamkniętymi słownikami kontraktu i potrafi zwrócić WYŁĄCZNIE
// `Apple Calendar` albo `Calendar`. Nazwa w rodzaju „Outlook" nie może więc
// dziś zapalić tej asercji — nie dlatego, że reguła jej nie obejmuje, tylko
// dlatego, że produkt jej nie rysuje. Dopisanie dostawcy do kontraktu zapala
// kompilator w `providerLabel`, nowa nazwa wchodzi do plakietek, a ta asercja
// obejmuje ją BEZ zmiany tego pliku. To jest cała wartość słownika branego
// z ekranu i to jest zdanie, które ten komentarz mówił wcześniej nieprawdziwie
// (obiecywał pokrycie nazwy, której żaden słownik produktu nie zna).
//
// PLAKIETKA DOSTAWCY ZOSTAJE POZA ZAKRESEM ŚWIADOMIE: `.meeting-sec-lock` mówi
// „Apple Calendar" i MA prawo — ona nazywa POŁĄCZENIE, z którego przyszły dane,
// a nie zbiór spotkań. Reguła dotyczy nagłówka, nie sekcji.
test("no section heading on this screen names the system the data came from", async () => {
  await mount((loop) => loop);

  const headings = [
    ...container.querySelectorAll<HTMLElement>(".meeting-sec-head h2"),
  ].map((node) => (node.textContent ?? "").trim());
  assert.ok(
    headings.length >= 2,
    `this screen drew ${headings.length} section heading(s); the rule is about both sections and ` +
      "a sweep over one of them proves nothing about the other",
  );

  // SŁOWNIK Z EKRANU, NIE Z TEGO PLIKU. Nazwy dostawców, które produkt naprawdę
  // rysuje, stoją w plakietkach połączenia i wydarzenia — biorąc je stamtąd,
  // asercja rośnie razem z `providerLabel`, zamiast być czwartą ręczną listą
  // obok zamkniętego słownika. „Jamie" dopisane wprost i to jest jedyny
  // literał tutaj: to nazwa integracji pisana w prozie tego ekranu ręką, więc
  // żadna plakietka jej nie niesie — a to właśnie ona wspięła się do nagłówka.
  const providerNames = [
    ...new Set([
      ...texts(".meeting-sec-lock"),
      ...texts(".meeting-event .meeting-locked"),
      "Jamie",
    ]),
  ].filter((name) => name !== "");
  assert.ok(
    providerNames.length >= 2,
    `the screen exposed ${providerNames.length} provider name(s) to compare against; with fewer ` +
      "than two this rule is a single hard-coded word wearing a vocabulary's clothes",
  );

  const named = headings.flatMap((heading) =>
    providerNames
      .filter((name) => heading.includes(name))
      .map((name) => `„${heading}" carries „${name}"`),
  );
  assert.deepEqual(
    named,
    [],
    "a section heading names the system the rows came from instead of the meetings it holds; the " +
      "reference names both sections by WHEN the meeting is (`Coming up`, `What is left of the " +
      "ones that happened`) and leaves the provider to the badge beside them",
  );
});

// DRUGA POŁOWA WPISU 10-2 — NAZWA DOSTĘPNA, KTÓRĄ NIC NIE PILNOWAŁO.
//
// Przemianowanie sekcji dotknęło DWÓCH napisów: widocznego `h2` i atrybutu
// `aria-label` listy pod nim (`MeetingsSurface.tsx:1255`). Zmiana atrybutu
// jechała na WŁASNEJ regule, wypisanej w komentarzu przy nim — „nazwa dostępna
// RÓWNA widocznemu nagłówkowi" — a asercja wyżej skanuje wyłącznie
// `.meeting-sec-head h2`. Czyli reguła była zadeklarowana i NIEZMIERZONA:
// przywrócenie w atrybucie `Jamie results` przeszłoby cały `npm run check`
// na zielono, razem z `english-copy` i `prose-guard`, które chodzą w tej samej
// aplikacji. Znalazł to przegląd adwersarialny naprawiający ten ogon —
// złamaniem, nie lekturą.
//
// ASERCJA JEST TOTALNA NAD SEKCJAMI I ICH POJEMNIKAMI, nie punktowa na jednym
// atrybucie: bierze KAŻDĄ sekcję z nagłówkiem, w niej KAŻDEGO potomka
// z `aria-label`, który jest pojemnikiem wierszy (a nie kontrolką ani wierszem
// — te mają prawo do własnych nazw), i żąda równości z nagłówkiem po zdjęciu
// licznika. Sekcja nadchodzących nie nazywa swojego pojemnika WCALE i to jest
// zapisana decyzja, nie luka — reguła mówi „jeśli nazywa, to tak samo", więc
// milczenie jej nie łamie i nie musi być wyjątkiem w kodzie.
test("a section's row container answers to the same name the section shows", async () => {
  await mount((loop) => loop);

  // `closest`, a nie `:has()`: selektor rodzica jest w happy-domie zależnością,
  // której ten plik nie musi zaciągać, a wynik jest ten sam i czytelniejszy.
  const sections = [
    ...new Set(
      [...container.querySelectorAll<HTMLElement>(".meeting-sec-head")].flatMap(
        (head) => {
          const section = head.closest("section");
          return section === null ? [] : [section];
        },
      ),
    ),
  ];
  assert.ok(
    sections.length >= 2,
    `this screen drew ${sections.length} named section(s); the rule is about every section, and ` +
      "one of them proves nothing about the other",
  );

  // Licznik jest OSOBNYM elementem nagłówka, nie częścią jego nazwy: prototyp
  // pisze `<span class="n">`, my `.meeting-sec-count`. Nazwa dostępna nie
  // powtarza liczby, więc porównanie zdejmuje ją z widocznej strony, zamiast
  // dopisywać do atrybutu.
  const visibleName = (section: HTMLElement): string => {
    const heading = section.querySelector<HTMLElement>(".meeting-sec-head h2");
    if (heading === null) return "";
    const clone = heading.cloneNode(true) as HTMLElement;
    for (const count of clone.querySelectorAll(".meeting-sec-count"))
      count.remove();
    return (clone.textContent ?? "").replace(/\s+/gu, " ").trim();
  };

  const disagreements: string[] = [];
  let compared = 0;
  for (const section of sections) {
    const shown = visibleName(section);
    if (shown === "") continue;
    for (const rows of section.querySelectorAll<HTMLElement>(
      "[aria-label][role='listbox'], ol[aria-label], ul[aria-label], " +
        "div[aria-label][class$='-list']",
    )) {
      const announced = (rows.getAttribute("aria-label") ?? "").trim();
      compared += 1;
      if (announced !== shown)
        disagreements.push(
          `„${rows.className}" answers to „${announced}" inside a section shown as „${shown}"`,
        );
    }
  }

  // §6 TEJ FALI, PRZENIESIONA DO ASERCJI: pusty przelot jest nieodróżnialny
  // od poprawnego. Jeśli produkt przestanie nazywać którykolwiek pojemnik,
  // ten test ma o tym POWIEDZIEĆ, a nie przejść na zerze porównań.
  assert.ok(
    compared >= 1,
    "this run compared zero row containers against their headings; the rule cannot pass on an " +
      "empty sweep — either the markup lost its accessible names or this selector stopped " +
      "reaching them",
  );
  assert.deepEqual(
    disagreements,
    [],
    "a row container announces a different name than the heading above it, so a reader using " +
      "software hears one collection and a reader looking sees another",
  );
});
