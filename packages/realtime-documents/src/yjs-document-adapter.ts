import * as Y from "yjs";

export const MAX_DOCUMENT_UPDATE_BYTES = 1_048_576;
export const MAX_DOCUMENT_TEXT_LENGTH = 2_000_000;

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
  getText(): string;
  replaceText(text: string, origin: DocumentChangeOrigin): void;
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

export class YjsRealtimeDocumentAdapter implements RealtimeDocumentAdapter {
  public readonly engine = "yjs-13" as const;
  private readonly document: Y.Doc;
  private readonly text: Y.Text;

  public constructor(initialState?: Uint8Array) {
    this.document = new Y.Doc({ gc: true });
    this.text = this.document.getText("content");
    if (initialState !== undefined) {
      assertUpdateSize(initialState);
      Y.applyUpdate(this.document, initialState, { kind: "remote" });
    }
  }

  public getText(): string {
    return this.text.toString();
  }

  public replaceText(text: string, origin: DocumentChangeOrigin): void {
    assertText(text);
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
    if (checkpoint.engine !== this.engine) {
      throw new Error("DOCUMENT_CHECKPOINT_ENGINE_INVALID");
    }
    const restored = new YjsRealtimeDocumentAdapter(checkpoint.state);
    try {
      this.replaceText(restored.getText(), { kind: "restore", revisionId });
    } finally {
      restored.destroy();
    }
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
