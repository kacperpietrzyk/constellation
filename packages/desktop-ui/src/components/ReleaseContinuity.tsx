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
    <section className="release-continuity" aria-labelledby={titleId}>
      <div>
        <p className="eyebrow">Aplikacja</p>
        <Heading id={titleId}>Aktualizacja bez utraty workspace’u</Heading>
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
