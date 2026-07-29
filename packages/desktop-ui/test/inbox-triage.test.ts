import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { QueryProjectionSchema } from "@constellation/contracts";

import type { AttentionInboxProjection } from "../src/client/workflow.js";
import {
  ATTENTION_INBOX_LIMIT,
  inboxCountIsFloor,
  inboxReasonLabels,
  inboxWaitingCount,
  isCaptureFailure,
  splitInbox,
  type InboxReason,
} from "../src/inbox-triage.js";

// Fixture przechodzi przez schemat kontraktu, a nie przez rzutowanie: pozycja
// o zmyślonym kształcie ma tu paść, zanim cokolwiek policzy.
const uuid = (suffix: string): string =>
  `00000000-0000-4000-8000-0000000009${suffix}`;

type ItemInput = {
  readonly id: string;
  readonly reason: InboxReason;
  /** Surowy kształt: schemat kontraktu i tak go sprawdzi, a marki
   *  identyfikatorów nie mają czego pilnować w danych testowych. */
  readonly destination: Readonly<Record<string, string>>;
  readonly title: string;
  readonly detail: string;
  readonly urgency?: "in_app" | "urgent";
  readonly state?: "unread" | "read" | "dismissed";
  readonly occurredAt: string;
};

const projection = (
  items: readonly ItemInput[],
  unreadCount?: number,
): AttentionInboxProjection =>
  QueryProjectionSchema.parse({
    kind: "attention.inbox",
    unreadCount:
      unreadCount ??
      items.filter((item) => (item.state ?? "unread") === "unread").length,
    items: items.map((item) => ({
      id: item.id,
      reason: item.reason,
      destination: item.destination,
      title: item.title,
      detail: item.detail,
      urgency: item.urgency ?? "in_app",
      state: item.state ?? "unread",
      version: 3,
      occurredAt: item.occurredAt,
    })),
  }) as AttentionInboxProjection;

const mention: ItemInput = {
  id: uuid("01"),
  reason: "comment_mention",
  destination: { kind: "task", taskId: uuid("51") },
  title: "Wzmianka w wątku o migracji",
  detail: "Kacper, potwierdzasz zakres na czwartek?",
  occurredAt: "2026-07-20T09:00:00.000Z",
};
const assignment: ItemInput = {
  id: uuid("02"),
  reason: "task_assignment",
  destination: { kind: "task", taskId: uuid("52") },
  title: "Przygotuj scenariusze detekcyjne",
  detail: "Zadanie zostało na Ciebie przypisane.",
  state: "read",
  occurredAt: "2026-07-21T09:00:00.000Z",
};
const renewal: ItemInput = {
  id: uuid("03"),
  reason: "renewal_due",
  destination: { kind: "project", projectId: uuid("53") },
  title: "Odnowienie licencji Northstar",
  detail: "Okres wyprzedzenia właśnie się zaczął.",
  urgency: "urgent",
  occurredAt: "2026-07-19T09:00:00.000Z",
};
const ambiguousCapture: ItemInput = {
  id: uuid("04"),
  reason: "capture_ambiguous",
  destination: { kind: "capture", captureId: uuid("54") },
  title: "https://example.test/raport-eps",
  detail: "Nie wiadomo, czy to zadanie, czy źródło.",
  occurredAt: "2026-07-22T09:00:00.000Z",
};
const missingPayloadCapture: ItemInput = {
  id: uuid("05"),
  reason: "capture_missing_payload",
  destination: { kind: "capture", captureId: uuid("55") },
  title: "Oferta_Northstar_v3.pdf",
  detail: "Oryginał nie dotarł w całości.",
  state: "read",
  occurredAt: "2026-07-18T09:00:00.000Z",
};

const everything = projection([
  mention,
  assignment,
  renewal,
  ambiguousCapture,
  missingPayloadCapture,
]);

describe("Inbox — two mailboxes, one count", () => {
  it("B11: the only comment that reaches the Inbox is a mention", () => {
    // Na tym kontrakcie nie da się ZBUDOWAĆ pozycji o zwykłym komentarzu —
    // powodu dla niej nie ma w zamkniętej liście. Sprawdzamy więc listę,
    // a nie render: mapa jest typowana po unii z kontraktu, więc nowy powód
    // („comment_created") nie przejdzie kompilacji bez wpisu, a wtedy ta
    // asercja go zobaczy.
    const commentReasons = Object.keys(inboxReasonLabels).filter((reason) =>
      reason.includes("comment"),
    );
    assert.deepEqual(
      commentReasons,
      ["comment_mention"],
      "a plain comment must have no way of becoming an inbox signal",
    );
  });

  it("B12: …and a mention is a decision about work, not plumbing", () => {
    const mailboxes = splitInbox(everything.items);
    assert.ok(
      mailboxes.work.some((item) => item.reason === "comment_mention"),
      "the mention is missing from the work mailbox",
    );
    assert.equal(
      mailboxes.captures.some((item) => item.reason === "comment_mention"),
      false,
    );
  });

  it("B13: work signals and capture failures land in separate mailboxes", () => {
    const mailboxes = splitInbox(everything.items);
    assert.deepEqual(mailboxes.work.map((item) => item.reason).toSorted(), [
      "comment_mention",
      "renewal_due",
      "task_assignment",
    ]);
    assert.deepEqual(mailboxes.captures.map((item) => item.reason).toSorted(), [
      "capture_ambiguous",
      "capture_missing_payload",
    ]);
  });

  it("puts every reason the contract can carry into exactly one mailbox", () => {
    // Podział po przedrostku ma tę własność, której druga lista powodów nie ma:
    // nowy powód nie może wypaść z obu kubełków i zniknąć z ekranu.
    const reasons = Object.keys(inboxReasonLabels) as InboxReason[];
    assert.equal(reasons.length, 18, "the reason taxonomy changed size");
    const captures = reasons.filter((reason) => isCaptureFailure(reason));
    assert.equal(captures.length, 10);
    assert.equal(reasons.length - captures.length, 8);
    for (const reason of reasons)
      assert.equal(
        typeof inboxReasonLabels[reason],
        "string",
        `${reason} has no label, so a raw contract identifier would reach the screen`,
      );
  });

  it("B29: the count is everything waiting, signals and captures alike", () => {
    const mailboxes = splitInbox(everything.items);
    assert.equal(
      inboxWaitingCount(everything.items),
      mailboxes.work.length + mailboxes.captures.length,
    );
    assert.equal(inboxWaitingCount(everything.items), 5);
    // To jest cała DECYZJA #22: liczba z boku mówiła o JEDNEJ części listy.
    assert.equal(everything.unreadCount, 3);
    assert.ok(
      inboxWaitingCount(everything.items) > everything.unreadCount,
      "the badge would again count one kind of thing instead of everything",
    );
  });

  it("marking read leaves the count alone; only leaving the list lowers it", () => {
    const beforeRead = inboxWaitingCount(everything.items);
    const read = everything.items.map((item) =>
      item.id === mention.id ? { ...item, state: "read" as const } : item,
    );
    assert.equal(
      inboxWaitingCount(read),
      beforeRead,
      "a read signal still lies in the inbox, so the count must not move",
    );
    const withoutMention = everything.items.filter(
      (item) => item.id !== mention.id,
    );
    assert.equal(inboxWaitingCount(withoutMention), beforeRead - 1);
  });

  it("never counts a dismissed signal, and never shows one", () => {
    const dismissed = everything.items.map((item) =>
      item.id === renewal.id ? { ...item, state: "dismissed" as const } : item,
    );
    const mailboxes = splitInbox(dismissed);
    assert.equal(inboxWaitingCount(dismissed), 4);
    assert.equal(
      mailboxes.work.some((item) => item.id === renewal.id),
      false,
    );
  });

  it("leads with the urgent one and orders the rest newest first", () => {
    const mailboxes = splitInbox(everything.items);
    assert.deepEqual(
      mailboxes.work.map((item) => item.title),
      [
        "Odnowienie licencji Northstar",
        "Przygotuj scenariusze detekcyjne",
        "Wzmianka w wątku o migracji",
      ],
    );
    assert.deepEqual(
      mailboxes.captures.map((item) => item.title),
      ["https://example.test/raport-eps", "Oferta_Northstar_v3.pdf"],
    );
  });

  it("orders two signals of the same second the same way every time", () => {
    // Bez tego klucza wiersz potrafi uciec spod kursora między renderami.
    const sameSecond = projection([
      { ...ambiguousCapture, id: uuid("06"), title: "Drugi" },
      { ...ambiguousCapture, id: uuid("07"), title: "Trzeci" },
    ]);
    const forward = splitInbox(sameSecond.items).captures.map(
      (item) => item.id,
    );
    const backward = splitInbox([...sameSecond.items].reverse()).captures.map(
      (item) => item.id,
    );
    // Na pustym kubełku „ten sam porządek" to `deepEqual([], [])`, czyli
    // asercja, która nie ma jak spaść. Najpierw musi być CO porządkować.
    assert.equal(
      forward.length,
      2,
      `both signals must reach the capture mailbox, got ${JSON.stringify(forward)}`,
    );
    assert.deepEqual(forward, backward);
    // …i jest to porządek po identyfikatorze, a nie kolejność wejścia.
    assert.deepEqual(forward, [uuid("06"), uuid("07")]);
  });

  it("says the count is a floor once the query has been cut to its limit", () => {
    // Skrzynka, która oddała dokładnie tyle, ile mogła, jest skrzynką obciętą:
    // „50 rzeczy czeka" jest wtedy zdaniem o całości bez pokrycia w zapytaniu.
    assert.equal(
      inboxCountIsFloor(everything.items),
      false,
      "five signals are the whole inbox, so the number is exact",
    );
    const saturated = projection(
      Array.from({ length: ATTENTION_INBOX_LIMIT }, (_unused, index) => ({
        ...ambiguousCapture,
        id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        title: `Wrzut ${index}`,
      })),
    );
    assert.equal(saturated.items.length, ATTENTION_INBOX_LIMIT);
    assert.equal(inboxCountIsFloor(saturated.items), true);
    // Liczone z SUROWEJ listy: odrzucone wypadają z kubełków, więc licznik
    // schodzi poniżej limitu, choć zapytanie i tak ucięło resztę.
    const withDismissed = projection(
      Array.from({ length: ATTENTION_INBOX_LIMIT }, (_unused, index) => ({
        ...ambiguousCapture,
        id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        title: `Wrzut ${index}`,
        state: index < 3 ? ("dismissed" as const) : ("unread" as const),
      })),
    );
    assert.equal(
      inboxWaitingCount(withDismissed.items),
      ATTENTION_INBOX_LIMIT - 3,
      "dismissed signals must not be waiting",
    );
    assert.equal(
      inboxCountIsFloor(withDismissed.items),
      true,
      "the query was still cut at its limit, so the number is still a floor",
    );
  });
});
