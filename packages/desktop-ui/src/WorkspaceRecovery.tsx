import { useEffect, useRef, useState, type FormEvent } from "react";

import type {
  ConstellationRendererClient,
  DataHomeStatus,
  WorkspaceBackupExportResult,
  WorkspaceBackupFailureCode,
  WorkspaceRestorePreviewResult,
} from "@constellation/desktop-preload/client";

import { ReleaseContinuity } from "./components/ReleaseContinuity.js";
import { formatDateTime } from "./i18n.js";

// Transport failure of the renderer↔main channel. Not part of the backup
// contract: the request never reached the workspace, so nothing changed.
type RecoveryFailureCode = WorkspaceBackupFailureCode | "channel_unavailable";

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
  | { readonly kind: "failure"; readonly code: RecoveryFailureCode };

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
    label: "Local only",
    detail: "No network. Backup stays a separate action.",
  },
  current: { label: "Up to date", detail: "Changes reached your own Hub." },
  queued: {
    label: "Queued",
    detail: "Changes are safe locally and waiting to be sent.",
  },
  syncing: { label: "Syncing", detail: "Exchanging changes with the Hub." },
  offline: {
    label: "Offline",
    detail: "The Hub is unreachable. You can keep working locally.",
  },
  conflict: {
    label: "Conflict",
    detail: "The Hub has a newer version. Nothing was overwritten.",
  },
  unknown_reconcile: {
    label: "Checking the outcome",
    detail:
      "The connection dropped after sending. The receipt is confirmed first.",
  },
};

const failureCopy: Record<RecoveryFailureCode, string> = {
  secure_storage_unavailable:
    "The system secure store is unavailable. Unlock your keychain or credential store and try again.",
  archive_invalid:
    "This backup is damaged or incomplete. The active workspace was not changed.",
  archive_unsupported:
    "This backup comes from an unsupported version. Open it in a compatible Constellation.",
  recovery_code_invalid:
    "That recovery code does not match the chosen backup. The active workspace was not changed.",
  workspace_identity_invalid:
    "The full workspace identity could not be confirmed. The restore was stopped.",
  operation_busy:
    "Another workspace maintenance operation is still running. Wait for it to finish.",
  io_failed:
    "The file operation could not finish safely. Check disk space and permissions, then try again.",
  restore_interrupted:
    "The restore was not confirmed. Constellation reopens the last known good workspace.",
  channel_unavailable:
    "Could not reach the app process. Nothing was started and the active workspace is unchanged.",
};

const formatBytes = (value: number): string =>
  new Intl.NumberFormat("en-US", {
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
    // The recovery code is shown exactly once. Closing (backdrop, Esc, ×)
    // stays blocked until the user explicitly confirms "Kod zapisany".
    if (state.kind === "code-issued") return;
    if (state.kind === "preview") {
      void client.cancelWorkspaceRestore({ restoreId: state.result.restoreId });
    }
    onClose();
  };

  const exportBackup = async () => {
    setState({ kind: "exporting" });
    let result: WorkspaceBackupExportResult;
    try {
      result = await client.exportWorkspaceBackup();
    } catch {
      setState({ kind: "failure", code: "channel_unavailable" });
      return;
    }
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
    let result: WorkspaceRestorePreviewResult;
    try {
      result = await client.prepareWorkspaceRestore({ recoveryCode });
    } catch {
      // Keep the entered code so the user can retry after the channel returns.
      setState({ kind: "failure", code: "channel_unavailable" });
      return;
    }
    setRecoveryCode("");
    if (result.outcome === "preview") setState({ kind: "preview", result });
    else if (result.outcome === "cancelled") setState({ kind: "ready" });
    else setState({ kind: "failure", code: result.code });
  };

  const confirmRestore = async () => {
    if (state.kind !== "preview") return;
    const restoreId = state.result.restoreId;
    setState({ kind: "restoring", restoreId });
    try {
      const result = await client.confirmWorkspaceRestore({ restoreId });
      if (result.outcome === "success") {
        await onRestored();
        onClose();
      } else setState({ kind: "failure", code: result.code });
    } catch {
      // Outcome unknown after confirm started: surface the interrupted-restore
      // guarantee (last good workspace wins on reopen), not a generic error.
      setState({ kind: "failure", code: "restore_interrupted" });
    }
  };

  const enrollHub = async (event: FormEvent) => {
    event.preventDefault();
    setHubEnrollment({ kind: "connecting" });
    let result: Awaited<ReturnType<typeof client.enrollHub>>;
    try {
      result = await client.enrollHub({
        hubOrigin: hubOrigin.trim(),
        enrollmentSecret: enrollmentSecret.trim(),
        deviceLabel: deviceLabel.trim(),
      });
    } catch {
      // Keep the one-time code so the user can retry without a new one.
      setHubEnrollment({
        kind: "failure",
        message:
          "Could not reach the app process. The workspace is unchanged. Try again.",
      });
      return;
    }
    setEnrollmentSecret("");
    if (result.outcome === "success") {
      setDataHome({ kind: "ready", status: result.status });
      setHubEnrollment({ kind: "success" });
      return;
    }
    const messages = {
      input_invalid:
        "Check the Hub address, the device name and the full enrollment code.",
      workspace_unavailable: "Open or restore this workspace first.",
      enrollment_invalid:
        "That code belongs to a different workspace, or it changed.",
      enrollment_expired:
        "That code expired. Create a new one-time code in the Hub.",
      enrollment_used: "That code was already used. Create a new one.",
      device_already_enrolled: "This device is already connected to this Hub.",
      hub_unreachable:
        "Could not connect to the Hub securely. Check the address and TLS.",
      credential_storage_failed:
        "The Hub accepted the device but did not store the credential. Restart and check the state before creating a new code.",
    } as const;
    setHubEnrollment({ kind: "failure", message: messages[result.code] });
  };

  const exportHubAuthorization = async () => {
    setHubAuthorizationExport({ kind: "exporting" });
    try {
      const result = await client.exportHubAuthorization();
      setHubAuthorizationExport(
        result.outcome === "success"
          ? { kind: "success", fileLabel: result.fileLabel }
          : { kind: result.outcome },
      );
    } catch {
      setHubAuthorizationExport({ kind: "failure" });
    }
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
      onClose={() => {
        // Chromium's CloseWatcher lets a second Esc close the dialog natively
        // despite preventDefault() in onCancel. When closing is blocked (an
        // operation runs or the one-time recovery code is on screen), reopen
        // immediately; otherwise mirror close() so the parent stays in sync.
        const dialog = dialogRef.current;
        if (dialog === null || !dialog.isConnected) return;
        if (busy || state.kind === "code-issued") {
          dialog.showModal();
          return;
        }
        if (state.kind === "preview")
          void client.cancelWorkspaceRestore({
            restoreId: state.result.restoreId,
          });
        onClose();
      }}
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <section className="recovery-dialog">
        <header className="recovery-header">
          <div>
            <p className="eyebrow">Workspace</p>
            <h2 id="recovery-title">Data Home and recovery</h2>
            <p>{workspaceName}</p>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button"
            aria-label="Close backup and recovery"
            disabled={busy || state.kind === "code-issued"}
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
              <h3 id="data-home-title">Canonical data for this workspace</h3>
            </div>
            {dataHome.kind === "ready" && (
              <span
                className={`data-home-availability data-home-availability--${dataHome.status.availability}`}
              >
                <i aria-hidden="true" />
                {dataHome.status.availability === "available"
                  ? "Available"
                  : dataHome.status.availability === "locked"
                    ? "Locked"
                    : "Needs recovery"}
              </span>
            )}
          </div>
          {dataHome.kind === "loading" && (
            <div className="data-home-loading" aria-busy="true" role="status">
              Checking the provider and data protection…
            </div>
          )}
          {dataHome.kind === "error" && (
            <div className="data-home-status-error" role="alert">
              <span>
                Could not confirm the Data Home state. No operation was counted
                as successful.
              </span>
              <button
                className="secondary-button compact"
                onClick={refreshDataHome}
              >
                Try again
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
                    // Stan synchronizacji jako dyskryminanta, nie jako zdanie:
                    // testy i diagnostyka pytają o `syncState`, a nie o copy.
                    data-sync-state={dataHome.status.syncState}
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
                        data-recovery-action="sync-now"
                        onClick={syncNow}
                      >
                        Sync now
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
                      ? "Canonical data on this device"
                      : "Local projection + durable change queue"}
                  </span>
                </div>
                <div>
                  <dt>Protection</dt>
                  <dd>SQLCipher + system store</dd>
                  <span>A separate code opens the portable checkpoint</span>
                </div>
                <div>
                  <dt>Portability</dt>
                  <dd>
                    {dataHome.status.checkpointState === "verified_this_session"
                      ? "Checkpoint verified"
                      : "Not verified this session"}
                  </dd>
                  <span>Export, preview and safe migration</span>
                </div>
              </dl>
              <div className="data-home-boundary-note">
                <span>
                  {dataHome.status.descriptor.providerKind === "local_only"
                    ? "Sync is not configured. This workspace runs locally; backup stays a separate action."
                    : "Your own Hub coordinates devices. The open database file is never synced through a cloud folder."}
                </span>
                <small>
                  Device …{dataHome.status.descriptor.deviceId.slice(-8)} ·
                  local disk space is never shown as provider quota
                </small>
              </div>
              {dataHome.status.descriptor.providerKind === "local_only" &&
                !restoreOnly && (
                  <form className="hub-enrollment" onSubmit={enrollHub}>
                    <div>
                      <p className="eyebrow">Your own Data Home</p>
                      <h4>Connect this workspace to your own Hub</h4>
                      {/* Kolejność dla drugiego urządzenia: najpierw restore,
                          potem dołączenie. Zaczepienie na atrybucie, bo tego
                          akapitu nie da się rozpoznać po treści po zmianie
                          języka. */}
                      <p data-recovery-note="second-device-order">
                        On the first install, export the authorization file for
                        your Hub operator. On a second device, restore the
                        portable backup first. Every device uses a new one-time
                        code.
                      </p>
                    </div>
                    <div className="hub-authorization-export">
                      <button
                        className="ghost-button"
                        type="button"
                        data-recovery-action="hub-authorization-export"
                        disabled={hubAuthorizationExport.kind === "exporting"}
                        onClick={() => void exportHubAuthorization()}
                      >
                        {hubAuthorizationExport.kind === "exporting"
                          ? "Saving…"
                          : "Export authorization file"}
                      </button>
                      {hubAuthorizationExport.kind === "success" && (
                        <small role="status">
                          Saved {hubAuthorizationExport.fileLabel}. Give this
                          file only to your own Hub operator.
                        </small>
                      )}
                      {hubAuthorizationExport.kind === "failure" && (
                        <small className="is-error" role="alert">
                          Could not save the file. Check disk space and
                          permissions.
                        </small>
                      )}
                    </div>
                    <label>
                      Hub address
                      <input
                        type="url"
                        required
                        disabled={hubEnrollment.kind === "connecting"}
                        aria-invalid={hubEnrollment.kind === "failure"}
                        aria-describedby={
                          hubEnrollment.kind === "failure"
                            ? "hub-enrollment-error"
                            : undefined
                        }
                        value={hubOrigin}
                        onChange={(event) => setHubOrigin(event.target.value)}
                        placeholder="https://hub.example.com"
                      />
                    </label>
                    <label>
                      Device name
                      <input
                        required
                        maxLength={80}
                        disabled={hubEnrollment.kind === "connecting"}
                        aria-invalid={hubEnrollment.kind === "failure"}
                        aria-describedby={
                          hubEnrollment.kind === "failure"
                            ? "hub-enrollment-error"
                            : undefined
                        }
                        value={deviceLabel}
                        onChange={(event) => setDeviceLabel(event.target.value)}
                        placeholder="Travel MacBook"
                      />
                    </label>
                    <label>
                      Enrollment code
                      <input
                        type="password"
                        required
                        minLength={32}
                        data-recovery-field="enrollment-secret"
                        autoComplete="off"
                        spellCheck={false}
                        disabled={hubEnrollment.kind === "connecting"}
                        aria-invalid={hubEnrollment.kind === "failure"}
                        aria-describedby={
                          hubEnrollment.kind === "failure"
                            ? "hub-enrollment-error"
                            : undefined
                        }
                        value={enrollmentSecret}
                        onChange={(event) =>
                          setEnrollmentSecret(event.target.value)
                        }
                        placeholder="One-time code from the Hub"
                      />
                    </label>
                    {hubEnrollment.kind === "failure" && (
                      <p
                        id="hub-enrollment-error"
                        className="hub-enrollment-feedback is-error"
                        role="alert"
                      >
                        {hubEnrollment.message}
                      </p>
                    )}
                    {hubEnrollment.kind === "success" && (
                      <p className="hub-enrollment-feedback" role="status">
                        Device connected. The first checkpoint was verified.
                      </p>
                    )}
                    <button
                      className="secondary-button"
                      type="submit"
                      data-recovery-action="hub-enroll"
                      disabled={hubEnrollment.kind === "connecting"}
                    >
                      {hubEnrollment.kind === "connecting"
                        ? "Connecting and verifying…"
                        : "Connect to the Hub"}
                    </button>
                  </form>
                )}
            </>
          )}
        </section>

        <ReleaseContinuity client={client} />

        <div className="recovery-chain" aria-label="Safe restore path">
          <span>Verified backup</span>
          <i aria-hidden="true" />
          <span>Restore preview</span>
          <i aria-hidden="true" />
          <span>Last good workspace</span>
        </div>

        {recoveredPrevious && state.kind === "ready" && (
          <div className="recovery-notice" role="status">
            <strong>Recovered the last good workspace.</strong>
            <span>
              The previous restore stopped before verification. The candidate
              did not replace your data.
            </span>
          </div>
        )}

        <div className="recovery-content" aria-live="polite">
          {(state.kind === "ready" || state.kind === "failure") && (
            <>
              {state.kind === "failure" && (
                <div
                  id="recovery-failure"
                  className="recovery-error"
                  role="alert"
                >
                  <strong>Operation stopped</strong>
                  <span>{failureCopy[state.code]}</span>
                </div>
              )}
              {!restoreOnly && (
                <section className="recovery-section">
                  <div>
                    <h3>Create a portable backup</h3>
                    <p>
                      Constellation saves a verified, encrypted copy and shows a
                      separate recovery code.
                    </p>
                  </div>
                  <button
                    className="secondary-button"
                    data-recovery-action="backup-export"
                    onClick={exportBackup}
                  >
                    Export backup
                  </button>
                </section>
              )}
              <section className="recovery-section recovery-restore-section">
                <div>
                  <h3>Restore from a backup</h3>
                  <p>
                    The copy is verified and previewed first. The active
                    workspace changes only after you confirm.
                  </p>
                </div>
                <form onSubmit={prepareRestore}>
                  <label htmlFor="workspace-recovery-code">Recovery code</label>
                  <div className="recovery-code-entry">
                    <input
                      id="workspace-recovery-code"
                      ref={codeInputRef}
                      type="password"
                      aria-invalid={
                        state.kind === "failure" &&
                        (state.code === "recovery_code_invalid" ||
                          state.code === "archive_invalid" ||
                          state.code === "archive_unsupported" ||
                          state.code === "workspace_identity_invalid")
                      }
                      aria-describedby={
                        state.kind === "failure"
                          ? "recovery-failure"
                          : undefined
                      }
                      value={recoveryCode}
                      onChange={(event) => setRecoveryCode(event.target.value)}
                      placeholder="cst1_…"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button
                      className="primary-button"
                      type="submit"
                      data-recovery-action="restore-prepare"
                      disabled={!recoveryCode.trim()}
                    >
                      Choose and verify backup
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
                    ? "Creating and verifying the backup"
                    : "Verifying the backup in isolation"}
                </strong>
                <span>
                  {state.kind === "exporting"
                    ? "The file appears only after the integrity check passes."
                    : "The active workspace stays open and unchanged."}
                </span>
              </div>
            </div>
          )}

          {state.kind === "code-issued" && (
            <div className="recovery-code-result">
              <p className="eyebrow">Backup verified</p>
              <h3>Store the code apart from the file</h3>
              <p>
                The backup cannot be opened without this code. Constellation
                keeps no copy of it. This window closes once you confirm “Code
                saved”.
              </p>
              <div className="recovery-code-value">
                <code>{state.result.recoveryCode}</code>
                <button
                  className="secondary-button compact"
                  onClick={() => {
                    void client
                      .copyWorkspaceRecoveryCode({
                        recoveryCode: state.result.recoveryCode,
                      })
                      .then((result) =>
                        setCopyStatus(
                          result.outcome === "success" ? "copied" : "failed",
                        ),
                      )
                      .catch(() => setCopyStatus("failed"));
                  }}
                >
                  {copyStatus === "copied" ? "Copied" : "Copy code"}
                </button>
              </div>
              {copyStatus === "failed" && (
                <span className="recovery-copy-failure">
                  The clipboard is unavailable. Select the code and copy it
                  manually.
                </span>
              )}
              <dl className="recovery-facts">
                <div>
                  <dt>File</dt>
                  <dd>{state.result.fileLabel}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatDateTime(state.result.metadata.createdAt)}</dd>
                </div>
                <div>
                  <dt>Data size</dt>
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
                  Code saved
                </button>
              </footer>
            </div>
          )}

          {state.kind === "preview" && (
            <div className="restore-preview">
              <p className="eyebrow">Backup ready to restore</p>
              <h3>{state.result.metadata.workspaceName}</h3>
              <p>
                The copy passed verification. Confirming keeps the current
                workspace and opens the restored data.
              </p>
              <dl className="restore-counts">
                <div>
                  <dt>Captures</dt>
                  <dd>{state.result.counts.captures}</dd>
                </div>
                <div>
                  <dt>Tasks</dt>
                  <dd>{state.result.counts.tasks}</dd>
                </div>
                <div>
                  <dt>Projects</dt>
                  <dd>{state.result.counts.projects}</dd>
                </div>
                <div>
                  <dt>Audit receipts</dt>
                  <dd>{state.result.counts.auditReceipts}</dd>
                </div>
              </dl>
              <div className="restore-preview-meta">
                <span>{formatDateTime(state.result.metadata.createdAt)}</span>
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
                  Cancel
                </button>
                <button className="primary-button" onClick={confirmRestore}>
                  Restore and reopen
                </button>
              </footer>
            </div>
          )}

          {state.kind === "restoring" && (
            <div className="recovery-progress" aria-busy="true">
              <span className="recovery-progress-mark" aria-hidden="true" />
              <div>
                <strong>Restoring the verified workspace</strong>
                <span>
                  The last good version is kept until the workspace reopens.
                </span>
              </div>
            </div>
          )}
        </div>
      </section>
    </dialog>
  );
};
