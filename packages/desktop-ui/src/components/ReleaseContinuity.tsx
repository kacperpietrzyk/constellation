import { useEffect, useId, useState } from "react";

import type {
  ConstellationRendererClient,
  ReleaseStatus,
} from "@constellation/desktop-preload/client";

// Shared release panel (check → download → install) used by the workspace
// recovery dialog and the Settings update section. Every client call is
// guarded: a broken channel degrades to a named failure state and the
// current application and workspace stay untouched.
export const ReleaseContinuity = ({
  client,
  headingLevel = 3,
}: {
  readonly client: ConstellationRendererClient;
  readonly headingLevel?: 2 | 3;
}) => {
  const [status, setStatus] = useState<ReleaseStatus>();
  const titleId = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";

  useEffect(() => {
    void client
      .getReleaseStatus()
      .then(setStatus)
      .catch(() =>
        setStatus({
          kind: "failure",
          currentVersion: "unknown",
          operation: "check",
          message:
            "Could not read the release channel. The workspace is unchanged.",
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
          "The release channel is unavailable. The app and workspace are unchanged.",
      });
    }
  };

  const currentVersion = status?.currentVersion ?? "…";
  const detail =
    status === undefined
      ? "Checking the signed release channel…"
      : status.kind === "unavailable"
        ? status.reason === "developer_preview"
          ? "The developer preview does not connect to the release channel."
          : status.reason === "mechanism_only_build"
            ? "This build verifies the installer and does not download updates."
            : status.reason === "platform_unsupported"
              ? "Updates for this platform are not supported yet."
              : "The release channel has no secure HTTPS address."
        : status.kind === "idle"
          ? "Checks are manual. Nothing downloads in the background."
          : status.kind === "checking"
            ? "Checking the signed release metadata…"
            : status.kind === "current"
              ? "You have the newest version from this channel."
              : status.kind === "available"
                ? `Version ${status.version} is available. Nothing downloads until you confirm.`
                : status.kind === "downloading"
                  ? `Downloading and verifying version ${status.version}…`
                  : status.kind === "ready"
                    ? `Version ${status.version} is verified and ready to restart.`
                    : status.kind === "installing"
                      ? `Closing the app and installing version ${status.version}…`
                      : status.message;

  return (
    <section className="release-continuity" aria-labelledby={titleId}>
      <div>
        <p className="eyebrow">App</p>
        <Heading id={titleId}>Update without losing the workspace</Heading>
        <p role={status?.kind === "failure" ? "alert" : "status"}>{detail}</p>
        <small>
          Version {currentVersion}. Uninstalling removes the app but keeps the
          encrypted workspace and its keys in the system store.
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
          {status.kind === "failure" ? "Try again" : "Check for updates"}
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
          Download and verify
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
          Restart and install
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
