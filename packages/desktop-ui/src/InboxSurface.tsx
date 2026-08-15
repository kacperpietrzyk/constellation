import { captureRecoveryActions } from "./CollaborationSurfaces.js";
import type { AttentionInboxProjection, DataSlice } from "./client/workflow.js";
import { TopicHelp } from "./help/TopicHelp.js";
import { useListNavigation } from "./hooks/useListNavigation.js";
import { countLabel, formatDateTime, recordKindLabels } from "./i18n.js";
import {
  inboxCountIsFloor,
  inboxReasonLabels,
  inboxWaitingCount,
  splitInbox,
  type InboxSignal,
} from "./inbox-triage.js";
import styles from "./inbox.module.css";

// Inbox rozdzielony na twardo, a nie filtrem, który trzeba sobie ustawić.
//
// Czego tu NIE MA, świadomie:
//   • zakładki „odrzucone" — odrzucona pozycja nie wraca z zapytania, więc taka
//     zakładka byłaby zawsze pusta i kłamałaby o tym, że coś da się odzyskać;
//   • cofania odrzucenia — komenda ma `revertability: "never"`, a przycisk
//     obiecujący powrót jest obietnicą, której kernel nie umie dotrzymać;
//   • filtrów, grupowania i akcji zbiorczych — triage sygnału to trzy rzeczy:
//     przeczytane, odrzuć, otwórz rekord.
//
// Nazwa sekcji jest CAŁYM wyjaśnieniem podziału. Gdyby przestała wystarczać,
// poprawia się nazwę, a nie dopisuje akapit pod nią.

// Nazwa rodzaju rekordu przychodzi z rejestru rodzajów, a nie z napisu wpisanego
// tutaj: kontrakt tego rejestru mówi, że KAŻDY ekran bierze nazwy stamtąd, więc
// przemianowanie „Document" na coś innego ma dotrzeć także tu. Zdanie składamy
// sami, bo rejestr niesie samą nazwę — „Open" i człon „history" to już treść
// tego ekranu.
const openVerb = (kind: string, fallback: string): string =>
  `Open ${(recordKindLabels[kind] ?? fallback).toLowerCase()}`;

/** Dokąd prowadzi wiersz. Kontrakt nie ma celu „komentarz": wzmianka ląduje
 *  na rekordzie, przy którym komentarz wisi — na zadaniu, projekcie,
 *  organizacji albo szansie. */
const openLabels: {
  readonly [kind in InboxSignal["destination"]["kind"]]: string;
} = {
  task: openVerb("task", "task"),
  project: openVerb("project", "project"),
  organization: openVerb("organization", "organization"),
  opportunity: openVerb("opportunity", "opportunity"),
  document: openVerb("document", "document"),
  // Wrzut nie prowadzi do rekordu, tylko do HISTORII wrzucania — tam widać, co
  // się z nim stało. Rejestr zna ten rodzaj pod `inspectorSurface: "library"`
  // — Historia wrzutek jest odczytem Biblioteki, nie własnym celem.
  capture: `${openVerb("capture", "capture")} history`,
};

export type InboxSurfaceProps = {
  readonly attention: DataSlice<AttentionInboxProjection>;
  readonly selectedItemId: string | undefined;
  readonly busy: boolean;
  readonly timezone?: string;
  readonly onSelect: (item: InboxSignal) => void;
  readonly onOpen: (item: InboxSignal) => void;
  readonly onMarkRead: (item: InboxSignal) => void;
  readonly onDismiss: (item: InboxSignal) => void;
  readonly onRouteCapture: (
    item: InboxSignal,
    destination: "task" | "knowledge_source",
  ) => void;
  readonly onRetryCapture: (item: InboxSignal) => void;
  readonly onReplaceCapturePayload: (item: InboxSignal) => void;
  readonly onKeepCapture: (item: InboxSignal) => void;
  /** Ponawia wczytanie skrzynki, gdy projekcja była niedostępna. */
  readonly onRetryLoad: () => void;
};

export const InboxSurface = ({
  attention,
  selectedItemId,
  busy,
  timezone,
  onSelect,
  onOpen,
  onMarkRead,
  onDismiss,
  onRouteCapture,
  onRetryCapture,
  onReplaceCapturePayload,
  onKeepCapture,
  onRetryLoad,
}: InboxSurfaceProps) => {
  const items = attention.kind === "ready" ? attention.data.items : [];
  // Jedno rozdzielenie na cały ekran. Drugie liczenie tej samej rzeczy jest
  // defektem, z którego wzięła się DECYZJA #22 — więc go tu nie ma.
  const mailboxes = splitInbox(items);
  const waiting = inboxWaitingCount(items);
  // Zapytanie o skrzynkę ma limit, więc pełna projekcja może być projekcją
  // OBCIĘTĄ. Wtedy „50 rzeczy czeka" jest zdaniem o całości, którego zapytanie
  // nie ma czym pokryć — a liczba, która po cichu kłamie, jest gorsza niż jej
  // brak. Mówimy więc dolną granicę, bo tyle naprawdę wiemy.
  const waitingIsFloor = inboxCountIsFloor(items);

  const workNav = useListNavigation({
    itemCount: mailboxes.work.length,
    onSelect: (index) => {
      const item = mailboxes.work[index];
      if (item) onSelect(item);
    },
    onOpen: (index) => {
      const item = mailboxes.work[index];
      if (item) onOpen(item);
    },
  });
  const captureNav = useListNavigation({
    itemCount: mailboxes.captures.length,
    onSelect: (index) => {
      const item = mailboxes.captures[index];
      if (item) onSelect(item);
    },
    onOpen: (index) => {
      const item = mailboxes.captures[index];
      if (item) onOpen(item);
    },
  });

  const row = (
    item: InboxSignal,
    index: number,
    mailbox: "work" | "capture",
    nav: ReturnType<typeof useListNavigation>,
  ) => {
    // Powód mówi, CO się stało; cel mówi, na czym da się jeszcze zadziałać.
    // Same akcje odzyskiwania wychodzą z powodu, ale każda z nich kończy się
    // w powłoce komendą na wrzucie — a ta cicho odmawia, gdy cel nie jest
    // wrzutem. Przycisk, którego uchwyt nie ma jak zadziałać, jest przyciskiem
    // udającym, że coś robi; dlatego bramka pyta o OBIE rzeczy.
    const recovery =
      item.destination.kind === "capture"
        ? captureRecoveryActions(item.reason)
        : [];
    return (
      <li
        key={item.id}
        className={styles.row}
        data-inbox-row
        data-inbox-mailbox={mailbox}
        data-inbox-reason={item.reason}
        data-inbox-destination={item.destination.kind}
        data-inbox-state={item.state}
        data-inbox-urgency={item.urgency}
      >
        <button
          type="button"
          className={styles.rowMain}
          aria-pressed={selectedItemId === item.id}
          {...nav(index)}
          onClick={() => onSelect(item)}
          onDoubleClick={() => onOpen(item)}
        >
          {/* Pilność niesie KSZTAŁT, słowo i dopiero na końcu kolor. Sam kolor
              byłby niewidoczny dla części ludzi i znika w druku. */}
          <span
            className={styles.mark}
            data-inbox-mark={item.urgency}
            aria-hidden="true"
          >
            {item.urgency === "urgent" ? "▲" : "▪"}
          </span>
          <span className={styles.main}>
            <span className={styles.reason}>
              {inboxReasonLabels[item.reason]}
              {item.urgency === "urgent" && (
                <b className={styles.urgent} data-inbox-urgent>
                  Urgent
                </b>
              )}
              {item.state === "unread" && (
                <span className={styles.unread} data-inbox-unread>
                  <span className="sr-only">Unread</span>
                </span>
              )}
            </span>
            <span className={styles.title} data-row-title>
              {item.title}
            </span>
            <span className={styles.detail}>{item.detail}</span>
          </span>
          <time className={styles.when} dateTime={item.occurredAt}>
            {formatDateTime(item.occurredAt, timezone)}
          </time>
        </button>
        <span className={styles.actions}>
          <button
            type="button"
            className="secondary-button compact"
            data-inbox-action="open"
            disabled={busy}
            onClick={() => onOpen(item)}
          >
            {openLabels[item.destination.kind]}
          </button>
          {/* Wyjścia dla wrzutu bierzemy z jednego miejsca w repo. Przepisana
              tu mapa powodów na akcje rozjechałaby się z tamtą po cichu. */}
          {recovery.includes("route") && (
            <>
              <button
                type="button"
                className="ghost-button compact"
                data-inbox-action="route"
                data-inbox-route="task"
                disabled={busy}
                onClick={() => onRouteCapture(item, "task")}
              >
                Create task
              </button>
              <button
                type="button"
                className="ghost-button compact"
                data-inbox-action="route"
                data-inbox-route="knowledge_source"
                disabled={busy}
                onClick={() => onRouteCapture(item, "knowledge_source")}
              >
                Save as source
              </button>
            </>
          )}
          {recovery.includes("retry") && (
            <button
              type="button"
              className="ghost-button compact"
              data-inbox-action="retry"
              disabled={busy}
              onClick={() => onRetryCapture(item)}
            >
              Try again
            </button>
          )}
          {recovery.includes("replace_payload") && (
            <button
              type="button"
              className="ghost-button compact"
              data-inbox-action="replace_payload"
              disabled={busy}
              onClick={() => onReplaceCapturePayload(item)}
            >
              Replace original
            </button>
          )}
          {recovery.includes("keep_unclassified") && (
            <button
              type="button"
              className="ghost-button compact"
              data-inbox-action="keep_unclassified"
              disabled={busy}
              onClick={() => onKeepCapture(item)}
            >
              Keep unclassified
            </button>
          )}
          {item.state === "unread" && (
            <button
              type="button"
              className="ghost-button compact"
              data-inbox-action="read"
              disabled={busy}
              onClick={() => onMarkRead(item)}
            >
              Mark as read
            </button>
          )}
          <button
            type="button"
            className="ghost-button compact"
            data-inbox-action="dismiss"
            disabled={busy}
            onClick={() => onDismiss(item)}
          >
            Dismiss
          </button>
        </span>
      </li>
    );
  };

  return (
    <div className={`surface-scroll ${styles.inbox}`}>
      {/* PASMO JEDNOWIERSZOWE: NAZWA PO LEWEJ, LICZBA PO PRAWEJ. Prototyp:
          `crumbbar("Inbox", <span class="when">4 to decide · 3 to route</span>)`
          (`v3/screens/inbox.js:287-288`) — po lewej jedno nazwanie, nic nad nim.
          Stał tu nadtytuł „Signals and captures", czyli zdanie TŁUMACZĄCE ekran
          w miejscu, w którym prototyp go NAZYWA (wpis 3-2 rejestru przejścia),
          i pasmo rysowało przez niego dwa wiersze. Nazwa, która przestaje
          wystarczać, poprawia się w NAZWIE — dokładnie to mówi nota przy
          crumbbarze Skrzynki w prototypie (`v3/screens/inbox.js:283-286`). */}
      <header className="surface-header">
        <h1 id="surface-title" tabIndex={-1}>
          Inbox
        </h1>
        {attention.kind === "ready" && (
          <p
            className={styles.waiting}
            data-inbox-waiting={waiting}
            data-inbox-waiting-floor={waitingIsFloor ? "true" : "false"}
          >
            <strong>
              {waitingIsFloor ? "At least " : ""}
              {countLabel(waiting, "thing")}
            </strong>{" "}
            waiting
          </p>
        )}
      </header>

      {attention.kind === "unavailable" ? (
        // Niedostępne to NIE to samo co puste. Pusta lista czyta się jako
        // „nic na Ciebie nie czeka" i jest wtedy kłamstwem.
        <section
          className={styles.failed}
          role="alert"
          data-surface-state="failed"
        >
          <h2>Inbox could not be loaded</h2>
          <p>Nothing was read, routed or dismissed.</p>
          <button
            type="button"
            className="secondary-button"
            data-surface-action="retry"
            onClick={onRetryLoad}
          >
            Try again
          </button>
        </section>
      ) : (
        <>
          <section className={styles.section} data-inbox-section="work">
            <div className={styles.sectionHead}>
              <h2 id="inbox-work">
                Needs a decision about work{" "}
                <span className={styles.count} data-inbox-count>
                  {mailboxes.work.length}
                </span>
              </h2>
              {/* WPIS 3-6 DOKUMENTU PRZEJŚCIA. Prototyp ma plakietkę przy OBU
                  głowach Skrzynki (`v3/screens/inbox.js:292` i `:301`),
                  ta apka nie miała jej przy żadnej — a to jest ekran, na
                  którym różnica między dwiema sekcjami JEST całą treścią:
                  pierwsza to decyzje o pracy, druga to rzeczy, które nie
                  weszły do systemu. Czytelnik, któremu nikt tego nie
                  powiedział, czyta dwie listy tego samego. Odstęp bierze
                  `gap` z `.sectionHead`. */}
              <TopicHelp topic="inbox-work" />
            </div>
            {mailboxes.work.length === 0 ? (
              <p className={styles.emptyState}>
                Nothing is waiting on a decision from you.
              </p>
            ) : (
              <ul
                className={styles.rows}
                role="list"
                aria-labelledby="inbox-work"
              >
                {mailboxes.work.map((item, index) =>
                  row(item, index, "work", workNav),
                )}
              </ul>
            )}
          </section>

          <section className={styles.section} data-inbox-section="capture">
            <div className={styles.sectionHead}>
              <h2 id="inbox-capture">
                Didn&apos;t make it into the system{" "}
                <span className={styles.count} data-inbox-count>
                  {mailboxes.captures.length}
                </span>
              </h2>
              {/* WPIS 3-6, DRUGA GŁOWA — `v3/screens/inbox.js:301`. */}
              <TopicHelp topic="inbox-plumbing" />
            </div>
            {mailboxes.captures.length === 0 ? (
              <p className={styles.emptyState}>
                Everything you threw in has a place.
              </p>
            ) : (
              <ul
                className={styles.rows}
                role="list"
                aria-labelledby="inbox-capture"
              >
                {mailboxes.captures.map((item, index) =>
                  row(item, index, "capture", captureNav),
                )}
              </ul>
            )}
          </section>

          {/* Ostrzeżenie stoi RAZ i jest krótkie. Kernel nie umie cofnąć
              odrzucenia, więc ekran nie proponuje cofania. */}
          <p className={styles.note} data-inbox-irreversible>
            Dismissing is permanent.
          </p>
        </>
      )}
    </div>
  );
};
