/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  activityCategoryFor,
  activityLabels,
  filterActivityItems,
  groupActivityItems,
  type ActivityItem,
} from "../src/activity-collection.js";

const item = (
  activityType: ActivityItem["activityType"],
  occurredAt: string,
  recordId = "11111111-1111-4111-8111-111111111111",
): ActivityItem =>
  ({
    eventId: crypto.randomUUID(),
    targetCommandId: crypto.randomUUID(),
    activityType,
    recordId,
    occurredAt,
  }) as ActivityItem;

const shiftDays = (iso: string, days: number): string =>
  new Date(Date.parse(iso) + days * 86_400_000).toISOString();

const dayAfter = (key: string): string =>
  new Date(Date.parse(`${key}T00:00:00.000Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);

/* Sondę tekstową wyprowadzamy z funkcji, która produkuje etykietę, i wybieramy
   ją czystym kryterium na łańcuchach: kandydat musi występować w etykiecie
   szukanego zdarzenia, a NIE może występować ani w jego własnym enumie i uuid,
   ani w materiale pozostałych pozycji. Dopiero wtedy trafienie dowodzi, że
   filtr sięga po ludzką etykietę, a nie po enum czy identyfikator. Najpierw
   próbujemy pojedynczego słowa — bo filtr pełnotekstowy ma trafiać we FRAGMENT
   — a dopiero gdy każde słowo siedzi w snake_case enuma, bierzemy całą
   etykietę (wielowyrazowa nigdy się w enumie nie zmieści). Dzięki temu wybór
   sondy nie zależy od języka etykiet. */
const labelProbeFor = (
  target: ActivityItem,
  others: readonly ActivityItem[],
): string => {
  const lower = (value: string) => value.toLocaleLowerCase("pl-PL");
  const foreign = lower(
    others
      .map((other) => `${activityLabels[other.activityType]} ${other.recordId}`)
      .join(" "),
  );
  const own = lower(`${target.activityType} ${target.recordId}`);
  const label = lower(activityLabels[target.activityType]).trim();
  const probe = [
    ...label.split(/[^\p{L}]+/u).filter((word) => word.length >= 4),
    label,
  ].find(
    (candidate) =>
      candidate.length >= 4 &&
      !foreign.includes(candidate) &&
      !own.includes(candidate),
  );
  assert.ok(
    probe !== undefined,
    `Etykieta ${target.activityType} nie ma fragmentu, który odróżnia ją od enuma, uuid i pozostałych pozycji.`,
  );
  return probe;
};

describe("activity collection", () => {
  const items = [
    item("task_completed", "2026-07-18T08:00:00.000Z"),
    item(
      "knowledge_source_updated",
      "2026-07-18T07:00:00.000Z",
      "22222222-2222-4222-8222-222222222222",
    ),
    item("command_undone", "2026-07-17T18:00:00.000Z"),
  ];

  it("maps every meaningful change to a truthful user-facing category", () => {
    assert.equal(activityCategoryFor(items[0]!), "work");
    assert.equal(activityCategoryFor(items[1]!), "knowledge");
    assert.equal(activityCategoryFor(items[2]!), "recovery");
  });

  it("filters by category, human label, and stable record prefix", () => {
    assert.deepEqual(filterActivityItems(items, "knowledge", ""), [items[1]]);

    const probe = labelProbeFor(items[0]!, [items[1]!, items[2]!]);
    assert.deepEqual(filterActivityItems(items, "all", probe), [items[0]]);

    assert.deepEqual(filterActivityItems(items, "all", "22222222"), [items[1]]);
    assert.deepEqual(filterActivityItems(items, "work", "22222222"), []);
  });

  it("groups in source order and labels the two most recent days relatively", () => {
    const older = item("task_created", "2026-07-10T09:00:00.000Z");
    const run = (offsetDays: number) =>
      groupActivityItems(
        [
          ...items.map((entry) =>
            item(
              entry.activityType,
              shiftDays(entry.occurredAt, offsetDays),
              entry.recordId,
            ),
          ),
          item(
            older.activityType,
            shiftDays(older.occurredAt, offsetDays),
            older.recordId,
          ),
        ],
        "Europe/Warsaw",
        new Date(shiftDays("2026-07-18T12:00:00.000Z", offsetDays)),
      );

    const now = run(0);
    const later = run(30);

    assert.equal(now.length, 3);
    // Kolejność źródłowa i przydział do dnia — po enumach, nie po tekście.
    assert.deepEqual(
      now.map((group) => group.items.map((entry) => entry.activityType)),
      [
        ["task_completed", "knowledge_source_updated"],
        ["command_undone"],
        ["task_created"],
      ],
    );

    // Dwie najświeższe grupy są opisane względem „teraz": ta sama etykieta
    // musi wyjść dla zupełnie innej daty kalendarzowej.
    assert.equal(now[0]?.label, later[0]?.label);
    assert.equal(now[1]?.label, later[1]?.label);
    assert.notEqual(now[0]?.label, now[1]?.label);

    // Starsza grupa jest opisana datą, więc razem z datą MUSI się zmienić.
    assert.notEqual(now[2]?.label, later[2]?.label);
    assert.notEqual(now[2]?.label, now[0]?.label);
    assert.notEqual(now[2]?.label, now[1]?.label);
    for (const group of now) {
      assert.ok(group.label.trim().length > 0);
    }

    // Przesunięcie o 30 dni musi przesunąć klucze grup.
    assert.notEqual(now[0]?.key, later[0]?.key);
    assert.notEqual(now[1]?.key, later[1]?.key);
  });

  it("groups by the calendar day of the workspace timezone", () => {
    // 22:30 UTC to już następny dzień w Warszawie, ale nie w UTC.
    const late = [item("task_completed", "2026-07-18T22:30:00.000Z")];
    const now = new Date("2026-07-19T12:00:00.000Z");
    const warsaw = groupActivityItems(late, "Europe/Warsaw", now);
    const utc = groupActivityItems(late, "UTC", now);

    assert.equal(warsaw.length, 1);
    assert.equal(utc.length, 1);
    assert.match(utc[0]!.key, /^\d{4}-\d{2}-\d{2}$/);
    assert.notEqual(
      warsaw[0]?.key,
      utc[0]?.key,
      "Strefa workspace nie wpływa na przydział do dnia.",
    );
    assert.equal(warsaw[0]?.key, dayAfter(utc[0]!.key));
  });
});
