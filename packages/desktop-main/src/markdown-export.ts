import {
  noteMarkdownFile,
  structuredDocumentToMarkdown,
  type NoteMarkdownSource,
  type StructuredDocument,
} from "@constellation/realtime-documents";

/**
 * The bulk markdown export — every note, with its folder tree, as `.md` files.
 *
 * NO ELECTRON AND NO FILESYSTEM IN THIS FILE. It turns reads into a list of
 * files, and `production-main.ts` writes them. The reason is the one B9 wrote
 * down about the attachment resolver: a boundary injected as a port is a
 * boundary a test can replace with a lie, so the part that decides WHAT gets
 * written — every path, every name collision, every byte of every note — is
 * the part under test, and the part that touches the disk does nothing else.
 *
 * The export is the argument for decision #17. The storage format is a
 * ProseMirror document inside a Yjs CRDT; nothing outside this application can
 * open it. If this file is wrong, the door out is painted on.
 */

/** Where unfiled notes go. Ruled in the build brief (OPEN-8a). */
export const UNFILED_DIRECTORY = "Unfiled";

/** One directory for every picture, shared by the notes that cite it. */
export const ATTACHMENT_DIRECTORY = "attachments";

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

/**
 * Windows is a first-class target and the gate runs there, so the names this
 * produces have to be legal on the strictest of the two filesystems rather
 * than on the one the export happened to be written on.
 */
const WINDOWS_RESERVED = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`),
]);

const MAX_NAME_LENGTH = 80;

/**
 * A title, as a filesystem name that cannot become something else.
 *
 * `< > : " / \ | ? *` are illegal on Windows and `/` ends a path segment
 * everywhere; a trailing dot or space is silently stripped by Windows, which
 * would turn two distinct titles into one file. A name that survives all of
 * that and is still empty gets a stated placeholder rather than a blank.
 */
export const markdownExportName = (title: string): string => {
  const cleaned = title
    // The control range is in the class deliberately: a newline or a NUL in
    // a title is legal in the graph and is not a filename anywhere.
    .replaceAll(/[\u0000-\u001f<>:"/\\|?*]/gu, "-")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    // Trailing dots and spaces are dropped by Windows itself, so they are
    // dropped here where the collision can still be seen and answered.
    .replace(/[. ]+$/u, "");
  if (cleaned.length === 0) return "Untitled";
  return WINDOWS_RESERVED.has(cleaned.toLowerCase()) ? `_${cleaned}` : cleaned;
};

/**
 * A name no sibling already holds.
 *
 * The caller sorts by id before asking, so which of two identically titled
 * notes keeps the plain name is stable across exports rather than a function
 * of whatever order a read happened to return.
 */
const uniqueName = (base: string, taken: Set<string>): string => {
  const key = (name: string): string => name.toLowerCase();
  if (!taken.has(key(base))) {
    taken.add(key(base));
    return base;
  }
  for (let index = 2; ; index += 1) {
    const candidate = `${base} (${index})`;
    if (!taken.has(key(candidate))) {
      taken.add(key(candidate));
      return candidate;
    }
  }
};

export interface MarkdownExportFolder {
  readonly id: string;
  readonly name: string;
  readonly parentFolderId?: string | undefined;
}

export interface MarkdownExportDocument {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly folderId?: string | undefined;
}

export interface MarkdownExportSource {
  readonly id: string;
  readonly title: string;
  readonly sourceKind: NoteMarkdownSource["sourceKind"];
  readonly availability: NoteMarkdownSource["availability"];
  readonly canonicalUrl?: string | undefined;
}

export interface MarkdownExportSpace {
  readonly spaceId: string;
  /**
   * A top-level directory ONLY when the export covers more than one Space.
   * One Space is the ordinary case and does not deserve a level of nesting;
   * two Spaces merged into one tree would interleave two access scopes, which
   * is the one thing a Space exists to keep apart.
   */
  readonly name: string;
  readonly folders: readonly MarkdownExportFolder[];
  readonly documents: readonly MarkdownExportDocument[];
  readonly sources: readonly MarkdownExportSource[];
}

export interface MarkdownExportPorts {
  /**
   * The Spaces this export covers, ALREADY SCOPED by the caller. It is a port
   * and never a parameter for the same reason the attachment resolver takes
   * its workspace as one: a scope the caller can widen is not a scope.
   */
  readonly readSpaces: () => readonly MarkdownExportSpace[];
  readonly readStructured: (input: {
    readonly documentId: string;
    readonly spaceId: string;
  }) => StructuredDocument | undefined;
  /** The source ids a note cites, in the order the note's evidence lists them. */
  readonly readEvidenceSourceIds: (input: {
    readonly documentId: string;
    readonly spaceId: string;
  }) => readonly string[];
  /**
   * The CURRENT names of the targets that still resolve. A target missing
   * from the answer did not resolve, and its reference becomes the marker.
   * The same read the preview uses (`document.linkCandidates` with
   * `targets`), which is what keeps the two surfaces from disagreeing.
   */
  readonly resolveReferences: (input: {
    readonly spaceId: string;
    readonly targets: readonly {
      readonly targetKind: string;
      readonly targetId: string;
    }[];
  }) => readonly {
    readonly targetKind: string;
    readonly targetId: string;
    readonly label: string;
  }[];
  /** An image's bytes, through the SAME authorization `<img src>` goes through. */
  readonly readAttachment: (
    sourceId: string,
  ) => { readonly bytes: Uint8Array; readonly mediaType: string } | undefined;
}

export interface MarkdownExportFile {
  /** POSIX-separated and relative to the chosen directory. */
  readonly path: string;
  readonly contents: string;
}

export interface MarkdownExportAttachment {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface MarkdownExportPlan {
  readonly notes: readonly MarkdownExportFile[];
  readonly attachments: readonly MarkdownExportAttachment[];
  readonly counts: {
    readonly notes: number;
    readonly attachments: number;
    /** Notes whose stored content this build could not read, so skipped. */
    readonly unreadable: number;
    /** References that resolved to nothing and became the plain-text marker. */
    readonly unresolvedReferences: number;
    /** Images whose bytes are not custodied here, so not written out. */
    readonly missingAttachments: number;
  };
}

const entityReferencesIn = (
  document: StructuredDocument,
): readonly { readonly targetKind: string; readonly targetId: string }[] => {
  const found = new Map<
    string,
    { readonly targetKind: string; readonly targetId: string }
  >();
  const visit = (node: {
    readonly type: string;
    readonly attrs?: Readonly<Record<string, unknown>> | undefined;
    readonly content?: readonly unknown[] | undefined;
  }): void => {
    if (node.type === "entityReference" && node.attrs !== undefined)
      found.set(
        `${String(node.attrs.targetKind)}:${String(node.attrs.targetId)}`,
        {
          targetKind: String(node.attrs.targetKind),
          targetId: String(node.attrs.targetId),
        },
      );
    for (const child of node.content ?? [])
      visit(child as Parameters<typeof visit>[0]);
  };
  for (const node of document.content)
    visit(node as Parameters<typeof visit>[0]);
  return [...found.values()];
};

const imageSourceIdsIn = (document: StructuredDocument): readonly string[] => {
  const found = new Set<string>();
  const visit = (node: {
    readonly type: string;
    readonly attrs?: Readonly<Record<string, unknown>> | undefined;
    readonly content?: readonly unknown[] | undefined;
  }): void => {
    if (node.type === "image" && node.attrs !== undefined)
      found.add(String(node.attrs.sourceId));
    for (const child of node.content ?? [])
      visit(child as Parameters<typeof visit>[0]);
  };
  for (const node of document.content)
    visit(node as Parameters<typeof visit>[0]);
  return [...found];
};

/** Guards a folder tree that somehow closed on itself; #30 nests without a limit. */
const MAX_FOLDER_DEPTH = 64;

export const buildMarkdownExport = (
  ports: MarkdownExportPorts,
): MarkdownExportPlan => {
  const spaces = ports.readSpaces();
  const notes: MarkdownExportFile[] = [];
  const attachments: MarkdownExportAttachment[] = [];
  let unreadable = 0;
  let unresolvedReferences = 0;
  let missingAttachments = 0;

  // Reserved before anything else can claim them: a real root folder named
  // "Unfiled" or "attachments" is legal, and the export's own two directories
  // must not be the ones that lose.
  const rootTaken = new Set([
    UNFILED_DIRECTORY.toLowerCase(),
    ATTACHMENT_DIRECTORY.toLowerCase(),
  ]);
  const takenByDirectory = new Map<string, Set<string>>([["", rootTaken]]);
  const takenIn = (directory: string): Set<string> => {
    const existing = takenByDirectory.get(directory);
    if (existing !== undefined) return existing;
    const created = new Set<string>();
    takenByDirectory.set(directory, created);
    return created;
  };

  // Attachment names are global, because the directory is: two notes citing
  // one picture cite one file rather than two copies of it.
  const attachmentPaths = new Map<string, string>();
  const attachmentTaken = new Set<string>();

  for (const space of spaces) {
    const spaceRoot =
      spaces.length > 1
        ? uniqueName(markdownExportName(space.name), rootTaken)
        : "";
    // Reserved AGAIN inside this Space's own root, not only at the top: with
    // more than one Space the unfiled notes go to `<Space>/Unfiled`, and the
    // top-level reservation never reaches that directory — so a real folder
    // named `Unfiled` inside the Space would claim the same path and the two
    // would merge into one indistinguishable directory.
    if (spaceRoot !== "") {
      const reserved = takenIn(spaceRoot);
      reserved.add(UNFILED_DIRECTORY.toLowerCase());
      reserved.add(ATTACHMENT_DIRECTORY.toLowerCase());
    }
    const joined = (directory: string): string =>
      spaceRoot === "" ? directory : `${spaceRoot}/${directory}`;
    const foldersById = new Map(
      space.folders.map((folder) => [folder.id, folder]),
    );
    const sourcesById = new Map(
      space.sources.map((source) => [source.id, source]),
    );
    // Sorted so that a name collision resolves the same way every time.
    const orderedFolders = [...space.folders].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    const folderPaths = new Map<string, string>();
    const folderPath = (id: string): string => {
      const known = folderPaths.get(id);
      if (known !== undefined) return known;
      const chain: MarkdownExportFolder[] = [];
      let current = foldersById.get(id);
      const seen = new Set<string>();
      while (
        current !== undefined &&
        !seen.has(current.id) &&
        chain.length < MAX_FOLDER_DEPTH
      ) {
        seen.add(current.id);
        chain.unshift(current);
        current =
          current.parentFolderId === undefined
            ? undefined
            : foldersById.get(current.parentFolderId);
      }
      let path = spaceRoot;
      for (const folder of chain) {
        const cached = folderPaths.get(folder.id);
        if (cached !== undefined) {
          path = cached;
          continue;
        }
        const name = uniqueName(markdownExportName(folder.name), takenIn(path));
        path = path === "" ? name : `${path}/${name}`;
        folderPaths.set(folder.id, path);
      }
      return path;
    };
    for (const folder of orderedFolders) folderPath(folder.id);

    const orderedDocuments = [...space.documents].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    for (const item of orderedDocuments) {
      const structured = ports.readStructured({
        documentId: item.id,
        spaceId: space.spaceId,
      });
      if (structured === undefined) {
        unreadable += 1;
        continue;
      }
      // A `folderId` that names no folder is Unfiled, not a missing path.
      // `contracts/src/query.ts` records why it is reachable BY DESIGN: a note
      // is removed keeping its folder, the folder — empty by then — is
      // removed, and the note removal is undone.
      const directory =
        item.folderId === undefined || !foldersById.has(item.folderId)
          ? joined(UNFILED_DIRECTORY)
          : folderPath(item.folderId);
      const depth = directory === "" ? 0 : directory.split("/").length;
      const upwards = "../".repeat(depth);

      const targets = entityReferencesIn(structured);
      const resolved = new Map(
        ports
          .resolveReferences({ spaceId: space.spaceId, targets })
          .map((entry) => [
            `${entry.targetKind}:${entry.targetId}`,
            entry.label,
          ]),
      );
      unresolvedReferences += targets.filter(
        (target) => !resolved.has(`${target.targetKind}:${target.targetId}`),
      ).length;

      for (const sourceId of imageSourceIdsIn(structured)) {
        if (attachmentPaths.has(sourceId)) continue;
        const payload = ports.readAttachment(sourceId);
        if (payload === undefined) {
          missingAttachments += 1;
          continue;
        }
        const extension = EXTENSIONS[payload.mediaType] ?? "bin";
        const base = markdownExportName(
          sourcesById.get(sourceId)?.title ?? "Attachment",
        );
        const name = `${uniqueName(base, attachmentTaken)}.${extension}`;
        attachmentPaths.set(sourceId, `${ATTACHMENT_DIRECTORY}/${name}`);
        attachments.push({
          path: `${ATTACHMENT_DIRECTORY}/${name}`,
          bytes: payload.bytes,
        });
      }

      const body = structuredDocumentToMarkdown(structured, {
        resolveReference: ({ targetKind, targetId }) =>
          resolved.get(`${targetKind}:${targetId}`),
        // THE ONE ACCEPTED DIFFERENCE from the per-note preview, and the
        // reason the preview states it: here the bytes exist on disk, so the
        // link is a real relative path a vault can follow. An image whose
        // bytes are not custodied keeps the identity URI rather than pointing
        // at a file that was never written.
        imageLink: (sourceId) => {
          const path = attachmentPaths.get(sourceId);
          return path === undefined
            ? `constellation://source/${sourceId}`
            : `${upwards}${path}`;
        },
      });

      const sources = ports
        .readEvidenceSourceIds({
          documentId: item.id,
          spaceId: space.spaceId,
        })
        .flatMap((sourceId) => {
          const source = sourcesById.get(sourceId);
          return source === undefined
            ? []
            : [
                {
                  title: source.title,
                  sourceKind: source.sourceKind,
                  availability: source.availability,
                  canonicalUrl: source.canonicalUrl,
                },
              ];
        });

      const name = uniqueName(
        markdownExportName(item.title),
        takenIn(directory),
      );
      notes.push({
        path: `${directory}/${name}.md`,
        contents: noteMarkdownFile({
          id: item.id,
          title: item.title,
          updatedAt: item.updatedAt,
          body,
          sources,
        }),
      });
    }
  }

  return {
    notes,
    attachments,
    counts: {
      notes: notes.length,
      attachments: attachments.length,
      unreadable,
      unresolvedReferences,
      missingAttachments,
    },
  };
};
