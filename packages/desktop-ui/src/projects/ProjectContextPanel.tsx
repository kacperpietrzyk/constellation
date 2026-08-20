import { useState, type FormEvent, type ReactNode } from "react";

import type { SpaceId, StrategicRecordId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  createArea,
  createInitiative,
  createWorkLink,
  removeWorkLink,
  type DesktopSnapshot,
  type MutationFailure,
  type WorkOverviewProjection,
} from "../client/workflow.js";
import {
  InlinePopover,
  reportFirstEmptyRequiredField,
} from "../components/InlinePopover.js";
import { NarrativeText } from "../components/RecordNarrative.js";
import { countLabel } from "../i18n.js";
import type { WorkContextKind } from "../record-narrative.js";
import styles from "./project-context.module.css";

// Areas and initiatives, where projects live.
//
// They were on the retired work surface, which was the only place they could be
// created, browsed or linked to a project at all. The product owner's decision
// put them here: an area is a lasting responsibility and an initiative is an
// outcome to close, and both answer the same question a reader has with the
// project list in front of them — what is this work FOR.
//
// The panel is `lazy()` behind one trigger. Projects is on the hot path, so the
// screen may only gain the handle and the button; every byte of the forms, the
// rows and this stylesheet loads when somebody asks for it.

type WorkLink = WorkOverviewProjection["links"][number];

const LINK_TYPE: Record<WorkContextKind, WorkLink["linkType"]> = {
  area: "project_serves_area",
  initiative: "project_advances_initiative",
};

export const ProjectContextPanel = ({
  client,
  snapshot,
  selectedContextId,
  onSelectContext,
  onReload,
  onFailure,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly selectedContextId: string | undefined;
  readonly onSelectContext: (kind: WorkContextKind, id: string) => void;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
}) => {
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [openPopover, setOpenPopover] = useState<string>();
  const [linkProjectId, setLinkProjectId] = useState("");
  const work = snapshot.work;
  const projection = work.kind === "ready" ? work.data : undefined;

  // A rejected transport promise still lands in `onFailure` and still clears
  // busy: a control left disabled after a dropped connection reads as a broken
  // screen rather than as a failed write.
  const run = async (
    id: string,
    operation: () => Promise<{ readonly kind: string }>,
  ): Promise<boolean> => {
    if (busyIds.has(id)) return false;
    setBusyIds((current) => new Set(current).add(id));
    try {
      const result = await operation();
      if (result.kind === "success") {
        await onReload();
        // Popover forms reset by unmounting, so the panel closes only after the
        // write reports success — a failure keeps the draft on screen.
        setOpenPopover((current) => (current === id ? undefined : current));
        return true;
      }
      onFailure(result as MutationFailure);
      return false;
    } catch {
      onFailure({
        kind: "unavailable",
        message: "Could not reach the data layer. Nothing changed — try again.",
      });
      return false;
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  if (projection === undefined)
    return (
      <p className={styles.note} role="status">
        {work.kind === "unavailable"
          ? work.message
          : "The work plane could not be read, so areas and initiatives are unknown here."}
      </p>
    );

  const { areas, initiatives, projects, tasks, links } = projection;
  const contextLinks = links.filter(
    (link) =>
      link.state === "active" &&
      (link.linkType === "project_serves_area" ||
        link.linkType === "project_advances_initiative"),
  );

  const projectsServing = (contextId: string): readonly string[] =>
    contextLinks
      .filter((link) => link.targetRecordId === contextId)
      .map(
        (link) =>
          projects.find((project) => project.id === link.sourceRecordId)
            ?.title ?? "A project outside this Space’s work",
      );

  const tasksServingDirectly = (
    kind: WorkContextKind,
    contextId: StrategicRecordId,
  ): readonly string[] =>
    tasks
      .filter((task) =>
        kind === "area"
          ? task.areaIds.includes(contextId)
          : task.initiativeIds.includes(contextId),
      )
      .map((task) => task.title);

  const linksOfProject = (projectId: string): readonly WorkLink[] =>
    contextLinks.filter((link) => link.sourceRecordId === projectId);

  const contextTitle = (link: WorkLink): string =>
    (link.linkType === "project_serves_area" ? areas : initiatives).find(
      (item) => item.id === link.targetRecordId,
    )?.title ?? "A context outside this Space’s work";

  const submitArea = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const responsibility = String(data.get("responsibility") ?? "").trim();
    if (!client) return;
    if (!title) {
      reportFirstEmptyRequiredField(form);
      return;
    }
    // An empty responsibility is REFUSED by the contract, so the key is omitted
    // rather than sent as "". The record is created with an explicit gap to
    // fill, which is what `NarrativeText` draws below.
    await run("area", () =>
      createArea(
        client,
        snapshot,
        title,
        responsibility === "" ? undefined : responsibility,
      ),
    );
  };

  const submitInitiative = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const outcome = String(data.get("outcome") ?? "").trim();
    if (!client) return;
    if (!title) {
      reportFirstEmptyRequiredField(form);
      return;
    }
    await run("initiative", () =>
      createInitiative(
        client,
        snapshot,
        title,
        outcome === "" ? undefined : outcome,
      ),
    );
  };

  const submitLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const projectId = String(data.get("projectId") ?? "");
    const target = String(data.get("target") ?? "");
    const [kind, targetId] = target.split(":");
    if (!client || !projectId || !targetId) return;
    // The PROJECT's own Space, never the workspace's first. `createWorkLink`
    // had that default and it was deliberately removed: the kernel demands the
    // payload's Space equal both endpoints', and a project opened from search or
    // followed out of a document can sit outside the first Space — where the
    // default turned a legitimate link into an unexplained rejection.
    const spaceId =
      snapshot.projects.kind === "ready"
        ? snapshot.projects.data.items.find((item) => item.id === projectId)
            ?.spaceId
        : undefined;
    if (spaceId === undefined) {
      onFailure({
        kind: "unavailable",
        message:
          "The project list is unread, so this link has no Space. Reload.",
      });
      return;
    }
    await run("link-project", () =>
      createWorkLink(
        client,
        snapshot,
        spaceId as SpaceId,
        kind === "initiative" ? LINK_TYPE.initiative : LINK_TYPE.area,
        projectId,
        targetId,
      ),
    );
  };

  const detach = async (link: WorkLink): Promise<void> => {
    if (!client) return;
    await run(`unlink:${link.id}`, () =>
      removeWorkLink(client, snapshot, { id: link.id, version: link.version }),
    );
  };

  /** One context, drawn the same way whichever kind it is. The narrative comes
   *  in as a NODE rather than as a string, so each caller names the field it is
   *  drawing at its own call site — an unwritten responsibility and an unwritten
   *  outcome are different sentences, and `NarrativeText` is what turns each of
   *  them into a gap to fill instead of a blank line. */
  const contextRow = (
    kind: WorkContextKind,
    item: { readonly id: StrategicRecordId; readonly title: string },
    lede: string,
    narrative: ReactNode,
  ) => {
    const serving = projectsServing(item.id);
    const directTasks = tasksServingDirectly(kind, item.id);
    return (
      <li key={item.id}>
        <button
          aria-pressed={item.id === selectedContextId}
          className={`${styles.row}${
            item.id === selectedContextId ? ` ${styles.rowPicked}` : ""
          }`}
          data-work-context={kind}
          onClick={() => onSelectContext(kind, item.id)}
          type="button"
        >
          <span className={styles.rowCopy}>
            <small className={styles.rowKind}>{lede}</small>
            <strong className={styles.rowTitle}>{item.title}</strong>
            <span className={styles.rowNarrative}>{narrative}</span>
            {/* Which projects sit under it, said here because retiring the work
                surface took away the only display of that membership. Named,
                not counted: "3 projects" is a number nobody can act on. */}
            <small className={styles.rowServing}>
              {serving.length === 0
                ? "No project under it yet"
                : `Projects · ${serving.join(" · ")}`}
            </small>
            <small
              className={styles.rowServing}
              data-context-direct-tasks={kind}
            >
              {directTasks.length === 0
                ? "No directly related task"
                : `Direct tasks · ${directTasks.join(" · ")}`}
            </small>
          </span>
        </button>
      </li>
    );
  };

  const chosen = linkProjectId === "" ? [] : linksOfProject(linkProjectId);

  return (
    <div className={styles.panel}>
      <div className={styles.heading}>
        <h2 className={styles.title}>Areas and initiatives</h2>
        <span className={styles.count}>
          {countLabel(areas.length + initiatives.length, "entry", "entries")}
        </span>
      </div>

      {areas.length + initiatives.length === 0 ? (
        <p className={styles.note}>
          No work context yet. An area is a responsibility that stays; an
          initiative is an outcome that closes.
        </p>
      ) : (
        <ul className={styles.rows}>
          {areas.map((area) =>
            contextRow(
              "area",
              area,
              "Area of responsibility",
              <NarrativeText
                kind="area"
                needsReview={area.needsReview}
                text={area.responsibility}
              />,
            ),
          )}
          {initiatives.map((initiative) =>
            contextRow(
              "initiative",
              initiative,
              "Initiative · outcome to close",
              <NarrativeText
                kind="initiative"
                needsReview={initiative.needsReview}
                text={initiative.intendedOutcome}
              />,
            ),
          )}
        </ul>
      )}

      <div className={styles.tools}>
        <InlinePopover
          label="Add area"
          onOpenChange={(next) => setOpenPopover(next ? "area" : undefined)}
          open={openPopover === "area"}
          panelLabel="Add area of responsibility"
        >
          <form
            className={styles.form}
            onSubmit={(event) => void submitArea(event)}
          >
            <input
              aria-label="Area name"
              name="title"
              placeholder="e.g. Client relationships"
              required
            />
            <textarea
              aria-label="Lasting responsibility (optional)"
              name="responsibility"
              placeholder="What do you stay responsible for? You can fill this in later."
            />
            <button disabled={busyIds.has("area") || !client}>
              {busyIds.has("area") ? "Saving…" : "Add"}
            </button>
          </form>
        </InlinePopover>

        <InlinePopover
          label="Add initiative"
          onOpenChange={(next) =>
            setOpenPopover(next ? "initiative" : undefined)
          }
          open={openPopover === "initiative"}
          panelLabel="Add initiative"
        >
          <form
            className={styles.form}
            onSubmit={(event) => void submitInitiative(event)}
          >
            <input
              aria-label="Initiative name"
              name="title"
              placeholder="e.g. Interactive alpha"
              required
            />
            <textarea
              aria-label="Intended outcome (optional)"
              name="outcome"
              placeholder="What outcome closes it? You can fill this in later."
            />
            <button disabled={busyIds.has("initiative") || !client}>
              {busyIds.has("initiative") ? "Saving…" : "Add"}
            </button>
          </form>
        </InlinePopover>

        <InlinePopover
          label="Put a project in context"
          onOpenChange={(next) =>
            setOpenPopover(next ? "link-project" : undefined)
          }
          open={openPopover === "link-project"}
          panelLabel="Put a project under an area or initiative"
        >
          <form
            className={styles.form}
            onSubmit={(event) => void submitLink(event)}
          >
            <select
              aria-label="Project"
              name="projectId"
              onChange={(event) => setLinkProjectId(event.target.value)}
              required
              value={linkProjectId}
            >
              <option value="">Choose project</option>
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>

            {/* What the chosen project is ALREADY under, with a way out of it.
                Without this, linking is the only half that exists and a project
                put in the wrong place stays there. */}
            {linkProjectId !== "" && (
              <ul className={styles.linked}>
                {chosen.length === 0 ? (
                  <li className={styles.note}>Not in any context yet</li>
                ) : (
                  chosen.map((link) => (
                    <li className={styles.linkedRow} key={link.id}>
                      <span className={styles.linkedLabel}>
                        {contextTitle(link)}
                        <small>
                          {link.linkType === "project_serves_area"
                            ? "serves this area"
                            : "advances this initiative"}
                        </small>
                      </span>
                      <button
                        disabled={busyIds.has(`unlink:${link.id}`) || !client}
                        onClick={() => void detach(link)}
                        type="button"
                      >
                        Take out
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}

            <select aria-label="Area or initiative" name="target" required>
              <option value="">Choose context</option>
              {initiatives.map((item) => (
                <option key={item.id} value={`initiative:${item.id}`}>
                  Initiative · {item.title}
                </option>
              ))}
              {areas.map((item) => (
                <option key={item.id} value={`area:${item.id}`}>
                  Area · {item.title}
                </option>
              ))}
            </select>
            <button disabled={busyIds.has("link-project") || !client}>
              {busyIds.has("link-project") ? "Saving…" : "Link"}
            </button>
          </form>
        </InlinePopover>
      </div>
    </div>
  );
};
