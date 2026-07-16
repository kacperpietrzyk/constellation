import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";

import type {
  ConstellationRendererClient,
  StarterWorkspaceCounts,
  DesktopWorkspaceEntry,
  ReleaseStatus,
} from "@constellation/desktop-preload/client";

import {
  renameWorkspace,
  setWorkspaceVoiceAudioRetention,
  type DesktopSnapshot,
  type MutationFailure,
} from "./client/workflow.js";
import type { SurfaceId } from "./client/wave2-fixtures.js";

type Theme = "system" | "dark" | "light";

const releaseCopy = (status: ReleaseStatus | undefined): string => {
  if (status === undefined) return "Sprawdzam stan wydania…";
  if (status.kind === "unavailable") {
    if (status.reason === "release_origin_missing")
      return "Publiczne źródło aktualizacji jest odłożone. Aplikacja nie pobierze niczego bez niego.";
    if (status.reason === "mechanism_only_build")
      return "To build mechanizmu, nie podpisane wydanie.";
    return "Aktualizacje nie są dostępne w tym wariancie aplikacji.";
  }
  if (status.kind === "available") return `Dostępna wersja ${status.version}.`;
  if (status.kind === "ready")
    return `Wersja ${status.version} jest gotowa do instalacji.`;
  if (status.kind === "current")
    return `Masz aktualną wersję ${status.currentVersion}.`;
  if (status.kind === "failure") return status.message;
  return `Zainstalowana wersja ${status.currentVersion}.`;
};

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
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = globalThis.localStorage?.getItem("constellation.theme");
    return saved === "dark" || saved === "light" ? saved : "system";
  });
  const [release, setRelease] = useState<ReleaseStatus>();
  const [workspaces, setWorkspaces] = useState<
    readonly DesktopWorkspaceEntry[]
  >([]);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [workspaceMessage, setWorkspaceMessage] = useState<string>();
  const [importMessage, setImportMessage] = useState<string>();
  const [importCandidate, setImportCandidate] = useState<{
    readonly fileName: string;
    readonly manifest: unknown;
    readonly counts: StarterWorkspaceCounts;
  }>();

  useEffect(() => {
    if (!client) return;
    let active = true;
    void client
      .getReleaseStatus()
      .then((status) => active && setRelease(status))
      .catch(() => {
        if (active)
          setRelease({
            kind: "failure",
            currentVersion: snapshot.build.version,
            operation: "check",
            message: "Stan wydania jest chwilowo niedostępny.",
          });
      });
    if (client.listWorkspaces)
      void client
        .listWorkspaces()
        .then((items) => active && setWorkspaces(items))
        .catch(() => {
          if (active)
            setWorkspaceMessage(
              "Lista workspace jest chwilowo niedostępna. Bieżące dane pozostają otwarte.",
            );
        });
    return () => {
      active = false;
    };
  }, [client, snapshot.build.version]);

  const createWorkspace = (event: FormEvent) => {
    event.preventDefault();
    const name = newWorkspaceName.trim();
    if (!name || !client?.createWorkspace) return;
    setBusy(true);
    setWorkspaceMessage("Tworzę osobny zaszyfrowany Data Home…");
    void client
      .createWorkspace({ name })
      .then((result) => {
        if (result.outcome !== "failure") return;
        setBusy(false);
        setWorkspaceMessage(
          result.code === "invalid_name"
            ? "Podaj nazwę od 1 do 80 znaków."
            : "Nie udało się bezpiecznie utworzyć workspace.",
        );
      })
      .catch(() => {
        setBusy(false);
        setWorkspaceMessage(
          "Nie udało się uruchomić tworzenia. Bieżący workspace nie został zmieniony.",
        );
      });
  };

  const switchWorkspace = (
    workspaceId: DesktopWorkspaceEntry["workspaceId"],
  ) => {
    if (!client?.switchWorkspace) return;
    setBusy(true);
    setWorkspaceMessage(
      "Zamykam bieżący runtime i otwieram wybrany workspace…",
    );
    void client
      .switchWorkspace({ workspaceId })
      .then((result) => {
        if (result.outcome !== "failure") return;
        setBusy(false);
        setWorkspaceMessage("Wybrany workspace nie jest już dostępny.");
      })
      .catch(() => {
        setBusy(false);
        setWorkspaceMessage(
          "Przełączenie nie rozpoczęło się. Bieżący workspace pozostaje aktywny.",
        );
      });
  };

  const importStarter = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !client?.previewStarterWorkspace) return;
    setImportCandidate(undefined);
    if (file.size > 256 * 1024) {
      setImportMessage("Pakiet jest większy niż bezpieczny limit 256 KB.");
      return;
    }
    setBusy(true);
    setImportMessage("Waliduję pakiet. Nic nie zostało jeszcze zapisane…");
    try {
      const manifest: unknown = JSON.parse(await file.text());
      const result = await client.previewStarterWorkspace(manifest);
      if (result.outcome === "success") {
        setImportCandidate({
          fileName: file.name,
          manifest,
          counts: result.counts,
        });
        setImportMessage("Podgląd gotowy. Sprawdź zakres i potwierdź import.");
      } else {
        setImportMessage(
          result.code === "manifest_invalid"
            ? "Plik nie pasuje do ścisłego formatu pakietu startowego."
            : "Podgląd jest dostępny w trwałej aplikacji desktopowej.",
        );
      }
    } catch {
      setImportMessage("Plik nie jest poprawnym JSON-em.");
    } finally {
      setBusy(false);
    }
  };

  const confirmStarterImport = async () => {
    if (!importCandidate || !client?.importStarterWorkspace) return;
    setBusy(true);
    setImportMessage("Wykonuję wersjonowane komendy…");
    try {
      const result = await client.importStarterWorkspace(
        importCandidate.manifest,
      );
      if (result.outcome === "success") {
        const { areas, initiatives, projects, tasks, links } = result.counts;
        setImportCandidate(undefined);
        setImportMessage(
          `Gotowe. Obszary: ${areas} · inicjatywy: ${initiatives} · projekty: ${projects} · zadania: ${tasks} · powiązania: ${links}.`,
        );
        await onReload();
      } else {
        setImportMessage(
          result.code === "manifest_invalid"
            ? "Pakiet zmienił się lub nie przeszedł ponownej walidacji. Wybierz go jeszcze raz."
            : result.code === "unavailable"
              ? "Import jest dostępny w trwałej aplikacji desktopowej."
              : "Import zatrzymał się. Zapisane kroki są bezpieczne; ponów ten sam plik, aby dokończyć idempotentnie.",
        );
      }
    } catch {
      setImportMessage(
        "Import nie został ukończony. Ponowienie tego samego pakietu jest bezpieczne.",
      );
    } finally {
      setBusy(false);
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
    setBusy(true);
    void renameWorkspace(client, snapshot, trimmed).then(async (result) => {
      setBusy(false);
      if (result.kind === "success") await onReload();
      else onFailure(result);
    });
  };

  const changeVoiceRetention = (event: ChangeEvent<HTMLSelectElement>) => {
    if (!client) return;
    const retentionPolicy = event.target.value as
      "delete_after_transcript" | "retain";
    setBusy(true);
    void setWorkspaceVoiceAudioRetention(
      client,
      snapshot,
      retentionPolicy,
    ).then(async (result) => {
      setBusy(false);
      if (result.kind === "success") await onReload();
      else onFailure(result);
    });
  };

  return (
    <div className="surface-scroll settings-surface">
      <header className="surface-header wave2-header">
        <div>
          <p className="eyebrow">Workspace operation</p>
          <h1 id="surface-title">Ustawienia bez panelu administracyjnego</h1>
          <p>
            Tożsamość, dane, wygląd, dostęp, połączenia i wydanie w jednym
            spokojnym miejscu.
          </p>
        </div>
      </header>

      <div className="settings-sections">
        <section>
          <div className="settings-copy">
            <p className="eyebrow">Workspace</p>
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
                onChange={(event) => setName(event.target.value)}
                required
              />
              <button
                disabled={
                  busy ||
                  !client ||
                  name.trim() === snapshot.bootstrap.workspace.name
                }
              >
                {busy ? "Zapisuję…" : "Zmień nazwę"}
              </button>
            </div>
          </form>
        </section>

        <section>
          <div className="settings-copy">
            <p className="eyebrow">Voice custody</p>
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
              disabled={busy || !client}
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
            <p className="eyebrow">Workspace switcher</p>
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
                    disabled={
                      busy || workspace.active || !client?.switchWorkspace
                    }
                    onClick={() => switchWorkspace(workspace.workspaceId)}
                  >
                    <span>
                      <strong>{workspace.name}</strong>
                      <small>
                        {workspace.active
                          ? "Otwarty teraz"
                          : "Osobny Data Home"}
                      </small>
                    </span>
                    <em>{workspace.active ? "Aktywny" : "Przełącz"}</em>
                  </button>
                ))
              )}
            </div>
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
                    busy ||
                    !client?.createWorkspace ||
                    newWorkspaceName.trim().length === 0
                  }
                >
                  Utwórz
                </button>
              </div>
            </form>
            {workspaceMessage && <p role="status">{workspaceMessage}</p>}
          </div>
        </section>

        <section>
          <div className="settings-copy">
            <p className="eyebrow">Data Home</p>
            <h2>Dane, backup i odzyskiwanie</h2>
            <p>
              {snapshot.dataHome?.descriptor.displayName ??
                "Stan Data Home jest chwilowo niedostępny."}
            </p>
          </div>
          <div className="settings-control">
            <strong>
              {snapshot.dataHome?.availability === "available"
                ? "Dostępny"
                : "Wymaga uwagi"}
            </strong>
            <button type="button" onClick={onOpenRecovery}>
              Otwórz Data Home
            </button>
          </div>
        </section>

        <section>
          <div className="settings-copy">
            <p className="eyebrow">Appearance</p>
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
            <p className="eyebrow">Authority</p>
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
            <p className="eyebrow">Connectors</p>
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
            <p className="eyebrow">Rules &amp; templates</p>
            <h2>Powtarzalny start bez ukrytych zapisów</h2>
            <p>
              Pakiet startowy tworzy Areas, Initiatives, Projects, Tasks i jawne
              powiązania wyłącznie przez te same wersjonowane komendy co UI i
              MCP. Ponowienie tego samego importu jest bezpieczne.
            </p>
          </div>
          <div className="settings-control settings-actions">
            <label
              className={`file-action ${busy || !client?.importStarterWorkspace ? "disabled" : ""}`}
            >
              <input
                type="file"
                accept="application/json,.json"
                disabled={busy || !client?.previewStarterWorkspace}
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
                    disabled={busy}
                    onClick={() => void confirmStarterImport()}
                  >
                    Importuj ten zakres
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setImportCandidate(undefined);
                      setImportMessage(
                        "Import anulowany. Nic nie zostało zapisane.",
                      );
                    }}
                  >
                    Anuluj
                  </button>
                </div>
              </div>
            )}
            {importMessage && <p role="status">{importMessage}</p>}
            <small>
              Reguły cykliczne i zapisane widoki pozostają zwykłymi rekordami
              Work; import nie wykonuje kodu ani nie omija audytu.
            </small>
          </div>
        </section>

        <section>
          <div className="settings-copy">
            <p className="eyebrow">Release</p>
            <h2>Aktualizacja aplikacji</h2>
            <p>{releaseCopy(release)}</p>
          </div>
          <div className="settings-control">
            <strong>{release?.currentVersion ?? snapshot.build.version}</strong>
            <button
              type="button"
              disabled={!client || release?.kind === "unavailable"}
              onClick={() => {
                if (!client) return;
                void client
                  .checkForRelease()
                  .then(setRelease)
                  .catch(() =>
                    setRelease({
                      kind: "failure",
                      currentVersion: snapshot.build.version,
                      operation: "check",
                      message:
                        "Nie udało się sprawdzić wydania. Spróbuj ponownie.",
                    }),
                  );
              }}
            >
              Sprawdź wersję
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
