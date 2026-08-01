import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import type {
  ConstellationRendererClient,
  StarterWorkspaceCounts,
  DesktopWorkspaceEntry,
} from "@constellation/desktop-preload/client";

import {
  changeFieldDefinition,
  changeTaskStatusDefinition,
  changeAutomationRuleDefinition,
  changeProjectTemplateDefinition,
  createAutomationRuleDefinition,
  createFieldDefinition,
  createProjectTemplateDefinition,
  createTaskStatusDefinition,
  renameWorkspace,
  setDefaultTaskStatus,
  setWorkspaceVoiceAudioRetention,
  type DesktopSnapshot,
  type MutationFailure,
} from "./client/workflow.js";

import { countLabel } from "./i18n.js";
import { ReleaseContinuity } from "./components/ReleaseContinuity.js";
import {
  ConceptHelpDialog,
  type ConceptHelpTopicId,
} from "./components/ConceptHelpDialog.js";
import type { SurfaceId } from "./client/wave2-fixtures.js";
import {
  settingsCategories,
  settingsCategoryElementId,
  type SettingsCategoryId,
} from "./settings-categories.js";

const fieldTypeLabels: Record<string, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  choice: "Choice",
  formula: "Formula",
  rollup: "Rollup",
};

const statusSemanticsLabels: Record<string, string> = {
  actionable: "Actionable",
  waiting: "Waiting",
  blocked: "Blocked",
  paused: "Paused",
};

type Theme = "system" | "dark" | "light";

// Section feedback carries its own tone: errors interrupt as alerts,
// progress and confirmations stay polite status messages.
type SectionMessage = {
  readonly tone: "status" | "alert";
  readonly text: string;
};

const availabilityLabels = {
  available: "Available",
  locked: "Locked",
  unavailable: "Unavailable",
  recovery_required: "Needs recovery",
  degraded: "Partly working",
} as const;

export const SettingsSurface = ({
  client,
  snapshot,
  onReload,
  onFailure,
  onOpenRecovery,
  onNavigate,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
  readonly onOpenRecovery: () => void;
  readonly onNavigate: (surface: SurfaceId, label: string) => void;
}) => {
  const [name, setName] = useState(snapshot.bootstrap.workspace.name);
  const [busyName, setBusyName] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState<string>();
  const [statusEditId, setStatusEditId] = useState<string>();
  const [statusEditLabel, setStatusEditLabel] = useState("");
  const [statusArchiveConfirmId, setStatusArchiveConfirmId] =
    useState<string>();
  const [newStatusLabel, setNewStatusLabel] = useState("");
  const [newStatusSemantics, setNewStatusSemantics] = useState<
    "actionable" | "waiting" | "blocked" | "paused"
  >("actionable");
  const [fieldBusyId, setFieldBusyId] = useState<string>();
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldTarget, setNewFieldTarget] = useState<"task" | "project">(
    "task",
  );
  const [newFieldType, setNewFieldType] = useState<
    "text" | "number" | "date" | "choice"
  >("text");
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const [templateBusyId, setTemplateBusyId] = useState<string>();
  const [automationBusyId, setAutomationBusyId] = useState<string>();
  const [newAutomationName, setNewAutomationName] = useState("");
  const [newAutomationRecipe, setNewAutomationRecipe] = useState<
    "complete_sets_status" | "waiting_review_signals"
  >("waiting_review_signals");
  const [newAutomationStatusId, setNewAutomationStatusId] = useState("");
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateTasks, setNewTemplateTasks] = useState("");
  const runAutomationOperation = async (
    id: string,
    operation: () => Promise<{ readonly kind: string }>,
  ): Promise<boolean> => {
    if (automationBusyId !== undefined) return false;
    setAutomationBusyId(id);
    try {
      const result = await operation();
      if (result.kind === "success") {
        await onReload();
        return true;
      }
      onFailure(result as MutationFailure);
      return false;
    } finally {
      setAutomationBusyId(undefined);
    }
  };
  const runTemplateOperation = async (
    id: string,
    operation: () => Promise<{ readonly kind: string }>,
  ): Promise<boolean> => {
    if (templateBusyId !== undefined) return false;
    setTemplateBusyId(id);
    try {
      const result = await operation();
      if (result.kind === "success") {
        await onReload();
        return true;
      }
      onFailure(result as MutationFailure);
      return false;
    } finally {
      setTemplateBusyId(undefined);
    }
  };
  const runFieldOperation = async (
    id: string,
    operation: () => Promise<{ readonly kind: string }>,
  ): Promise<boolean> => {
    if (fieldBusyId !== undefined) return false;
    setFieldBusyId(id);
    try {
      const result = await operation();
      if (result.kind === "success") {
        await onReload();
        return true;
      }
      onFailure(result as MutationFailure);
      return false;
    } finally {
      setFieldBusyId(undefined);
    }
  };
  const runStatusOperation = async (
    id: string,
    operation: () => Promise<{ readonly kind: string }>,
  ): Promise<boolean> => {
    if (statusBusyId !== undefined) return false;
    setStatusBusyId(id);
    try {
      const result = await operation();
      if (result.kind === "success") {
        await onReload();
        return true;
      }
      onFailure(result as MutationFailure);
      return false;
    } finally {
      setStatusBusyId(undefined);
    }
  };
  const [busyRetention, setBusyRetention] = useState(false);
  const [busyWorkspace, setBusyWorkspace] = useState(false);
  const [busyImport, setBusyImport] = useState(false);
  const [busySupport, setBusySupport] = useState(false);
  const [busyNotesExport, setBusyNotesExport] = useState(false);
  const [activeCategory, setActiveCategory] =
    useState<SettingsCategoryId>("workspace");
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = globalThis.localStorage?.getItem("constellation.theme");
    return saved === "dark" || saved === "light" ? saved : "system";
  });
  const [workspaces, setWorkspaces] = useState<
    readonly DesktopWorkspaceEntry[]
  >([]);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [confirmSwitchId, setConfirmSwitchId] =
    useState<DesktopWorkspaceEntry["workspaceId"]>();
  const [workspaceMessage, setWorkspaceMessage] = useState<SectionMessage>();
  const [importMessage, setImportMessage] = useState<SectionMessage>();
  const [supportMessage, setSupportMessage] = useState<SectionMessage>();
  const [notesExportMessage, setNotesExportMessage] =
    useState<SectionMessage>();
  const [conceptHelpTopic, setConceptHelpTopic] =
    useState<ConceptHelpTopicId>();
  const [busyExport, setBusyExport] = useState(false);
  const [exportMessage, setExportMessage] = useState<
    { readonly tone: "status" | "alert"; readonly text: string } | undefined
  >(undefined);
  const [importCandidate, setImportCandidate] = useState<{
    readonly fileName: string;
    readonly manifest: unknown;
    readonly counts: StarterWorkspaceCounts;
  }>();
  const workspaceTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!("IntersectionObserver" in globalThis)) return;
    const categories = settingsCategories
      .map(({ id }) => document.getElementById(settingsCategoryElementId(id)))
      .filter((element): element is HTMLElement => element !== null);
    if (categories.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const nearestVisible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) =>
              Math.abs(left.boundingClientRect.top) -
              Math.abs(right.boundingClientRect.top),
          )[0];
        const category = nearestVisible?.target.getAttribute(
          "data-settings-category",
        ) as SettingsCategoryId | null | undefined;
        if (category !== undefined && category !== null)
          setActiveCategory(category);
      },
      { rootMargin: "-18% 0px -68% 0px", threshold: [0, 0.05] },
    );
    categories.forEach((category) => observer.observe(category));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!client) return;
    let active = true;
    if (client.listWorkspaces)
      void client
        .listWorkspaces()
        .then((items) => active && setWorkspaces(items))
        .catch(() => {
          if (active)
            setWorkspaceMessage({
              tone: "alert",
              text: "The workspace list is unavailable right now. Your current data stays open.",
            });
        });
    return () => {
      active = false;
    };
  }, [client]);

  // Create/switch normally end with a full app restart, so a hung channel
  // would leave the section busy forever. After 15 s without any response the
  // section unlocks and states plainly that the current workspace is still
  // the active one; every settled invoke (success or failure) clears the
  // timer, and a confirmed success keeps the section locked until restart.
  const clearWorkspaceTimeout = () => {
    if (workspaceTimeoutRef.current !== undefined)
      clearTimeout(workspaceTimeoutRef.current);
    workspaceTimeoutRef.current = undefined;
  };
  const armWorkspaceTimeout = () => {
    clearWorkspaceTimeout();
    workspaceTimeoutRef.current = setTimeout(() => {
      workspaceTimeoutRef.current = undefined;
      setBusyWorkspace(false);
      setWorkspaceMessage({
        tone: "alert",
        text: "No confirmation after 15 seconds. The current workspace is still active — try again.",
      });
    }, 15_000);
  };
  useEffect(() => clearWorkspaceTimeout, []);

  const createWorkspace = (event: FormEvent) => {
    event.preventDefault();
    const name = newWorkspaceName.trim();
    if (!name || !client?.createWorkspace) return;
    setBusyWorkspace(true);
    setWorkspaceMessage({
      tone: "status",
      text: "Creating a separate encrypted Data Home…",
    });
    armWorkspaceTimeout();
    void client
      .createWorkspace({ name })
      .then((result) => {
        if (result.outcome !== "failure") {
          // Confirmed: the app restarts into the new workspace. The section
          // stays locked — the timeout covers only a channel that never
          // answered, not a slow restart after success.
          clearWorkspaceTimeout();
          setWorkspaceMessage({
            tone: "status",
            text: "Workspace created. The app restarts in a moment.",
          });
          return;
        }
        clearWorkspaceTimeout();
        setBusyWorkspace(false);
        setWorkspaceMessage({
          tone: "alert",
          text:
            result.code === "invalid_name"
              ? "Use a name between 1 and 80 characters."
              : "Could not create the workspace safely.",
        });
      })
      .catch(() => {
        clearWorkspaceTimeout();
        setBusyWorkspace(false);
        setWorkspaceMessage({
          tone: "alert",
          text: "Could not start creating. The current workspace is unchanged.",
        });
      });
  };

  const switchWorkspace = (
    workspaceId: DesktopWorkspaceEntry["workspaceId"],
  ) => {
    if (!client?.switchWorkspace) return;
    setConfirmSwitchId(undefined);
    setBusyWorkspace(true);
    setWorkspaceMessage({
      tone: "status",
      text: "Closing the current runtime and opening the chosen workspace…",
    });
    armWorkspaceTimeout();
    void client
      .switchWorkspace({ workspaceId })
      .then((result) => {
        if (result.outcome !== "failure") {
          // Confirmed: the runtime closes and reopens the chosen workspace,
          // so the section must not unlock with a false failure alert.
          clearWorkspaceTimeout();
          setWorkspaceMessage({
            tone: "status",
            text: "Switch confirmed. The app restarts in a moment.",
          });
          return;
        }
        clearWorkspaceTimeout();
        setBusyWorkspace(false);
        setWorkspaceMessage({
          tone: "alert",
          text: "That workspace is no longer available.",
        });
      })
      .catch(() => {
        clearWorkspaceTimeout();
        setBusyWorkspace(false);
        setWorkspaceMessage({
          tone: "alert",
          text: "The switch did not start. The current workspace is still active.",
        });
      });
  };

  const exportExchange = async () => {
    if (!client?.exportExchangePackage) return;
    setBusyExport(true);
    setExportMessage(undefined);
    try {
      const result = await client.exportExchangePackage();
      if (result.outcome === "success") {
        setExportMessage({
          tone: "status",
          text: `Saved ${result.fileLabel}: ${countLabel(result.counts.projects, "project")}, ${countLabel(result.counts.tasks, "task")} and ${countLabel(result.counts.documents, "document")}. Import can read this same file.`,
        });
      } else if (result.outcome === "cancelled") {
        setExportMessage({
          tone: "status",
          text: "Export cancelled. Nothing was saved.",
        });
      } else {
        setExportMessage({
          tone: "alert",
          text: "Could not save the package. Check permissions for the chosen folder.",
        });
      }
    } finally {
      setBusyExport(false);
    }
  };

  const importStarter = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !client?.previewStarterWorkspace) return;
    setImportCandidate(undefined);
    if (file.size > 256 * 1024) {
      setImportMessage({
        tone: "alert",
        text: "The package is larger than the safe 256 KB limit.",
      });
      return;
    }
    setBusyImport(true);
    setImportMessage({
      tone: "status",
      text: "Validating the package. Nothing has been saved yet…",
    });
    try {
      const manifest: unknown = file.name.toLocaleLowerCase().endsWith(".csv")
        ? { format: "tasks_csv", text: await file.text() }
        : (JSON.parse(await file.text()) as unknown);
      const result = await client.previewStarterWorkspace(manifest);
      if (result.outcome === "success") {
        setImportCandidate({
          fileName: file.name,
          manifest,
          counts: result.counts,
        });
        setImportMessage({
          tone: "status",
          text: "Preview ready. Check the scope and confirm the import.",
        });
      } else {
        setImportMessage({
          tone: "alert",
          text:
            result.errors !== undefined && result.errors.length > 0
              ? `File rejected: ${result.errors.slice(0, 5).join(" ")}${
                  result.errors.length > 5
                    ? ` (and ${countLabel(result.errors.length - 5, "more problem")})`
                    : ""
                }`
              : result.code === "manifest_invalid"
                ? "This file does not match the documented import format."
                : "Preview is available in the installed desktop app.",
        });
      }
    } catch {
      setImportMessage({
        tone: "alert",
        text: "That file is not valid JSON or CSV.",
      });
    } finally {
      setBusyImport(false);
    }
  };

  const confirmStarterImport = async () => {
    if (!importCandidate || !client?.importStarterWorkspace) return;
    setBusyImport(true);
    setImportMessage({
      tone: "status",
      text: "Running versioned commands…",
    });
    try {
      const result = await client.importStarterWorkspace(
        importCandidate.manifest,
      );
      if (result.outcome === "success") {
        const { areas, initiatives, projects, tasks, links } = result.counts;
        setImportCandidate(undefined);
        setImportMessage({
          tone: "status",
          text: `Done. Areas: ${areas} · initiatives: ${initiatives} · projects: ${projects} · tasks: ${tasks} · links: ${links}.`,
        });
        await onReload();
      } else {
        setImportMessage({
          tone: "alert",
          text:
            result.code === "manifest_invalid"
              ? "The package changed or failed re-validation. Choose it again."
              : result.code === "unavailable"
                ? "Import is available in the installed desktop app."
                : "The import stopped. Saved steps are safe — run the same file again to finish it.",
        });
      }
    } catch {
      setImportMessage({
        tone: "alert",
        text: "The import did not finish. Running the same package again is safe.",
      });
    } finally {
      setBusyImport(false);
    }
  };

  const applyTheme = (next: Theme) => {
    setTheme(next);
    if (next === "system") {
      localStorage.removeItem("constellation.theme");
      document.documentElement.dataset.theme = matchMedia(
        "(prefers-color-scheme: light)",
      ).matches
        ? "light"
        : "dark";
    } else {
      localStorage.setItem("constellation.theme", next);
      document.documentElement.dataset.theme = next;
    }
  };

  const submitName = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!client || !trimmed || trimmed === snapshot.bootstrap.workspace.name)
      return;
    setBusyName(true);
    void renameWorkspace(client, snapshot, trimmed).then(async (result) => {
      setBusyName(false);
      if (result.kind === "success") await onReload();
      else onFailure(result);
    });
  };

  const changeVoiceRetention = (event: ChangeEvent<HTMLSelectElement>) => {
    if (!client) return;
    const retentionPolicy = event.target.value as
      "delete_after_transcript" | "retain";
    setBusyRetention(true);
    void setWorkspaceVoiceAudioRetention(
      client,
      snapshot,
      retentionPolicy,
    ).then(async (result) => {
      setBusyRetention(false);
      if (result.kind === "success") await onReload();
      else onFailure(result);
    });
  };

  const exportNotesMarkdown = async () => {
    if (!client?.exportNotesMarkdown) return;
    setBusyNotesExport(true);
    setNotesExportMessage({
      tone: "status",
      text: "Choose where the files should go…",
    });
    try {
      const result = await client.exportNotesMarkdown();
      if (result.outcome === "cancelled") {
        setNotesExportMessage({
          tone: "status",
          text: "Cancelled. Nothing was written.",
        });
        return;
      }
      if (result.outcome === "would_overwrite") {
        setNotesExportMessage({
          tone: "alert",
          text:
            `${countLabel(result.count, "file")} in ${result.directoryLabel} ` +
            `would be replaced, so nothing was written. Choose an empty folder.`,
        });
        return;
      }
      if (result.outcome === "partial") {
        setNotesExportMessage({
          tone: "alert",
          text:
            `Stopped after ${countLabel(result.written.notes, "note")} and ` +
            `${countLabel(result.written.attachments, "picture")} in ${result.directoryLabel}. ` +
            `Those files are on disk; your notes are unchanged.`,
        });
        return;
      }
      if (result.outcome !== "success") {
        setNotesExportMessage({
          tone: "alert",
          text: "Could not write the files. Your notes are unchanged.",
        });
        return;
      }
      // WHAT DID NOT COME OUT IS REPORTED IN THE SAME BREATH as what did.
      // A round number that quietly excluded the notes this build could not
      // read would look exactly like a complete export, and the person would
      // find out by missing one.
      const left = [
        result.counts.unreadable > 0
          ? `${result.counts.unreadable} could not be read and were left out`
          : undefined,
        result.counts.missingAttachments > 0
          ? `${result.counts.missingAttachments} pictures are not stored here, so the notes name them instead`
          : undefined,
        result.counts.unresolvedReferences > 0
          ? `${result.counts.unresolvedReferences} links point at records you can no longer see and became plain text`
          : undefined,
      ].filter((entry) => entry !== undefined);
      setNotesExportMessage({
        tone: left.length > 0 ? "alert" : "status",
        text:
          `Wrote ${countLabel(result.counts.notes, "note")} and ` +
          `${countLabel(result.counts.attachments, "picture")} to ${result.directoryLabel}.` +
          (left.length > 0 ? ` ${left.join("; ")}.` : ""),
      });
    } catch {
      setNotesExportMessage({
        tone: "alert",
        text: "The export is unavailable right now. Your notes are unchanged.",
      });
    } finally {
      setBusyNotesExport(false);
    }
  };

  const exportSupportReport = async () => {
    if (!client?.exportSupportReport) return;
    setBusySupport(true);
    setSupportMessage({ tone: "status", text: "Opening the save dialog…" });
    try {
      const result = await client.exportSupportReport();
      setSupportMessage(
        result.outcome === "success"
          ? {
              tone: "status",
              text: `Report saved as ${result.fileLabel}. Check the file before sharing it.`,
            }
          : result.outcome === "cancelled"
            ? {
                tone: "status",
                text: "Cancelled. No report was saved.",
              }
            : {
                tone: "alert",
                text: "Could not save the report. Try again — app data is unchanged.",
              },
      );
    } catch {
      setSupportMessage({
        tone: "alert",
        text: "The report is unavailable right now. App data is unchanged.",
      });
    } finally {
      setBusySupport(false);
    }
  };

  const themeLabel =
    theme === "system" ? "System" : theme === "dark" ? "Dark" : "Light";
  const categoryStatus: Record<SettingsCategoryId, string> = {
    workspace: snapshot.bootstrap.workspace.name,
    data:
      snapshot.dataHome === undefined
        ? "Data Home state unknown"
        : `Data Home: ${availabilityLabels[snapshot.dataHome.availability]}`,
    // A SETTINGS STATEMENT, NEVER A RECORD COUNT. Every other status here
    // names what the section does; "Notes 16" would name how many notes exist,
    // which is a fact about the workspace and not about this section — and it
    // is the mistake this row has already been written with once.
    notes: "Export to Markdown",
    appearance: `Theme: ${themeLabel}`,
    access: "Roles, agents, Calendar and Jamie",
    application: `Version ${snapshot.build.version}`,
  };
  const navigateToCategory = (category: SettingsCategoryId) => {
    setActiveCategory(category);
    document
      .getElementById(settingsCategoryElementId(category))
      ?.scrollIntoView({ block: "start", behavior: "auto" });
  };

  return (
    <div className="surface-scroll settings-surface">
      <header className="surface-header wave2-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1 id="surface-title" tabIndex={-1}>
            Settings
          </h1>
          <p>Identity, data, appearance, access and release.</p>
          <button
            type="button"
            className="settings-help-entry"
            aria-haspopup="dialog"
            onClick={() => setConceptHelpTopic("data-home")}
          >
            Explain data and access
          </button>
        </div>
      </header>

      <div className="settings-category-picker">
        <label htmlFor="settings-category-select">Settings category</label>
        <select
          id="settings-category-select"
          value={activeCategory}
          onChange={(event) =>
            navigateToCategory(event.target.value as SettingsCategoryId)
          }
        >
          {settingsCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-layout">
        <nav className="settings-navigator" aria-label="Settings categories">
          <p>Categories</p>
          <ol>
            {settingsCategories.map((category) => (
              <li key={category.id}>
                <button
                  type="button"
                  aria-controls={settingsCategoryElementId(category.id)}
                  aria-current={
                    activeCategory === category.id ? "location" : undefined
                  }
                  onClick={() => navigateToCategory(category.id)}
                >
                  <span>{category.label}</span>
                  <small>{categoryStatus[category.id]}</small>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="settings-sections">
          <div
            className="settings-category"
            id={settingsCategoryElementId("workspace")}
            data-settings-category="workspace"
          >
            <section>
              <div className="settings-copy">
                <h2>Identity</h2>
                <p>
                  Renaming is a versioned change, visible to the same operators
                  as any other work.
                </p>
              </div>
              <form className="settings-control" onSubmit={submitName}>
                <label htmlFor="workspace-name">Workspace name</label>
                <div>
                  <input
                    id="workspace-name"
                    value={name}
                    maxLength={80}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                  <button
                    disabled={
                      busyName ||
                      !client ||
                      name.trim() === snapshot.bootstrap.workspace.name
                    }
                  >
                    {busyName ? "Saving…" : "Rename"}
                  </button>
                </div>
              </form>
            </section>

            <section>
              <div className="settings-copy">
                <h2>Task statuses</h2>
                <p>
                  Labels and order belong to this workspace; the operational
                  meaning stays explicit so views and agents stay predictable.
                  Archiving does not rewrite existing tasks — they keep their
                  old label.
                </p>
              </div>
              <div className="settings-control status-manager">
                <ul className="status-list">
                  {[...snapshot.bootstrap.taskStatuses]
                    .sort(
                      (left, right) =>
                        left.position - right.position ||
                        left.id.localeCompare(right.id),
                    )
                    .map((status, index, ordered) => {
                      const archived = status.state === "archived";
                      const isDefault =
                        snapshot.bootstrap.workspace.defaultTaskStatusId ===
                        status.id;
                      const carrying = snapshot.tasks.filter(
                        (task) => task.status.id === status.id,
                      ).length;
                      const busy = statusBusyId === status.id;
                      return (
                        <li
                          key={status.id}
                          className={archived ? "status-archived" : undefined}
                        >
                          {statusEditId === status.id ? (
                            <form
                              className="status-rename"
                              onSubmit={(event) => {
                                event.preventDefault();
                                const label = statusEditLabel.trim();
                                if (label.length === 0 || !client) return;
                                void runStatusOperation(status.id, () =>
                                  changeTaskStatusDefinition(
                                    client,
                                    snapshot,
                                    status.id,
                                    status.version,
                                    { kind: "rename", label },
                                  ),
                                ).then((ok) => {
                                  if (ok) setStatusEditId(undefined);
                                });
                              }}
                            >
                              <input
                                value={statusEditLabel}
                                maxLength={120}
                                autoFocus
                                aria-label={`New label for ${status.label}`}
                                onChange={(event) =>
                                  setStatusEditLabel(event.target.value)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Escape") {
                                    event.stopPropagation();
                                    setStatusEditId(undefined);
                                  }
                                }}
                              />
                              <button type="submit" disabled={busy}>
                                Save
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setStatusEditId(undefined)}
                              >
                                Cancel
                              </button>
                            </form>
                          ) : (
                            <>
                              <span className="status-label">
                                <strong>{status.label}</strong>
                                <small>
                                  {statusSemanticsLabels[
                                    status.operationalSemantics
                                  ] ?? status.operationalSemantics}
                                  {isDefault ? " · default" : ""}
                                  {archived ? " · archived" : ""}
                                </small>
                              </span>
                              <span className="status-actions">
                                <button
                                  type="button"
                                  disabled={busy || index === 0 || archived}
                                  aria-label={`Move up: ${status.label}`}
                                  onClick={() => {
                                    const above = ordered[index - 1];
                                    if (!client || !above) return;
                                    void runStatusOperation(status.id, () =>
                                      changeTaskStatusDefinition(
                                        client,
                                        snapshot,
                                        status.id,
                                        status.version,
                                        {
                                          kind: "reorder",
                                          position: Math.max(
                                            0,
                                            above.position === status.position
                                              ? status.position - 1
                                              : above.position,
                                          ),
                                        },
                                      ),
                                    );
                                  }}
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    busy ||
                                    index === ordered.length - 1 ||
                                    archived
                                  }
                                  aria-label={`Move down: ${status.label}`}
                                  onClick={() => {
                                    const below = ordered[index + 1];
                                    if (!client || !below) return;
                                    void runStatusOperation(status.id, () =>
                                      changeTaskStatusDefinition(
                                        client,
                                        snapshot,
                                        status.id,
                                        status.version,
                                        {
                                          kind: "reorder",
                                          position:
                                            below.position === status.position
                                              ? status.position + 1
                                              : below.position,
                                        },
                                      ),
                                    );
                                  }}
                                >
                                  ↓
                                </button>
                                <button
                                  type="button"
                                  disabled={busy || archived}
                                  onClick={() => {
                                    setStatusEditId(status.id);
                                    setStatusEditLabel(status.label);
                                  }}
                                >
                                  Rename
                                </button>
                                {!isDefault && !archived && (
                                  <button
                                    type="button"
                                    disabled={busy || !client}
                                    onClick={() => {
                                      if (!client) return;
                                      void runStatusOperation(status.id, () =>
                                        setDefaultTaskStatus(
                                          client,
                                          snapshot,
                                          status.id,
                                        ),
                                      );
                                    }}
                                  >
                                    Set as default
                                  </button>
                                )}
                                {archived ? (
                                  <button
                                    type="button"
                                    disabled={busy || !client}
                                    onClick={() => {
                                      if (!client) return;
                                      void runStatusOperation(status.id, () =>
                                        changeTaskStatusDefinition(
                                          client,
                                          snapshot,
                                          status.id,
                                          status.version,
                                          { kind: "restore" },
                                        ),
                                      );
                                    }}
                                  >
                                    Restore
                                  </button>
                                ) : statusArchiveConfirmId === status.id ? (
                                  <>
                                    <button
                                      type="button"
                                      className="status-danger"
                                      disabled={busy || !client}
                                      onClick={() => {
                                        if (!client) return;
                                        setStatusArchiveConfirmId(undefined);
                                        void runStatusOperation(status.id, () =>
                                          changeTaskStatusDefinition(
                                            client,
                                            snapshot,
                                            status.id,
                                            status.version,
                                            { kind: "archive" },
                                          ),
                                        );
                                      }}
                                    >
                                      Confirm archive
                                      {carrying > 0
                                        ? ` (${countLabel(carrying, "task")} will keep the label)`
                                        : ""}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setStatusArchiveConfirmId(undefined)
                                      }
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  !isDefault && (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() =>
                                        setStatusArchiveConfirmId(status.id)
                                      }
                                    >
                                      Archive
                                    </button>
                                  )
                                )}
                              </span>
                            </>
                          )}
                        </li>
                      );
                    })}
                </ul>
                <form
                  className="status-create"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const label = newStatusLabel.trim();
                    if (label.length === 0 || !client) return;
                    void runStatusOperation("create", () =>
                      createTaskStatusDefinition(client, snapshot, {
                        label,
                        operationalSemantics: newStatusSemantics,
                      }),
                    ).then((ok) => {
                      if (ok) setNewStatusLabel("");
                    });
                  }}
                >
                  <label>
                    <span className="sr-only">New status label</span>
                    <input
                      value={newStatusLabel}
                      maxLength={120}
                      placeholder="New status — label"
                      disabled={statusBusyId === "create"}
                      onChange={(event) =>
                        setNewStatusLabel(event.target.value)
                      }
                    />
                  </label>
                  <select
                    aria-label="Operational meaning of the new status"
                    value={newStatusSemantics}
                    disabled={statusBusyId === "create"}
                    onChange={(event) =>
                      setNewStatusSemantics(
                        event.target.value as typeof newStatusSemantics,
                      )
                    }
                  >
                    <option value="actionable">Actionable</option>
                    <option value="waiting">Waiting</option>
                    <option value="blocked">Blocked</option>
                    <option value="paused">Paused</option>
                  </select>
                  <button
                    type="submit"
                    disabled={
                      statusBusyId === "create" ||
                      newStatusLabel.trim() === "" ||
                      !client
                    }
                  >
                    Add
                  </button>
                </form>
              </div>
            </section>

            <section>
              <div className="settings-copy">
                <h2>Record fields</h2>
                <p>
                  Typed workspace fields extend tasks and projects without an
                  app release. Values inherit the record's permissions, and
                  retiring a definition leaves saved values alone.
                </p>
              </div>
              <div className="settings-control status-manager">
                <ul className="status-list">
                  {(snapshot.bootstrap.fieldDefinitions ?? []).map(
                    (definition) => {
                      const retired = definition.state === "retired";
                      const busy = fieldBusyId === definition.id;
                      return (
                        <li
                          key={definition.id}
                          className={retired ? "status-archived" : undefined}
                        >
                          <span className="status-label">
                            <strong>{definition.label}</strong>
                            <small>
                              {definition.targetKind === "task"
                                ? "Task"
                                : "Project"}
                              {" · "}
                              {fieldTypeLabels[definition.type.kind]}
                              {definition.type.kind === "choice"
                                ? ` (${definition.type.options.join(", ")})`
                                : ""}
                              {retired ? " · retired" : ""}
                            </small>
                          </span>
                          <span className="status-actions">
                            {retired ? (
                              <button
                                type="button"
                                disabled={busy || !client}
                                onClick={() => {
                                  if (!client) return;
                                  void runFieldOperation(definition.id, () =>
                                    changeFieldDefinition(
                                      client,
                                      snapshot,
                                      definition.id,
                                      definition.version,
                                      { kind: "restore" },
                                    ),
                                  );
                                }}
                              >
                                Restore
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busy || !client}
                                onClick={() => {
                                  if (!client) return;
                                  void runFieldOperation(definition.id, () =>
                                    changeFieldDefinition(
                                      client,
                                      snapshot,
                                      definition.id,
                                      definition.version,
                                      { kind: "archive" },
                                    ),
                                  );
                                }}
                              >
                                Retire
                              </button>
                            )}
                          </span>
                        </li>
                      );
                    },
                  )}
                </ul>
                <form
                  className="status-create"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const label = newFieldLabel.trim();
                    if (label.length === 0 || !client) return;
                    const type =
                      newFieldType === "choice"
                        ? {
                            kind: "choice" as const,
                            options: newFieldOptions
                              .split(",")
                              .map((option) => option.trim())
                              .filter((option) => option.length > 0),
                          }
                        : { kind: newFieldType };
                    if (type.kind === "choice" && type.options.length === 0) {
                      onFailure({
                        kind: "error",
                        message:
                          "A choice field needs at least one option, separated by commas.",
                      });
                      return;
                    }
                    void runFieldOperation("create", () =>
                      createFieldDefinition(client, snapshot, {
                        targetKind: newFieldTarget,
                        label,
                        type,
                      }),
                    ).then((ok) => {
                      if (ok) {
                        setNewFieldLabel("");
                        setNewFieldOptions("");
                      }
                    });
                  }}
                >
                  <label>
                    <span className="sr-only">New field label</span>
                    <input
                      value={newFieldLabel}
                      maxLength={120}
                      placeholder="New field — label"
                      disabled={fieldBusyId === "create"}
                      onChange={(event) => setNewFieldLabel(event.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Target record"
                    value={newFieldTarget}
                    disabled={fieldBusyId === "create"}
                    onChange={(event) =>
                      setNewFieldTarget(
                        event.target.value as "task" | "project",
                      )
                    }
                  >
                    <option value="task">Task</option>
                    <option value="project">Project</option>
                  </select>
                  <select
                    aria-label="Field type"
                    value={newFieldType}
                    disabled={fieldBusyId === "create"}
                    onChange={(event) =>
                      setNewFieldType(
                        event.target.value as
                          "text" | "number" | "date" | "choice",
                      )
                    }
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="choice">Choice</option>
                  </select>
                  {newFieldType === "choice" && (
                    <input
                      value={newFieldOptions}
                      placeholder="Comma-separated options"
                      aria-label="Choice field options"
                      disabled={fieldBusyId === "create"}
                      onChange={(event) =>
                        setNewFieldOptions(event.target.value)
                      }
                    />
                  )}
                  <button
                    type="submit"
                    disabled={
                      fieldBusyId === "create" ||
                      newFieldLabel.trim() === "" ||
                      !client
                    }
                  >
                    Add
                  </button>
                </form>
              </div>
            </section>

            <section>
              <div className="settings-copy">
                <h2>Project templates</h2>
                <p>
                  A template starts a project with ready tasks. Applying one is
                  always explicit and overwrites nothing; editing a template
                  only affects future uses.
                </p>
              </div>
              <div className="settings-control status-manager">
                <ul className="status-list">
                  {(snapshot.bootstrap.projectTemplates ?? []).map(
                    (template) => {
                      const retired = template.state === "retired";
                      const busy = templateBusyId === template.id;
                      return (
                        <li
                          key={template.id}
                          className={retired ? "status-archived" : undefined}
                        >
                          <span className="status-label">
                            <strong>{template.name}</strong>
                            <small>
                              {template.taskTitles.length === 1
                                ? "1 starter task"
                                : `${template.taskTitles.length} starter tasks`}
                              {retired ? " · retired" : ""}
                            </small>
                          </span>
                          <span className="status-actions">
                            <button
                              type="button"
                              disabled={busy || !client}
                              onClick={() => {
                                if (!client) return;
                                void runTemplateOperation(template.id, () =>
                                  changeProjectTemplateDefinition(
                                    client,
                                    snapshot,
                                    template.id,
                                    template.version,
                                    retired
                                      ? { kind: "restore" }
                                      : { kind: "archive" },
                                  ),
                                );
                              }}
                            >
                              {retired ? "Restore" : "Retire"}
                            </button>
                          </span>
                        </li>
                      );
                    },
                  )}
                </ul>
                <form
                  className="status-create"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const name = newTemplateName.trim();
                    if (name.length === 0 || !client) return;
                    const taskTitles = newTemplateTasks
                      .split(",")
                      .map((entry) => entry.trim())
                      .filter((entry) => entry.length > 0);
                    void runTemplateOperation("create", () =>
                      createProjectTemplateDefinition(client, snapshot, {
                        name,
                        taskTitles,
                      }),
                    ).then((ok) => {
                      if (ok) {
                        setNewTemplateName("");
                        setNewTemplateTasks("");
                      }
                    });
                  }}
                >
                  <label>
                    <span className="sr-only">New template name</span>
                    <input
                      value={newTemplateName}
                      maxLength={120}
                      placeholder="New template — name"
                      disabled={templateBusyId === "create"}
                      onChange={(event) =>
                        setNewTemplateName(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span className="sr-only">
                      Comma-separated starter tasks
                    </span>
                    <input
                      value={newTemplateTasks}
                      placeholder="Comma-separated starter tasks"
                      disabled={templateBusyId === "create"}
                      onChange={(event) =>
                        setNewTemplateTasks(event.target.value)
                      }
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={
                      templateBusyId === "create" ||
                      newTemplateName.trim() === "" ||
                      !client
                    }
                  >
                    Add
                  </button>
                </form>
              </div>
            </section>

            <section>
              <div className="settings-copy">
                <h2>Automations</h2>
                <p>
                  Narrow, deterministic rules: no scripts, no effects outside
                  the workspace. Disabling a rule undoes nothing; its past
                  effects stay in the audit, attributed to the rule.
                </p>
              </div>
              <div className="settings-control status-manager">
                <ul className="status-list">
                  {(snapshot.bootstrap.automationRules ?? []).map((rule) => {
                    const disabled = rule.state === "disabled";
                    const busy = automationBusyId === rule.id;
                    const statusLabel =
                      rule.recipe.kind === "complete_sets_status"
                        ? (snapshot.bootstrap.taskStatuses.find(
                            (status) =>
                              rule.recipe.kind === "complete_sets_status" &&
                              status.id === rule.recipe.statusId,
                          )?.label ?? "a removed status")
                        : undefined;
                    return (
                      <li
                        key={rule.id}
                        className={disabled ? "status-archived" : undefined}
                      >
                        <span className="status-label">
                          <strong>{rule.name}</strong>
                          <small>
                            {rule.recipe.kind === "complete_sets_status"
                              ? `Completed task moves to “${statusLabel}”`
                              : "Signal when a waiting review is overdue"}
                            {disabled ? " · disabled" : ""}
                          </small>
                        </span>
                        <span className="status-actions">
                          <button
                            type="button"
                            disabled={busy || !client}
                            onClick={() => {
                              if (!client) return;
                              void runAutomationOperation(rule.id, () =>
                                changeAutomationRuleDefinition(
                                  client,
                                  snapshot,
                                  rule.id,
                                  rule.version,
                                  {
                                    kind: "setState",
                                    state: disabled ? "active" : "disabled",
                                  },
                                ),
                              );
                            }}
                          >
                            {disabled ? "Enable" : "Disable"}
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <form
                  className="status-create"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const name = newAutomationName.trim();
                    if (name.length === 0 || !client) return;
                    if (
                      newAutomationRecipe === "complete_sets_status" &&
                      newAutomationStatusId === ""
                    ) {
                      onFailure({
                        kind: "error",
                        message: "The completion rule needs a target status.",
                      });
                      return;
                    }
                    void runAutomationOperation("create", () =>
                      createAutomationRuleDefinition(client, snapshot, {
                        name,
                        recipe:
                          newAutomationRecipe === "complete_sets_status"
                            ? {
                                kind: "complete_sets_status",
                                statusId: newAutomationStatusId,
                              }
                            : { kind: "waiting_review_signals" },
                      }),
                    ).then((ok) => {
                      if (ok) {
                        setNewAutomationName("");
                        setNewAutomationStatusId("");
                      }
                    });
                  }}
                >
                  <label>
                    <span className="sr-only">New rule name</span>
                    <input
                      value={newAutomationName}
                      maxLength={120}
                      placeholder="New rule — name"
                      disabled={automationBusyId === "create"}
                      onChange={(event) =>
                        setNewAutomationName(event.target.value)
                      }
                    />
                  </label>
                  <select
                    aria-label="Rule type"
                    value={newAutomationRecipe}
                    disabled={automationBusyId === "create"}
                    onChange={(event) =>
                      setNewAutomationRecipe(
                        event.target.value as
                          "complete_sets_status" | "waiting_review_signals",
                      )
                    }
                  >
                    <option value="waiting_review_signals">
                      Signal when a waiting review is overdue
                    </option>
                    <option value="complete_sets_status">
                      Completed task moves to a status
                    </option>
                  </select>
                  {newAutomationRecipe === "complete_sets_status" && (
                    <select
                      aria-label="Target status"
                      value={newAutomationStatusId}
                      disabled={automationBusyId === "create"}
                      onChange={(event) =>
                        setNewAutomationStatusId(event.target.value)
                      }
                    >
                      <option value="">Choose status…</option>
                      {snapshot.bootstrap.taskStatuses
                        .filter((status) => status.state !== "archived")
                        .map((status) => (
                          <option key={status.id} value={status.id}>
                            {status.label}
                          </option>
                        ))}
                    </select>
                  )}
                  <button
                    type="submit"
                    disabled={
                      automationBusyId === "create" ||
                      newAutomationName.trim() === "" ||
                      !client
                    }
                  >
                    Add
                  </button>
                </form>
              </div>
            </section>

            <section>
              <div className="settings-copy">
                <h2>Default audio retention</h2>
                <p>
                  New voice notes inherit this choice. Quick Capture can change
                  it for a single recording.
                </p>
              </div>
              <div className="settings-control">
                <label htmlFor="voice-audio-retention">
                  After transcription
                </label>
                <select
                  id="voice-audio-retention"
                  disabled={busyRetention || !client}
                  value={snapshot.bootstrap.workspace.voiceAudioRetentionPolicy}
                  onChange={changeVoiceRetention}
                >
                  <option value="delete_after_transcript">Delete audio</option>
                  <option value="retain">Keep audio</option>
                </select>
              </div>
            </section>
          </div>

          <div
            className="settings-category"
            id={settingsCategoryElementId("data")}
            data-settings-category="data"
          >
            <section>
              <div className="settings-copy">
                <h2>Separate data boundaries</h2>
                <p>
                  Every workspace has its own encrypted database, Data Home, Hub
                  credentials and local MCP endpoint. Switching restarts the app
                  safely.
                </p>
                <button
                  type="button"
                  className="settings-context-help"
                  aria-haspopup="dialog"
                  onClick={() => setConceptHelpTopic("data-home")}
                >
                  Explain Data Home, Hub and MCP
                </button>
              </div>
              <div className="settings-control workspace-registry-control">
                <div className="workspace-registry-list">
                  {workspaces.length === 0 ? (
                    <span>The list is available in the desktop app.</span>
                  ) : (
                    workspaces.map((workspace) => (
                      <button
                        type="button"
                        key={workspace.workspaceId}
                        className={
                          workspace.active ? "workspace-current" : undefined
                        }
                        aria-current={workspace.active ? "true" : undefined}
                        disabled={
                          busyWorkspace ||
                          workspace.active ||
                          !client?.switchWorkspace
                        }
                        onClick={() => {
                          // Two-step confirmation: switching closes the current
                          // runtime, so the first click only arms the row.
                          if (confirmSwitchId === workspace.workspaceId) {
                            switchWorkspace(workspace.workspaceId);
                            return;
                          }
                          setConfirmSwitchId(workspace.workspaceId);
                          setWorkspaceMessage({
                            tone: "status",
                            text: "Switching closes this workspace and restarts the app. Click “Confirm switch”.",
                          });
                        }}
                      >
                        <span>
                          <strong>{workspace.name}</strong>
                          <small>
                            {workspace.active
                              ? "Open now"
                              : "Separate Data Home"}
                          </small>
                        </span>
                        <em>
                          {workspace.active
                            ? "Active"
                            : confirmSwitchId === workspace.workspaceId
                              ? "Confirm switch"
                              : "Switch"}
                        </em>
                      </button>
                    ))
                  )}
                </div>
                {confirmSwitchId !== undefined && (
                  <button
                    type="button"
                    disabled={busyWorkspace}
                    onClick={() => {
                      setConfirmSwitchId(undefined);
                      setWorkspaceMessage(undefined);
                    }}
                  >
                    Cancel switch
                  </button>
                )}
                <form onSubmit={createWorkspace}>
                  <label htmlFor="new-workspace-name">New workspace</label>
                  <div>
                    <input
                      id="new-workspace-name"
                      value={newWorkspaceName}
                      onChange={(event) =>
                        setNewWorkspaceName(event.target.value)
                      }
                      placeholder="e.g. Studio"
                      maxLength={80}
                    />
                    <button
                      disabled={
                        busyWorkspace ||
                        !client?.createWorkspace ||
                        newWorkspaceName.trim().length === 0
                      }
                    >
                      Create
                    </button>
                  </div>
                </form>
                {workspaceMessage && (
                  <p role={workspaceMessage.tone}>{workspaceMessage.text}</p>
                )}
              </div>
            </section>

            <section>
              <div className="settings-copy">
                <h2>Data, backup and recovery</h2>
                <p>
                  {snapshot.dataHome?.descriptor.displayName ??
                    "Data Home state is unavailable right now."}
                </p>
                <button
                  type="button"
                  className="settings-context-help"
                  aria-haspopup="dialog"
                  onClick={() => setConceptHelpTopic("recovery")}
                >
                  Explain recovery
                </button>
              </div>
              <div className="settings-control">
                <span
                  className={`data-home-availability data-home-availability--${snapshot.dataHome?.availability ?? "unavailable"}`}
                >
                  <i aria-hidden="true" />
                  {snapshot.dataHome === undefined
                    ? "State unknown"
                    : availabilityLabels[snapshot.dataHome.availability]}
                </span>
                <button type="button" onClick={onOpenRecovery}>
                  Open Data Home
                </button>
              </div>
            </section>

            <section className="support-report-section">
              <div className="settings-copy">
                <h2>Support report</h2>
                <p>
                  Save a diagnostic file when you ask for help. It shows app
                  state, not your work or anything identifying.
                </p>
                <details className="support-report-details">
                  <summary>What goes into the report?</summary>
                  <div>
                    <p>
                      <strong>Includes:</strong> app and system versions, plus
                      named Data Home, recovery and update states.
                    </p>
                    <p>
                      <strong>Excludes:</strong> content, names, identifiers,
                      paths, service addresses, record counts, credentials,
                      logs, stack traces and raw messages.
                    </p>
                  </div>
                </details>
              </div>
              <div className="settings-control support-report-action">
                <button
                  type="button"
                  disabled={busySupport || !client?.exportSupportReport}
                  onClick={() => void exportSupportReport()}
                >
                  Save report…
                </button>
                <p className="support-report-privacy-note">
                  The file stays on this device. Nothing is sent automatically.
                </p>
                {supportMessage && (
                  <p role={supportMessage.tone}>{supportMessage.text}</p>
                )}
              </div>
            </section>
          </div>

          {/* SEKCJA NOTES (OPEN-11).
              Trzyma DWIE tafle: eksport (ten lot) i import z Obsidiana, który
              dostawia lot importu — bezpośrednio pod tą tafla, wewnątrz tego
              samego `div.settings-category`. Nic więcej nie trzeba ruszać:
              wpis w `settings-categories.ts` i `categoryStatus` już są. */}
          <div
            className="settings-category"
            id={settingsCategoryElementId("notes")}
            data-settings-category="notes"
          >
            <section className="notes-export-section">
              <div className="settings-copy">
                <h2>Export to Markdown</h2>
                <p>
                  The notes are stored in a collaborative format no other
                  application can open. This writes them back out as ordinary
                  files, so you can always leave with your own writing.
                </p>
                <p>
                  Every note becomes one <code>.md</code> file, inside the
                  folder it sits in. A note with no folder goes to{" "}
                  <code>Unfiled</code>.
                </p>
              </div>
              <div className="settings-control notes-export-control">
                <div className="notes-export-terms">
                  <div>
                    <h3>What travels</h3>
                    <ul>
                      <li>Headings, lists, quotes and tables.</li>
                      <li>
                        A code block, with the language it was written in.
                      </li>
                      <li>
                        A link to a record: its name today, and an identifier
                        that survives a rename.
                      </li>
                      <li>
                        Pictures, written into an <code>attachments</code>{" "}
                        folder that the notes point at.
                      </li>
                      <li>
                        The sources each note cites, by title, kind and
                        availability.
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h3>What stays here</h3>
                    <ul>
                      <li>
                        Editing history and named versions. A file has one
                        state; a note has every state it passed through.
                      </li>
                      <li>
                        A link to a record you can no longer see. It becomes
                        plain text with a marker, never a remembered name — a
                        name kept from before could be wrong now, or could name
                        something you were meant to stop seeing.
                      </li>
                      <li>
                        The files behind your sources. Most sources are
                        references rather than copies, so a title and a link
                        travel and the file does not.
                      </li>
                      <li>
                        Anything markdown has no form for is written into the
                        file as a comment, so nothing disappears without saying
                        so.
                      </li>
                    </ul>
                  </div>
                </div>
                <button
                  type="button"
                  data-notes-export="true"
                  disabled={busyNotesExport || !client?.exportNotesMarkdown}
                  onClick={() => void exportNotesMarkdown()}
                >
                  {busyNotesExport ? "Writing files…" : "Export to Markdown…"}
                </button>
                {notesExportMessage && (
                  <p role={notesExportMessage.tone}>
                    {notesExportMessage.text}
                  </p>
                )}
              </div>
            </section>
          </div>

          <div
            className="settings-category"
            id={settingsCategoryElementId("appearance")}
            data-settings-category="appearance"
          >
            <section>
              <div className="settings-copy">
                <h2>Appearance</h2>
                <p>
                  Theme is a local device preference. Contrast, transparency and
                  motion follow system settings.
                </p>
              </div>
              <fieldset className="settings-control settings-choice">
                <legend>Theme</legend>
                {(["system", "dark", "light"] as const).map((item) => (
                  <label key={item}>
                    <input
                      type="radio"
                      name="theme"
                      checked={theme === item}
                      onChange={() => applyTheme(item)}
                    />
                    <span>
                      {item === "system"
                        ? "System"
                        : item === "dark"
                          ? "Dark"
                          : "Light"}
                    </span>
                  </label>
                ))}
              </fieldset>
            </section>
          </div>

          <div
            className="settings-category"
            id={settingsCategoryElementId("access")}
            data-settings-category="access"
          >
            <section>
              <div className="settings-copy">
                <h2>Access and agents</h2>
                <p>
                  Role, Space scope and agent capabilities stay separate
                  settings.
                </p>
                <button
                  type="button"
                  className="settings-context-help"
                  aria-haspopup="dialog"
                  onClick={() => setConceptHelpTopic("agent-access")}
                >
                  Explain agent access
                </button>
              </div>
              <div className="settings-control settings-actions">
                <button
                  type="button"
                  onClick={() => onNavigate("access", "Access")}
                >
                  Manage access
                </button>
              </div>
            </section>

            <section>
              <div className="settings-copy">
                <h2>Calendar and Jamie</h2>
                <p>
                  Constellation reads Calendar and imports Jamie results; it
                  does not record or transcribe.
                </p>
              </div>
              <div className="settings-control settings-actions">
                <button
                  type="button"
                  onClick={() => onNavigate("meetings", "Meetings")}
                >
                  Open connections
                </button>
              </div>
            </section>
          </div>

          <div
            className="settings-category"
            id={settingsCategoryElementId("application")}
            data-settings-category="application"
          >
            <section>
              <div className="settings-copy">
                <h2>Import with no hidden writes</h2>
                <p>
                  A versioned JSON package creates Areas, Initiatives, Projects
                  and Tasks; a task CSV (columns: title, project, status,
                  priority, due, start, description, state, waitingOn) maps onto
                  the same engine. You see a preview before anything is written,
                  and running the same file again finishes an interrupted
                  import.
                </p>
              </div>
              <div className="settings-control settings-actions">
                <label
                  className={`file-action ${busyImport || !client?.importStarterWorkspace ? "disabled" : ""}`}
                >
                  <input
                    type="file"
                    accept="application/json,.json,text/csv,.csv"
                    disabled={busyImport || !client?.previewStarterWorkspace}
                    onChange={(event) => void importStarter(event)}
                  />
                  <span>Choose an import file (JSON or task CSV)</span>
                </label>
                {importCandidate && (
                  <div
                    className="import-preview"
                    role="group"
                    aria-labelledby="import-preview-title"
                  >
                    <strong id="import-preview-title">
                      Scope before import
                    </strong>
                    <span>{importCandidate.fileName}</span>
                    <dl>
                      <div>
                        <dt>Task statuses</dt>
                        <dd>{importCandidate.counts.taskStatuses}</dd>
                      </div>
                      <div>
                        <dt>Documents</dt>
                        <dd>{importCandidate.counts.documents}</dd>
                      </div>
                      <div>
                        <dt>Areas</dt>
                        <dd>{importCandidate.counts.areas}</dd>
                      </div>
                      <div>
                        <dt>Initiatives</dt>
                        <dd>{importCandidate.counts.initiatives}</dd>
                      </div>
                      <div>
                        <dt>Projects</dt>
                        <dd>{importCandidate.counts.projects}</dd>
                      </div>
                      <div>
                        <dt>Tasks</dt>
                        <dd>{importCandidate.counts.tasks}</dd>
                      </div>
                      <div>
                        <dt>Links</dt>
                        <dd>{importCandidate.counts.links}</dd>
                      </div>
                    </dl>
                    <div className="import-preview-actions">
                      <button
                        type="button"
                        className="import-preview-confirm"
                        disabled={busyImport}
                        onClick={() => void confirmStarterImport()}
                      >
                        Import this scope
                      </button>
                      <button
                        type="button"
                        disabled={busyImport}
                        onClick={() => {
                          setImportCandidate(undefined);
                          setImportMessage({
                            tone: "status",
                            text: "Import cancelled. Nothing was saved.",
                          });
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {importMessage && (
                  <p role={importMessage.tone}>{importMessage.text}</p>
                )}
                <small>
                  Recurrences and saved views stay ordinary Work records; import
                  runs no code and skips no audit.
                </small>
              </div>
            </section>

            <section>
              <div className="settings-copy">
                <h2>Exchange package export</h2>
                <p>
                  Saves this workspace's Areas, Initiatives, Projects and Tasks
                  in the format import accepts, so another device can read it
                  and re-reading the same file duplicates nothing. Document
                  content and attachments stay out of the package.
                </p>
              </div>
              <div className="settings-control settings-actions">
                <button
                  type="button"
                  disabled={busyExport || !client?.exportExchangePackage}
                  onClick={() => void exportExchange()}
                >
                  Export exchange package
                </button>
                {exportMessage && (
                  <p role={exportMessage.tone}>{exportMessage.text}</p>
                )}
              </div>
            </section>

            <section>
              {client ? (
                <ReleaseContinuity client={client} headingLevel={2} />
              ) : (
                <>
                  <div className="settings-copy">
                    <h2>App update</h2>
                    <p role="status">
                      Release state is available in the desktop app.
                    </p>
                  </div>
                  <div className="settings-control">
                    <strong>{snapshot.build.version}</strong>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      </div>
      {conceptHelpTopic !== undefined && (
        <ConceptHelpDialog
          initialTopic={conceptHelpTopic}
          onClose={() => setConceptHelpTopic(undefined)}
        />
      )}
    </div>
  );
};
