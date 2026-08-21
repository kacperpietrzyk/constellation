import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { it } from "node:test";

it("keeps public Hub snapshot helpers out of canonical repository mutation paths", () => {
  const source = readFileSync(
    new URL("../../src/service.ts", import.meta.url),
    "utf8",
  );
  assert.equal(
    [...source.matchAll(/\bfromHubSnapshot\(/g)].length,
    3,
    "public parsing belongs only to createWorkspace validation/sanitization and bootstrapSnapshot sanitization",
  );
  assert.equal(
    [...source.matchAll(/\btoHubSnapshot\(/g)].length,
    2,
    "public serialization belongs only to createWorkspace and bootstrapSnapshot sanitization",
  );
  assert.equal(
    [...source.matchAll(/\bscopeHubSnapshot\(/g)].length,
    0,
    "repository-owned state must be scoped through a server-internal envelope",
  );
  const maintenance = source.slice(
    source.indexOf("private async finalizeVoiceAudio"),
    source.indexOf("public async bootstrapSnapshot"),
  );
  assert.doesNotMatch(maintenance, /\bfromHubSnapshot\(/);
  assert.doesNotMatch(maintenance, /\btoHubSnapshot\(/);
  assert.match(maintenance, /\bfromInternalHubSnapshot\(/);
  assert.match(maintenance, /\btoInternalHubSnapshot\(/);

  const sourceDirectory = new URL("../../src/", import.meta.url);
  const sources = new Map(
    readdirSync(sourceDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => [
        entry.name,
        readFileSync(new URL(entry.name, sourceDirectory), "utf8"),
      ]),
  );
  for (const [name, candidate] of sources) {
    if (name === "snapshot.ts" || name === "service.ts") continue;
    assert.doesNotMatch(
      candidate,
      /\b(?:fromHubSnapshot|toHubSnapshot|scopeHubSnapshot)\(/,
      `${name} must not cross the public snapshot boundary`,
    );
  }
  const canonicalWriters = [...sources]
    .filter(([, candidate]) => /state\.snapshot\s*=/.test(candidate))
    .map(([name]) => name)
    .sort();
  assert.deepEqual(canonicalWriters, ["remote-mcp.ts", "service.ts"]);
  for (const name of canonicalWriters) {
    const writer = sources.get(name)!;
    assert.match(
      writer,
      /\btoInternalHubSnapshot\(/,
      `${name} must persist canonical state through an internal envelope`,
    );
    assert.match(
      writer,
      /\bfromInternalHubSnapshot\(/,
      `${name} must reconstruct canonical state through an internal envelope`,
    );
  }
});
