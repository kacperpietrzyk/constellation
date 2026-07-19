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
          "Workspace jest gotowy, ale nie udało się odświeżyć aplikacji. Spróbuj ponownie.",
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
            <p className="eyebrow">Jedno źródło prawdy</p>
            <h2 id="onboarding-title" ref={titleRef} tabIndex={-1}>
              Praca zachowuje kontekst
            </h2>
            <p>
              Capture przyjmuje wejście bez klasyfikacji. Obszary, inicjatywy,
              projekty, zadania, dokumenty, spotkania i relacje pozostają
              typowanymi rekordami jednego grafu.
            </p>
            <div
              className="onboarding-thread evidence-thread"
              aria-hidden="true"
            >
              <span className="evidence-node">Capture</span>
              <i aria-hidden="true" />
              <span className="evidence-node">Praca</span>
              <i aria-hidden="true" />
              <span className="evidence-node">Wynik</span>
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="onboarding-step">
            <p className="eyebrow">Twój workspace</p>
            <h2 id="onboarding-title" ref={titleRef} tabIndex={-1}>
              Nazwij miejsce pracy
            </h2>
            <p>
              Ten workspace ma własny Data Home, zakres dostępu i możliwość
              eksportu. Nazwę możesz później zmienić w Ustawieniach.
            </p>
            <label>
              <span>Nazwa workspace</span>
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
                {snapshot.dataHome?.descriptor.displayName ?? "Tylko lokalnie"}
              </strong>
              <span>
                {snapshot.dataHome === undefined
                  ? "Stan Data Home sprawdzisz po otwarciu workspace."
                  : snapshot.dataHome.descriptor.storageRole === "canonical"
                    ? "To urządzenie przechowuje źródło prawdy."
                    : "Dane korzystają ze skoordynowanego Data Home."}
              </span>
            </aside>
          </div>
        )}
        {step === 2 && (
          <div className="onboarding-step">
            <p className="eyebrow">Szybki start</p>
            <h2 id="onboarding-title" ref={titleRef} tabIndex={-1}>
              Ty i agenci używacie tych samych operacji
            </h2>
            <ul>
              <li>
                <kbd>⌘/Ctrl ⇧ K</kbd>
                <span>Quick Capture z dowolnego miejsca.</span>
              </li>
              <li>
                <kbd>⌘/Ctrl K</kbd>
                <span>Paleta widoków i lokalne wyszukiwanie.</span>
              </li>
              <li>
                <strong>MCP</strong>
                <span>
                  Agenci działają w jawnym zakresie możliwości i Space, z
                  audytem i cofaniem.
                </span>
              </li>
            </ul>
            <p className="onboarding-note">
              Constellation nie uruchamia modeli i nie zawiera czatu. Jamie
              pozostaje właścicielem nagrywania i transkrypcji.
            </p>
          </div>
        )}
        {renameError !== undefined && (
          <p
            id="onboarding-rename-error"
            className="onboarding-feedback is-error"
            role="alert"
          >
            Nazwa nie została zapisana. {renameError}{" "}
            {step !== 1 && (
              <button
                type="button"
                className="text-button"
                onClick={() => setStep(1)}
              >
                Popraw nazwę
              </button>
            )}
          </p>
        )}
        {skipConfirm && renameError === undefined && (
          <p className="onboarding-feedback" role="status">
            Pominąć wprowadzenie? Naciśnij Esc ponownie albo wybierz „Pomiń
            wprowadzenie”. Ten ekran nie pokaże się przy kolejnym otwarciu.
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
            Wstecz
          </button>
          <div className="onboarding-forward">
            <button
              type="button"
              className="quiet-button"
              disabled={busy}
              onClick={() => void skip()}
            >
              Pomiń wprowadzenie
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
                Dalej
              </button>
            ) : (
              <button
                type="button"
                className="primary-button"
                disabled={busy || !name.trim()}
                onClick={() => void finish()}
              >
                {busy ? "Przygotowuję…" : "Otwórz workspace"}
              </button>
            )}
          </div>
        </footer>
      </section>
    </dialog>
  );
};
