import assert from "node:assert/strict";
import { it } from "node:test";

import { verifyDependencyLicenses } from "./verify-dependency-licenses.mjs";

const lockfile = (dependency) => ({
  lockfileVersion: 3,
  packages: {
    "": { license: "Apache-2.0" },
    "node_modules/example": dependency,
  },
});

it("accepts declared compatible dependency licenses", () => {
  assert.deepEqual(verifyDependencyLicenses(lockfile({ license: "MIT" })), {
    dependencyCount: 1,
    licenses: { MIT: 1 },
  });
});

it("resolves workspace-link licenses from the lockfile", () => {
  const linked = lockfile({ link: true, resolved: "packages/example" });
  linked.packages["packages/example"] = { license: "Apache-2.0" };
  assert.equal(verifyDependencyLicenses(linked).dependencyCount, 1);
});

it("fails closed for missing or unaccepted dependency licenses", () => {
  assert.throws(
    () => verifyDependencyLicenses(lockfile({})),
    /example: missing license/u,
  );
  assert.throws(
    () => verifyDependencyLicenses(lockfile({ license: "GPL-3.0-only" })),
    /example: GPL-3\.0-only/u,
  );
});

it("fails closed for an unsupported lockfile shape", () => {
  assert.throws(
    () => verifyDependencyLicenses({ lockfileVersion: 2, packages: {} }),
    /DEPENDENCY_LICENSE_LOCKFILE_INVALID/u,
  );
});
