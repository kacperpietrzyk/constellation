import assert from "node:assert/strict";
import { test } from "vitest";

import {
  acceptProjectCheckInLoad,
  projectCheckInSliceForProject,
  type ProjectCheckInListProjection,
  type ProjectCheckInSlice,
} from "../src/client/workflow.js";
import {
  ProjectCheckInIdSchema,
  ProjectIdSchema,
} from "@constellation/contracts";

const projectA = ProjectIdSchema.parse("75000000-0000-4000-8000-000000000001");
const projectB = ProjectIdSchema.parse("75000000-0000-4000-8000-000000000002");
const checkInA = ProjectCheckInIdSchema.parse(
  "75000000-0000-4000-8000-000000000003",
);
const projection = (
  projectId: typeof projectA,
): ProjectCheckInListProjection => ({
  kind: "project.checkInList",
  projectId,
  latestCheckInId: checkInA,
  items: [],
});

test("a Project switch cannot render or settle the prior Project check-in slice", () => {
  const readyA: ProjectCheckInSlice = {
    kind: "ready",
    projectId: projectA,
    data: projection(projectA),
  };
  assert.deepEqual(projectCheckInSliceForProject(readyA, projectB), {
    kind: "loading",
    projectId: projectB,
  });
  const loadingB: ProjectCheckInSlice = {
    kind: "loading",
    projectId: projectB,
  };
  assert.deepEqual(
    acceptProjectCheckInLoad(loadingB, projectA, projection(projectA)),
    loadingB,
    "a late Project A response must not replace Project B loading state",
  );
  assert.deepEqual(
    acceptProjectCheckInLoad(loadingB, projectB, projection(projectB)),
    {
      kind: "ready",
      projectId: projectB,
      data: projection(projectB),
    },
  );
});
