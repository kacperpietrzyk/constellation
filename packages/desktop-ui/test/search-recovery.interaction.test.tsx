import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import { assertDifferentNode, assertSameNode } from "./dom-assert.js";
import { shellQueries } from "./shell-fixture.js";

// Gwarancja: wyszukiwanie, które padło, MÓWI o tym jako alert i daje dwa
// wyjścia, a zamknięcie nakładki oddaje ognisko dokładnie temu, kto ją otworzył.
//
// Do tej pory pilnowały tego dwie sekcje `interaction-recovery-contract`
// regexujące `Wave2Surfaces.tsx` — na `setSearchAttempt`, na
// `useRef<HTMLElement | null>` i na literalny kształt tablicy zależności
// efektu. Żadna z nich nigdy niczego nie wyrenderowała, więc przestawienie
// JSX-a albo przemianowanie stanu wywracało je przy NIEZMIENIONYM zachowaniu,
// a zmiana zachowania przy zachowanych nazwach przechodziła. Wycinek nakładki
// był brany między dwoma literałami eksportu, więc przemianowanie sąsiada
// opróżniało go po cichu.
//
// I przechodziła: obie sekcje świeciły na zielono nad oddawaniem ogniska,
// które NIE DZIAŁAŁO — `autoFocus` na polu wyprzedzał odczyt „kto otworzył",
// więc nakładka zapamiętywała samą siebie i przy zamknięciu ognisko spadało
// na `<body>`. Ten plik klika i to złapał.

let container: HTMLDivElement;
let root: Root;
let mounted = false;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
});

const unmount = (): void => {
  if (!mounted) return;
  mounted = false;
  act(() => {
    root.unmount();
  });
};

afterEach(() => {
  // Przypadki o oddawaniu ogniska odmontowują same, żeby sprawdzić, dokąd ono
  // wraca. Drugie `unmount()` na tym samym korzeniu wywala workera Vitesta,
  // więc odmontowanie jest tu jednorazowe z założenia, a nie przez ostrożność.
  unmount();
  container.remove();
});

const settle = async (): Promise<void> => {
  // Zapytanie jest odbijane (`setTimeout`), więc bez przeczekania odbicia
  // asercja o stanie błędu sprawdzałaby stan ładowania.
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 260);
    });
  });
};

const mountOverlay = async (options?: {
  readonly onClose?: () => void;
}): Promise<{ readonly searchCalls: () => number }> => {
  const { SearchOverlay } = await import("../src/Wave2Surfaces.js");
  const { createScenarioClient } =
    await import("../src/client/scenario-client.js");
  const { loadDesktopSnapshot } = await import("../src/client/workflow.js");
  const client = createScenarioClient({ queries: shellQueries });
  const snapshot = await loadDesktopSnapshot(client);
  // `search.global` nie ma zaślepki, więc scenariuszowy klient odmawia — czyli
  // dokładnie ten przypadek, o który tu chodzi.
  let searchCalls = 0;
  const counting = {
    ...client,
    runQuery: async (query: Parameters<typeof client.runQuery>[0]) => {
      if (query.queryName === "search.global") searchCalls += 1;
      return client.runQuery(query);
    },
  };

  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(SearchOverlay, {
        client: counting,
        snapshot,
        destinations: [],
        onClose: options?.onClose ?? (() => undefined),
        onOpenDestination: () => undefined,
        onNavigate: () => undefined,
      }),
    );
  });
  return { searchCalls: () => searchCalls };
};

const typeQuery = async (text: string): Promise<HTMLInputElement> => {
  const input = container.querySelector("input");
  assert.ok(
    input instanceof HTMLInputElement,
    "the overlay has no query field",
  );
  // React trzyma własny ślad ostatniej wartości pola. Przypisanie `input.value`
  // aktualizuje TAKŻE ten ślad, więc następujące po nim zdarzenie wygląda dla
  // Reacta na brak zmiany i `onChange` nie idzie — pisanie „nie dochodzi", a
  // asercje przechodzą pusto. Setter z prototypu omija ślad, czyli robi to, co
  // robi klawiatura.
  const nativeValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  assert.ok(nativeValue, "no native value setter on the input prototype");
  await act(async () => {
    nativeValue.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
};

const alertOf = (): Element => {
  const alert = container.querySelector('[role="alert"]');
  assert.ok(alert !== null, "a failed search did not announce itself as alert");
  return alert;
};

/** Kontrolka poza nakładką, udająca to, co wyszukiwanie otworzyło. */
const openerButton = (): HTMLButtonElement => {
  const opener = document.createElement("button");
  opener.textContent = "Search";
  document.body.append(opener);
  opener.focus();
  return opener;
};

test("a failed search says so as an alert and offers two ways forward", async () => {
  await mountOverlay();
  await typeQuery("cokolwiek");
  await settle();

  const actions = alertOf().querySelectorAll("button");
  assert.equal(
    actions.length,
    2,
    `the alert offers ${actions.length} ways forward instead of two`,
  );
  for (const action of actions) {
    assert.ok(
      (action.textContent ?? "").trim().length > 0,
      "a way out of the failure with no name is a way out nobody can see",
    );
  }
});

test("retrying runs the query again and puts the caret back in the field", async () => {
  const { searchCalls } = await mountOverlay();
  const input = await typeQuery("cokolwiek");
  await settle();
  const before = searchCalls();
  assert.ok(before > 0, "the first search never went out at all");

  const retry = alertOf().querySelector("button");
  assert.ok(
    retry instanceof HTMLButtonElement,
    "the alert has nothing to retry with",
  );
  await act(async () => {
    retry.click();
  });
  assertSameNode(
    document.activeElement,
    input,
    "retrying did not put the caret back in the field",
  );
  await settle();
  assert.ok(
    searchCalls() > before,
    // To jest cała treść słowa „ponów": zapytanie MUSI pójść jeszcze raz przy
    // tym samym tekście. Wcześniej pilnował tego regex na tablicy zależności.
    `retrying sent no new query (${before} → ${searchCalls()})`,
  );
});

test("clearing empties the field and puts the caret back in it", async () => {
  await mountOverlay();
  const input = await typeQuery("cokolwiek");
  await settle();

  const clear = [...alertOf().querySelectorAll("button")][1];
  assert.ok(
    clear instanceof HTMLButtonElement,
    "the alert has nothing to clear with",
  );
  await act(async () => {
    clear.click();
  });
  assert.equal(input.value, "", "clearing did not empty the field");
  assertSameNode(
    document.activeElement,
    input,
    "clearing did not put the caret back in the field",
  );
});

test("a failed search never shows the raw failure text", async () => {
  // Komunikat błędu renderera potrafi nieść ścieżkę na dysku albo nazwę
  // dostawcy. Nakładka ma powiedzieć, że się nie udało — nie co dokładnie.
  await mountOverlay();
  await typeQuery("cokolwiek");
  await settle();
  // Bez tego zdania asercja niżej przechodzi także wtedy, gdy błędu w ogóle
  // nie widać — pusty wynik pomiaru to awaria pomiaru.
  alertOf();
  const shown = container.textContent ?? "";
  // Wzorce są dwojakie: nazwa kodu odmowy z kontraktu i KSZTAŁT przeciekniętej
  // diagnostyki — ścieżka POSIX-owa, ścieżka windowsowa, kod errno, prefiks
  // `Error:`. Lista konkretnych komunikatów zestarzałaby się przy pierwszym
  // nowym dostawcy; kształt nie.
  assert.doesNotMatch(
    shown,
    /query\.[a-z_]+|Error:|\/(?:Users|home|var)\/|[A-Z]:\\|E[A-Z]{4,}/u,
    "the overlay showed the raw failure instead of saying it failed",
  );
});

test("closing the overlay gives focus back to whoever opened it", async () => {
  const opener = openerButton();
  assertSameNode(document.activeElement, opener, "the opener never had focus");

  await mountOverlay();
  assertDifferentNode(
    document.activeElement,
    opener,
    "the overlay never took focus, so giving it back proves nothing",
  );
  unmount();
  assertSameNode(
    document.activeElement,
    opener,
    "focus did not return to the control that opened search",
  );
  opener.remove();
});

// Dwa przypadki niżej mierzą WYWOŁANIE `focus()`, nie `document.activeElement`.
// Sprawdzone przez zepsucie: po zdjęciu obu strażników z komponentu asercja na
// `activeElement` przechodziła dalej, bo happy-dom i tak nie ogniskuje węzła
// odpiętego ani wyłączonego. Mierzyłaby więc uprzejmość biblioteki, nie regułę
// aplikacji — czyli byłaby ozdobą. Podsłuch na metodzie mierzy dokładnie to,
// co robi strażnik: czy nakładka W OGÓLE sięga po tę kontrolkę.
const watchFocus = (target: HTMLElement): { readonly calls: () => number } => {
  let calls = 0;
  const original = target.focus.bind(target);
  target.focus = (options?: FocusOptions) => {
    calls += 1;
    original(options);
  };
  return { calls: () => calls };
};

test("closing does not chase an opener that left the document", async () => {
  // Kontrolka, która otworzyła wyszukiwanie, może zniknąć, zanim nakładka się
  // zamknie — bo ekran pod spodem się przeładował.
  const opener = openerButton();
  const focused = watchFocus(opener);
  await mountOverlay();
  opener.remove();

  unmount();
  assert.equal(
    focused.calls(),
    0,
    "closing reached for a control that had left the document",
  );
});

test("closing does not hand focus to an opener that became disabled", async () => {
  // Ognisko na wyłączonej kontrolce to ślepy zaułek dla klawiatury: widać
  // obwódkę, a Tab i Enter nie robią nic.
  const opener = openerButton();
  const focused = watchFocus(opener);
  await mountOverlay();
  opener.disabled = true;

  unmount();
  assert.equal(
    focused.calls(),
    0,
    "closing handed focus to a control that can no longer be used",
  );
  opener.remove();
});

test("closing does reach for an opener that is still usable", async () => {
  // Dodatni odpowiednik obu zakazów wyżej: bez niego oba przechodziłyby także
  // na nakładce, która nie oddaje ogniska NIGDY i nikomu.
  const opener = openerButton();
  const focused = watchFocus(opener);
  await mountOverlay();

  unmount();
  assert.ok(
    focused.calls() > 0,
    "closing never reached for the control that opened search",
  );
  opener.remove();
});
