// Agent writes land in the same graph this window is showing, but the window
// holds its own projection: without a re-read it keeps rendering the state it
// opened with, and a correct agent write reads as a missing one.
//
// Ta logika mieszkała w domknięciu `useEffect` w RealApp.tsx i jej JEDYNYM
// pokryciem była asercja `assert.match(realApp, /AGENT_WRITE_RELOAD_DELAY_MS/)`
// — czyli sprawdzenie, że stała jest zadeklarowana. Taki test przechodzi przy
// dowolnie zepsutym sklejaniu: przy zerowym opóźnieniu, przy zgubionym filtrze
// cudzego workspace'u, przy przeładowaniu na każde zdarzenie. `real-workflow`
// zaślepia `onWorkspaceChanged`, więc nie łapał tego nikt inny.
//
// Wydzielenie jest po to, żeby dało się to sprawdzić ZACHOWANIEM, bez
// renderowania Reacta — i żeby przeżyło rozbicie RealApp.tsx.

export const AGENT_WRITE_RELOAD_DELAY_MS = 400;

export type WorkspaceChangedEvent = { readonly workspaceId: string };

type Timer = ReturnType<typeof setTimeout>;

export type AgentWriteReloadOptions = {
  /** Zapisuje słuchacza i oddaje odpięcie — dokładnie `client.onWorkspaceChanged`. */
  readonly subscribe: (
    listener: (event: WorkspaceChangedEvent) => void,
  ) => () => void;
  /**
   * Workspace, który to okno pokazuje TERAZ. Czytany przy każdym zdarzeniu, nie
   * domykany raz: okno potrafi przełączyć workspace bez ponownego zapisu.
   * `undefined` znaczy „jeszcze nie wiadomo" i wtedy nie odrzucamy niczego —
   * inaczej pierwsze zapisy agenta ginęłyby w czasie startu.
   */
  readonly currentWorkspaceId: () => string | undefined;
  readonly reload: () => void;
  readonly delayMs?: number;
  readonly schedule?: (run: () => void, delayMs: number) => Timer;
  readonly cancel?: (timer: Timer) => void;
};

/**
 * Przeładowuje snapshot RAZ na serię zapisów agenta, ignorując zapisy do
 * cudzego workspace'u. Zwraca odpięcie, które kasuje też lot w toku.
 *
 * Sklejanie jest wiodące krawędzią-późną: pierwsze zdarzenie ustawia lot,
 * każde kolejne w oknie opóźnienia jest pochłonięte, a przeładowanie wykonuje
 * się raz po opóźnieniu — bo migracja stosuje się partiami i przeładowanie na
 * każdą komendę zrobiłoby z okna pętli sprzężenia.
 */
export const subscribeToAgentWrites = ({
  subscribe,
  currentWorkspaceId,
  reload,
  delayMs = AGENT_WRITE_RELOAD_DELAY_MS,
  schedule = setTimeout,
  cancel = clearTimeout,
}: AgentWriteReloadOptions): (() => void) => {
  let pending: Timer | undefined;

  const unsubscribe = subscribe((event) => {
    const mine = currentWorkspaceId();
    if (mine !== undefined && event.workspaceId !== mine) return;
    if (pending !== undefined) return;
    pending = schedule(() => {
      pending = undefined;
      reload();
    }, delayMs);
  });

  return () => {
    if (pending !== undefined) {
      cancel(pending);
      pending = undefined;
    }
    unsubscribe();
  };
};
