import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  savedViewTaskListParameters,
  type SavedViewFilters,
} from "../src/client/saved-view-query.js";

const principal = "10000000-0000-4000-8000-000000000003";
const project = "10000000-0000-4000-8000-000000000010";
const field = "10000000-0000-4000-8000-000000000020";
const status = "10000000-0000-4000-8000-000000000030";

// A Thursday, 09:00 in Warsaw (UTC+2 in July).
const now = new Date("2026-07-30T07:00:00.000Z");
const warsaw = { now, timeZone: "Europe/Warsaw" };

describe("saved view → task.list parameters", () => {
  it("carries every filter the query can express", () => {
    const filters = {
      operationalStates: ["waiting"],
      statusIds: [status],
      priorities: ["urgent"],
      scheduled: true,
      assigneePrincipalIds: [principal],
      unassigned: true,
      fields: [{ fieldId: field, predicate: { kind: "set" } }],
    } as unknown as SavedViewFilters;

    assert.deepEqual(savedViewTaskListParameters(filters, warsaw), {
      operationalStates: ["waiting"],
      statusIds: [status],
      priorities: ["urgent"],
      scheduled: true,
      assigneePrincipalIds: [principal],
      unassigned: true,
      fields: [{ fieldId: field, predicate: { kind: "set" } }],
    });
  });

  it("sends no parameter for an unassigned filter that filters nothing", () => {
    // The saved view treats `unassigned: false` as no filter at all, and the
    // query refuses the value outright. Translating it as `false` would send a
    // parameter the query rejects — a stored view that cannot be asked for.
    assert.deepEqual(
      savedViewTaskListParameters(
        { unassigned: false } as unknown as SavedViewFilters,
        warsaw,
      ),
      {},
    );
  });

  it("turns the three retired id lists into the relation conditions they always meant", () => {
    // These were accepted and stored while nothing read them. Reading them here
    // as their own parameter — or not at all — would drop the relation filter
    // of every view saved before ADR-045, on the query side only.
    const translated = savedViewTaskListParameters(
      { projectIds: [project] } as unknown as SavedViewFilters,
      warsaw,
    );
    assert.deepEqual(translated, {
      relationConditions: [
        { path: "project", predicate: { field: "id", in: [project] } },
      ],
    });
  });

  it("does not send the same relation condition twice", () => {
    const translated = savedViewTaskListParameters(
      {
        projectIds: [project],
        relationConditions: [
          {
            path: "project",
            predicate: { field: "lifecycle", in: ["active"] },
          },
        ],
      } as unknown as SavedViewFilters,
      warsaw,
    );
    assert.equal(translated.relationConditions?.length, 2);
  });

  it("resolves a named due window into boundaries in the WORKSPACE timezone", () => {
    // The day begins at 00:00 in Warsaw, which is 22:00 UTC the day before.
    // Appending `Z` to the local day key — the obvious shortcut — would move
    // every boundary two hours and put two hours of deadlines in the wrong day.
    assert.deepEqual(
      savedViewTaskListParameters(
        { dueWindow: "today" } as unknown as SavedViewFilters,
        warsaw,
      ),
      {
        dueAfter: "2026-07-29T22:00:00.000Z",
        dueBefore: "2026-07-30T22:00:00.000Z",
      },
    );
    // The same instant read in a workspace on UTC is a different day boundary,
    // which is the whole point of asking the workspace rather than the machine.
    assert.deepEqual(
      savedViewTaskListParameters(
        { dueWindow: "today" } as unknown as SavedViewFilters,
        { now, timeZone: "UTC" },
      ),
      {
        dueAfter: "2026-07-30T00:00:00.000Z",
        dueBefore: "2026-07-31T00:00:00.000Z",
      },
    );
    // Monday-start week containing that Thursday: 27 Jul → 3 Aug, exclusive.
    assert.deepEqual(
      savedViewTaskListParameters(
        { dueWindow: "this_week" } as unknown as SavedViewFilters,
        warsaw,
      ),
      {
        dueAfter: "2026-07-26T22:00:00.000Z",
        dueBefore: "2026-08-02T22:00:00.000Z",
      },
    );
    assert.deepEqual(
      savedViewTaskListParameters(
        { dueWindow: "overdue" } as unknown as SavedViewFilters,
        warsaw,
      ),
      { dueBefore: "2026-07-30T07:00:00.000Z" },
    );
  });

  it("leaves a window boundary open rather than a millisecond wide gap", () => {
    // `dueAfter` is inclusive and `dueBefore` exclusive kernel-side, so one
    // day's end must be the next day's start. A deadline landing exactly on
    // midnight belongs to one window and one only.
    const today = savedViewTaskListParameters(
      { dueWindow: "today" } as unknown as SavedViewFilters,
      warsaw,
    );
    const week = savedViewTaskListParameters(
      { dueWindow: "this_week" } as unknown as SavedViewFilters,
      warsaw,
    );
    assert.equal(Date.parse(today.dueBefore!) % 86_400_000 === 0, false);
    assert.equal(
      (Date.parse(today.dueBefore!) - Date.parse(today.dueAfter!)) / 3_600_000,
      24,
    );
    assert.equal(
      (Date.parse(week.dueBefore!) - Date.parse(week.dueAfter!)) / 3_600_000,
      168,
    );
  });
});
