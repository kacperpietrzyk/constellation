import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { DocumentId, FolderId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  createDocument,
  renameDocument,
  setDocumentFolder,
  type DesktopSnapshot,
  type MutationFailure,
} from "../client/workflow.js";
import { Icon } from "../components/Icon.js";
import { InlinePopover } from "../components/InlinePopover.js";
import type { DocumentEntityTargetKind } from "../document-entity-reference.js";
import { TopicHelp } from "../help/TopicHelp.js";
import { formatDate } from "../i18n.js";
import {
  ALL_NOTES,
  UNFILED,
  folderPath,
  folderTreeOrder,
  isUnfiled,
  notesInSelection,
  type FolderSummary,
  type TreeSelection,
} from "./folder-tree.js";
import {
  readExpandedFolders,
  writeExpandedFolders,
} from "./folder-expansion.js";
import { FolderTree } from "./FolderTree.js";
import { KnowledgeEditor } from "./KnowledgeEditor.js";
import {
  EvidenceMotif,
  roleAccusativeCopy,
  roleCopy,
} from "./library-chrome.js";
import {
  arrangeNotes,
  noteArrangementLabel,
  noteArrangements,
  type ArrangeableNote,
  type NoteArrangement,
} from "./note-arrangement.js";
import styles from "./notes.module.css";

// THE NOTES READING — three panels: folder tree │ list │ what you are reading.
//
// DECISION #30 IS THE ONE THIS FILE CARRIES, and its hard requirement is small
// to state and easy to lose: NOTES IS THE WHOLE LIBRARY, NOT A LEFTOVERS BOX.
// At the `All notes` root every note is on the list — the ones attached to a
// project beside the loose ones — and selecting a folder shows that folder AND
// everything below it, so the list is never narrower than the counter beside
// it. Decision #34 is the other half: none of this tree is in the sidebar; it
// lives here and only here.
//
// WHAT THE SWITCHER MUST NOT CHANGE is the property with the most ways to break
// and the fewest ways to notice: the reading pane. `selectedId` is state of THIS
// component and the arrangement is state beside it — the pane reads the former
// and never the latter, so rotating the list cannot move what you are reading.
//
// The list markup keeps `.knowledge-document-list > li` deliberately: the
// layout gate counts exactly that selector to prove it measured a Library that
// had rows in it, and a screen that renames the class while the gate keeps
// counting reports "no overflow" over a list it never saw.

type KnowledgeDocument = Extract<
  DesktopSnapshot["knowledge"],
  { kind: "ready" }
>["data"]["documents"][number];

interface NoteRow extends ArrangeableNote {
  readonly role: "note" | "document" | "deliverable";
}

const MOVE_TO_UNFILED = "unfiled" as const;

export const NotesReading = ({
  client,
  snapshot,
  activeDocumentId,
  actionHost,
  inspectorHost,
  onInspectorOpen,
  onEntityActivate,
  onReload,
  onFailure,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly activeDocumentId?: DocumentId | undefined;
  readonly inspectorHost: HTMLElement | null;
  /** Węzeł w paśmie tytułu powłoki, do którego ten odczyt wstrzykuje SWOJĄ
   *  akcję główną. `null`, dopóki powłoka go nie zamontuje — patrz nota przy
   *  portalu niżej. Ten sam kształt co `inspectorHost` obok. */
  readonly actionHost: HTMLElement | null;
  readonly onInspectorOpen: () => void;
  readonly onEntityActivate: (target: {
    readonly targetKind: DocumentEntityTargetKind;
    readonly targetId: string;
  }) => void;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
}) => {
  const items =
    snapshot.documents.kind === "ready" ? snapshot.documents.data.items : [];
  const knowledge =
    snapshot.knowledge.kind === "ready" ? snapshot.knowledge.data : undefined;
  const folders: readonly FolderSummary[] = knowledge?.folders ?? [];
  const summaries: readonly KnowledgeDocument[] = knowledge?.documents ?? [];
  const workspaceId = snapshot.bootstrap.workspace.id;
  /**
   * WHERE EVERY NOTE LIVES AND WHAT IT IS ABOUT COME FROM ONE READ, and when
   * that read is refused the screen must say so rather than answer anyway.
   *
   * Without this branch a denied `knowledge.list` drew a tree of two roots and
   * put EVERY note under `Unfiled` — because a note with no folder and a note
   * whose folder this reader may not see are indistinguishable once the folder
   * list is empty. That is a screen stating something false about the data,
   * which is worse than a screen that renders nothing: nobody re-checks a
   * number that looks like an answer. The notes themselves still come from
   * `document.list` and are still readable, so the reading survives and only
   * the claims about structure are withdrawn.
   */
  const structureReadable = snapshot.knowledge.kind === "ready";

  // ONE ROW PER NOTE, built from the two reads the screen already has.
  // `document.list` is the authoritative membership (it is what the editor
  // opens from); `knowledge.list` carries the folder, the references and the
  // timestamps the arrangement needs.
  const notes: readonly NoteRow[] = useMemo(() => {
    const byId = new Map(summaries.map((summary) => [summary.id, summary]));
    return items.map((item) => {
      const summary = byId.get(item.id);
      return {
        id: item.id,
        title: item.title,
        role: item.role,
        ...(summary?.folderId === undefined
          ? item.folderId === undefined
            ? {}
            : { folderId: item.folderId }
          : { folderId: summary.folderId }),
        references: summary?.references ?? [],
        updatedAt: summary?.updatedAt ?? item.updatedAt,
      };
    });
  }, [items, summaries]);

  const [selection, setSelection] = useState<TreeSelection>(ALL_NOTES);
  const [arrangement, setArrangement] = useState<NoteArrangement>("folder");
  const [expanded, setExpanded] = useState<ReadonlySet<FolderId>>(() =>
    readExpandedFolders(workspaceId, folders),
  );
  const [selectedId, setSelectedId] = useState<DocumentId | undefined>();
  const [newTitle, setNewTitle] = useState("");
  const [newRole, setNewRole] = useState<"note" | "document" | "deliverable">(
    "note",
  );
  const [creating, setCreating] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const [moving, setMoving] = useState<DocumentId | undefined>();
  const dragged = useRef<DocumentId | undefined>(undefined);

  // The tree arrives with the projection, so the default expansion cannot be
  // computed before the first read lands. Recomputed only while nothing is
  // stored — a reader who has collapsed things keeps their tree when a folder
  // is added.
  const settled = useRef(false);
  useEffect(() => {
    if (settled.current || folders.length === 0) return;
    settled.current = true;
    setExpanded(readExpandedFolders(workspaceId, folders));
  }, [folders, workspaceId]);

  const inView = notesInSelection(
    notes,
    folders,
    structureReadable ? selection : ALL_NOTES,
  );
  // ONE UNGROUPED SECTION when the structure read is refused, rather than the
  // `Folder` arrangement over an empty folder list — that arrangement would put
  // every note under `Unfiled`, which is the false claim this branch exists to
  // avoid making.
  const groups = structureReadable
    ? arrangeNotes(arrangement, inView, folders, Date.now())
    : [{ key: ALL_NOTES, label: "All notes", items: inView }];

  // WHAT IS BEING READ, and why it is not simply `items[0]`. The reader opens on
  // the newest note that is actually in this node, so the pane never shows
  // something absent from the list beside it. A pane opened on nothing is also
  // what let the layout gate measure this screen without ever drawing the
  // writing plane.
  const openId =
    selectedId !== undefined && inView.some((note) => note.id === selectedId)
      ? selectedId
      : [...inView].sort((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt),
        )[0]?.id;
  const open = items.find((item) => item.id === openId);

  useEffect(() => {
    if (
      activeDocumentId !== undefined &&
      items.some((item) => item.id === activeDocumentId)
    ) {
      setSelectedId(activeDocumentId);
      setSelection(ALL_NOTES);
    }
  }, [activeDocumentId, items]);

  const inspectorControls = inspectorHost
    ? { "aria-controls": "document-inspector-detail" }
    : {};

  const toggleFolder = (folderId: FolderId, opened: boolean) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (opened) next.add(folderId);
      else next.delete(folderId);
      writeExpandedFolders(workspaceId, next);
      return next;
    });
  };

  // ONE OPERATION, TWO ENTRIES — a drag onto a tree node and a control on the
  // row. `null` is Unfiled and reaches the kernel as `null`: it is a placement,
  // not a missing value, and a wrapper that swallowed it would make taking a
  // note out of a folder impossible while every test still passed.
  const moveNote = (noteId: DocumentId, folderId: FolderId | null) => {
    const summary = summaries.find((candidate) => candidate.id === noteId);
    const item = items.find((candidate) => candidate.id === noteId);
    const version = summary?.version ?? item?.version;
    if (!client || version === undefined) return;
    setMoving(undefined);
    void setDocumentFolder(
      client,
      snapshot,
      { id: noteId, version },
      folderId,
    ).then(async (result) => {
      if (result.kind !== "success") return onFailure(result);
      await onReload();
    });
  };

  // THE OTHER THING THAT CAN BE DONE TO A NOTE FROM THIS SCREEN, and it lives
  // here rather than in the pane that draws the control for one reason: the
  // note's version. `moveNote` above resolves it as `knowledge.list` first and
  // `document.list` second, and the pane holds only the second of those two
  // reads — a rename resolving the version differently from a move would send
  // a stale number and come back as a conflict over a record nobody else
  // touched. One resolution, used by both writes.
  //
  // A title the note already carries is SENT, not swallowed. The kernel
  // accepts it on purpose (`wave2.ts`, `document.rename`) so that a retried
  // write does not fail on a workspace that already applied it, and an
  // interface that refused it here would be restating a rule the domain
  // deliberately declined to make.
  const renameNote = async (
    noteId: DocumentId,
    title: string,
  ): Promise<boolean> => {
    const summary = summaries.find((candidate) => candidate.id === noteId);
    const item = items.find((candidate) => candidate.id === noteId);
    const version = summary?.version ?? item?.version;
    if (!client || version === undefined) return false;
    const result = await renameDocument(
      client,
      snapshot,
      { id: noteId, version },
      title,
    );
    if (result.kind !== "success") {
      onFailure(result);
      return false;
    }
    await onReload();
    return true;
  };

  const selectionLabel =
    selection === ALL_NOTES
      ? "All notes"
      : selection === UNFILED
        ? "Unfiled"
        : folderPath(folders, selection);

  return (
    <div className={styles.notes} data-notes-screen="">
      {structureReadable ? (
        <FolderTree
          expanded={expanded}
          folders={folders}
          notes={notes}
          onDropNote={(folderId) => {
            const noteId = dragged.current;
            dragged.current = undefined;
            if (noteId !== undefined) moveNote(noteId, folderId);
          }}
          onSelect={setSelection}
          onToggle={toggleFolder}
          selection={selection}
        />
      ) : (
        <div className={styles.treePanel} data-structure-unavailable="">
          <div className={styles.panelHead}>
            <h2>Folders</h2>
          </div>
          <p className="inline-error">
            Folders are not available in this scope.
          </p>
        </div>
      )}

      <section aria-label="Notes" className={styles.listPanel}>
        {/* FAZA D, LOT D3, WPIS #34 — JEDEN RZĄD GŁOWY, NIE TRZY PIĘTRA.
            Prototyp: `v3/screens/knowledge.js:812-815` — `.kn-side-head`
            niesie ŚCIEŻKĘ WĘZŁA i licznik, i nic więcej; wyzwalacz pomocy stoi
            w tym samym rzędzie tam, gdzie ten ekran go ma (`:807`). Znika
            mikroetykieta „Notes" nad tytułem — nazwę odczytu mówi zakładka
            obiektywu nad kolumną, więc powtarzała ją drugi raz kosztem piętra —
            i znika osobny wiersz linku pomocy, bo wyzwalacz przenosi się TUTAJ.

            DLACZEGO POMOC MIEŚCI SIĘ DOPIERO TERAZ: zmierzone przy 1440 px,
            rząd narzędzi ma 279 px treści, a przełącznik (179 px) i wyzwalacz
            (139 px) razem chcą 326 px — więc pomoc łamała się do własnej linii.
            W głowie kolumny sąsiadem jest tytuł złożony `--text-2xs` i para
            mieści się w jednym rzędzie. */}
        <div className={styles.panelHead}>
          <div className={styles.panelTitle}>
            <h2>{structureReadable ? selectionLabel : "All notes"}</h2>
            {structureReadable ? <TopicHelp topic="note-arrangement" /> : null}
          </div>
          {/* The count of THIS list, which is why it agrees with the counter on
              the tree node beside it: both include descendant folders. The
              global class keeps the shared rule's single owner; the module class
              flattens the pill for this screen only. */}
          <span className={`library-count ${styles.headCount}`}>
            {inView.length}
          </span>
        </div>

        <div className={styles.listTools}>
          {/* The switcher is withdrawn with the read it arranges: two of its
              three axes are folders and references, and the third would be a
              lone control where a group of three is the affordance. */}
          {structureReadable ? (
            <div
              aria-label="Arrange notes by"
              className={styles.arrangement}
              role="group"
            >
              {noteArrangements.map((mode) => (
                <button
                  aria-pressed={arrangement === mode}
                  className={styles.arrangementButton}
                  data-arrangement={mode}
                  key={mode}
                  onClick={() => setArrangement(mode)}
                  type="button"
                >
                  {noteArrangementLabel[mode]}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* ITS OWN NAMED REGION, and it keeps the name the shipped screen had.
            The create path is discoverable by its accessible name rather than
            by where it happens to sit, which is what makes it findable when
            the panels collapse and the toolbar wraps.

            FAZA C, LOT C2 — REGION PRZENIÓSŁ SIĘ DO PASMA TYTUŁU, przez portal,
            i to jest zmiana MIEJSCA, nie nazwy: `aria-label` zostaje ten sam,
            zostaje ten sam wyzwalacz, ten sam dymek i ten sam formularz.
            Prototyp stawia tę akcję jako drugi argument crumbbara
            (`v3/screens/knowledge.js:802-804`, `btn("New note", { cls:
            "primary", icon: "plus" })`, malowane `v3/app.css:321-332`),
            a rejestr notuje o tym ekranie, że nie ma na nim ANI JEDNEJ
            powierzchni wypełnionej akcentem, bo tworzenie stało bladą pigułką
            w środkowej kolumnie. Etykieta idzie za prototypem („New note"
            zamiast „New content"): pasmo mówi, co powstanie, a dymek dalej
            pozwala wybrać rolę.

            HOST MOŻE BYĆ `null` — powłoka montuje węzeł celu w tym samym
            przebiegu, w którym renderuje ten odczyt, więc pierwsze przejście
            nie ma jeszcze dokąd wstrzykiwać. Wtedy nie rysuje się NIC, a nie
            rysuje się kopia w starym miejscu: dwa wyzwalacze o tej samej
            nazwie to dwie akcje główne na jednym ekranie. */}
        {actionHost !== null &&
          createPortal(
            <div aria-label="Create in the library">
              <InlinePopover
                disabled={!client || creating}
                label="New note"
                onOpenChange={setOpenCreate}
                open={openCreate}
                panelLabel="Create content in the library"
                triggerClassName="primary-button"
              >
                <form
                  className="new-knowledge-form knowledge-create-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!client || !newTitle.trim() || creating) return;
                    setCreating(true);
                    void createDocument(
                      client,
                      snapshot,
                      newTitle,
                      newRole,
                      selection === ALL_NOTES || selection === UNFILED
                        ? undefined
                        : selection,
                    ).then(async (result) => {
                      setCreating(false);
                      if (result.kind !== "success") return onFailure(result);
                      setSelectedId(result.data);
                      setNewTitle("");
                      setOpenCreate(false);
                      await onReload();
                    });
                  }}
                >
                  <label htmlFor="knowledge-title">New content</label>
                  <input
                    id="knowledge-title"
                    maxLength={500}
                    name="knowledgeTitle"
                    onChange={(event) => setNewTitle(event.target.value)}
                    placeholder="Note or deliverable title"
                    required
                    value={newTitle}
                  />
                  <div
                    aria-label="Content kind"
                    className="role-options"
                    role="group"
                  >
                    {(Object.keys(roleCopy) as (keyof typeof roleCopy)[]).map(
                      (role) => (
                        <button
                          aria-pressed={newRole === role}
                          key={role}
                          onClick={() => setNewRole(role)}
                          type="button"
                        >
                          {roleCopy[role]}
                        </button>
                      ),
                    )}
                  </div>
                  <button className="primary-button" disabled={creating}>
                    Create {roleAccusativeCopy[newRole]}
                  </button>
                </form>
              </InlinePopover>
            </div>,
            actionHost,
          )}

        <div className={styles.listScroll}>
          {snapshot.documents.kind === "unavailable" ? (
            <p className="inline-error">
              Content is not available in this scope.
            </p>
          ) : groups.length === 0 ? (
            <div className="library-empty">
              <p>Nothing here yet. Drag a note onto a folder to file it.</p>
            </div>
          ) : (
            groups.map((group) => (
              <section className={styles.group} key={group.key}>
                <h3 className={styles.groupHead}>
                  <span className={styles.groupLabel}>{group.label}</span>
                  {group.sub === undefined ? null : (
                    <span className={styles.groupSub}>{group.sub}</span>
                  )}
                  <span className={styles.groupCount}>
                    {group.items.length}
                  </span>
                </h3>
                <ul className="knowledge-document-list">
                  {group.items.map((note) => {
                    const active = open?.id === note.id;
                    const where = isUnfiled(note, folders)
                      ? "Unfiled"
                      : folderPath(folders, note.folderId as FolderId);
                    return (
                      <li key={`${group.key}:${note.id}`}>
                        <button
                          aria-current={active ? "page" : undefined}
                          className={active ? "active" : ""}
                          data-note-id={note.id}
                          draggable
                          onClick={() => {
                            setSelectedId(note.id);
                            onInspectorOpen();
                          }}
                          onDragEnd={() => {
                            // THE GESTURE ENDING IS NOT THE SAME AS A DROP.
                            // Without this the note stayed armed after an
                            // abandoned drag, and the next drop on ANY tree
                            // node — including one the operating system
                            // delivers for a file dragged in from outside —
                            // would file a note nobody had picked up.
                            dragged.current = undefined;
                          }}
                          onDragStart={() => {
                            dragged.current = note.id;
                          }}
                          {...inspectorControls}
                        >
                          <strong>{note.title}</strong>
                          <small>
                            {/* THE SWITCHER'S WHOLE VISIBLE EFFECT ON A ROW:
                                under a record heading the row says WHERE it
                                lives, because the heading already says what
                                it is about; anywhere else it says what it is
                                about, because the heading already says where
                                it lives. */}
                            {/* FAZA D, LOT D3, WPIS #35 — REFERENCJA JEST
                                OBWÓDKOWĄ PIGUŁKĄ Z GLIFEM, nie gołym napisem.
                                Prototyp: `.kn-row-in`
                                (`v3/screens/knowledge.css:182-189`) — obwódka
                                włoskowa, `--radius-full`, wyściółka
                                0.0625/0.4375 rem i glif w kolorze akcentu
                                (`:188`); nadmiar referencji stoi OBOK pigułki
                                jako `.kn-row-more` (`:190`), a nie w środku
                                jej etykiety (`v3/screens/knowledge.js:727-728`).
                                Ścieżka folderu ma w prototypie własny kształt
                                — `.kn-row-where` (`:191-195`): glif folderu bez
                                obwódki, bo to adres, a nie wyjście dokądś.

                                GLIF JEST `arrow`, NIE `into`. Prototyp rysuje
                                tam własny, lokalny `into`
                                (`v3/screens/knowledge.js:365`) i tej nazwy nie
                                ma w `components/Icon.tsx`. Dokładanie glifów
                                należy do jednego właściciela tego pliku (nota
                                w jego nagłówku) — loty ekranowe konsumują
                                nazwy — więc bierzemy `arrow`, czyli glif,
                                którym ten zestaw już mówi „to prowadzi gdzieś
                                indziej" (`v3/app.js:54`). Rozjazd zgłoszony,
                                nie przemilczany. */}
                            {arrangement === "record" ? (
                              <span className="knowledge-row-where">
                                <Icon name="folder" />
                                <span className="knowledge-row-context">
                                  {where}
                                </span>
                              </span>
                            ) : note.references.length === 0 ? (
                              <span className="knowledge-row-context">
                                {roleCopy[note.role]}
                              </span>
                            ) : (
                              <>
                                <span className="knowledge-row-ref">
                                  <Icon name="arrow" />
                                  <span className="knowledge-row-context">
                                    {note.references[0]?.label ?? ""}
                                  </span>
                                </span>
                                {note.references.length > 1 && (
                                  <span className="knowledge-row-more">
                                    +{note.references.length - 1}
                                  </span>
                                )}
                              </>
                            )}
                            {/* THE DATE GETS ITS OWN LANE, and the separator
                                dot goes with the change rather than surviving
                                it: „context · date" as one string meant the
                                ellipsis ate the date first, on the column a
                                reader scans DOWN. Two elements make the
                                separation structural, so a long reference label
                                can no longer reach it. `<time>` because the row
                                now has an element that is only the timestamp,
                                which is the first point at which the machine
                                readable value has somewhere to live. */}
                            <time
                              className="knowledge-row-when"
                              dateTime={note.updatedAt}
                            >
                              {formatDate(
                                note.updatedAt,
                                snapshot.bootstrap.workspace.timezone,
                              )}
                            </time>
                          </small>
                        </button>
                        <InlinePopover
                          disabled={!client}
                          label="Move"
                          onOpenChange={(next) =>
                            setMoving(next ? note.id : undefined)
                          }
                          open={moving === note.id}
                          panelLabel={`Move ${note.title} to a folder`}
                          triggerClassName={styles.moveTrigger ?? ""}
                        >
                          <div className={styles.moveMenu} role="group">
                            <button
                              data-move-target={MOVE_TO_UNFILED}
                              onClick={() => moveNote(note.id, null)}
                              type="button"
                            >
                              Unfiled
                            </button>
                            {/* REAL INDENTATION, not repeated spaces: the
                                prototype indented this menu with `"  ".repeat`
                                inside HTML, where runs of spaces collapse, so
                                its move menu showed no hierarchy at any depth. */}
                            {folderTreeOrder(folders).map((folder) => (
                              <button
                                data-move-target={folder.id}
                                key={folder.id}
                                onClick={() => moveNote(note.id, folder.id)}
                                style={
                                  {
                                    "--tree-depth":
                                      folderPath(folders, folder.id).split(
                                        " / ",
                                      ).length - 1,
                                  } as React.CSSProperties
                                }
                                type="button"
                              >
                                {folder.name}
                              </button>
                            ))}
                          </div>
                        </InlinePopover>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </section>

      {/* WHICH NOTE THIS PANE IS READING, said by the pane itself. It is the
          only property of the switcher worth guarding — rotating the list must
          not move what you are reading — and reading it off the editor would
          make the assertion depend on a collaborative session being up, which
          is a different thing from the screen having chosen the same note. */}
      <div className={styles.readingPanel} data-open-note-id={open?.id ?? ""}>
        {client && open ? (
          <KnowledgeEditor
            client={client}
            document={open}
            key={open.id}
            inspectorHost={inspectorHost}
            onEntityActivate={onEntityActivate}
            onFailure={onFailure}
            onReload={onReload}
            onRename={(title) => renameNote(open.id, title)}
            snapshot={snapshot}
          />
        ) : (
          <section className="knowledge-welcome">
            <EvidenceMotif />
            <h2>From source to version, without losing provenance</h2>
            <p>
              Save a source, expand it in a note, and freeze a deliverable when
              it matters.
            </p>
          </section>
        )}
      </div>
    </div>
  );
};
