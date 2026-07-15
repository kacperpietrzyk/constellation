import { useEffect, useRef, useState, type FormEvent } from "react";

import type {
  ConstellationRendererClient,
  DataHomeStatus,
  WorkspaceBackupExportResult,
  WorkspaceBackupFailureCode,
  WorkspaceRestorePreviewResult,
  ReleaseStatus,
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

type HubEnrollmentState =
  | { readonly kind: "idle" }
  | { readonly kind: "connecting" }
  | { readonly kind: "success" }
  | { readonly kind: "failure"; readonly message: string };

const syncCopy: Record<
  DataHomeStatus["syncState"],
  { readonly label: string; readonly detail: string }
> = {
  not_configured: {
    label: "Tylko lokalnie",
    detail: "Bez sieci; backup pozostaje oddzielną operacją.",
  },
  current: { label: "Aktualne", detail: "Zmiany dotarły do własnego Huba." },
  queued: {
    label: "W kolejce",
    detail: "Zmiany są bezpieczne lokalnie i czekają na wysłanie.",
  },
  syncing: { label: "Synchronizacja", detail: "Wymieniam zmiany z Hubem." },
  offline: {
    label: "Offline",
    detail: "Hub jest niedostępny; możesz nadal pracować lokalnie.",
  },
  conflict: {
    label: "Konflikt",
    detail: "Hub ma nowszą wersję. Żadna zmiana nie została nadpisana.",
  },
  unknown_reconcile: {
    label: "Sprawdzam wynik",
    detail: "Połączenie przerwano po wysłaniu. Najpierw potwierdzę receipt.",
  },
};

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

const ReleaseContinuity = ({
  client,
}: {
  readonly client: ConstellationRendererClient;
}) => {
  const [status, setStatus] = useState<ReleaseStatus>();

  useEffect(() => {
    void client
      .getReleaseStatus()
      .then(setStatus)
      .catch(() =>
        setStatus({
          kind: "failure",
          currentVersion: "nieznana",
          operation: "check",
          message:
            "Nie udało się odczytać kanału wydania. Workspace pozostaje bez zmian.",
        }),
      );
  }, [client]);

  const run = async (
    action: () => Promise<ReleaseStatus>,
    pending: ReleaseStatus,
  ) => {
    setStatus(pending);
    try {
      setStatus(await action());
    } catch {
      const operation =
        pending.kind === "checking"
          ? "check"
          : pending.kind === "downloading"
            ? "download"
            : "install";
      setStatus({
        kind: "failure",
        currentVersion: pending.currentVersion,
        operation,
        message:
          "Kanał wydania jest chwilowo niedostępny. Obecna aplikacja i workspace pozostają bez zmian.",
      });
    }
  };

  const currentVersion = status?.currentVersion ?? "…";
  const detail =
    status === undefined
      ? "Sprawdzam podpisany kanał wydania…"
      : status.kind === "unavailable"
        ? status.reason === "developer_preview"
          ? "Podgląd deweloperski nie łączy się z kanałem wydań."
          : status.reason === "mechanism_only_build"
            ? "Ten build służy do weryfikacji instalatora i nie pobiera aktualizacji."
            : status.reason === "platform_unsupported"
              ? "Aktualizacje dla tej platformy nie są jeszcze obsługiwane."
              : "Kanał wydania nie ma bezpiecznego adresu HTTPS."
        : status.kind === "idle"
          ? "Sprawdzenie uruchamiasz ręcznie; nic nie pobierze się w tle."
          : status.kind === "checking"
            ? "Sprawdzam podpisane metadane wydania…"
            : status.kind === "current"
              ? "Masz najnowszą wersję z tego kanału."
              : status.kind === "available"
                ? `Wersja ${status.version} jest dostępna. Pobieranie rozpocznie się dopiero po potwierdzeniu.`
                : status.kind === "downloading"
                  ? `Pobieram i weryfikuję wersję ${status.version}…`
                  : status.kind === "ready"
                    ? `Wersja ${status.version} jest zweryfikowana i gotowa do restartu.`
                    : status.kind === "installing"
                      ? `Zamykam aplikację i instaluję wersję ${status.version}…`
                      : status.message;

  return (
    <section className="release-continuity" aria-labelledby="release-title">
      <div>
        <p className="eyebrow">Aplikacja</p>
        <h3 id="release-title">Aktualizacja bez utraty workspace’u</h3>
        <p role={status?.kind === "failure" ? "alert" : "status"}>{detail}</p>
        <small>
          Wersja {currentVersion}. Odinstalowanie usuwa aplikację, ale domyślnie
          zachowuje zaszyfrowany workspace i klucze w magazynie systemowym.
        </small>
      </div>
      {(status?.kind === "idle" ||
        status?.kind === "current" ||
        status?.kind === "failure") && (
        <button
          className="secondary-button compact"
          onClick={() =>
            void run(client.checkForRelease, {
              kind: "checking",
              currentVersion,
            })
          }
        >
          {status.kind === "failure" ? "Spróbuj ponownie" : "Sprawdź wersję"}
        </button>
      )}
      {status?.kind === "available" && (
        <button
          className="secondary-button compact"
          onClick={() =>
            void run(client.downloadRelease, {
              kind: "downloading",
              currentVersion,
              version: status.version,
            })
          }
        >
          Pobierz i zweryfikuj
        </button>
      )}
      {status?.kind === "ready" && (
        <button
          className="primary-button compact"
          onClick={() =>
            void run(client.installRelease, {
              kind: "installing",
              currentVersion,
              version: status.version,
            })
          }
        >
          Uruchom ponownie i zainstaluj
        </button>
      )}
      {(status?.kind === "checking" ||
        status?.kind === "downloading" ||
        status?.kind === "installing" ||
        status === undefined) && (
        <span className="release-progress" aria-hidden="true" />
      )}
    </section>
  );
};

export const WorkspaceRecovery = ({
  client,
  initialStatus,
  workspaceName,
  recoveredPrevious,
  restoreOnly = false,
  onClose,
  onRestored,
}: {
  readonly client: ConstellationRendererClient;
  readonly initialStatus?: DataHomeStatus;
  readonly workspaceName: string;
  readonly recoveredPrevious: boolean;
  readonly restoreOnly?: boolean;
  readonly onClose: () => void;
  readonly onRestored: () => Promise<void>;
}) => {
  const [state, setState] = useState<RecoveryState>({ kind: "ready" });
  const [recoveryCode, setRecoveryCode] = useState("");
  const [hubOrigin, setHubOrigin] = useState("");
  const [enrollmentSecret, setEnrollmentSecret] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("");
  const [hubEnrollment, setHubEnrollment] = useState<HubEnrollmentState>({
    kind: "idle",
  });
  const [hubAuthorizationExport, setHubAuthorizationExport] = useState<
    | { readonly kind: "idle" | "exporting" | "cancelled" | "failure" }
    | { readonly kind: "success"; readonly fileLabel: string }
  >({ kind: "idle" });
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const [dataHome, setDataHome] = useState<
    | { readonly kind: "loading" }
    | { readonly kind: "ready"; readonly status: DataHomeStatus }
    | { readonly kind: "error" }
  >(
    initialStatus === undefined
      ? { kind: "loading" }
      : { kind: "ready", status: initialStatus },
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const busy =
    state.kind === "exporting" ||
    state.kind === "verifying" ||
    state.kind === "restoring";

  useEffect(() => {
    dialogRef.current?.showModal();
    closeButtonRef.current?.focus();
    return () => dialogRef.current?.close();
  }, []);

  const refreshDataHome = async () => {
    setDataHome({ kind: "loading" });
    try {
      setDataHome({ kind: "ready", status: await client.getDataHomeStatus() });
    } catch {
      setDataHome({ kind: "error" });
    }
  };

  useEffect(() => {
    if (initialStatus !== undefined) return;
    void refreshDataHome();
  }, [initialStatus]);

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
      void refreshDataHome();
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

  const enrollHub = async (event: FormEvent) => {
    event.preventDefault();
    setHubEnrollment({ kind: "connecting" });
    const result = await client.enrollHub({
      hubOrigin: hubOrigin.trim(),
      enrollmentSecret: enrollmentSecret.trim(),
      deviceLabel: deviceLabel.trim(),
    });
    setEnrollmentSecret("");
    if (result.outcome === "success") {
      setDataHome({ kind: "ready", status: result.status });
      setHubEnrollment({ kind: "success" });
      return;
    }
    const messages = {
      input_invalid:
        "Sprawdź adres Huba, nazwę urządzenia i pełny kod dołączenia.",
      workspace_unavailable: "Najpierw otwórz albo przywróć ten workspace.",
      enrollment_invalid:
        "Kod nie należy do tego workspace’u albo został zmieniony.",
      enrollment_expired: "Kod wygasł. Utwórz nowy jednorazowy kod w Hubie.",
      enrollment_used: "Ten kod został już wykorzystany. Utwórz nowy.",
      device_already_enrolled: "To urządzenie jest już połączone z tym Hubem.",
      hub_unreachable:
        "Nie udało się bezpiecznie połączyć z Hubem. Sprawdź adres i TLS.",
      credential_storage_failed:
        "Hub przyjął urządzenie, ale system nie zapisał poświadczenia. Uruchom ponownie i sprawdź stan przed utworzeniem nowego kodu.",
    } as const;
    setHubEnrollment({ kind: "failure", message: messages[result.code] });
  };

  const exportHubAuthorization = async () => {
    setHubAuthorizationExport({ kind: "exporting" });
    const result = await client.exportHubAuthorization();
    setHubAuthorizationExport(
      result.outcome === "success"
        ? { kind: "success", fileLabel: result.fileLabel }
        : { kind: result.outcome },
    );
  };

  const syncNow = async () => {
    setDataHome({ kind: "loading" });
    try {
      setDataHome({ kind: "ready", status: await client.syncDataHome() });
    } catch {
      setDataHome({ kind: "error" });
    }
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
            <h2 id="recovery-title">Data Home i odzyskiwanie</h2>
            <p>{workspaceName}</p>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button"
            aria-label="Zamknij backup i odzyskiwanie"
            disabled={busy}
            onClick={close}
          >
            <CloseIcon />
          </button>
        </header>

        <section
          className="data-home-summary"
          aria-labelledby="data-home-title"
        >
          <div className="data-home-summary-heading">
            <div>
              <p className="eyebrow">Data Home</p>
              <h3 id="data-home-title">Kanoniczne dane tego workspace’u</h3>
            </div>
            {dataHome.kind === "ready" && (
              <span
                className={`data-home-availability data-home-availability--${dataHome.status.availability}`}
              >
                <i aria-hidden="true" />
                {dataHome.status.availability === "available"
                  ? "Dostępny"
                  : dataHome.status.availability === "locked"
                    ? "Zablokowany"
                    : "Wymaga odzyskania"}
              </span>
            )}
          </div>
          {dataHome.kind === "loading" && (
            <div className="data-home-loading" aria-busy="true" role="status">
              Sprawdzam provider i ochronę danych…
            </div>
          )}
          {dataHome.kind === "error" && (
            <div className="data-home-status-error" role="alert">
              <span>
                Nie udało się potwierdzić stanu Data Home. Żadna operacja nie
                została uznana za udaną.
              </span>
              <button
                className="secondary-button compact"
                onClick={refreshDataHome}
              >
                Sprawdź ponownie
              </button>
            </div>
          )}
          {dataHome.kind === "ready" && (
            <>
              {(() => {
                const copy = syncCopy[dataHome.status.syncState];
                return (
                  <div
                    className={`data-home-sync-state data-home-sync-state--${dataHome.status.syncState}`}
                  >
                    <span aria-hidden="true" />
                    <div>
                      <strong>{copy.label}</strong>
                      <small>{copy.detail}</small>
                    </div>
                    {dataHome.status.descriptor.providerKind ===
                      "coordinated" && (
                      <button
                        className="secondary-button compact"
                        onClick={syncNow}
                      >
                        Synchronizuj teraz
                      </button>
                    )}
                  </div>
                );
              })()}
              <dl className="data-home-facts">
                <div>
                  <dt>Provider</dt>
                  <dd>{dataHome.status.descriptor.displayName}</dd>
                  <span>
                    {dataHome.status.descriptor.storageRole === "canonical"
                      ? "Dane kanoniczne na tym urządzeniu"
                      : "Lokalna projekcja + trwała kolejka zmian"}
                  </span>
                </div>
                <div>
                  <dt>Ochrona</dt>
                  <dd>SQLCipher + magazyn systemowy</dd>
                  <span>Osobny kod otwiera przenośny checkpoint</span>
                </div>
                <div>
                  <dt>Przenośność</dt>
                  <dd>
                    {dataHome.status.checkpointState === "verified_this_session"
                      ? "Checkpoint zweryfikowany"
                      : "Niezweryfikowany w tej sesji"}
                  </dd>
                  <span>Eksport, podgląd i bezpieczna migracja</span>
                </div>
              </dl>
              <div className="data-home-boundary-note">
                <span>
                  {dataHome.status.descriptor.providerKind === "local_only"
                    ? "Synchronizacja nie jest skonfigurowana. Workspace działa lokalnie bez sieci; backup pozostaje oddzielną operacją."
                    : "Własny Hub koordynuje urządzenia. Otwarty plik bazy nigdy nie jest synchronizowany przez folder chmurowy."}
                </span>
                <small>
                  Urządzenie …{dataHome.status.descriptor.deviceId.slice(-8)} ·
                  limit lokalnego dysku nie jest udawany jako limit providera
                </small>
              </div>
              {dataHome.status.descriptor.providerKind === "local_only" &&
                !restoreOnly && (
                  <form className="hub-enrollment" onSubmit={enrollHub}>
                    <div>
                      <p className="eyebrow">Własny Data Home</p>
                      <h4>Połącz ten workspace z własnym Hubem</h4>
                      <p>
                        Przy pierwszej instalacji wyeksportuj plik autoryzacji
                        dla operatora Huba. Na drugim urządzeniu najpierw
                        przywróć przenośny backup. Każde urządzenie używa nowego
                        jednorazowego kodu.
                      </p>
                    </div>
                    <div className="hub-authorization-export">
                      <button
                        className="ghost-button"
                        type="button"
                        disabled={hubAuthorizationExport.kind === "exporting"}
                        onClick={() => void exportHubAuthorization()}
                      >
                        {hubAuthorizationExport.kind === "exporting"
                          ? "Zapisuję…"
                          : "Eksportuj plik autoryzacji"}
                      </button>
                      {hubAuthorizationExport.kind === "success" && (
                        <small role="status">
                          Zapisano {hubAuthorizationExport.fileLabel}. Przekaż
                          plik wyłącznie operatorowi własnego Huba.
                        </small>
                      )}
                      {hubAuthorizationExport.kind === "failure" && (
                        <small className="is-error" role="alert">
                          Nie udało się zapisać pliku. Sprawdź miejsce i
                          uprawnienia.
                        </small>
                      )}
                    </div>
                    <label>
                      Adres Huba
                      <input
                        type="url"
                        required
                        value={hubOrigin}
                        onChange={(event) => setHubOrigin(event.target.value)}
                        placeholder="https://hub.example.com"
                      />
                    </label>
                    <label>
                      Nazwa urządzenia
                      <input
                        required
                        maxLength={80}
                        value={deviceLabel}
                        onChange={(event) => setDeviceLabel(event.target.value)}
                        placeholder="MacBook podróżny"
                      />
                    </label>
                    <label>
                      Kod dołączenia
                      <input
                        type="password"
                        required
                        minLength={32}
                        autoComplete="off"
                        spellCheck={false}
                        value={enrollmentSecret}
                        onChange={(event) =>
                          setEnrollmentSecret(event.target.value)
                        }
                        placeholder="Jednorazowy kod z Huba"
                      />
                    </label>
                    {hubEnrollment.kind === "failure" && (
                      <p
                        className="hub-enrollment-feedback is-error"
                        role="alert"
                      >
                        {hubEnrollment.message}
                      </p>
                    )}
                    {hubEnrollment.kind === "success" && (
                      <p className="hub-enrollment-feedback" role="status">
                        Urządzenie połączone. Pierwszy checkpoint został
                        sprawdzony.
                      </p>
                    )}
                    <button className="secondary-button" type="submit">
                      {hubEnrollment.kind === "connecting"
                        ? "Łączę i sprawdzam…"
                        : "Połącz z Hubem"}
                    </button>
                  </form>
                )}
            </>
          )}
        </section>

        <ReleaseContinuity client={client} />

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
