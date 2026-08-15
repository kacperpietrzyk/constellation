import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import {
  longIntendedOutcome,
  longTaskTitle,
  populatedProjectList,
  populatedShellQueries,
  populatedTaskList,
} from "./shell-fixture.js";

// Fixture, którego nikt nie czyta, jest nie do odróżnienia od braku fixture'u.
// Ten plik jest dowodem konsumpcji `populatedShellQueries`: powłoka montuje się
// na nim, a rekordy z niego są WIDOCZNE na planie roboczym. Bez tego wariant
// bogaty mógłby mieć dowolny kształt — nikt by się nie dowiedział.
//
// „Widoczne" znaczy tu: w węźle, który ogląda człowiek. Pomiar po
// `plane.textContent` przechodził na obcięciu widocznego tytułu do dwudziestu
// znaków, bo ten sam tytuł niosą jeszcze dwie etykiety `sr-only` w tym samym
// wierszu — dlatego każda asercja o treści idzie przez `data-row-title` /
// `data-row-outcome`, a nie przez tekst całego planu.

let container: HTMLDivElement;
let root: Root;
// Odmontowanie tego samego korzenia dwa razy wywala workera Vitesta bez
// komunikatu. Bez tego znacznika pierwsza czerwień w tym pliku pociągałaby za
// sobą awarię pozostałych przypadków i przyczyna byłaby nie do odczytania.
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

/** Do komunikatów: tyle napisu, żeby go poznać, i ani znaku więcej. */
const clip = (text: string): string =>
  text.length <= 60 ? text : `${text.slice(0, 60)}…`;

/** Ile znaków od POCZĄTKU obu napisów jest wspólnych. */
const sharedPrefix = (left: string, right: string): number => {
  let index = 0;
  while (
    index < left.length &&
    index < right.length &&
    left[index] === right[index]
  ) {
    index += 1;
  }
  return index;
};

const mountShell = async (): Promise<void> => {
  const { RealApp } = await import("../src/RealApp.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({ queries: populatedShellQueries });
  const initialSnapshot = await loadDesktopSnapshot(client);

  // Pomiar pusty to awaria pomiaru: gdyby wczytanie migawki zdegradowało
  // którąkolwiek z dwóch projekcji, na których stoi ten plik, ekran
  // wyrenderowałby stan pusty, a wszystkie asercje niżej padłyby z komunikatem
  // o brakującym wierszu — czyli w miejscu, które nie wskazuje przyczyny.
  assert.equal(
    initialSnapshot.tasks.length,
    populatedTaskList.items.length,
    `the snapshot took ${initialSnapshot.tasks.length} tasks from a fixture that carries ${populatedTaskList.items.length}`,
  );
  assert.equal(
    initialSnapshot.projects.kind,
    "ready",
    `the project fixture did not reach the snapshot: ${JSON.stringify(initialSnapshot.projects)}`,
  );

  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(createElement(RealApp, { client, initialSnapshot }));
  });
};

const openDestination = async (surface: string): Promise<HTMLElement> => {
  const item = [
    ...container.querySelectorAll<HTMLElement>(".nav-item[data-surface]"),
  ].find((node) => node.dataset.surface === surface);
  assert.ok(item, `no navigation target rendered for ${surface}`);
  await act(async () => {
    item.click();
  });

  // Korelacja, że nawigacja W OGÓLE się zdarzyła, i to tam, gdzie proszono.
  // Bez tego zdania każdy pomiar niżej czytał DOWOLNY plan roboczy, jaki akurat
  // stał na ekranie. Sprawdzone przez zepsucie: przypięcie nawigacji do
  // `today` zostawiało przypadek Projektów zielony, bo plan Dzisiaj też
  // wypisuje projekty razem z ich intencjami. Ta sama gwarancja i ten sam
  // zaczep, co w `surface-lifecycle.interaction.test.tsx:159-165`.
  const main = container.querySelector<HTMLElement>("main[data-surface]");
  // Zawężenie typu W PRAKTYCE, ale nie ozdoba: `data-surface` nosi WYŁĄCZNIE
  // plan roboczy — trzy punkty orientacyjne `center-state` (RealApp.tsx
  // 2720/2734/2770) go nie mają, więc powłoka, która wylądowała w ładowaniu
  // albo w odzyskiwaniu, pada tutaj. Że tu nie wyląduje, pilnują strażnicy
  // migawki w `mountShell`; zdanie zostaje, żeby taka powłoka NAZWAŁA SIĘ,
  // zamiast wywalić się na `null` kilka linii niżej.
  assert.ok(main, `${surface}: the shell rendered no main landmark`);
  // PRZED pytaniem o plan i o jego treść: nawigacja, która poszła nie tam,
  // objawiłaby się inaczej jako „pusty plan roboczy", czyli czerwień nazwałaby
  // niewłaściwą przyczynę.
  assert.equal(
    main.getAttribute("data-surface"),
    surface,
    `the shell went to “${main.getAttribute("data-surface")}” instead of “${surface}”, so everything below was measured on the wrong screen`,
  );

  const plane = main.querySelector<HTMLElement>('[role="tabpanel"]');
  assert.ok(plane, `${surface} rendered no work plane after the click`);
  // Plan roboczy bez ani jednego znaku znaczy, że każda asercja o treści niżej
  // mierzyłaby pustkę. Osobne zdanie, żeby czerwień nazywała przyczynę.
  assert.ok(
    (plane.textContent ?? "").trim().length > 0,
    `${surface} rendered an empty work plane`,
  );
  return plane;
};

/**
 * Tytuły wierszy tak, jak je widzi CZYTAJĄCY: treść węzłów `data-row-title`.
 * Świadomie nie `plane.textContent` — patrz komentarz na górze pliku.
 */
const visibleRowTitles = (plane: HTMLElement): readonly string[] => {
  const titles = [
    ...plane.querySelectorAll<HTMLElement>("[data-row-title]"),
  ].map((node) => (node.textContent ?? "").trim());
  assert.ok(
    titles.length > 0,
    "the plane rendered no row title at all, so nothing below measures a row",
  );
  return titles;
};

test("the populated fixture puts its tasks on the Tasks plane", async () => {
  // Pętla po pustej liście przechodzi bez ani jednej asercji, więc bez tego
  // zdania opróżnienie fixture'u czytałoby się jako sukces. Sprawdzone przez
  // zepsucie: z `items: []` cały ten przypadek świecił na zielono.
  assert.ok(
    populatedTaskList.items.length >= 3,
    `the populated task fixture degenerated to ${populatedTaskList.items.length} items`,
  );

  await mountShell();
  const plane = await openDestination("tasks");
  const titles = visibleRowTitles(plane);

  // Dopasowanie DOKŁADNE, nie `includes`: obcięty tytuł ma tu paść, i to na
  // tym tytule, którego dotyczy.
  for (const item of populatedTaskList.items) {
    assert.ok(
      titles.includes(item.title),
      `the Tasks plane shows no row reading “${clip(item.title)}” — its rows read ${JSON.stringify(titles.map(clip))}`,
    );
  }

  // To zdanie nie mierzy EKRANU, tylko FIXTURE, i tak jest zamierzone: pomiar
  // obcinania wykonuje pętla wyżej, a ta asercja pilnuje, żeby miała czym go
  // wykonać. Tytuł skrócony do trzech słów nie odsłoni ani obcięcia, ani
  // zawinięcia, ani kolizji z metryką obok, a pętla dalej byłaby zielona.
  assert.ok(
    longTaskTitle.length > 100,
    `the long-title case degenerated to ${longTaskTitle.length} characters`,
  );
});

test("the populated fixture puts its projects on the Projects plane", async () => {
  assert.ok(
    populatedProjectList.items.length >= 2,
    `the populated project fixture degenerated to ${populatedProjectList.items.length} items`,
  );

  await mountShell();
  const plane = await openDestination("projects");
  const titles = visibleRowTitles(plane);

  for (const item of populatedProjectList.items) {
    assert.ok(
      titles.includes(item.title),
      `the Projects plane shows no row reading “${clip(item.title)}” — its rows read ${JSON.stringify(titles.map(clip))}`,
    );
  }

  // Realne `intendedOutcome` w tym workspace ma 1400-3000 znaków i kilka
  // akapitów. Fixture skrócony do jednego zdania przestaje odsłaniać obcinanie
  // i rytm akapitów, a ta klasa defektów już raz tędy przeszła — dlatego
  // długość i wieloakapitowość są tu pilnowane wprost. To jedyne dwa zdania
  // o KSZTAŁCIE fixture'u w tym przypadku; wszystko niżej mierzy już ekran.
  // Symetria jest celowa: bez drugiego zdania fixture ścięty do jednego akapitu
  // zaczerwieniłby się dopiero na pomiarze ekranu, komunikatem wskazującym
  // render — czyli czerwień nazwałaby niewłaściwą przyczynę.
  assert.ok(
    longIntendedOutcome.length >= 1400,
    `the long outcome degenerated to ${longIntendedOutcome.length} characters`,
  );
  assert.ok(
    longIntendedOutcome.includes("\n\n"),
    "the long outcome fixture is one paragraph, so no render can put a multi-paragraph rhythm on the screen",
  );

  const carrier = populatedProjectList.items.find(
    (item) => item.intendedOutcome === longIntendedOutcome,
  );
  assert.ok(
    carrier,
    "no project in the fixture carries the long intended outcome, so the layout it exists to expose is unreachable",
  );
  const carrierTitle = [
    ...plane.querySelectorAll<HTMLElement>("[data-row-title]"),
  ].find((node) => (node.textContent ?? "").trim() === carrier.title);
  // Zawężenie typu, nie pomiar: pętla wyżej sprawdziła już KAŻDY tytuł
  // z fixture'u, a `carrier` jest jednym z nich — ten wiersz nie ma prawa
  // tu nie istnieć. Zdanie zostaje po to, żeby przyszła zmiana kolejności
  // nie zamieniła braku wiersza w `undefined is not an object`.
  assert.ok(
    carrierTitle,
    `the Projects plane rendered no row for “${clip(carrier.title)}”, the only project that carries the long outcome`,
  );
  // Gdzie ta gwarancja teraz mieszka, i dlaczego się przeniosła. Wiersz
  // kolekcji NIE pokazuje już intencji: przyjęty prototyp wycina eseje
  // z wierszy, bo pierwsze 190 px każdego ekranu było instrukcją obsługi,
  // a wiersz ma mówić, co jest z projektem — nie streszczać go. Pomiar
  // obcinania przenosi się więc tam, gdzie intencja NAPRAWDĘ jest rysowana:
  // do inspektora, jedno kliknięcie od wiersza. Sama gwarancja się nie
  // zmienia — CAŁA intencja dociera do DOM-u, z rytmem akapitów — i to jest
  // ta klasa defektów, która przeszła tędy już raz.
  //
  // Pełny widok rekordu stoi na `project.operationalOverview`, którego ten
  // fixture nie niesie, więc mierzenie go stąd mierzyłoby nieosiągalny ekran.
  // Kiedy powstanie ekran rekordu (decyzja #29: szerokość do czytania, bez
  // ucinania), gwarancja przenosi się tam razem z tą projekcją.
  const carrierRow = carrierTitle.closest<HTMLElement>("[data-project-row]");
  assert.ok(
    carrierRow,
    `the row for “${clip(carrier.title)}” carries no project identity to open`,
  );
  await act(async () => {
    carrierRow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (container.querySelector(".provenance-block blockquote")) break;
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    });
  }
  const outcome = container.querySelector<HTMLElement>(
    ".provenance-block blockquote",
  );
  assert.ok(
    outcome,
    `the record for “${clip(carrier.title)}” renders no intended outcome at all`,
  );
  const rendered = (outcome.textContent ?? "").trim();

  // KOLEJNOŚĆ: najpierw akapity, potem całość. Render, który skleja akapity w
  // jeden ciąg, gubi rytm przy TEJ SAMEJ liczbie znaków — pytanie o całość
  // powiedziałoby wtedy „napis się nie zgadza", a to zdanie mówi, co dokładnie
  // zniknęło. Liczone na WYRENDEROWANYM tekście: ta sama asercja postawiona na
  // stałej z fixture'u nie mówi nic o ekranie.
  const paragraphs = rendered
    .split("\n\n")
    .filter((paragraph) => paragraph.trim() !== "");
  assert.ok(
    paragraphs.length >= 3,
    `the rendered outcome arrived as ${paragraphs.length} paragraph(s) of ${rendered.length} characters, so no multi-paragraph rhythm reaches the screen`,
  );

  // Sedno: CAŁA intencja dociera do DOM-u. Sprawdzone przez zepsucie —
  // obcięcie renderu do 200 znaków zostawiało poprzednią wersję tej asercji
  // zieloną, bo pytała tylko o pierwsze 120.
  assert.ok(
    rendered.includes(longIntendedOutcome),
    `the record carries ${rendered.length} characters of the ${longIntendedOutcome.length}-character outcome (${sharedPrefix(rendered, longIntendedOutcome)} of them from its start), so the truncation this fixture exists to expose cannot show up`,
  );
});

test("a task row names its owner where the packaged smoke reads it", async () => {
  // The packaged hub smoke proves that an assignment made on another device
  // shows up here and names THAT member, reading the principal off
  // `data-assignee`. Nothing local rendered an owner at all until this fixture
  // carried one, so that attribute was verified only by a twenty-minute run —
  // which is how four smoke selectors cost three CI cycles.
  await mountShell();
  const plane = await openDestination("tasks");
  const owners = [...plane.querySelectorAll<HTMLElement>("[data-assignee]")];
  assert.ok(
    owners.length > 0,
    "no row exposed data-assignee, so the packaged smoke's assignee check has nothing to read",
  );
  const expected = populatedTaskList.items.find(
    (item) => item.assignment?.assigneePrincipalId !== undefined,
  );
  assert.ok(expected, "the populated fixture carries no assignment to render");
  assert.ok(
    owners.some(
      (node) =>
        node.dataset.assignee === expected.assignment?.assigneePrincipalId,
    ),
    `the rendered owner is not the assigned principal: ${owners
      .map((node) => node.dataset.assignee)
      .join(", ")}`,
  );
});
