import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import { QueryProjectionSchema } from "@constellation/contracts";

import { captureRecoveryActions } from "../src/CollaborationSurfaces.js";
import type { AttentionInboxProjection } from "../src/client/workflow.js";
import { recordKindLabels } from "../src/i18n.js";
import { InboxSurface } from "../src/InboxSurface.js";
import {
  ATTENTION_INBOX_LIMIT,
  inboxWaitingCount,
  type InboxSignal,
} from "../src/inbox-triage.js";

// Ekran montowany SAM, na ręcznie zbudowanym kawałku migawki: powłokę wpina
// później dyspozytor, a ta warstwa ma mierzyć skrzynkę, nie trasowanie.

let container: HTMLDivElement;
let root: Root;
let mounted = false;

const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-0000000009${suffix}`;

const projection = QueryProjectionSchema.parse({
  kind: "attention.inbox",
  // Liczba „jednego rodzaju", którą plakietka pokazywała do tej pory.
  unreadCount: 3,
  items: [
    {
      id: uuid("01"),
      reason: "comment_mention",
      destination: { kind: "task", taskId: uuid("51") },
      title: "Wzmianka w wątku o migracji",
      detail: "Kacper, potwierdzasz zakres na czwartek?",
      urgency: "in_app",
      state: "unread",
      version: 4,
      occurredAt: "2026-07-20T09:00:00.000Z",
    },
    {
      id: uuid("02"),
      reason: "task_assignment",
      destination: { kind: "task", taskId: uuid("52") },
      title: "Przygotuj scenariusze detekcyjne",
      detail: "Zadanie zostało na Ciebie przypisane.",
      urgency: "in_app",
      state: "read",
      version: 2,
      occurredAt: "2026-07-21T09:00:00.000Z",
    },
    {
      id: uuid("03"),
      reason: "renewal_due",
      destination: { kind: "project", projectId: uuid("53") },
      title: "Odnowienie licencji Northstar",
      detail: "Okres wyprzedzenia właśnie się zaczął.",
      urgency: "urgent",
      state: "unread",
      version: 7,
      occurredAt: "2026-07-19T09:00:00.000Z",
    },
    {
      id: uuid("04"),
      reason: "capture_ambiguous",
      destination: { kind: "capture", captureId: uuid("54") },
      title: "https://example.test/raport-eps",
      detail: "Nie wiadomo, czy to zadanie, czy źródło.",
      urgency: "in_app",
      state: "unread",
      version: 1,
      occurredAt: "2026-07-22T09:00:00.000Z",
    },
    {
      id: uuid("05"),
      reason: "capture_missing_payload",
      destination: { kind: "capture", captureId: uuid("55") },
      title: "Oferta_Northstar_v3.pdf",
      detail: "Oryginał nie dotarł w całości.",
      urgency: "in_app",
      state: "read",
      version: 3,
      occurredAt: "2026-07-18T09:00:00.000Z",
    },
    {
      // Powód mówi „awaria wrzucania", ale cel jest ZADANIEM: wrzut zdążył się
      // rozwiązać do rekordu, zanim reszta poszła nie tak. Kontrakt na to
      // pozwala, a każda komenda odzyskiwania działa wyłącznie na wrzucie —
      // więc przyciski odzyskiwania byłyby tu przyciskami bez uchwytu.
      id: uuid("06"),
      reason: "capture_missing_target",
      destination: { kind: "task", taskId: uuid("56") },
      title: "Notatka z rozmowy o EPS",
      detail: "Wrzut wskazał zadanie, którego już nie ma.",
      urgency: "in_app",
      state: "read",
      version: 5,
      occurredAt: "2026-07-17T09:00:00.000Z",
    },
  ],
}) as AttentionInboxProjection;

type Call = { readonly what: string; readonly item: InboxSignal };
let calls: Call[] = [];
let retried = 0;

const record =
  (what: string) =>
  (item: InboxSignal): void => {
    calls.push({ what, item });
  };

const mount = async (
  attention: Parameters<typeof InboxSurface>[0]["attention"] = {
    kind: "ready",
    data: projection,
  },
): Promise<HTMLElement> => {
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      createElement(InboxSurface, {
        attention,
        selectedItemId: undefined,
        busy: false,
        timezone: "Europe/Warsaw",
        onSelect: record("select"),
        onOpen: record("open"),
        onMarkRead: record("read"),
        onDismiss: record("dismiss"),
        onRouteCapture: (item, destination) => {
          calls.push({ what: `route:${destination}`, item });
        },
        onRetryCapture: record("retry"),
        onReplaceCapturePayload: record("replace_payload"),
        onKeepCapture: record("keep_unclassified"),
        onRetryLoad: () => {
          retried += 1;
        },
      }),
    );
  });
  const plane = container.firstElementChild;
  assert.ok(plane instanceof HTMLElement, "the Inbox did not render at all");
  return plane;
};

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  calls = [];
  retried = 0;
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

const rows = (scope: Element, mailbox?: string): readonly HTMLElement[] => [
  ...scope.querySelectorAll<HTMLElement>(
    mailbox === undefined
      ? "[data-inbox-row]"
      : `[data-inbox-row][data-inbox-mailbox="${mailbox}"]`,
  ),
];

const titleOf = (row: Element): string =>
  (row.querySelector("[data-row-title]")?.textContent ?? "").trim();

test("B13: the Inbox is two mailboxes, each with its own count", async () => {
  const plane = await mount();
  const sections = [
    ...plane.querySelectorAll<HTMLElement>("[data-inbox-section]"),
  ];
  assert.deepEqual(
    sections.map((section) => section.dataset.inboxSection),
    ["work", "capture"],
    "the screen must keep thinking and plumbing apart, in that order",
  );
  assert.deepEqual(
    sections.map(
      (section) =>
        section.querySelector<HTMLElement>("[data-inbox-count]")?.textContent,
    ),
    ["3", "3"],
  );
  // Awaria wrzucania nie ma prawa stanąć w skrzynce do myślenia i odwrotnie.
  for (const row of rows(plane, "work"))
    assert.equal(
      row.dataset.inboxReason?.startsWith("capture_"),
      false,
      `${row.dataset.inboxReason} is plumbing and must not sit among decisions`,
    );
  for (const row of rows(plane, "capture"))
    assert.equal(row.dataset.inboxReason?.startsWith("capture_"), true);
});

test("B12: a mention reaches the Inbox and leads to the record it hangs on", async () => {
  const plane = await mount();
  const mention = rows(plane, "work").find(
    (row) => row.dataset.inboxReason === "comment_mention",
  );
  assert.ok(mention, "the mention never reached the screen");
  assert.equal(titleOf(mention), "Wzmianka w wątku o migracji");
  // Kontrakt nie ma celu „komentarz", więc wzmianka ląduje na zadaniu.
  assert.equal(mention.dataset.inboxDestination, "task");

  const open = mention.querySelector<HTMLElement>('[data-inbox-action="open"]');
  assert.ok(open, "a signal that opens nothing is a list of regrets");
  assert.equal(open.textContent?.trim(), "Open task");
  await act(async () => {
    open.click();
  });
  assert.deepEqual(
    calls.map((call) => call.what),
    ["open"],
  );
  // Cała pozycja, nie sam identyfikator: obie komendy żądają DOKŁADNEJ wersji.
  assert.equal(calls[0]?.item.version, 4);
});

test("B11: the screen shows exactly the signals it was given, and nothing else", async () => {
  // Zwykły komentarz nie ma powodu w zamkniętej liście, więc nie da się go
  // podać na wejściu. Mierzalne jest to, że ekran nie DOKŁADA nic od siebie
  // i nic nie gubi — czyli że lista na ekranie jest listą z projekcji.
  const plane = await mount();
  assert.deepEqual(
    rows(plane).map(titleOf).toSorted(),
    projection.items.map((item) => item.title).toSorted(),
  );
});

test("B29: the waiting count agrees with what is on screen", async () => {
  const plane = await mount();
  const badge = plane.querySelector<HTMLElement>("[data-inbox-waiting]");
  assert.ok(badge, "the screen does not say how much is waiting");
  const stated = Number(badge.dataset.inboxWaiting);
  assert.equal(
    stated,
    rows(plane).length,
    "the number and the rows disagree, which is the defect decision #22 came from",
  );
  assert.equal(stated, inboxWaitingCount(projection.items));
  // WPIS 3-3 OGONA FAZY III — WIDOCZNY NAPIS JEST MAPĄ EKRANU, A ZACZEP DLA
  // MASZYNY ZOSTAJE SUMĄ, i te dwie rzeczy nie są odtąd tym samym zdaniem.
  // Do tej poprawki pasmo mówiło `6 things waiting` i ta asercja szukała
  // w napisie liczby z `data-inbox-waiting`. Prototyp mówi tu DWIE liczby, po
  // jednej na sekcję (`v3/screens/inbox.js:287-288` — `4 to decide · 3 to
  // route`), a ich SUMA w ogóle nie musi się w napisie pojawić: 2 + 1 = 3
  // rysowałoby się jako „2 to decide · 1 to route" i stara asercja byłaby
  // zielona tylko przez zbieg okoliczności tej fikstury.
  //
  // OBIE LICZBY WYPROWADZONE Z LIST, KTÓRE EKRAN NARYSOWAŁ — nie z fikstury
  // i nie wpisane: pasmo, które zacznie mówić o innym zbiorze niż sekcje pod
  // nim, jest dokładnie tą wadą, z której wzięła się DECYZJA #22.
  const sectionRows = (section: string): number =>
    plane.querySelectorAll(`[data-inbox-section="${section}"] [data-inbox-row]`)
      .length;
  const said = badge.textContent ?? "";
  const shape = /(\d+) to decide · (\d+) to route/u.exec(said);
  assert.ok(
    shape,
    `the band said “${said}” where the reference says “N to decide · N to route” — one number ` +
      "summed over two mailboxes tells the reader how much is waiting and never which of the two " +
      "screens below is waiting on them",
  );
  assert.equal(
    Number(shape[1]),
    sectionRows("work"),
    `the band counted ${shape[1]} to decide against the rows in the work section`,
  );
  assert.equal(
    Number(shape[2]),
    sectionRows("capture"),
    `the band counted ${shape[2]} to route against the rows in the capture section`,
  );
  assert.equal(
    Number(shape[1]) + Number(shape[2]),
    stated,
    "the two visible numbers do not add up to the machine-readable total beside them",
  );
  // …i musi to być więcej niż liczba o jednym rodzaju rzeczy.
  assert.ok(
    stated > projection.unreadCount,
    `waiting=${stated} unread=${projection.unreadCount}`,
  );
  // Skrzynka mieści się w limicie zapytania, więc liczba jest DOKŁADNA i nie
  // wolno jej się asekurować.
  assert.equal(badge.dataset.inboxWaitingFloor, "false");
  assert.equal(
    /at least/iu.test(badge.textContent ?? ""),
    false,
    "a complete inbox must state its size, not hedge about it",
  );
});

test("a saturated inbox says the number is a floor, not the whole of it", async () => {
  // `attention.inbox` tnie się na limicie, więc pełna projekcja bywa projekcją
  // OBCIĘTĄ — a wtedy „50 rzeczy czeka" jest zdaniem o całości, którego
  // zapytanie nie ma czym pokryć.
  const template = projection.items[0];
  assert.ok(template, "the fixture lost its first signal");
  const saturated = QueryProjectionSchema.parse({
    kind: "attention.inbox",
    unreadCount: ATTENTION_INBOX_LIMIT,
    items: Array.from({ length: ATTENTION_INBOX_LIMIT }, (_unused, index) => ({
      ...template,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      title: `Sygnał ${index}`,
    })),
  }) as AttentionInboxProjection;
  assert.equal(saturated.items.length, ATTENTION_INBOX_LIMIT);

  const plane = await mount({ kind: "ready", data: saturated });
  const badge = plane.querySelector<HTMLElement>("[data-inbox-waiting]");
  assert.ok(badge, "the screen does not say how much is waiting");
  assert.equal(badge.dataset.inboxWaitingFloor, "true");
  assert.match(
    badge.textContent ?? "",
    /at least/iu,
    `a cut-off inbox stated its size as complete: “${badge.textContent}”`,
  );
  assert.match(
    badge.textContent ?? "",
    new RegExp(`\\b${ATTENTION_INBOX_LIMIT}\\b`),
  );
});

test("the name of a destination comes from the record-kind registry", async () => {
  // Kontrakt rejestru mówi, że KAŻDY ekran bierze nazwy rodzajów stamtąd.
  // Napis wpisany w ekranie przeżywa przemianowanie w rejestrze i po cichu
  // rozjeżdża się z resztą aplikacji.
  const plane = await mount();
  const labelFor = (destination: string): string => {
    const row = rows(plane).find(
      (candidate) => candidate.dataset.inboxDestination === destination,
    );
    assert.ok(row, `no row leading to a ${destination}`);
    const open = row.querySelector<HTMLElement>('[data-inbox-action="open"]');
    assert.ok(open, `the ${destination} row opens nothing`);
    return (open.textContent ?? "").trim();
  };
  assert.equal(
    labelFor("task"),
    `Open ${recordKindLabels.task?.toLowerCase()}`,
  );
  assert.equal(labelFor("task"), "Open task");
  assert.equal(
    labelFor("project"),
    `Open ${recordKindLabels.project?.toLowerCase()}`,
  );
  assert.equal(
    labelFor("capture"),
    `Open ${recordKindLabels.capture?.toLowerCase()} history`,
  );
  assert.equal(labelFor("capture"), "Open capture history");
});

const RECOVERY_ACTIONS = [
  "route",
  "retry",
  "replace_payload",
  "keep_unclassified",
] as const;

const offeredActions = (row: Element): ReadonlySet<string | undefined> =>
  new Set(
    [...row.querySelectorAll<HTMLElement>("[data-inbox-action]")].map(
      (button) => button.dataset.inboxAction,
    ),
  );

test("a capture row offers exactly the recovery actions that exist for it", async () => {
  const plane = await mount();
  // Pętla po pustej liście spełnia i asercję pozytywną, i negatywną naraz —
  // czyli przechodzi także wtedy, gdy skrzynka wrzutów jest pusta.
  const captures = rows(plane, "capture").filter(
    (row) => row.dataset.inboxDestination === "capture",
  );
  assert.equal(
    captures.length,
    2,
    `nothing to measure: the capture mailbox held ${captures.length} capture-destined rows`,
  );
  for (const row of captures) {
    const reason = row.dataset.inboxReason as InboxSignal["reason"];
    const offered = offeredActions(row);
    const expected = captureRecoveryActions(reason);
    assert.ok(
      expected.length > 0,
      `${reason} is in the capture mailbox but has no recovery action at all`,
    );
    for (const action of expected)
      assert.ok(
        offered.has(action),
        `${reason} must offer ${action}, offered ${[...offered].join(", ")}`,
      );
    // I nic ponad to: akcja odzyskiwania, której powód nie przewiduje, jest
    // obietnicą bez pokrycia.
    for (const action of RECOVERY_ACTIONS)
      if (!expected.includes(action))
        assert.equal(
          offered.has(action),
          false,
          `${reason} offers ${action}, which does not exist for it`,
        );
  }
});

test("no recovery is offered where its command could not act", async () => {
  // Akcje odzyskiwania wychodzą z POWODU, ale każdy uchwyt w powłoce pyta
  // o CEL i cicho odmawia, gdy cel nie jest wrzutem. Przycisk, którego uchwyt
  // nie ma jak zadziałać, jest przyciskiem udającym, że coś robi.
  const plane = await mount();
  const misrouted = rows(plane).find(
    (row) => row.dataset.inboxReason === "capture_missing_target",
  );
  assert.ok(misrouted, "the fixture lost the capture that points at a task");
  assert.equal(
    misrouted.dataset.inboxDestination,
    "task",
    "this case only means something when the reason and the destination disagree",
  );
  assert.ok(
    captureRecoveryActions("capture_missing_target").length > 0,
    "the reason alone must still promise actions, or the guard proves nothing",
  );

  const offered = offeredActions(misrouted);
  for (const action of RECOVERY_ACTIONS)
    assert.equal(
      offered.has(action),
      false,
      `a task-destined signal offers ${action}, whose command refuses anything but a capture`,
    );
  // …a triage, który celu nie dotyczy, zostaje: wiersz nie staje się martwy.
  assert.ok(
    offered.has("dismiss"),
    "the row lost its ordinary triage along with the recovery it never had",
  );
  assert.ok(offered.has("open"));
});

test("routing a capture names the destination and carries the whole signal", async () => {
  const plane = await mount();
  const ambiguous = rows(plane, "capture").find(
    (row) => row.dataset.inboxReason === "capture_ambiguous",
  );
  assert.ok(ambiguous);
  const asSource = ambiguous.querySelector<HTMLElement>(
    '[data-inbox-route="knowledge_source"]',
  );
  assert.ok(asSource, "an unclear capture must offer the source route");
  await act(async () => {
    asSource.click();
  });
  assert.deepEqual(
    calls.map((call) => call.what),
    ["route:knowledge_source"],
  );
  assert.equal(calls[0]?.item.destination.kind, "capture");
});

test("triage stays minimal, and never promises an undo the kernel cannot honour", async () => {
  const plane = await mount();
  const unread = rows(plane, "work").find(
    (row) => row.dataset.inboxState === "unread",
  );
  assert.ok(unread);
  const read = unread.querySelector<HTMLElement>('[data-inbox-action="read"]');
  const dismiss = unread.querySelector<HTMLElement>(
    '[data-inbox-action="dismiss"]',
  );
  assert.ok(read, "an unread signal must be markable as read");
  assert.ok(dismiss);
  await act(async () => {
    dismiss.click();
  });
  assert.equal(calls[0]?.what, "dismiss");
  assert.equal(calls[0]?.item.version, 7);

  // Przeczytany sygnał nie dostaje „oznacz jako przeczytane" drugi raz.
  const alreadyRead = rows(plane, "work").find(
    (row) => row.dataset.inboxState === "read",
  );
  assert.ok(alreadyRead);
  assert.equal(alreadyRead.querySelector('[data-inbox-action="read"]'), null);

  // Odrzucenie ma `revertability: "never"`. Żadna kontrolka nie ma prawa
  // sugerować powrotu, a ostrzeżenie stoi RAZ.
  const controls = [...plane.querySelectorAll("button")].map(
    (button) => `${button.textContent ?? ""} ${button.ariaLabel ?? ""}`,
  );
  assert.equal(
    controls.some((label) => /undo|restore|bring .* back/i.test(label)),
    false,
    `the screen offers a way back that the kernel does not have: ${controls.join(" | ")}`,
  );
  assert.equal(
    plane.querySelectorAll("[data-inbox-irreversible]").length,
    1,
    "the warning about permanence must be said once, not per row",
  );
});

test("an unavailable inbox says so and offers a retry — it is not an empty one", async () => {
  const plane = await mount({
    kind: "unavailable",
    message: "attention.inbox query failed",
  });
  const failed = plane.querySelector<HTMLElement>(
    '[data-surface-state="failed"]',
  );
  assert.ok(
    failed,
    "an unavailable projection rendered as an empty inbox, which reads as 'nothing waits for you'",
  );
  const retry = failed.querySelector<HTMLElement>(
    '[data-surface-action="retry"]',
  );
  assert.ok(retry, "a failed surface must offer a way to try again");
  await act(async () => {
    retry.click();
  });
  assert.equal(retried, 1);
  assert.equal(rows(plane).length, 0);
  assert.equal(plane.querySelector("[data-inbox-waiting]"), null);
});

test("the surface keeps one focusable heading and does not skip a level", async () => {
  const plane = await mount();
  const headings = [...plane.querySelectorAll("h1, h2, h3")].map(
    (node) => node.tagName,
  );
  assert.deepEqual(headings, ["H1", "H2", "H2"]);
  // `querySelector` oddaje pierwszy pasujący węzeł, więc na duplikacie
  // przechodzi tak samo jak na jedynaku — a `#surface-title` jest celem
  // przeskoku powłoki i musi być JEDEN.
  const titles = [...plane.querySelectorAll<HTMLElement>("#surface-title")];
  assert.equal(
    titles.length,
    1,
    `the shell jumps focus to #surface-title, and found ${titles.length} of them`,
  );
  const title = titles[0];
  assert.ok(title);
  assert.equal(title.tabIndex, -1);

  // Każda lista jest NAZWANA i nazwa naprawdę istnieje. Wiszące `aria-*`
  // kosztowało już powłokę pełny timeout paczkowanego smoke'u.
  const lists = [...plane.querySelectorAll<HTMLElement>("ul[aria-labelledby]")];
  assert.equal(lists.length, 2);
  for (const list of lists) {
    assert.equal(
      list.getAttribute("role"),
      "list",
      "a bare <ul> cannot take an accessible name, so the label would be inert",
    );
    const labelId = list.getAttribute("aria-labelledby") ?? "";
    assert.ok(
      plane.querySelector(`#${labelId}`),
      `aria-labelledby points at ${labelId}, which is not on the screen`,
    );
  }
});
