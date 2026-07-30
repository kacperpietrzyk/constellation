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
  orderForLayout,
  readProjects,
  type ProjectLayout,
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

  // The order the MOUNTED lens actually draws, not the order the readings
  // arrived in. Each lens groups differently, and numbering rows in any other
  // order would make Enter on a focused row open a different project than the
  // one under the cursor — silently, and for the keyboard only, because a
  // mouse click passes an id and would look correct beside it.
  const ordered = useMemo(
    () =>
      readings === undefined
        ? []
        : orderForLayout(layout, readings, (projectId) =>
            clientNames.get(projectId),
          ),
    [clientNames, layout, readings],
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
    readings,
    prose,
    itemProps,
    selectedProjectId,
    onSelect: onSelectProject,
    onOpen: onOpenProject,
    clientOf: (projectId: ProjectId) => clientNames.get(projectId),
  };

  return (
    <section aria-label="Project collection" className={styles.collection}>
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
        <span aria-live="polite" className={styles.count} role="status">
          {countLabel(readings.length, "project")}
        </span>
      </div>

      {layout === "list" && <ProjectListLayout {...layoutProps} />}
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
