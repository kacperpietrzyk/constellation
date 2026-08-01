/// <reference types="node" />

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ATTACHMENT_PROTOCOL_SCHEME,
  SERVABLE_IMAGE_MEDIA_TYPES,
  attachmentUrl,
} from "@constellation/contracts";

/**
 * The renderer's half of the image byte path.
 *
 * The assertion that earns its place here is the CSP one. `img-src 'self'
 * data:` blocks the custom scheme outright, so without the entry every image
 * in every note renders broken — and it would look like a defect in the image
 * node rather than in a header nobody was thinking about. A future tidy-up of
 * that meta tag is exactly the kind of change that would sail through review.
 */

const uiRoot = ((): string => {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(directory, "src", "RealApp.tsx"))) {
    const parent = path.dirname(directory);
    if (parent === directory)
      throw new Error("Could not locate the desktop-ui package root.");
    directory = parent;
  }
  return directory;
})();

const read = (...segments: readonly string[]): string =>
  readFileSync(path.join(uiRoot, ...segments), "utf8");

/**
 * The attribute name the descendant-overflow sweep looks for, taken from the
 * sweep's own source rather than restated here. The sweep is plain JavaScript
 * with no declaration file, so it is read as text; the throw below is what
 * stops that from degrading into a green run over an empty string.
 */
const horizontalScrollAttribute = ((): string => {
  const sweep = readFileSync(
    path.join(uiRoot, "..", "..", "scripts", "descendant-overflow.mjs"),
    "utf8",
  );
  const found = /HORIZONTAL_SCROLL_ATTRIBUTE = "([^"]+)"/u.exec(sweep)?.[1];
  if (found === undefined || found.length === 0)
    throw new Error(
      "The descendant-overflow sweep no longer exports HORIZONTAL_SCROLL_ATTRIBUTE where this assertion reads it.",
    );
  return found;
})();

describe("the image byte path, from the renderer's side", () => {
  it("lets the attachment scheme through the content security policy", () => {
    const html = read("index.html");
    const policy = /content="([^"]+)"/u.exec(html)?.[1];
    assert.ok(
      policy !== undefined && policy.includes("img-src"),
      "The content security policy is no longer where this assertion looks — it measures nothing.",
    );
    const imgSrc = /img-src ([^;]+)/u.exec(policy)?.[1] ?? "";
    assert.ok(
      imgSrc.includes(`${ATTACHMENT_PROTOCOL_SCHEME}:`),
      `img-src does not admit ${ATTACHMENT_PROTOCOL_SCHEME}: — every image in every note renders broken, and it looks like a defect in the image node.`,
    );
    // And the policy has not simply been opened up to everything on the way.
    assert.ok(!imgSrc.includes("*"), `img-src became permissive: ${imgSrc}`);
    assert.ok(!policy.includes("unsafe-eval"), policy);
  });

  it("builds an image's src from the shared helper, never from a literal", () => {
    const source = read("src", "document-nodes.tsx");
    assert.match(source, /src=\{attachmentUrl\(sourceId\)\}/u);
    // A scheme spelled out in the renderer is a scheme that can drift from
    // the one the main process registered.
    assert.doesNotMatch(
      source.replace(/^import[\s\S]*?;$/gmu, ""),
      new RegExp(`["'\`]${ATTACHMENT_PROTOCOL_SCHEME}`, "u"),
    );
    assert.equal(
      attachmentUrl("b0000000-0000-4000-8000-000000000003"),
      `${ATTACHMENT_PROTOCOL_SCHEME}://b0000000-0000-4000-8000-000000000003`,
    );
  });

  it("declares the table's horizontal scroll rather than taking it", () => {
    // S2 built the descendant-overflow sweep on exactly this contract: an
    // element that scrolls horizontally without saying so is an ACCIDENTAL
    // scroll and a layout defect, and "the shell will absorb it" stops being
    // an excuse the moment a region can declare that it meant to. A table of
    // prose columns inside a 50 rem canvas will exceed it, so it declares.
    //
    // The attribute is read from the sweep's own export, so the two cannot
    // drift: a spelling written twice is a spelling that will be written
    // differently twice, which is this wave's defect family.
    const nodes = read("src", "document-nodes.tsx");
    const styles = read("src", "styles.css");
    assert.match(
      nodes,
      new RegExp(`"${horizontalScrollAttribute}":`, "u"),
      "The table no longer declares that it scrolls horizontally.",
    );
    assert.match(
      styles,
      /\.document-canvas table \{[^}]*overflow-x: auto;/u,
      "The table stopped scrolling in its own box — a wide one now pushes the whole canvas sideways.",
    );
  });

  it("offers to insert only what the main process would actually serve", () => {
    // The button and the resolver read ONE list, from the contract. Two lists
    // means either a button that always fails, or — the direction that
    // matters — a type the renderer would not offer being served anyway.
    const editor = read("src", "library", "KnowledgeEditor.tsx");
    assert.match(editor, /SERVABLE_IMAGE_MEDIA_TYPES\.has\(/u);
    assert.match(editor, /Insert into note/u);
    // Gated on custody: an attachment whose bytes are not on this device
    // would insert a node that resolves to a 404 the moment it lands.
    assert.match(editor, /custodyState !== "available"/u);
    assert.ok(
      SERVABLE_IMAGE_MEDIA_TYPES.size >= 4 &&
        !SERVABLE_IMAGE_MEDIA_TYPES.has("image/svg+xml"),
      "The servable media types went empty, or admitted a scriptable one.",
    );
  });
});
