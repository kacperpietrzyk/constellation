import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  collectInventoryPages,
  projectReclassificationTargets,
} from "../src/client/workflow.js";

const page = (
  items: readonly string[],
  options: {
    readonly snapshot?: string;
    readonly totalCount?: number;
    readonly nextCursor?: string | null;
    readonly final?: boolean;
  } = {},
) => ({
  items,
  snapshot: options.snapshot ?? "snapshot-a",
  totalCount: options.totalCount ?? 3,
  nextCursor: options.nextCursor ?? null,
  final: options.final ?? true,
});

test("collects every bounded inventory page and proves explicit finality", async () => {
  const cursors: Array<string | undefined> = [];
  const result = await collectInventoryPages(async (cursor) => {
    cursors.push(cursor);
    return cursor === undefined
      ? page(["one", "two"], { nextCursor: "cursor-2", final: false })
      : page(["three"]);
  });
  assert.deepEqual(cursors, [undefined, "cursor-2"]);
  assert.deepEqual(result.items, ["one", "two", "three"]);
  assert.equal(result.totalCount, 3);
  assert.equal(result.snapshot, "snapshot-a");
  assert.equal(result.final, true);
  assert.equal(result.nextCursor, null);
});

test("refuses inconsistent inventory pages instead of presenting a partial count", async () => {
  await assert.rejects(
    collectInventoryPages(async (cursor) =>
      cursor === undefined
        ? page(["one"], { nextCursor: "cursor-2", final: false })
        : page(["two"], {
            snapshot: "snapshot-b",
            totalCount: 2,
          }),
    ),
    /snapshot changed/u,
  );
  await assert.rejects(
    collectInventoryPages(async (cursor) =>
      cursor === undefined
        ? page(["one"], { nextCursor: "cursor-2", final: false })
        : page(["two"], { totalCount: 3, final: true }),
    ),
    /item count does not match totalCount/u,
  );
});

test("builds reclassification targets from the complete pageable Opportunity inventory", () => {
  const targets = projectReclassificationTargets(
    {
      areas: [{ id: "area-1", title: "Product" }],
      initiatives: [{ id: "initiative-1", title: "Desktop" }],
    } as never,
    {
      kind: "ready",
      data: {
        items: [
          { id: "opportunity-1", title: "Renewal" },
          { id: "opportunity-2", title: "Expansion" },
        ],
      },
    } as never,
  );
  assert.deepEqual(
    targets.map((target) => target.kind),
    ["area", "initiative", "opportunity", "opportunity"],
  );
});
