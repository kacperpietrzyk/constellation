import type { AttentionInboxProjection } from "./client/workflow.js";

// Inbox to DWIE skrzynki zlepione w jedną, i podział jest tu całą rzeczą.
//
// `attention.inbox` niesie osiemnaście powodów. Osiem pyta „co z tym zrobisz"
// i prowadzi do rekordu — to jest MYŚLENIE. Dziesięć zaczyna się od `capture_`
// i pyta „gdzie to miało trafić" — to jest HYDRAULIKA. Mieszanie ich sprawia,
// że skrzynka raz jest narzędziem pracy, a raz dziennikiem błędów.
//
// Podział idzie po PRZEDROSTKU, a nie po drugiej liście powodów. Druga lista
// rozjechałaby się z kontraktem przy pierwszym nowym powodzie i nikt by tego
// nie zauważył — nowy powód po prostu wypadłby z obu kubełków i zniknął
// z ekranu. Przedrostek nie ma jak zgubić pozycji: wszystko, co nie jest
// awarią wrzucania, jest decyzją o pracy.
//
// Dlaczego to jest osobny plik bez Reacta: liczba przy Inboxie w powłoce ma
// znaczyć „tyle rzeczy na Ciebie czeka" (DECYZJA #22), a liczby sprawdza się
// asercją. Policzenie jej DRUGI RAZ w drugim miejscu jest dokładnie tym
// defektem, z którego ta decyzja powstała — plakietka mówiła pięć, ekran
// pokazywał siedem, obie o tej samej skrzynce.

export type InboxSignal = AttentionInboxProjection["items"][number];
export type InboxReason = InboxSignal["reason"];

/**
 * Ile pozycji skrzynki wolno wciągnąć jednym zapytaniem. Limit stoi TUTAJ,
 * a nie przy wywołaniu zapytania, bo to ten moduł odpowiada za znaczenie liczby
 * na ekranie — a liczba i granica, o którą się obcięła, muszą być jedną wiedzą.
 */
export const ATTENTION_INBOX_LIMIT = 100;

/**
 * Czy zapytanie oddało dokładnie tyle, ile mogło — czyli czy reszta została
 * ucięta. Wtedy „tyle rzeczy czeka" przestaje być zdaniem prawdziwym: czeka co
 * najmniej tyle. Liczone z SUROWEJ listy z projekcji, nie z rozdzielonej —
 * `splitInbox` odrzuca pozycje `dismissed`, więc kubełki potrafią być krótsze
 * niż limit, choć zapytanie i tak obcięło resztę.
 */
export const inboxCountIsFloor = (items: readonly InboxSignal[]): boolean =>
  items.length >= ATTENTION_INBOX_LIMIT;

/** Awaria wrzucania — hydraulika do naprawy, nie praca do przemyślenia. */
export const isCaptureFailure = (reason: InboxReason): boolean =>
  reason.startsWith("capture_");

/**
 * Nazwa powodu, którą czyta człowiek. Typ mapowany po unii z kontraktu wymusza
 * KOMPLETNOŚĆ: nowy powód nie przejdzie typecheck bez etykiety, więc surowy
 * identyfikator z kontraktu nie ma jak trafić na ekran.
 *
 * To JEDYNA taka mapa w repo i mieszka tutaj, a nie w ekranie, bo czytają ją
 * dwa ekrany. Kopia stała wcześniej w `CollaborationSurfaces.tsx` i zdążyła
 * się rozjechać na `capture_duplicate` („Duplicate Capture" kontra „Duplicate
 * capture") — niewidocznie, bo lista pisze powód wersalikami. Etykiety idą
 * zdaniowo: wersaliki są sprawą arkusza stylów, nie treści.
 */
export const inboxReasonLabels: {
  readonly [reason in InboxReason]: string;
} = {
  comment_mention: "Mention",
  task_assignment: "Responsibility",
  sync_conflict: "Sync conflict",
  knowledge_evidence_changed: "Evidence changed",
  renewal_due: "Renewal due",
  waiting_review_elapsed: "Waiting review overdue",
  relationship_fact_stale: "Stale relationship fact",
  decision_impact_review: "Impact review due",
  capture_duplicate: "Duplicate capture",
  capture_ambiguous: "Unclear destination",
  capture_unsupported: "Unsupported original",
  capture_parsing_failure: "Read error",
  capture_permission_failure: "Missing permission",
  capture_stale_conflict: "Stale version",
  capture_missing_target: "Missing target",
  capture_missing_payload: "Missing original",
  capture_partial_payload_transfer: "Partial transfer",
  capture_unknown_reconcile: "Unknown outcome",
};

export type InboxMailboxes = {
  /** Sygnały, które pytają o decyzję o pracy. */
  readonly work: readonly InboxSignal[];
  /** Wrzuty, które nie weszły do systemu. */
  readonly captures: readonly InboxSignal[];
};

const urgencyRank = (signal: InboxSignal): number =>
  signal.urgency === "urgent" ? 0 : 1;

// Pilne prowadzi, dalej najnowsze. Identyfikator na końcu wyłącznie po to, by
// porządek był TOTALNY: dwa sygnały o tej samej sekundzie nie mogą zamieniać
// się miejscami między renderami, bo wiersz uciekałby spod kursora.
const byUrgencyThenNewest = (left: InboxSignal, right: InboxSignal): number =>
  urgencyRank(left) - urgencyRank(right) ||
  right.occurredAt.localeCompare(left.occurredAt) ||
  left.id.localeCompare(right.id);

/**
 * Rozdziela skrzynkę na dwie populacje i porządkuje obie. To JEDYNE miejsce,
 * które filtruje i sortuje — ekran renderuje dokładnie to, co tu wyszło,
 * a plakietka liczy dokładnie to samo.
 *
 * `dismissed` odpada, choć kontrakt i tak takich nie zwraca: pozycja odrzucona
 * nie wraca z zapytania, więc zakładka „odrzucone" jest na tym kontrakcie
 * niemożliwa, a pozostawienie takiej pozycji w kubełku dawałoby liczbę
 * większą niż to, co widać.
 */
export const splitInbox = (items: readonly InboxSignal[]): InboxMailboxes => {
  const waiting = items.filter((item) => item.state !== "dismissed");
  return {
    work: waiting
      .filter((item) => !isCaptureFailure(item.reason))
      .toSorted(byUrgencyThenNewest),
    captures: waiting
      .filter((item) => isCaptureFailure(item.reason))
      .toSorted(byUrgencyThenNewest),
  };
};

/**
 * DECYZJA #22: ile rzeczy czeka w skrzynce — sygnały I wrzuty razem.
 *
 * Liczone z tej samej listy, którą ekran renderuje, przez to samo rozdzielenie.
 * Świadomie NIE jest to `unreadCount`: przeczytany sygnał dalej leży na ekranie
 * i dalej czeka, więc oznaczenie jako przeczytane NIE zmniejsza tej liczby —
 * zmniejsza ją dopiero odrzucenie, czyli zniknięcie wiersza. Liczba, która
 * spada, gdy nic nie zniknęło, przestaje znaczyć „tyle tu leży".
 */
export const inboxWaitingCount = (items: readonly InboxSignal[]): number => {
  const mailboxes = splitInbox(items);
  return mailboxes.work.length + mailboxes.captures.length;
};
