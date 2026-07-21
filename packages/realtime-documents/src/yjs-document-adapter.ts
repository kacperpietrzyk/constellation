import * as Y from "yjs";

import {
  replaceStructuredDocumentInYjs as replaceImportedStructuredDocument,
  structuredDocumentFromYjs as importStructuredDocument,
  type StructuredDocument,
} from "./structured-document.js";

export const MAX_DOCUMENT_UPDATE_BYTES = 1_048_576;
export const MAX_DOCUMENT_TEXT_LENGTH = 200_000;
export const LEGACY_DOCUMENT_TEXT_ROOT = "content";
export const RICH_DOCUMENT_FRAGMENT_ROOT = "rich-content";
export const DOCUMENT_FORMAT_METADATA_ROOT = "constellation-document";

export type DocumentContentFormat = "plain-v1" | "rich-v1";
export type DocumentEntityReferenceKind =
  "task" | "project" | "person" | "organization" | "meeting";
export interface DocumentEntityReference {
  readonly targetKind: DocumentEntityReferenceKind;
  readonly targetId: string;
}

export type DocumentChangeOrigin =
  | { readonly kind: "human"; readonly principalId: string }
  | {
      readonly kind: "agent";
      readonly principalId: string;
      readonly runId: string;
    }
  | { readonly kind: "remote" }
  | { readonly kind: "restore"; readonly revisionId: string };

export interface RealtimeDocumentCheckpoint {
  readonly engine: "yjs-13";
  readonly state: Uint8Array;
  readonly stateVector: Uint8Array;
}

export interface RealtimeDocumentAdapter {
  readonly engine: "yjs-13";
  getFormat(): DocumentContentFormat;
  getText(): string;
  getEntityReferences(): readonly DocumentEntityReference[];
  getStructuredContent(): StructuredDocument;
  migrateToRich(legacyDigest: string, origin: DocumentChangeOrigin): boolean;
  replaceText(text: string, origin: DocumentChangeOrigin): void;
  replaceStructuredContent(
    content: unknown,
    origin: DocumentChangeOrigin,
  ): StructuredDocument;
  applyUpdate(update: Uint8Array): void;
  encodeState(): Uint8Array;
  encodeUpdateSince(stateVector: Uint8Array): Uint8Array;
  checkpoint(): RealtimeDocumentCheckpoint;
  restore(checkpoint: RealtimeDocumentCheckpoint, revisionId: string): void;
  onUpdate(listener: (update: Uint8Array) => void): () => void;
  destroy(): void;
}

const assertUpdateSize = (update: Uint8Array): void => {
  if (
    update.byteLength === 0 ||
    update.byteLength > MAX_DOCUMENT_UPDATE_BYTES
  ) {
    throw new Error("DOCUMENT_UPDATE_SIZE_INVALID");
  }
};

const assertText = (text: string): void => {
  if (text.length > MAX_DOCUMENT_TEXT_LENGTH) {
    throw new Error("DOCUMENT_TEXT_SIZE_INVALID");
  }
};

const assertLegacyDigest = (digest: string): void => {
  if (!/^[a-f0-9]{64}$/u.test(digest)) {
    throw new Error("DOCUMENT_LEGACY_DIGEST_INVALID");
  }
};

const formatOf = (document: Y.Doc): DocumentContentFormat => {
  const value = document
    .getMap<unknown>(DOCUMENT_FORMAT_METADATA_ROOT)
    .get("format");
  if (value === undefined || value === "plain-v1") return "plain-v1";
  if (value === "rich-v1") return "rich-v1";
  throw new Error("DOCUMENT_FORMAT_UNSUPPORTED");
};

const paragraphNodes = (text: string): Y.XmlElement[] =>
  text.split("\n").map((line) => {
    const paragraph = new Y.XmlElement("paragraph");
    if (line !== "") {
      const content = new Y.XmlText();
      content.insert(0, line);
      paragraph.insert(0, [content]);
    }
    return paragraph;
  });

const replaceRichWithPlainText = (document: Y.Doc, text: string): void => {
  const rich = document.getXmlFragment(RICH_DOCUMENT_FRAGMENT_ROOT);
  if (rich.length > 0) rich.delete(0, rich.length);
  rich.insert(0, paragraphNodes(text));
};

const replaceLegacyWithPlainText = (document: Y.Doc, text: string): void => {
  const legacy = document.getText(LEGACY_DOCUMENT_TEXT_ROOT);
  if (legacy.length > 0) legacy.delete(0, legacy.length);
  if (text !== "") legacy.insert(0, text);
};

const richNodeText = (node: Y.XmlElement | Y.XmlText): string => {
  // XmlText#toString serializes formatting as XML-like tags. Search/export
  // need the visible characters only, independent of marks.
  if (node instanceof Y.XmlText)
    return node
      .toDelta()
      .map((part: { readonly insert: unknown }) =>
        typeof part.insert === "string" ? part.insert : "",
      )
      .join("");
  if (node.nodeName === "hardBreak") return "\n";
  const childText = node
    .toArray()
    .filter(
      (child): child is Y.XmlElement | Y.XmlText =>
        child instanceof Y.XmlElement || child instanceof Y.XmlText,
    )
    .map(richNodeText);
  if (node.nodeName === "bulletList" || node.nodeName === "orderedList") {
    return childText.join("\n");
  }
  if (node.nodeName === "listItem") return childText.join("\n");
  return childText.join("");
};

export const documentContentFormat = (document: Y.Doc): DocumentContentFormat =>
  formatOf(document);

export const documentPlainText = (document: Y.Doc): string => {
  if (formatOf(document) === "plain-v1") {
    return document.getText(LEGACY_DOCUMENT_TEXT_ROOT).toString();
  }
  return document
    .getXmlFragment(RICH_DOCUMENT_FRAGMENT_ROOT)
    .toArray()
    .filter(
      (node): node is Y.XmlElement | Y.XmlText =>
        node instanceof Y.XmlElement || node instanceof Y.XmlText,
    )
    .map(richNodeText)
    .join("\n");
};

const entityReferenceKinds = new Set<DocumentEntityReferenceKind>([
  "task",
  "project",
  "person",
  "organization",
  "meeting",
]);

export const documentEntityReferences = (
  document: Y.Doc,
): readonly DocumentEntityReference[] => {
  if (formatOf(document) !== "rich-v1") return [];
  const references = new Map<string, DocumentEntityReference>();
  const inspect = (node: Y.XmlElement | Y.XmlText): void => {
    if (node instanceof Y.XmlText) return;
    if (node.nodeName === "entityReference") {
      const targetKind = node.getAttribute("targetKind");
      const targetId = node.getAttribute("targetId");
      if (
        typeof targetKind !== "string" ||
        !entityReferenceKinds.has(targetKind as DocumentEntityReferenceKind) ||
        typeof targetId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          targetId,
        )
      ) {
        throw new Error("DOCUMENT_ENTITY_REFERENCE_INVALID");
      }
      const reference = {
        targetKind: targetKind as DocumentEntityReferenceKind,
        targetId,
      };
      references.set(
        `${reference.targetKind}:${reference.targetId}`,
        reference,
      );
    }
    for (const child of node.toArray()) {
      if (child instanceof Y.XmlElement || child instanceof Y.XmlText)
        inspect(child);
    }
  };
  for (const node of document
    .getXmlFragment(RICH_DOCUMENT_FRAGMENT_ROOT)
    .toArray()) {
    if (node instanceof Y.XmlElement || node instanceof Y.XmlText)
      inspect(node);
  }
  return [...references.values()].sort(
    (left, right) =>
      left.targetKind.localeCompare(right.targetKind) ||
      left.targetId.localeCompare(right.targetId),
  );
};

export const migrateDocumentToRich = (
  document: Y.Doc,
  legacyDigest: string,
  origin: DocumentChangeOrigin,
): boolean => {
  assertLegacyDigest(legacyDigest);
  if (formatOf(document) === "rich-v1") return false;
  const text = document.getText(LEGACY_DOCUMENT_TEXT_ROOT).toString();
  assertText(text);
  document.transact(() => {
    replaceRichWithPlainText(document, text);
    const metadata = document.getMap<unknown>(DOCUMENT_FORMAT_METADATA_ROOT);
    metadata.set("format", "rich-v1");
    metadata.set("schemaVersion", 1);
    metadata.set("legacyDigest", legacyDigest);
  }, origin);
  return true;
};

export const restoreDocumentFromCheckpoint = (
  document: Y.Doc,
  checkpoint: RealtimeDocumentCheckpoint,
  revisionId: string,
): void => {
  if (checkpoint.engine !== "yjs-13") {
    throw new Error("DOCUMENT_CHECKPOINT_ENGINE_INVALID");
  }
  assertUpdateSize(checkpoint.state);
  const restored = new Y.Doc({ gc: true });
  try {
    Y.applyUpdate(restored, checkpoint.state);
    const restoredFormat = formatOf(restored);
    const currentFormat = formatOf(document);
    document.transact(
      () => {
        if (restoredFormat === "plain-v1") {
          const text = restored.getText(LEGACY_DOCUMENT_TEXT_ROOT).toString();
          assertText(text);
          if (currentFormat === "rich-v1")
            replaceRichWithPlainText(document, text);
          else replaceLegacyWithPlainText(document, text);
          return;
        }
        const restoredRich = restored.getXmlFragment(
          RICH_DOCUMENT_FRAGMENT_ROOT,
        );
        const currentRich = document.getXmlFragment(
          RICH_DOCUMENT_FRAGMENT_ROOT,
        );
        if (currentRich.length > 0) currentRich.delete(0, currentRich.length);
        currentRich.insert(
          0,
          restoredRich
            .toArray()
            .filter(
              (node): node is Y.XmlElement | Y.XmlText =>
                node instanceof Y.XmlElement || node instanceof Y.XmlText,
            )
            .map((node) => node.clone()),
        );
        const currentMetadata = document.getMap<unknown>(
          DOCUMENT_FORMAT_METADATA_ROOT,
        );
        const restoredMetadata = restored.getMap<unknown>(
          DOCUMENT_FORMAT_METADATA_ROOT,
        );
        currentMetadata.set("format", "rich-v1");
        currentMetadata.set("schemaVersion", 1);
        const digest = restoredMetadata.get("legacyDigest");
        if (typeof digest === "string")
          currentMetadata.set("legacyDigest", digest);
      },
      { kind: "restore", revisionId },
    );
  } finally {
    restored.destroy();
  }
};

export class YjsRealtimeDocumentAdapter implements RealtimeDocumentAdapter {
  public readonly engine = "yjs-13" as const;
  private readonly document: Y.Doc;
  private readonly text: Y.Text;

  public constructor(initialState?: Uint8Array) {
    this.document = new Y.Doc({ gc: true });
    this.text = this.document.getText(LEGACY_DOCUMENT_TEXT_ROOT);
    if (initialState !== undefined) {
      assertUpdateSize(initialState);
      Y.applyUpdate(this.document, initialState, { kind: "remote" });
    }
  }

  public getFormat(): DocumentContentFormat {
    return formatOf(this.document);
  }

  public getText(): string {
    return documentPlainText(this.document);
  }

  public getEntityReferences(): readonly DocumentEntityReference[] {
    return documentEntityReferences(this.document);
  }

  public getStructuredContent(): StructuredDocument {
    if (this.getFormat() !== "rich-v1")
      throw new Error("DOCUMENT_FORMAT_UPGRADE_REQUIRED");
    return importStructuredDocument(this.document);
  }

  public migrateToRich(
    legacyDigest: string,
    origin: DocumentChangeOrigin,
  ): boolean {
    return migrateDocumentToRich(this.document, legacyDigest, origin);
  }

  public replaceText(text: string, origin: DocumentChangeOrigin): void {
    assertText(text);
    if (this.getFormat() === "rich-v1") {
      this.document.transact(
        () => replaceRichWithPlainText(this.document, text),
        origin,
      );
      return;
    }
    this.document.transact(() => {
      const current = this.text.toString();
      let prefix = 0;
      while (
        prefix < current.length &&
        prefix < text.length &&
        current[prefix] === text[prefix]
      ) {
        prefix += 1;
      }
      let suffix = 0;
      while (
        suffix < current.length - prefix &&
        suffix < text.length - prefix &&
        current[current.length - 1 - suffix] === text[text.length - 1 - suffix]
      ) {
        suffix += 1;
      }
      const deleteLength = current.length - prefix - suffix;
      if (deleteLength > 0) this.text.delete(prefix, deleteLength);
      const insertion = text.slice(prefix, text.length - suffix);
      if (insertion.length > 0) this.text.insert(prefix, insertion);
    }, origin);
  }

  public replaceStructuredContent(
    content: unknown,
    origin: DocumentChangeOrigin,
  ): StructuredDocument {
    if (this.getFormat() !== "rich-v1")
      throw new Error("DOCUMENT_FORMAT_UPGRADE_REQUIRED");
    return replaceImportedStructuredDocument(this.document, content, origin);
  }

  public applyUpdate(update: Uint8Array): void {
    assertUpdateSize(update);
    Y.applyUpdate(this.document, update, { kind: "remote" });
    assertText(this.getText());
  }

  public encodeState(): Uint8Array {
    const state = Y.encodeStateAsUpdate(this.document);
    assertUpdateSize(state);
    return state;
  }

  public encodeUpdateSince(stateVector: Uint8Array): Uint8Array {
    const update = Y.encodeStateAsUpdate(this.document, stateVector);
    if (update.byteLength > MAX_DOCUMENT_UPDATE_BYTES) {
      throw new Error("DOCUMENT_UPDATE_SIZE_INVALID");
    }
    return update;
  }

  public checkpoint(): RealtimeDocumentCheckpoint {
    return {
      engine: this.engine,
      state: this.encodeState(),
      stateVector: Y.encodeStateVector(this.document),
    };
  }

  public restore(
    checkpoint: RealtimeDocumentCheckpoint,
    revisionId: string,
  ): void {
    restoreDocumentFromCheckpoint(this.document, checkpoint, revisionId);
  }

  public onUpdate(listener: (update: Uint8Array) => void): () => void {
    const handler = (update: Uint8Array, origin: unknown): void => {
      if (
        typeof origin === "object" &&
        origin !== null &&
        "kind" in origin &&
        origin.kind === "remote"
      ) {
        return;
      }
      assertUpdateSize(update);
      listener(update.slice());
    };
    this.document.on("update", handler);
    return () => this.document.off("update", handler);
  }

  public destroy(): void {
    this.document.destroy();
  }
}
