import { useEffect, useRef, useState, type FormEvent } from "react";

import type {
  ConstellationRendererClient,
  WorkspaceBackupExportResult,
  WorkspaceBackupFailureCode,
  WorkspaceRestorePreviewResult,
} from "@constellation/desktop-preload/client";

type RecoveryState =
  | { readonly kind: "ready" }
  | { readonly kind: "exporting" }
  | {
      readonly kind: "code-issued";
      readonly result: Extract<
        WorkspaceBackupExportResult,
        { readonly outcome: "success" }
      >;
    }
  | { readonly kind: "verifying" }
  | {
      readonly kind: "preview";
      readonly result: Extract<
        WorkspaceRestorePreviewResult,
        { readonly outcome: "preview" }
      >;
    }
  | { readonly kind: "restoring"; readonly restoreId: string }
  | { readonly kind: "failure"; readonly code: WorkspaceBackupFailureCode };

const failureCopy: Record<WorkspaceBackupFailureCode, string> = {
  secure_storage_unavailable:
    "Bezpieczny magazyn systemu jest chwilowo niedostępny. Odblokuj pęk kluczy lub magazyn poświadczeń i spróbuj ponownie.",
  archive_invalid:
    "Backup jest uszkodzony albo niekompletny. Aktywny workspace nie został zmieniony.",
  archive_unsupported:
    "Ten backup pochodzi z nieobsługiwanej wersji. Otwórz go w zgodnej wersji Constellation.",
  recovery_code_invalid:
    "Kod odzyskiwania nie pasuje do wybranego backupu. Aktywny workspace nie został zmieniony.",
  workspace_identity_invalid:
    "Nie udało się potwierdzić kompletnej tożsamości workspace’u. Restore został zatrzymany.",
  operation_busy:
    "Inna operacja utrzymania workspace’u nadal trwa. Zaczekaj na jej zakończenie.",
  io_failed:
    "Nie udało się bezpiecznie zakończyć operacji na pliku. Sprawdź miejsce i uprawnienia, a potem spróbuj ponownie.",
  restore_interrupted:
    "Restore nie został potwierdzony. Constellation przywróci ostatni znany dobry workspace przy ponownym otwarciu.",
};

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const formatBytes = (value: number): string =>
  new Intl.NumberFormat("pl-PL", {
    style: "unit",
    unit: value >= 1024 * 1024 ? "megabyte" : "kilobyte",
    maximumFractionDigits: 1,
  }).format(value / (value >= 1024 * 1024 ? 1024 * 1024 : 1024));

const CloseIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
  >
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const WorkspaceRecovery = ({
  client,
  workspaceName,
  recoveredPrevious,
  restoreOnly = false,
  onClose,
  onRestored,
}: {
  readonly client: ConstellationRendererClient;
  readonly workspaceName: string;
  readonly recoveredPrevious: boolean;
  readonly restoreOnly?: boolean;
  readonly onClose: () => void;
  readonly onRestored: () => Promise<void>;
}) => {
  const [state, setState] = useState<RecoveryState>({ kind: "ready" });
  const [recoveryCode, setRecoveryCode] = useState("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const busy =
    state.kind === "exporting" ||
    state.kind === "verifying" ||
    state.kind === "restoring";

  useEffect(() => {
    dialogRef.current?.showModal();
    return () => dialogRef.current?.close();
  }, []);

  const close = () => {
    if (busy) return;
    if (state.kind === "preview") {
      void client.cancelWorkspaceRestore({ restoreId: state.result.restoreId });
    }
    onClose();
  };

  const exportBackup = async () => {
    setState({ kind: "exporting" });
    const result = await client.exportWorkspaceBackup();
    if (result.outcome === "success") {
      setState({ kind: "code-issued", result });
      setCopyStatus("idle");
    } else if (result.outcome === "cancelled") setState({ kind: "ready" });
    else setState({ kind: "failure", code: result.code });
  };

  const prepareRestore = async (event: FormEvent) => {
    event.preventDefault();
    if (!recoveryCode.trim()) return;
    setState({ kind: "verifying" });
    const result = await client.prepareWorkspaceRestore({ recoveryCode });
    setRecoveryCode("");
    if (result.outcome === "preview") setState({ kind: "preview", result });
    else if (result.outcome === "cancelled") setState({ kind: "ready" });
    else setState({ kind: "failure", code: result.code });
  };

  const confirmRestore = async () => {
    if (state.kind !== "preview") return;
    const restoreId = state.result.restoreId;
    setState({ kind: "restoring", restoreId });
    const result = await client.confirmWorkspaceRestore({ restoreId });
    if (result.outcome === "success") {
      await onRestored();
      onClose();
    } else setState({ kind: "failure", code: result.code });
  };

  return (
    <dialog
      ref={dialogRef}
      className="recovery-backdrop"
      aria-labelledby="recovery-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <section className="recovery-dialog">
        <header className="recovery-header">
          <div>
            <p className="eyebrow">Workspace</p>
            <h2 id="recovery-title">Backup i odzyskiwanie</h2>
            <p>{workspaceName}</p>
          </div>
          <button
            className="icon-button"
            aria-label="Zamknij backup i odzyskiwanie"
            disabled={busy}
            onClick={close}
          >
            <CloseIcon />
          </button>
        </header>

        <div
          className="recovery-chain"
          aria-label="Bezpieczny przebieg restore"
        >
          <span>Zweryfikowany backup</span>
          <i aria-hidden="true" />
          <span>Podgląd restore</span>
          <i aria-hidden="true" />
          <span>Ostatni dobry workspace</span>
        </div>

        {recoveredPrevious && state.kind === "ready" && (
          <div className="recovery-notice" role="status">
            <strong>Odzyskano ostatni dobry workspace.</strong>
            <span>
              Poprzedni restore został przerwany przed weryfikacją. Kandydat nie
              zastąpił Twoich danych.
            </span>
          </div>
        )}

        <div className="recovery-content" aria-live="polite">
          {(state.kind === "ready" || state.kind === "failure") && (
            <>
              {state.kind === "failure" && (
                <div className="recovery-error" role="alert">
                  <strong>Operacja została zatrzymana</strong>
                  <span>{failureCopy[state.code]}</span>
                </div>
              )}
              {!restoreOnly && (
                <section className="recovery-section">
                  <div>
                    <h3>Utwórz przenośny backup</h3>
                    <p>
                      Constellation zapisze zweryfikowaną, zaszyfrowaną kopię i
                      pokaże osobny kod odzyskiwania.
                    </p>
                  </div>
                  <button className="secondary-button" onClick={exportBackup}>
                    Eksportuj backup
                  </button>
                </section>
              )}
              <section className="recovery-section recovery-restore-section">
                <div>
                  <h3>Przywróć z backupu</h3>
                  <p>
                    Najpierw sprawdzimy kopię i pokażemy jej zawartość. Aktywny
                    workspace zmieni się dopiero po Twoim potwierdzeniu.
                  </p>
                </div>
                <form onSubmit={prepareRestore}>
                  <label htmlFor="workspace-recovery-code">
                    Kod odzyskiwania
                  </label>
                  <div className="recovery-code-entry">
                    <input
                      id="workspace-recovery-code"
                      ref={codeInputRef}
                      type="password"
                      value={recoveryCode}
                      onChange={(event) => setRecoveryCode(event.target.value)}
                      placeholder="cst1_…"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={!recoveryCode.trim()}
                    >
                      Wybierz i sprawdź backup
                    </button>
                  </div>
                </form>
              </section>
            </>
          )}

          {(state.kind === "exporting" || state.kind === "verifying") && (
            <div className="recovery-progress" aria-busy="true">
              <span className="recovery-progress-mark" aria-hidden="true" />
              <div>
                <strong>
                  {state.kind === "exporting"
                    ? "Tworzę i weryfikuję backup"
                    : "Sprawdzam backup w izolacji"}
                </strong>
                <span>
                  {state.kind === "exporting"
                    ? "Plik pojawi się dopiero po sprawdzeniu integralności."
                    : "Aktywny workspace pozostaje otwarty i niezmieniony."}
                </span>
              </div>
            </div>
          )}

          {state.kind === "code-issued" && (
            <div className="recovery-code-result">
              <p className="eyebrow">Backup zweryfikowany</p>
              <h3>Zapisz kod oddzielnie od pliku</h3>
              <p>
                Bez tego kodu nie da się otworzyć backupu. Constellation nie
                przechowuje jego kopii.
              </p>
              <div className="recovery-code-value">
                <code>{state.result.recoveryCode}</code>
                <button
                  className="secondary-button compact"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(state.result.recoveryCode)
                      .then(() => setCopyStatus("copied"))
                      .catch(() => setCopyStatus("failed"));
                  }}
                >
                  {copyStatus === "copied" ? "Skopiowano" : "Kopiuj kod"}
                </button>
              </div>
              {copyStatus === "failed" && (
                <span className="recovery-copy-failure">
                  Schowek jest niedostępny. Zaznacz kod i skopiuj go ręcznie.
                </span>
              )}
              <dl className="recovery-facts">
                <div>
                  <dt>Plik</dt>
                  <dd>{state.result.fileLabel}</dd>
                </div>
                <div>
                  <dt>Utworzono</dt>
                  <dd>{formatDate(state.result.metadata.createdAt)}</dd>
                </div>
                <div>
                  <dt>Rozmiar danych</dt>
                  <dd>
                    {formatBytes(state.result.metadata.databaseByteLength)}
                  </dd>
                </div>
              </dl>
              <footer>
                <button
                  className="primary-button"
                  onClick={() => setState({ kind: "ready" })}
                >
                  Kod zapisany
                </button>
              </footer>
            </div>
          )}

          {state.kind === "preview" && (
            <div className="restore-preview">
              <p className="eyebrow">Backup gotowy do restore</p>
              <h3>{state.result.metadata.workspaceName}</h3>
              <p>
                Kopia przeszła weryfikację. Po potwierdzeniu Constellation
                zachowa obecny workspace, przełączy dane i otworzy je ponownie.
              </p>
              <dl className="restore-counts">
                <div>
                  <dt>Capture</dt>
                  <dd>{state.result.counts.captures}</dd>
                </div>
                <div>
                  <dt>Zadania</dt>
                  <dd>{state.result.counts.tasks}</dd>
                </div>
                <div>
                  <dt>Projekty</dt>
                  <dd>{state.result.counts.projects}</dd>
                </div>
                <div>
                  <dt>Ślad audytowy</dt>
                  <dd>{state.result.counts.auditReceipts}</dd>
                </div>
              </dl>
              <div className="restore-preview-meta">
                <span>{formatDate(state.result.metadata.createdAt)}</span>
                <span>ID …{state.result.metadata.workspaceId.slice(-8)}</span>
              </div>
              <footer>
                <button
                  className="secondary-button"
                  onClick={() => {
                    void client.cancelWorkspaceRestore({
                      restoreId: state.result.restoreId,
                    });
                    setState({ kind: "ready" });
                  }}
                >
                  Anuluj
                </button>
                <button className="primary-button" onClick={confirmRestore}>
                  Przywróć i otwórz ponownie
                </button>
              </footer>
            </div>
          )}

          {state.kind === "restoring" && (
            <div className="recovery-progress" aria-busy="true">
              <span className="recovery-progress-mark" aria-hidden="true" />
              <div>
                <strong>Przywracam zweryfikowany workspace</strong>
                <span>
                  Ostatnia dobra wersja pozostaje zachowana do czasu ponownego
                  otwarcia.
                </span>
              </div>
            </div>
          )}
        </div>
      </section>
    </dialog>
  );
};
