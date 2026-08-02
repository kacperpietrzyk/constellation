import { randomUUID } from "node:crypto";

import {
  CommandEnvelopeSchema,
  type SpaceId,
  type WorkspaceId,
} from "@constellation/contracts";
import {
  MARKDOWN_IMPORT_CONSTRUCTS,
  parseMarkdownImport,
  parseStructuredDocument,
  resolveMarkdownImport,
  STRUCTURED_DOCUMENT_SCHEMA_VERSION,
  structuredDocumentNodeText,
  type MarkdownImportConstruct,
  type MarkdownImportConstructCounts,
  type MarkdownImportNode,
  type MarkdownImportResolution,
  type MarkdownImportWikilink,
  type StructuredDocument,
  type StructuredDocumentNode,
} from "@constellation/realtime-documents";

import type { DesktopKernelService } from "./runtime-kernel-service.js";

/**
 * The Obsidian import — a vault of markdown files into notes and folders.
 *
 * NO ELECTRON AND NO FILESYSTEM IN THIS FILE, exactly as `markdown-export.ts`
 * keeps none: the part that decides WHAT will be written is the part under
 * test, and the part that touches a disk does nothing else. The walk lives in
 * `production-main.ts` and hands this module a list of files.
 *
 * TWO PASSES, AND THE ORDER IS THE WHOLE DESIGN. In Obsidian `[[Northstar]]`
 * names a FILE; here a reference stores IDENTITY and the label is resolved at
 * read time from the current authorized target. So a link cannot be turned
 * into a reference until the note it points at exists, and a vault is mostly
 * forward references. Pass one creates every folder and every note; pass two
 * walks the parsed trees and substitutes. `planObsidianImport` computes both
 * passes' answers WITHOUT ISSUING A COMMAND, which is what makes the scan a
 * real preview rather than a promise.
 */

/** One markdown file, as the walk found it. */
export interface ObsidianVaultFile {
  /** Vault-relative, POSIX separators, `.md` extension included. */
  readonly path: string;
  readonly text: string;
}

export interface ObsidianExistingFolder {
  readonly id: string;
  readonly name: string;
  readonly parentFolderId?: string | undefined;
}

export interface ObsidianExistingDocument {
  readonly id: string;
  readonly title: string;
  readonly externalId?: string | undefined;
}

export interface ObsidianImportPorts {
  /** The folder tree and the notes this Space already holds. */
  readonly readExisting: () => {
    readonly folders: readonly ObsidianExistingFolder[];
    readonly documents: readonly ObsidianExistingDocument[];
  };
  /**
   * A record whose CURRENT name is exactly this text.
   *
   * `undefined` when nothing matches AND when more than one thing does. An
   * ambiguous link is unresolvable, never a coin flip: `document.linkCandidates`
   * is a ranked SEARCH, names are not unique and nothing refuses a duplicate,
   * so taking the first result because the query returned something is how
   * `[[Budget]]` silently becomes a reference to a person called "Budget
   * Review".
   */
  readonly resolveRecord: (
    name: string,
  ) => { readonly targetKind: string; readonly targetId: string } | undefined;
}

/**
 * The prefix a note's source key carries. `jamie:<id>` and `folder:<slug>` are
 * the shapes already in the MCP catalogue; this is the same convention.
 */
export const OBSIDIAN_EXTERNAL_ID_PREFIX = "obsidian:";

/** `ExternalIdSchema` stops at 500 characters. */
const MAX_EXTERNAL_ID_LENGTH = 500;

/** The command bound on a note's title. */
const MAX_TITLE_LENGTH = 500;

/** The command bound on a folder's name. */
const MAX_FOLDER_NAME_LENGTH = 200;

/** How many unresolvable link targets the preview names one by one. */
export const OBSIDIAN_PREVIEW_SAMPLE_LIMIT = 20;

export const obsidianExternalId = (path: string): string => {
  const key = `${OBSIDIAN_EXTERNAL_ID_PREFIX}${path}`;
  if (key.length <= MAX_EXTERNAL_ID_LENGTH) return key;
  // A path longer than the field is rare and must still be STABLE across runs,
  // because the whole point of the key is that a second run recognises it. The
  // tail is what differs between deep siblings, so the head is what gives way.
  const tail = path.slice(
    -(MAX_EXTERNAL_ID_LENGTH - OBSIDIAN_EXTERNAL_ID_PREFIX.length - 1),
  );
  return `${OBSIDIAN_EXTERNAL_ID_PREFIX}…${tail}`;
};

export interface ObsidianFolderPlan {
  /** The vault-relative directory path — the identity a re-run matches on. */
  readonly key: string;
  readonly name: string;
  readonly parentKey?: string;
  /** Present means an existing folder was MATCHED; absent means it is CREATED. */
  readonly existingId?: string;
}

export interface ObsidianNotePlan {
  readonly path: string;
  readonly externalId: string;
  readonly title: string;
  readonly folderKey?: string;
  /** Present means this file was already imported and only its body is rewritten. */
  readonly existingId?: string;
  /** Present when the stored title no longer matches the file name. */
  readonly storedTitle?: string;
  readonly content: readonly MarkdownImportNode[];
}

export type ObsidianSkipReason = "too_large" | "unreadable";

export interface ObsidianSkippedFile {
  readonly path: string;
  readonly reason: ObsidianSkipReason;
}

export interface ObsidianImportCounts {
  readonly files: number;
  readonly notesCreated: number;
  readonly notesMatched: number;
  readonly foldersCreated: number;
  readonly foldersMatched: number;
  readonly links: number;
  readonly linksToNotes: number;
  readonly linksToRecords: number;
  readonly linksUnresolved: number;
  readonly titlesDiverged: number;
  readonly skipped: number;
}

export interface ObsidianImportPlan {
  readonly folders: readonly ObsidianFolderPlan[];
  readonly notes: readonly ObsidianNotePlan[];
  readonly skipped: readonly ObsidianSkippedFile[];
  /** Distinct link targets nothing resolves to, sorted, bounded for a preview. */
  readonly unresolvedTargets: readonly string[];
  readonly counts: ObsidianImportCounts;
  /** What the vault CONTAINS that this model cannot express, counted. */
  readonly constructs: MarkdownImportConstructCounts;
}

type LinkAnswer =
  | { readonly kind: "note"; readonly path: string }
  | {
      readonly kind: "record";
      readonly targetKind: string;
      readonly targetId: string;
    }
  | { readonly kind: "unresolved" };

const directoryOf = (path: string): string => {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
};

const baseNameOf = (path: string): string => {
  const cut = path.lastIndexOf("/");
  return (cut === -1 ? path : path.slice(cut + 1)).replace(/\.md$/iu, "");
};

const titleOf = (path: string): string => {
  const base = baseNameOf(path).trim();
  return base.length === 0 ? "Untitled" : base.slice(0, MAX_TITLE_LENGTH);
};

/**
 * A lookup with THREE answers, not two: this one, several, or none.
 *
 * A key two files claim resolves to `ambiguous` rather than to the first
 * claimant — the vault requirement includes duplicate titles in different
 * folders, and picking one would point half of somebody's links at the wrong
 * note with nothing saying it happened.
 *
 * `ambiguous` and `undefined` are kept APART on purpose, and that distinction
 * is load-bearing rather than tidy: collapsed into one `undefined`, a vault
 * holding two files called `Kickoff` and a workspace holding a Project called
 * `Kickoff` resolved `[[Kickoff]]` to the PROJECT — the ambiguity fell through
 * into the record search, and the rule that a note in the vault wins over a
 * record of the same name inverted in exactly the case it exists for.
 */
type VaultLookup =
  | { readonly kind: "one"; readonly path: string }
  | { readonly kind: "ambiguous" }
  | undefined;

const uniqueIndex = <Value>(
  entries: readonly (readonly [string, Value])[],
): Map<string, Value | "ambiguous"> => {
  const found = new Map<string, Value | "ambiguous">();
  for (const [key, value] of entries) {
    if (found.has(key)) found.set(key, "ambiguous");
    else found.set(key, value);
  }
  return found;
};

/**
 * What a `[[link]]` names, inside the vault.
 *
 * ONE lookup, built once and used by both the plan and the run. Path before
 * base name and exact before case-insensitive, because that is Obsidian's own
 * order: a link with a slash names a path, a bare one names a file anywhere in
 * the vault, and both are matched without regard to case.
 *
 * Keyed on the raw string, never on a folded one. `ł` HAS NO NFD
 * DECOMPOSITION — folding two lines of this kind made a query in this wave
 * return ZERO at every size — so `Wdrożenie.md` and `[[Wdrożenie]]` are
 * compared as they were written.
 */
const vaultIndex = (
  paths: readonly string[],
): ((target: string) => VaultLookup) => {
  const withoutExtension = (path: string): string =>
    path.replace(/\.md$/iu, "");
  const byPath = uniqueIndex(
    paths.map((path) => [withoutExtension(path), path] as const),
  );
  const byBase = uniqueIndex(
    paths.map((path) => [baseNameOf(path), path] as const),
  );
  const byPathLower = uniqueIndex(
    paths.map((path) => [withoutExtension(path).toLowerCase(), path] as const),
  );
  const byBaseLower = uniqueIndex(
    paths.map((path) => [baseNameOf(path).toLowerCase(), path] as const),
  );
  return (target: string): VaultLookup => {
    const normalised = target.replace(/^\.?\//u, "").replace(/\.md$/iu, "");
    const found =
      byPath.get(normalised) ??
      byBase.get(normalised) ??
      byPathLower.get(normalised.toLowerCase()) ??
      byBaseLower.get(normalised.toLowerCase());
    if (found === undefined) return undefined;
    return found === "ambiguous"
      ? { kind: "ambiguous" }
      : { kind: "one", path: found };
  };
};

const emptyConstructs = (): Record<MarkdownImportConstruct, number> =>
  Object.fromEntries(
    MARKDOWN_IMPORT_CONSTRUCTS.map((construct) => [construct, 0]),
  ) as Record<MarkdownImportConstruct, number>;

/**
 * The whole plan, computed from the files and one read of what already exists.
 * ISSUES NO COMMAND AND WRITES NOTHING — the prototype's own words for this
 * screen are "a vault is read where it stands", and the scan has to be able to
 * say what would happen before it does.
 */
export const planObsidianImport = (
  files: readonly ObsidianVaultFile[],
  ports: ObsidianImportPorts,
): ObsidianImportPlan => {
  const existing = ports.readExisting();
  const constructs = emptyConstructs();
  const skipped: ObsidianSkippedFile[] = [];

  // -- parse every file once ------------------------------------------------
  const parsedFiles = new Map<
    string,
    {
      readonly content: readonly MarkdownImportNode[];
      readonly links: readonly MarkdownImportWikilink[];
    }
  >();
  for (const file of [...files].sort((left, right) =>
    left.path.localeCompare(right.path),
  )) {
    const result = parseMarkdownImport(file.text);
    // VALIDATED HERE, at plan time, with every link left as its own text —
    // which is the LONGEST the note can be, since a resolved reference is an
    // atom carrying no characters. A note the validator refuses is named in
    // the preview instead of failing half way through a two-hundred-note run.
    try {
      parseStructuredDocument({
        schemaVersion: STRUCTURED_DOCUMENT_SCHEMA_VERSION,
        type: "doc",
        content: resolveMarkdownImport(result.content, () => ({
          kind: "unresolved",
        })).content,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      skipped.push({
        path: file.path,
        reason:
          message === "DOCUMENT_TEXT_SIZE_INVALID" ||
          message === "DOCUMENT_STRUCTURED_SIZE_INVALID"
            ? "too_large"
            : "unreadable",
      });
      continue;
    }
    for (const construct of MARKDOWN_IMPORT_CONSTRUCTS)
      constructs[construct] += result.observed[construct];
    parsedFiles.set(file.path, {
      content: result.content,
      links: result.wikilinks,
    });
  }

  // -- the vault's own index, for note→note links ---------------------------
  const paths = [...parsedFiles.keys()];
  const inVault = vaultIndex(paths);

  const answers = new Map<string, LinkAnswer>();
  const answerFor = (target: string): LinkAnswer => {
    const known = answers.get(target);
    if (known !== undefined) return known;
    const found = inVault(target);
    // AMBIGUOUS STOPS HERE. Falling through to the record search would let a
    // Project called `Kickoff` answer for a link that names two files called
    // `Kickoff`, which is worse than not resolving it: it is confidently wrong.
    const answer: LinkAnswer =
      found?.kind === "ambiguous"
        ? { kind: "unresolved" }
        : found !== undefined
          ? { kind: "note", path: found.path }
          : (() => {
              // Only then a RECORD: a link naming a project, a person or a note
              // that is already here rather than in the vault. Exact name, or
              // nothing — see `resolveRecord`.
              const record = ports.resolveRecord(target);
              return record === undefined
                ? ({ kind: "unresolved" } as const)
                : ({
                    kind: "record",
                    targetKind: record.targetKind,
                    targetId: record.targetId,
                  } as const);
            })();
    answers.set(target, answer);
    return answer;
  };

  // -- folders, by path ------------------------------------------------------
  //
  // A `Folder` carries no `externalId` — it lives in its own table and a source
  // key there would cost a migration and a uniqueness index for a case that
  // only bites on a re-run after a rename. So a re-run matches on the PATH,
  // which is deterministic because the importer takes a folder's name straight
  // from the directory's. THE CONSEQUENCE IS REAL AND IS SHOWN, NOT HIDDEN:
  // rename a folder inside Constellation and a re-run makes a second tree
  // beside it, which is why the plan says how many folders are matched and how
  // many are created rather than reporting one total.
  const existingByParent = new Map<string, ObsidianExistingFolder[]>();
  for (const folder of existing.folders) {
    const parent = folder.parentFolderId ?? "";
    existingByParent.set(parent, [
      ...(existingByParent.get(parent) ?? []),
      folder,
    ]);
  }
  const matchFolder = (
    parentId: string | undefined,
    name: string,
  ): ObsidianExistingFolder | undefined =>
    [...(existingByParent.get(parentId ?? "") ?? [])]
      .sort((left, right) => left.id.localeCompare(right.id))
      .find((folder) => folder.name === name);

  const directories = new Set<string>();
  for (const path of paths) {
    let directory = directoryOf(path);
    while (directory !== "") {
      directories.add(directory);
      directory = directoryOf(directory);
    }
  }
  const folders: ObsidianFolderPlan[] = [];
  const folderIdByKey = new Map<string, string>();
  let foldersMatched = 0;
  for (const key of [...directories].sort(
    (left, right) =>
      left.split("/").length - right.split("/").length ||
      left.localeCompare(right),
  )) {
    const parentKey = directoryOf(key);
    const name = key
      .slice(parentKey === "" ? 0 : parentKey.length + 1)
      .slice(0, MAX_FOLDER_NAME_LENGTH);
    const parentId =
      parentKey === "" ? undefined : folderIdByKey.get(parentKey);
    // A folder whose parent is itself new cannot match anything, and asking
    // would match a same-named folder at the ROOT — the bug that turns
    // `Clients/Falcon` into a match for a top-level `Falcon`.
    const matched =
      parentKey === "" || parentId !== undefined
        ? matchFolder(parentId, name)
        : undefined;
    if (matched !== undefined) {
      folderIdByKey.set(key, matched.id);
      foldersMatched += 1;
    }
    folders.push({
      key,
      name,
      ...(parentKey === "" ? {} : { parentKey }),
      ...(matched === undefined ? {} : { existingId: matched.id }),
    });
  }

  // -- notes -----------------------------------------------------------------
  const documentByExternalId = new Map(
    existing.documents.flatMap((document) =>
      document.externalId === undefined
        ? []
        : [[document.externalId, document] as const],
    ),
  );
  const notes: ObsidianNotePlan[] = [];
  let notesMatched = 0;
  let titlesDiverged = 0;
  let links = 0;
  let linksToNotes = 0;
  let linksToRecords = 0;
  let linksUnresolved = 0;
  const unresolvedTargets = new Set<string>();

  for (const path of paths) {
    const parsedFile = parsedFiles.get(path)!;
    const externalId = obsidianExternalId(path);
    const known = documentByExternalId.get(externalId);
    const title = titleOf(path);
    const folderKey = directoryOf(path);
    if (known !== undefined) {
      notesMatched += 1;
      // THERE IS NO `document.rename`. A note whose file was renamed in the
      // vault keeps the title Constellation already holds; only its body is
      // rewritten. Reported rather than papered over — inventing a command in
      // an import lot is how a domain change arrives without a decision.
      if (known.title !== title) titlesDiverged += 1;
    }
    for (const link of parsedFile.links) {
      links += 1;
      const answer = answerFor(link.target);
      if (answer.kind === "note") linksToNotes += 1;
      else if (answer.kind === "record") linksToRecords += 1;
      else {
        linksUnresolved += 1;
        unresolvedTargets.add(link.target);
      }
    }
    notes.push({
      path,
      externalId,
      title,
      ...(folderKey === "" ? {} : { folderKey }),
      ...(known === undefined ? {} : { existingId: known.id }),
      ...(known === undefined || known.title === title
        ? {}
        : { storedTitle: known.title }),
      content: parsedFile.content,
    });
  }

  return {
    folders,
    notes,
    skipped,
    unresolvedTargets: [...unresolvedTargets]
      .sort((left, right) => left.localeCompare(right))
      .slice(0, OBSIDIAN_PREVIEW_SAMPLE_LIMIT),
    counts: {
      files: files.length,
      notesCreated: notes.length - notesMatched,
      notesMatched,
      foldersCreated: folders.length - foldersMatched,
      foldersMatched,
      links,
      linksToNotes,
      linksToRecords,
      linksUnresolved,
      titlesDiverged,
      skipped: skipped.length,
    },
    constructs,
  };
};

/**
 * The plan's own answer for one link, reused by the apply pass so the preview
 * and the run cannot disagree about what a link becomes.
 */
const resolutionFor = (
  plan: ObsidianImportPlan,
  ports: ObsidianImportPorts,
  documentIdByPath: ReadonlyMap<string, string>,
) => {
  // THE SAME `vaultIndex` THE PLAN USED. Two spellings of one lookup is how a
  // preview and a run come to disagree about what a link becomes, which is the
  // restated-shape defect this repository has now paid for in four waves.
  const inVault = vaultIndex(plan.notes.map((note) => note.path));
  const cache = new Map<string, MarkdownImportResolution>();
  return (link: MarkdownImportWikilink): MarkdownImportResolution => {
    const known = cache.get(link.target);
    if (known !== undefined) return known;
    const found = inVault(link.target);
    const record =
      found === undefined
        ? ports.resolveRecord(link.target)
        : found.kind === "ambiguous"
          ? // Same rule as the plan's, and it MUST be the same rule: a preview
            // that counted an ambiguous link as unresolved while the run
            // resolved it to a record would be two answers for one link.
            undefined
          : (() => {
              const id = documentIdByPath.get(found.path);
              // A note whose creation was refused resolves to NOTHING rather
              // than to whatever a record search would find under its name.
              return id === undefined
                ? undefined
                : { targetKind: "document", targetId: id };
            })();
    const answer: MarkdownImportResolution =
      record === undefined
        ? { kind: "unresolved" }
        : { kind: "reference", ...record };
    cache.set(link.target, answer);
    return answer;
  };
};

/** The plain text of a structured document, for the search projection. */
const documentText = (document: StructuredDocument): string => {
  const visit = (node: StructuredDocumentNode): string =>
    node.type === "text"
      ? (node.text ?? "")
      : structuredDocumentNodeText(
          node.type,
          (node.content ?? []).map(visit),
          (name) => {
            const value = node.attrs?.[name];
            return value === undefined || value === null
              ? undefined
              : String(value);
          },
        );
  return document.content.map(visit).join("\n");
};

export interface ObsidianImportResult {
  readonly foldersCreated: number;
  readonly foldersMatched: number;
  readonly notesCreated: number;
  readonly notesMatched: number;
  readonly bodiesWritten: number;
  readonly bodiesFailed: number;
  readonly linksResolved: number;
  readonly linksUnresolved: number;
  readonly titlesDiverged: number;
  readonly skipped: number;
}

export interface ObsidianImportApplyInput {
  readonly service: DesktopKernelService;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly plan: ObsidianImportPlan;
  readonly ports: ObsidianImportPorts;
  readonly writeContent: (input: {
    readonly documentId: string;
    readonly spaceId: SpaceId;
    readonly text: string;
    readonly content: StructuredDocument;
  }) => void;
  readonly correlationId?: string;
  readonly newId?: () => string;
}

/**
 * PASS ONE then PASS TWO, against the real command layer.
 *
 * Nothing here throws on a refusal. A run that stops half way is a normal
 * outcome for two hundred files — a full disk, a folder removed underneath it
 * — and the import is IDEMPOTENT precisely so the answer to that is "run it
 * again": every note already made is recognised by its source key and only its
 * body is rewritten. Aborting instead would turn a recoverable partial run into
 * one where nobody knows which half landed.
 */
export const applyObsidianImport = (
  input: ObsidianImportApplyInput,
): ObsidianImportResult => {
  const newId = input.newId ?? (() => randomUUID());
  const correlationId = input.correlationId ?? newId();
  const send = (
    commandName: string,
    payload: Record<string, unknown>,
    key: string,
  ) => {
    const response = input.service.execute(
      CommandEnvelopeSchema.parse({
        contractVersion: 1,
        commandName,
        commandId: newId(),
        workspaceId: input.workspaceId,
        idempotencyKey: `obsidian:${correlationId}:${key}`,
        expectedVersions: {},
        correlationId,
        payload,
      }),
    );
    return response.kind === "command_outcome" ? response.outcome : undefined;
  };

  // -- pass one, folders -----------------------------------------------------
  const folderIdByKey = new Map<string, string>();
  let foldersCreated = 0;
  let foldersMatched = 0;
  for (const folder of input.plan.folders) {
    if (folder.existingId !== undefined) {
      folderIdByKey.set(folder.key, folder.existingId);
      foldersMatched += 1;
      continue;
    }
    const parentFolderId =
      folder.parentKey === undefined
        ? undefined
        : folderIdByKey.get(folder.parentKey);
    // A child whose parent was refused is not created at the ROOT instead:
    // that would scatter a subtree across the top of somebody's Library with
    // nothing saying why.
    if (folder.parentKey !== undefined && parentFolderId === undefined)
      continue;
    const folderId = newId();
    const outcome = send(
      "folder.create",
      {
        folderId,
        spaceId: input.spaceId,
        name: folder.name,
        ...(parentFolderId === undefined ? {} : { parentFolderId }),
      },
      `folder:${folder.key}`,
    );
    if (outcome?.outcome !== "success") continue;
    folderIdByKey.set(folder.key, folderId);
    foldersCreated += 1;
  }

  // -- pass one, notes -------------------------------------------------------
  const documentIdByPath = new Map<string, string>();
  let notesCreated = 0;
  let notesMatched = 0;
  for (const note of input.plan.notes) {
    if (note.existingId !== undefined) {
      documentIdByPath.set(note.path, note.existingId);
      notesMatched += 1;
      continue;
    }
    const folderId =
      note.folderKey === undefined
        ? undefined
        : folderIdByKey.get(note.folderKey);
    const documentId = newId();
    const outcome = send(
      "document.create",
      {
        documentId,
        spaceId: input.spaceId,
        title: note.title,
        externalId: note.externalId,
        role: "note",
        ...(folderId === undefined ? {} : { folderId }),
      },
      `note:${note.path}`,
    );
    if (outcome?.outcome === "success") {
      documentIdByPath.set(note.path, documentId);
      notesCreated += 1;
      continue;
    }
    // `record.already_exists` names the note holding this source key, and its
    // id is the whole point of the refusal: the plan was read before another
    // run — or another half of this one — got there. Adopt it and write the
    // body, rather than minting a second id for one file.
    if (
      outcome?.outcome === "conflict" &&
      outcome.diagnosticCode === "record.already_exists"
    ) {
      const claimed = Object.keys(outcome.currentVersions ?? {})[0];
      if (claimed !== undefined) {
        documentIdByPath.set(note.path, claimed);
        notesMatched += 1;
      }
    }
  }

  // -- pass two, links and bodies -------------------------------------------
  const resolve = resolutionFor(input.plan, input.ports, documentIdByPath);
  let bodiesWritten = 0;
  let bodiesFailed = 0;
  let linksResolved = 0;
  let linksUnresolved = 0;
  for (const note of input.plan.notes) {
    const documentId = documentIdByPath.get(note.path);
    if (documentId === undefined) continue;
    const resolved = resolveMarkdownImport(note.content, resolve);
    linksResolved += resolved.resolved;
    linksUnresolved += resolved.unresolved;
    try {
      const document = parseStructuredDocument({
        schemaVersion: STRUCTURED_DOCUMENT_SCHEMA_VERSION,
        type: "doc",
        content: resolved.content,
      });
      input.writeContent({
        documentId,
        spaceId: input.spaceId,
        text: documentText(document),
        content: document,
      });
      bodiesWritten += 1;
    } catch {
      bodiesFailed += 1;
    }
  }

  return {
    foldersCreated,
    foldersMatched,
    notesCreated,
    notesMatched,
    bodiesWritten,
    bodiesFailed,
    linksResolved,
    linksUnresolved,
    titlesDiverged: input.plan.counts.titlesDiverged,
    skipped: input.plan.skipped.length,
  };
};
