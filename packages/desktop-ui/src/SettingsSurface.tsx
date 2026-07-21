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

import { ReleaseContinuity } from "./components/ReleaseContinuity.js";
import {
  ConceptHelpDialog,
  type ConceptHelpTopicId,
} from "./components/ConceptHelpDialog.js";
import type { SurfaceId } from "./client/wave2-fixtures.js";

const fieldTypeLabels: Record<string, string> = {
  text: "Tekst",
  number: "Liczba",
  date: "Data",
  choice: "Wybór",
};

const statusSemanticsLabels: Record<string, string> = {
  actionable: "Do działania",
  waiting: "Oczekiwanie",
  blocked: "Blokada",
  paused: "Wstrzymane",
};

type Theme = "system" | "dark" | "light";

const settingsCategories = [
  { id: "workspace", label: "Workspace" },
  { id: "data", label: "Dane i prywatność" },
  { id: "appearance", label: "Wygląd" },
  { id: "access", label: "Dostęp i połączenia" },
  { id: "application", label: "Start i aplikacja" },
] as const;

type SettingsCategoryId = (typeof settingsCategories)[number]["id"];

const settingsCategoryElementId = (category: SettingsCategoryId) =>
  `settings-category-${category}`;

// Section feedback carries its own tone: errors interrupt as alerts,
// progress and confirmations stay polite status messages.
type SectionMessage = {
  readonly tone: "status" | "alert";
  readonly text: string;
};

const availabilityLabels = {
  available: "Dostępny",
  locked: "Zablokowany",
  unavailable: "Niedostępny",
  recovery_required: "Wymaga odzyskania",
  degraded: "Działa częściowo",
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
              text: "Lista workspace jest chwilowo niedostępna. Bieżące dane pozostają otwarte.",
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
        text: "Operacja nie potwierdziła się w ciągu 15 sekund. Bieżący workspace pozostaje aktywny; spróbuj ponownie.",
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
      text: "Tworzę osobny zaszyfrowany Data Home…",
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
            text: "Workspace utworzony. Aplikacja za chwilę uruchomi się ponownie.",
          });
          return;
        }
        clearWorkspaceTimeout();
        setBusyWorkspace(false);
        setWorkspaceMessage({
          tone: "alert",
          text:
            result.code === "invalid_name"
              ? "Podaj nazwę od 1 do 80 znaków."
              : "Nie udało się bezpiecznie utworzyć workspace.",
        });
      })
      .catch(() => {
        clearWorkspaceTimeout();
        setBusyWorkspace(false);
        setWorkspaceMessage({
          tone: "alert",
          text: "Nie udało się uruchomić tworzenia. Bieżący workspace nie został zmieniony.",
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
      text: "Zamykam bieżący runtime i otwieram wybrany workspace…",
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
            text: "Przełączenie potwierdzone. Aplikacja za chwilę uruchomi się ponownie.",
          });
          return;
        }
        clearWorkspaceTimeout();
        setBusyWorkspace(false);
        setWorkspaceMessage({
          tone: "alert",
          text: "Wybrany workspace nie jest już dostępny.",
        });
      })
      .catch(() => {
        clearWorkspaceTimeout();
        setBusyWorkspace(false);
        setWorkspaceMessage({
          tone: "alert",
          text: "Przełączenie nie rozpoczęło się. Bieżący workspace pozostaje aktywny.",
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
          text: `Zapisano ${result.fileLabel}: ${result.counts.projects} projektów i ${result.counts.tasks} zadań. Ten sam plik można wczytać importem.`,
        });
      } else if (result.outcome === "cancelled") {
        setExportMessage({
          tone: "status",
          text: "Eksport anulowany. Nic nie zostało zapisane.",
        });
      } else {
        setExportMessage({
          tone: "alert",
          text: "Nie udało się zapisać pakietu. Sprawdź uprawnienia do wybranego katalogu.",
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
        text: "Pakiet jest większy niż bezpieczny limit 256 KB.",
      });
      return;
    }
    setBusyImport(true);
    setImportMessage({
      tone: "status",
      text: "Waliduję pakiet. Nic nie zostało jeszcze zapisane…",
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
          text: "Podgląd gotowy. Sprawdź zakres i potwierdź import.",
        });
      } else {
        setImportMessage({
          tone: "alert",
          text:
            result.errors !== undefined && result.errors.length > 0
              ? `Plik odrzucono: ${result.errors.slice(0, 5).join(" ")}${
                  result.errors.length > 5
                    ? ` (i ${result.errors.length - 5} dalszych problemów)`
                    : ""
                }`
              : result.code === "manifest_invalid"
                ? "Plik nie pasuje do udokumentowanego formatu importu."
                : "Podgląd jest dostępny w trwałej aplikacji desktopowej.",
        });
      }
    } catch {
      setImportMessage({
        tone: "alert",
        text: "Plik nie jest poprawnym JSON-em ani CSV.",
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
      text: "Wykonuję wersjonowane komendy…",
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
          text: `Gotowe. Obszary: ${areas} · inicjatywy: ${initiatives} · projekty: ${projects} · zadania: ${tasks} · powiązania: ${links}.`,
        });
        await onReload();
      } else {
        setImportMessage({
          tone: "alert",
          text:
            result.code === "manifest_invalid"
              ? "Pakiet zmienił się lub nie przeszedł ponownej walidacji. Wybierz go jeszcze raz."
              : result.code === "unavailable"
                ? "Import jest dostępny w trwałej aplikacji desktopowej."
                : "Import zatrzymał się. Zapisane kroki są bezpieczne; ponów ten sam plik, aby dokończyć idempotentnie.",
        });
      }
    } catch {
      setImportMessage({
        tone: "alert",
        text: "Import nie został ukończony. Ponowienie tego samego pakietu jest bezpieczne.",
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

  const exportSupportReport = async () => {
    if (!client?.exportSupportReport) return;
    setBusySupport(true);
    setSupportMessage({ tone: "status", text: "Otwieram zapis raportu…" });
    try {
      const result = await client.exportSupportReport();
      setSupportMessage(
        result.outcome === "success"
          ? {
              tone: "status",
              text: `Raport zapisany jako ${result.fileLabel}. Sprawdź plik przed udostępnieniem.`,
            }
          : result.outcome === "cancelled"
            ? {
                tone: "status",
                text: "Anulowano. Żaden raport nie został zapisany.",
              }
            : {
                tone: "alert",
                text: "Nie udało się zapisać raportu. Spróbuj ponownie. Dane aplikacji pozostały bez zmian.",
              },
      );
    } catch {
      setSupportMessage({
        tone: "alert",
        text: "Raport jest chwilowo niedostępny. Dane aplikacji pozostały bez zmian.",
      });
    } finally {
      setBusySupport(false);
    }
  };

  const themeLabel =
    theme === "system" ? "System" : theme === "dark" ? "Ciemny" : "Jasny";
  const categoryStatus: Record<SettingsCategoryId, string> = {
    workspace: snapshot.bootstrap.workspace.name,
    data:
      snapshot.dataHome === undefined
        ? "Stan Data Home nieznany"
        : `Data Home: ${availabilityLabels[snapshot.dataHome.availability]}`,
    appearance: `Motyw: ${themeLabel}`,
    access: "Role, agenci, Kalendarz i Jamie",
    application: `Wersja ${snapshot.build.version}`,
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
            Ustawienia
          </h1>
          <p>
            Tożsamość, dane, wygląd, dostęp, połączenia i wydanie w jednym
            spokojnym miejscu.
          </p>
          <button
            type="button"
            className="settings-help-entry"
            aria-haspopup="dialog"
            onClick={() => setConceptHelpTopic("data-home")}
          >
            Wyjaśnij pojęcia danych i dostępu
          </button>
        </div>
      </header>

      <div className="settings-category-picker">
        <label htmlFor="settings-category-select">Kategoria ustawień</label>
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
        <nav className="settings-navigator" aria-label="Kategorie ustawień">
          <p>Kategorie</p>
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
                <h2>Tożsamość</h2>
                <p>
                  Nazwa jest wersjonowaną zmianą widoczną dla tych samych
                  operatorów co pozostała praca.
                </p>
              </div>
              <form className="settings-control" onSubmit={submitName}>
                <label htmlFor="workspace-name">Nazwa workspace</label>
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
                    {busyName ? "Zapisuję…" : "Zmień nazwę"}
                  </button>
                </div>
              </form>
            </section>

            <section>
              <div className="settings-copy">
                <h2>Statusy zadań</h2>
                <p>
                  Etykiety i kolejność należą do workspace; szerokie znaczenie
                  operacyjne pozostaje jawne, żeby widoki i agenci zachowywali
                  się przewidywalnie. Archiwizacja nie przepisuje istniejących
                  zadań — zachowują historyczną etykietę.
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
                                aria-label={`Nowa etykieta statusu ${status.label}`}
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
                                Zapisz
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setStatusEditId(undefined)}
                              >
                                Anuluj
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
                                  {isDefault ? " · domyślny" : ""}
                                  {archived ? " · archiwalny" : ""}
                                </small>
                              </span>
                              <span className="status-actions">
                                <button
                                  type="button"
                                  disabled={busy || index === 0 || archived}
                                  aria-label={`Przesuń wyżej: ${status.label}`}
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
                                  aria-label={`Przesuń niżej: ${status.label}`}
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
                                  Zmień nazwę
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
                                    Ustaw domyślny
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
                                    Przywróć
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
                                      Potwierdź archiwizację
                                      {carrying > 0
                                        ? ` (${carrying} zadań zachowa etykietę)`
                                        : ""}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setStatusArchiveConfirmId(undefined)
                                      }
                                    >
                                      Anuluj
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
                                      Archiwizuj
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
                    <span className="sr-only">Etykieta nowego statusu</span>
                    <input
                      value={newStatusLabel}
                      maxLength={120}
                      placeholder="Nowy status — etykieta"
                      disabled={statusBusyId === "create"}
                      onChange={(event) =>
                        setNewStatusLabel(event.target.value)
                      }
                    />
                  </label>
                  <select
                    aria-label="Znaczenie operacyjne nowego statusu"
                    value={newStatusSemantics}
                    disabled={statusBusyId === "create"}
                    onChange={(event) =>
                      setNewStatusSemantics(
                        event.target.value as typeof newStatusSemantics,
                      )
                    }
                  >
                    <option value="actionable">Do działania</option>
                    <option value="waiting">Oczekiwanie</option>
                    <option value="blocked">Blokada</option>
                    <option value="paused">Wstrzymane</option>
                  </select>
                  <button
                    type="submit"
                    disabled={
                      statusBusyId === "create" ||
                      newStatusLabel.trim() === "" ||
                      !client
                    }
                  >
                    Dodaj
                  </button>
                </form>
              </div>
            </section>

            <section>
              <div className="settings-copy">
                <h2>Pola rekordów</h2>
                <p>
                  Typowane pola workspace rozszerzają zadania i projekty bez
                  wydania aplikacji. Wartości dziedziczą uprawnienia rekordu;
                  wycofana definicja nie zmienia zapisanych wartości.
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
                                ? "Zadanie"
                                : "Projekt"}
                              {" · "}
                              {fieldTypeLabels[definition.type.kind]}
                              {definition.type.kind === "choice"
                                ? ` (${definition.type.options.join(", ")})`
                                : ""}
                              {retired ? " · wycofane" : ""}
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
                                Przywróć
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
                                Wycofaj
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
                          "Pole wyboru wymaga co najmniej jednej opcji (rozdziel przecinkami).",
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
                    <span className="sr-only">Etykieta nowego pola</span>
                    <input
                      value={newFieldLabel}
                      maxLength={120}
                      placeholder="Nowe pole — etykieta"
                      disabled={fieldBusyId === "create"}
                      onChange={(event) => setNewFieldLabel(event.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Rekord docelowy"
                    value={newFieldTarget}
                    disabled={fieldBusyId === "create"}
                    onChange={(event) =>
                      setNewFieldTarget(
                        event.target.value as "task" | "project",
                      )
                    }
                  >
                    <option value="task">Zadanie</option>
                    <option value="project">Projekt</option>
                  </select>
                  <select
                    aria-label="Typ pola"
                    value={newFieldType}
                    disabled={fieldBusyId === "create"}
                    onChange={(event) =>
                      setNewFieldType(
                        event.target.value as
                          "text" | "number" | "date" | "choice",
                      )
                    }
                  >
                    <option value="text">Tekst</option>
                    <option value="number">Liczba</option>
                    <option value="date">Data</option>
                    <option value="choice">Wybór</option>
                  </select>
                  {newFieldType === "choice" && (
                    <input
                      value={newFieldOptions}
                      placeholder="Opcje po przecinku"
                      aria-label="Opcje pola wyboru"
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
                    Dodaj
                  </button>
                </form>
              </div>
            </section>

            <section>
              <div className="settings-copy">
                <h2>Szablony projektów</h2>
                <p>
                  Szablon startuje projekt z gotowymi zadaniami. Zastosowanie
                  jest zawsze jawne i niczego nie nadpisuje; zmiana szablonu
                  dotyczy tylko przyszłych zastosowań.
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
                                ? "1 zadanie startowe"
                                : `${template.taskTitles.length} zadań startowych`}
                              {retired ? " · wycofany" : ""}
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
                              {retired ? "Przywróć" : "Wycofaj"}
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
                    <span className="sr-only">Nazwa nowego szablonu</span>
                    <input
                      value={newTemplateName}
                      maxLength={120}
                      placeholder="Nowy szablon — nazwa"
                      disabled={templateBusyId === "create"}
                      onChange={(event) =>
                        setNewTemplateName(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span className="sr-only">
                      Zadania startowe rozdzielone przecinkami
                    </span>
                    <input
                      value={newTemplateTasks}
                      placeholder="Zadania startowe po przecinku"
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
                    Dodaj
                  </button>
                </form>
              </div>
            </section>

            <section>
              <div className="settings-copy">
                <h2>Automatyzacje</h2>
                <p>
                  Ograniczone, deterministyczne reguły: bez skryptów i bez
                  efektów poza workspace. Wyłączona reguła niczego nie cofa;
                  efekty pozostają w audycie z atrybucją reguły.
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
                          )?.label ?? "status historyczny")
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
                              ? `Ukończone zadanie trafia do „${statusLabel}”`
                              : "Sygnał po miniętym terminie przeglądu oczekiwania"}
                            {disabled ? " · wyłączona" : ""}
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
                            {disabled ? "Włącz" : "Wyłącz"}
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
                        message:
                          "Reguła ukończenia wymaga wybranego statusu docelowego.",
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
                    <span className="sr-only">Nazwa nowej reguły</span>
                    <input
                      value={newAutomationName}
                      maxLength={120}
                      placeholder="Nowa reguła — nazwa"
                      disabled={automationBusyId === "create"}
                      onChange={(event) =>
                        setNewAutomationName(event.target.value)
                      }
                    />
                  </label>
                  <select
                    aria-label="Rodzaj reguły"
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
                      Sygnał po miniętym przeglądzie oczekiwania
                    </option>
                    <option value="complete_sets_status">
                      Ukończone zadanie trafia do statusu
                    </option>
                  </select>
                  {newAutomationRecipe === "complete_sets_status" && (
                    <select
                      aria-label="Status docelowy"
                      value={newAutomationStatusId}
                      disabled={automationBusyId === "create"}
                      onChange={(event) =>
                        setNewAutomationStatusId(event.target.value)
                      }
                    >
                      <option value="">Wybierz status…</option>
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
                    Dodaj
                  </button>
                </form>
              </div>
            </section>

            <section>
              <div className="settings-copy">
                <h2>Domyślna retencja audio</h2>
                <p>
                  Nowe notatki głosowe dziedziczą tę decyzję. W Quick Capture
                  możesz ją zmienić dla pojedynczego nagrania.
                </p>
              </div>
              <div className="settings-control">
                <label htmlFor="voice-audio-retention">Po transkrypcji</label>
                <select
                  id="voice-audio-retention"
                  disabled={busyRetention || !client}
                  value={snapshot.bootstrap.workspace.voiceAudioRetentionPolicy}
                  onChange={changeVoiceRetention}
                >
                  <option value="delete_after_transcript">Usuń audio</option>
                  <option value="retain">Zachowaj audio</option>
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
                <h2>Osobne granice danych</h2>
                <p>
                  Każdy workspace ma własną szyfrowaną bazę, Data Home,
                  poświadczenia Hub i lokalny endpoint MCP. Przełączenie
                  bezpiecznie uruchamia aplikację ponownie.
                </p>
                <button
                  type="button"
                  className="settings-context-help"
                  aria-haspopup="dialog"
                  onClick={() => setConceptHelpTopic("data-home")}
                >
                  Wyjaśnij Data Home, Hub i MCP
                </button>
              </div>
              <div className="settings-control workspace-registry-control">
                <div className="workspace-registry-list">
                  {workspaces.length === 0 ? (
                    <span>Lista jest dostępna w aplikacji desktopowej.</span>
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
                            text: "Przełączenie bezpiecznie zamknie bieżący workspace i uruchomi aplikację ponownie. Kliknij „Potwierdź przełączenie”.",
                          });
                        }}
                      >
                        <span>
                          <strong>{workspace.name}</strong>
                          <small>
                            {workspace.active
                              ? "Otwarty teraz"
                              : "Osobny Data Home"}
                          </small>
                        </span>
                        <em>
                          {workspace.active
                            ? "Aktywny"
                            : confirmSwitchId === workspace.workspaceId
                              ? "Potwierdź przełączenie"
                              : "Przełącz"}
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
                    Anuluj przełączenie
                  </button>
                )}
                <form onSubmit={createWorkspace}>
                  <label htmlFor="new-workspace-name">Nowy workspace</label>
                  <div>
                    <input
                      id="new-workspace-name"
                      value={newWorkspaceName}
                      onChange={(event) =>
                        setNewWorkspaceName(event.target.value)
                      }
                      placeholder="Np. Studio"
                      maxLength={80}
                    />
                    <button
                      disabled={
                        busyWorkspace ||
                        !client?.createWorkspace ||
                        newWorkspaceName.trim().length === 0
                      }
                    >
                      Utwórz
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
                <h2>Dane, backup i odzyskiwanie</h2>
                <p>
                  {snapshot.dataHome?.descriptor.displayName ??
                    "Stan Data Home jest chwilowo niedostępny."}
                </p>
                <button
                  type="button"
                  className="settings-context-help"
                  aria-haspopup="dialog"
                  onClick={() => setConceptHelpTopic("recovery")}
                >
                  Wyjaśnij odzyskiwanie
                </button>
              </div>
              <div className="settings-control">
                <span
                  className={`data-home-availability data-home-availability--${snapshot.dataHome?.availability ?? "unavailable"}`}
                >
                  <i aria-hidden="true" />
                  {snapshot.dataHome === undefined
                    ? "Stan nieznany"
                    : availabilityLabels[snapshot.dataHome.availability]}
                </span>
                <button type="button" onClick={onOpenRecovery}>
                  Otwórz Data Home
                </button>
              </div>
            </section>

            <section className="support-report-section">
              <div className="settings-copy">
                <h2>Raport wsparcia</h2>
                <p>
                  Zapisz plik diagnostyczny, gdy prosisz o pomoc. Pokazuje stan
                  aplikacji, ale nie treść pracy ani dane identyfikujące.
                </p>
                <details className="support-report-details">
                  <summary>Co znajdzie się w raporcie?</summary>
                  <div>
                    <p>
                      <strong>Zawiera:</strong> wersje aplikacji i systemu oraz
                      nazwane stany Data Home, odzyskiwania i aktualizacji.
                    </p>
                    <p>
                      <strong>Nie zawiera:</strong> treści, nazw,
                      identyfikatorów, ścieżek, adresów usług, liczby rekordów,
                      poświadczeń, logów, stosów błędów ani surowych
                      komunikatów.
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
                  Zapisz raport…
                </button>
                <p className="support-report-privacy-note">
                  Plik zostaje na Twoim urządzeniu. Nic nie jest wysyłane
                  automatycznie.
                </p>
                {supportMessage && (
                  <p role={supportMessage.tone}>{supportMessage.text}</p>
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
                <h2>Wygląd</h2>
                <p>
                  Motyw jest lokalną preferencją urządzenia. Kontrast,
                  przezroczystość i ruch respektują ustawienia systemowe.
                </p>
              </div>
              <fieldset className="settings-control settings-choice">
                <legend>Motyw</legend>
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
                          ? "Ciemny"
                          : "Jasny"}
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
                <h2>Dostęp i agenci</h2>
                <p>
                  Rola, zakres Space i możliwości agentów pozostają niezależnymi
                  ustawieniami.
                </p>
                <button
                  type="button"
                  className="settings-context-help"
                  aria-haspopup="dialog"
                  onClick={() => setConceptHelpTopic("agent-access")}
                >
                  Wyjaśnij dostęp agenta
                </button>
              </div>
              <div className="settings-control settings-actions">
                <button
                  type="button"
                  onClick={() => onNavigate("access", "Dostęp")}
                >
                  Zarządzaj dostępem
                </button>
              </div>
            </section>

            <section>
              <div className="settings-copy">
                <h2>Kalendarz i Jamie</h2>
                <p>
                  Constellation czyta Kalendarz i importuje wyniki Jamie; nie
                  przejmuje nagrywania ani transkrypcji.
                </p>
              </div>
              <div className="settings-control settings-actions">
                <button
                  type="button"
                  onClick={() => onNavigate("meetings", "Spotkania")}
                >
                  Otwórz połączenia
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
                <h2>Import bez ukrytych zapisów</h2>
                <p>
                  Wersjonowany pakiet JSON tworzy Areas, Initiatives, Projects i
                  Tasks; CSV zadań (kolumny: title, project, status, priority,
                  due, start, description, state, waitingOn) mapuje się na ten
                  sam silnik. Wyłącznie te same wersjonowane komendy co UI i
                  MCP; podgląd przed zapisem; ponowienie tego samego pliku
                  bezpiecznie dokańcza przerwany import.
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
                  <span>Wybierz plik importu (JSON lub CSV zadań)</span>
                </label>
                {importCandidate && (
                  <div
                    className="import-preview"
                    role="group"
                    aria-labelledby="import-preview-title"
                  >
                    <strong id="import-preview-title">
                      Zakres przed importem
                    </strong>
                    <span>{importCandidate.fileName}</span>
                    <dl>
                      <div>
                        <dt>Statusy zadań</dt>
                        <dd>{importCandidate.counts.taskStatuses}</dd>
                      </div>
                      <div>
                        <dt>Obszary</dt>
                        <dd>{importCandidate.counts.areas}</dd>
                      </div>
                      <div>
                        <dt>Inicjatywy</dt>
                        <dd>{importCandidate.counts.initiatives}</dd>
                      </div>
                      <div>
                        <dt>Projekty</dt>
                        <dd>{importCandidate.counts.projects}</dd>
                      </div>
                      <div>
                        <dt>Zadania</dt>
                        <dd>{importCandidate.counts.tasks}</dd>
                      </div>
                      <div>
                        <dt>Powiązania</dt>
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
                        Importuj ten zakres
                      </button>
                      <button
                        type="button"
                        disabled={busyImport}
                        onClick={() => {
                          setImportCandidate(undefined);
                          setImportMessage({
                            tone: "status",
                            text: "Import anulowany. Nic nie zostało zapisane.",
                          });
                        }}
                      >
                        Anuluj
                      </button>
                    </div>
                  </div>
                )}
                {importMessage && (
                  <p role={importMessage.tone}>{importMessage.text}</p>
                )}
                <small>
                  Reguły cykliczne i zapisane widoki pozostają zwykłymi
                  rekordami Work; import nie wykonuje kodu ani nie omija audytu.
                </small>
              </div>
            </section>

            <section>
              <div className="settings-copy">
                <h2>Eksport pakietu wymiany</h2>
                <p>
                  Zapisuje Areas, Initiatives, Projects i Tasks tego workspace w
                  tym samym formacie, który przyjmuje import — pakiet można
                  wczytać na innym urządzeniu, a ponowne wczytanie tego samego
                  pliku niczego nie duplikuje. Treść dokumentów i załączniki nie
                  wchodzą do pakietu.
                </p>
              </div>
              <div className="settings-control settings-actions">
                <button
                  type="button"
                  disabled={busyExport || !client?.exportExchangePackage}
                  onClick={() => void exportExchange()}
                >
                  Eksportuj pakiet wymiany
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
                    <h2>Aktualizacja aplikacji</h2>
                    <p role="status">
                      Stan wydania jest dostępny w aplikacji desktopowej.
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
