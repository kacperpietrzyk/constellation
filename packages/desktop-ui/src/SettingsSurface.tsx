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
  renameWorkspace,
  setWorkspaceVoiceAudioRetention,
  type DesktopSnapshot,
  type MutationFailure,
} from "./client/workflow.js";
import { ReleaseContinuity } from "./components/ReleaseContinuity.js";
import type { SurfaceId } from "./client/wave2-fixtures.js";

type Theme = "system" | "dark" | "light";

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
  const [busyRetention, setBusyRetention] = useState(false);
  const [busyWorkspace, setBusyWorkspace] = useState(false);
  const [busyImport, setBusyImport] = useState(false);
  const [busySupport, setBusySupport] = useState(false);
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
  const [importCandidate, setImportCandidate] = useState<{
    readonly fileName: string;
    readonly manifest: unknown;
    readonly counts: StarterWorkspaceCounts;
  }>();
  const workspaceTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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
      const manifest: unknown = JSON.parse(await file.text());
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
            result.code === "manifest_invalid"
              ? "Plik nie pasuje do ścisłego formatu pakietu startowego."
              : "Podgląd jest dostępny w trwałej aplikacji desktopowej.",
        });
      }
    } catch {
      setImportMessage({
        tone: "alert",
        text: "Plik nie jest poprawnym JSON-em.",
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
        </div>
      </header>

      <div className="settings-sections">
        <section>
          <div className="settings-copy">
            <h2>Tożsamość</h2>
            <p>
              Nazwa jest wersjonowaną zmianą widoczną dla tych samych operatorów
              co pozostała praca.
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
            <h2>Domyślna retencja audio</h2>
            <p>
              Nowe notatki głosowe dziedziczą tę decyzję. W Quick Capture możesz
              ją zmienić dla pojedynczego nagrania.
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

        <section>
          <div className="settings-copy">
            <h2>Osobne granice danych</h2>
            <p>
              Każdy workspace ma własną szyfrowaną bazę, Data Home,
              poświadczenia Hub i lokalny endpoint MCP. Przełączenie bezpiecznie
              uruchamia aplikację ponownie.
            </p>
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
                  onChange={(event) => setNewWorkspaceName(event.target.value)}
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
                  <strong>Nie zawiera:</strong> treści, nazw, identyfikatorów,
                  ścieżek, adresów usług, liczby rekordów, poświadczeń, logów,
                  stosów błędów ani surowych komunikatów.
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

        <section>
          <div className="settings-copy">
            <h2>Dostęp i agenci</h2>
            <p>
              Rola, zakres Space i możliwości agentów pozostają niezależnymi
              ustawieniami.
            </p>
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

        <section>
          <div className="settings-copy">
            <h2>Powtarzalny start bez ukrytych zapisów</h2>
            <p>
              Pakiet startowy tworzy Areas, Initiatives, Projects, Tasks i jawne
              powiązania wyłącznie przez te same wersjonowane komendy co UI i
              MCP. Ponowienie tego samego importu jest bezpieczne.
            </p>
          </div>
          <div className="settings-control settings-actions">
            <label
              className={`file-action ${busyImport || !client?.importStarterWorkspace ? "disabled" : ""}`}
            >
              <input
                type="file"
                accept="application/json,.json"
                disabled={busyImport || !client?.previewStarterWorkspace}
                onChange={(event) => void importStarter(event)}
              />
              <span>Wybierz pakiet startowy JSON</span>
            </label>
            {importCandidate && (
              <div
                className="import-preview"
                role="group"
                aria-labelledby="import-preview-title"
              >
                <strong id="import-preview-title">Zakres przed importem</strong>
                <span>{importCandidate.fileName}</span>
                <dl>
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
              Reguły cykliczne i zapisane widoki pozostają zwykłymi rekordami
              Work; import nie wykonuje kodu ani nie omija audytu.
            </small>
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
  );
};
