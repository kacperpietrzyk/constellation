import { useEffect, useRef, useState } from "react";

import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  renameWorkspace,
  type DesktopSnapshot,
  type MutationFailure,
} from "./client/workflow.js";

export const OnboardingFlow = ({
  client,
  snapshot,
  onComplete,
  onFailure,
}: {
  readonly client: ConstellationRendererClient;
  readonly snapshot: DesktopSnapshot;
  readonly onComplete: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(snapshot.bootstrap.workspace.name);
  const [busy, setBusy] = useState(false);
  const [renameError, setRenameError] = useState<string>();
  const [skipConfirm, setSkipConfirm] = useState(false);
  useEffect(() => {
    dialogRef.current?.showModal();
    return () => dialogRef.current?.close();
  }, []);
  useEffect(() => {
    titleRef.current?.focus();
  }, [step]);

  const complete = async () => {
    localStorage.setItem(
      `constellation.onboarded:${snapshot.bootstrap.workspace.id}`,
      "1",
    );
    try {
      await onComplete();
    } catch {
      localStorage.removeItem(
        `constellation.onboarded:${snapshot.bootstrap.workspace.id}`,
      );
      onFailure({
        kind: "unavailable",
        message:
          "The workspace is ready, but the app could not refresh. Try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    setRenameError(undefined);
    if (name.trim() !== snapshot.bootstrap.workspace.name) {
      const result = await renameWorkspace(client, snapshot, name.trim());
      if (result.kind !== "success") {
        // Inline in the card: a notice behind the open modal would be
        // invisible and the flow would look silently stuck.
        setBusy(false);
        setRenameError(result.message);
        return;
      }
    }
    await complete();
  };

  const skip = async () => {
    if (busy) return;
    setBusy(true);
    await complete();
  };

  return (
    <dialog
      ref={dialogRef}
      className="onboarding-backdrop"
      aria-labelledby="onboarding-title"
      onCancel={(event) => {
        event.preventDefault();
        if (busy) return;
        // First Esc arms a visible confirmation; only the second one skips,
        // because skipping hides the intro on every next launch.
        if (skipConfirm) {
          void skip();
          return;
        }
        setSkipConfirm(true);
      }}
      onClose={() => {
        // Chromium's CloseWatcher lets a second Esc close the dialog natively
        // despite preventDefault() in onCancel. During a save the modal must
        // stay on screen; otherwise a native close counts as skipping, so the
        // onboarding state is never orphaned behind a closed dialog.
        const dialog = dialogRef.current;
        if (dialog === null || !dialog.isConnected) return;
        if (busy) {
          dialog.showModal();
          return;
        }
        void skip();
      }}
    >
      <section className="onboarding-card">
        <header>
          <span>0{step + 1} / 03</span>
          <strong>Constellation</strong>
        </header>
        {step === 0 && (
          <div className="onboarding-step">
            <p className="eyebrow">One source of truth</p>
            <h2 id="onboarding-title" ref={titleRef} tabIndex={-1}>
              Work keeps its context
            </h2>
            <p>
              Capture takes input without sorting it. Everything else stays a
              typed record in one graph.
            </p>
            <div
              className="onboarding-thread evidence-thread"
              aria-hidden="true"
            >
              <span className="evidence-node">Capture</span>
              <i aria-hidden="true" />
              <span className="evidence-node">Work</span>
              <i aria-hidden="true" />
              <span className="evidence-node">Outcome</span>
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="onboarding-step">
            <p className="eyebrow">Your workspace</p>
            <h2 id="onboarding-title" ref={titleRef} tabIndex={-1}>
              Name your workspace
            </h2>
            <p>
              This workspace has its own Data Home and access scope. You can
              rename it later in Settings.
            </p>
            <label>
              <span>Workspace name</span>
              <input
                value={name}
                maxLength={80}
                aria-invalid={renameError !== undefined}
                aria-describedby={
                  renameError === undefined
                    ? undefined
                    : "onboarding-rename-error"
                }
                onChange={(event) => {
                  setName(event.target.value);
                  setRenameError(undefined);
                }}
                required
              />
            </label>
            <aside>
              <strong>
                {snapshot.dataHome?.descriptor.displayName ?? "Local only"}
              </strong>
              <span>
                {snapshot.dataHome === undefined
                  ? "Data Home status shows once the workspace opens."
                  : snapshot.dataHome.descriptor.storageRole === "canonical"
                    ? "This device holds the source of truth."
                    : "Data uses a coordinated Data Home."}
              </span>
            </aside>
          </div>
        )}
        {step === 2 && (
          <div className="onboarding-step">
            <p className="eyebrow">Quick start</p>
            <h2 id="onboarding-title" ref={titleRef} tabIndex={-1}>
              You and agents use the same operations
            </h2>
            <ul>
              <li>
                <kbd>⌘/Ctrl ⇧ K</kbd>
                <span>Quick Capture from anywhere.</span>
              </li>
              <li>
                <kbd>⌘/Ctrl K</kbd>
                <span>View palette and local search.</span>
              </li>
              <li>
                <strong>MCP</strong>
                <span>
                  Agents work inside an explicit capability and Space scope,
                  audited and reversible.
                </span>
              </li>
            </ul>
            <p className="onboarding-note">
              Constellation runs no models and has no chat. Jamie still owns
              recording and transcription.
            </p>
          </div>
        )}
        {renameError !== undefined && (
          <p
            id="onboarding-rename-error"
            className="onboarding-feedback is-error"
            role="alert"
          >
            The name was not saved. {renameError}{" "}
            {step !== 1 && (
              <button
                type="button"
                className="text-button"
                onClick={() => setStep(1)}
              >
                Fix the name
              </button>
            )}
          </p>
        )}
        {skipConfirm && renameError === undefined && (
          <p className="onboarding-feedback" role="status">
            Skip the intro? Press Esc again or choose “Skip intro”. This screen
            will not show up next time.
          </p>
        )}
        <footer>
          <button
            type="button"
            className="secondary-button"
            disabled={step === 0 || busy}
            onClick={() => {
              setSkipConfirm(false);
              setStep((current) => current - 1);
            }}
          >
            Back
          </button>
          <div className="onboarding-forward">
            <button
              type="button"
              className="quiet-button"
              disabled={busy}
              onClick={() => void skip()}
            >
              Skip intro
            </button>
            {step < 2 ? (
              <button
                type="button"
                className="primary-button"
                disabled={step === 1 && !name.trim()}
                onClick={() => {
                  setSkipConfirm(false);
                  setStep((current) => current + 1);
                }}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className="primary-button"
                disabled={busy || !name.trim()}
                onClick={() => void finish()}
              >
                {busy ? "Preparing…" : "Open workspace"}
              </button>
            )}
          </div>
        </footer>
      </section>
    </dialog>
  );
};
