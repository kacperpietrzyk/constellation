import { Suspense, lazy, useMemo, useState } from "react";

import type { ProjectId } from "@constellation/contracts";

import type { DesktopSnapshot } from "../client/workflow.js";
import { directClientLinks } from "../client/workflow.js";
import { useListNavigation } from "../hooks/useListNavigation.js";
import { countLabel, dateKeyInZone } from "../i18n.js";
import {
  LazySurfaceBoundary,
  SurfaceLoadingState,
} from "../SurfaceLifecycleStates.js";
import { ProjectListLayout } from "./ProjectListLayout.js";
import {
  PROJECT_LAYOUTS,
  PROJECT_LAYOUT_LABELS,
  filterProjectReadings,
  orderForLayout,
  readProjects,
  type ProjectLayout,
  type ProjectGovernanceFilter,
  type ProjectProse,
} from "./project-view.js";
import styles from "./project-collection.module.css";

// One collection of projects, three lenses over it. Everything that decides
// WHAT is in the collection lives here; a layout is handed finished readings
// and decides only how they are drawn.
//
// The list ships with the screen and the other two load when somebody switches
// to them. Projects is an eager destination, so a static import of all three
// would put two lenses nobody has opened into the first paint — which is what
// the size gate exists to refuse.
const ProjectClientsLayout = lazy(async () => ({
  default: (await import("./ProjectClientsLayout.js")).ProjectClientsLayout,
}));
const ProjectTimelineLayout = lazy(async () => ({
  default: (await import("./ProjectTimelineLayout.js")).ProjectTimelineLayout,
}));

export const ProjectCollection = ({
  snapshot,
  selectedProjectId,
  onOpenProject,
  onSelectProject,
}: {
  readonly snapshot: DesktopSnapshot;
  readonly selectedProjectId: ProjectId | undefined;
  readonly onOpenProject: (id: ProjectId) => void;
  readonly onSelectProject: (id: ProjectId) => void;
}) => {
  const [layout, setLayout] = useState<ProjectLayout>("list");
  const [governance, setGovernance] = useState<ProjectGovernanceFilter>({
    portfolio: "all",
    exception: "all",
  });

  const timeZone = snapshot.bootstrap.workspace.timezone;
  const prose: ProjectProse = useMemo(
    () => ({ timeZone, todayKey: dateKeyInZone(new Date(), timeZone) }),
    [timeZone],
  );

  const readings = useMemo(
    () => readProjects(snapshot, prose),
    [prose, snapshot],
  );

  // The client a project is delivered to, resolved once for the whole
  // collection rather than per row: the link lives in `relationship.workspace`
  // and each lookup walks every record in it.
  const clientNames = useMemo(() => {
    const names = new Map<ProjectId, string>();
    if (snapshot.relationships.kind !== "ready" || readings === undefined)
      return names;
    // Keyed loosely on purpose: `directClientLinks` yields the far end of the
    // link as a bare id, and narrowing it back to a branded one here would be
    // a cast asserting something this side has not checked.
    const organizations = new Map<string, string>(
      snapshot.relationships.data.records
        .filter((record) => record.kind === "organization")
        .map((record) => [record.id as string, record.name] as const),
    );
    for (const reading of readings) {
      for (const organizationId of directClientLinks(
        snapshot,
        reading.project.id,
      ).keys()) {
        const name = organizations.get(organizationId);
        // A project can be linked to more than one client. The collection
        // names the first — the row has one cell — and the record screen is
        // where every link is listed. Naming none would be worse: "No client"
        // on a project that has one is a wrong answer, not a quiet one.
        if (name !== undefined) {
          names.set(reading.project.id, name);
          break;
        }
      }
    }
    return names;
  }, [readings, snapshot]);

  const governanceContext = useMemo(() => {
    const areaIdsByProject = new Map<string, Set<string>>();
    const initiativeIdsByProject = new Map<string, Set<string>>();
    const clientIdsByProject = new Map<string, Set<string>>();
    const add = (
      map: Map<string, Set<string>>,
      projectId: string,
      id: string,
    ) => {
      const values = map.get(projectId) ?? new Set<string>();
      values.add(id);
      map.set(projectId, values);
    };
    if (snapshot.work.kind === "ready")
      for (const link of snapshot.work.data.links) {
        if (link.state !== "active") continue;
        if (link.linkType === "project_serves_area")
          add(areaIdsByProject, link.sourceRecordId, link.targetRecordId);
        if (link.linkType === "project_advances_initiative")
          add(initiativeIdsByProject, link.sourceRecordId, link.targetRecordId);
      }
    if (snapshot.relationships.kind === "ready" && readings !== undefined)
      for (const reading of readings)
        for (const organizationId of directClientLinks(
          snapshot,
          reading.project.id,
        ).keys())
          add(clientIdsByProject, reading.project.id, organizationId);
    return { areaIdsByProject, initiativeIdsByProject, clientIdsByProject };
  }, [readings, snapshot]);

  const filtered = useMemo(
    () =>
      readings === undefined
        ? undefined
        : filterProjectReadings(readings, governance, governanceContext),
    [governance, governanceContext, readings],
  );

  // The order the MOUNTED lens actually draws, not the order the readings
  // arrived in. Each lens groups differently, and numbering rows in any other
  // order would make Enter on a focused row open a different project than the
  // one under the cursor — silently, and for the keyboard only, because a
  // mouse click passes an id and would look correct beside it.
  const ordered = useMemo(
    () =>
      filtered === undefined
        ? []
        : orderForLayout(layout, filtered, (projectId) =>
            clientNames.get(projectId),
          ),
    [clientNames, filtered, layout],
  );
  const itemProps = useListNavigation({
    itemCount: ordered.length,
    onOpen: (index) => {
      const reading = ordered[index];
      if (reading) onOpenProject(reading.project.id);
    },
    onSelect: (index) => {
      const reading = ordered[index];
      if (reading) onSelectProject(reading.project.id);
    },
  });

  if (readings === undefined)
    return (
      <p className={styles.unavailable}>
        Projects cannot be read while the work plane is unavailable.
      </p>
    );

  const layoutProps = {
    readings: filtered ?? [],
    prose,
    itemProps,
    selectedProjectId,
    onSelect: onSelectProject,
    onOpen: onOpenProject,
    clientOf: (projectId: ProjectId) => clientNames.get(projectId),
  };

  return (
    <section aria-label="Project collection" className={styles.collection}>
      <div aria-label="Portfolio attention" className={styles.governance}>
        <div className={styles.lenses} role="group" aria-label="Portfolio lens">
          {(["all", "current", "waiting", "parked", "closed"] as const).map(
            (candidate) => (
              <button
                aria-pressed={(governance.portfolio ?? "all") === candidate}
                className={styles.switch}
                data-portfolio-lens={candidate}
                key={candidate}
                onClick={() =>
                  setGovernance((current) => ({
                    ...current,
                    portfolio: candidate,
                  }))
                }
                type="button"
              >
                {candidate[0]?.toUpperCase()}
                {candidate.slice(1)}
              </button>
            ),
          )}
        </div>
        <label className={styles.filterLabel}>
          Exception
          <select
            value={governance.exception ?? "all"}
            onChange={(event) =>
              setGovernance((current) => ({
                ...current,
                exception: event.target.value as NonNullable<
                  ProjectGovernanceFilter["exception"]
                >,
              }))
            }
          >
            <option value="all">All</option>
            <option value="no_context">No context</option>
            <option value="no_open_tasks">No open tasks</option>
            <option value="stale">Stale</option>
            <option value="no_signal">No signal</option>
          </select>
        </label>
        <label className={styles.filterLabel}>
          Area
          <select
            data-project-filter="area"
            disabled={snapshot.work.kind !== "ready"}
            value={governance.areaId ?? ""}
            onChange={(event) =>
              setGovernance((current) => ({
                ...current,
                areaId: event.target.value || undefined,
              }))
            }
          >
            <option value="">
              {snapshot.work.kind === "ready" ? "Any area" : "Unavailable"}
            </option>
            {snapshot.work.kind === "ready" &&
              snapshot.work.data.areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.title}
                </option>
              ))}
          </select>
        </label>
        <label className={styles.filterLabel}>
          Initiative
          <select
            data-project-filter="initiative"
            disabled={snapshot.work.kind !== "ready"}
            value={governance.initiativeId ?? ""}
            onChange={(event) =>
              setGovernance((current) => ({
                ...current,
                initiativeId: event.target.value || undefined,
              }))
            }
          >
            <option value="">
              {snapshot.work.kind === "ready"
                ? "Any initiative"
                : "Unavailable"}
            </option>
            {snapshot.work.kind === "ready" &&
              snapshot.work.data.initiatives.map((initiative) => (
                <option key={initiative.id} value={initiative.id}>
                  {initiative.title}
                </option>
              ))}
          </select>
        </label>
        <label className={styles.filterLabel}>
          Client
          <select
            data-project-filter="client"
            disabled={snapshot.relationships.kind !== "ready"}
            value={governance.clientId ?? ""}
            onChange={(event) =>
              setGovernance((current) => ({
                ...current,
                clientId: event.target.value || undefined,
              }))
            }
          >
            <option value="">
              {snapshot.relationships.kind === "ready"
                ? "Any client"
                : "Unavailable"}
            </option>
            {snapshot.relationships.kind === "ready" &&
              snapshot.relationships.data.records
                .filter((record) => record.kind === "organization")
                .map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
          </select>
        </label>
      </div>
      <div className={styles.viewbar}>
        <div
          aria-label="Project layout"
          className={styles.switcher}
          role="tablist"
        >
          {PROJECT_LAYOUTS.map((candidate) => (
            <button
              aria-pressed={layout === candidate}
              className={styles.switch}
              data-layout={candidate}
              key={candidate}
              onClick={() => setLayout(candidate)}
              type="button"
            >
              {PROJECT_LAYOUT_LABELS[candidate]}
            </button>
          ))}
        </div>
        <span
          aria-live="polite"
          className={styles.count}
          data-project-result-count
          role="status"
        >
          {countLabel(filtered?.length ?? 0, "project")}
        </span>
      </div>

      {filtered?.length === 0 && (
        <p className={styles.unavailable} role="status">
          No projects in this view. Change or clear the portfolio filters.
        </p>
      )}

      {filtered !== undefined && filtered.length > 0 && layout === "list" && (
        <ProjectListLayout {...layoutProps} />
      )}
      {layout === "client" && (
        <LazySurfaceBoundary label="By client">
          <Suspense fallback={<SurfaceLoadingState label="By client" />}>
            <ProjectClientsLayout {...layoutProps} />
          </Suspense>
        </LazySurfaceBoundary>
      )}
      {layout === "timeline" && (
        <LazySurfaceBoundary label="Timeline">
          <Suspense fallback={<SurfaceLoadingState label="Timeline" />}>
            <ProjectTimelineLayout {...layoutProps} />
          </Suspense>
        </LazySurfaceBoundary>
      )}
    </section>
  );
};
