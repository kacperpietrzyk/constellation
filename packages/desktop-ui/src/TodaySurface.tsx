import { useEffect, useState } from "react";

import type { TaskId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  ConceptHelpDialog,
  type ConceptHelpTopicId,
} from "./components/ConceptHelpDialog.js";
import { calendarReadRefusal } from "./client/calendar-reservation.js";
import type { DesktopSnapshot } from "./client/workflow.js";
import {
  countLabel,
  dateKeyInZone,
  dayDistance,
  formatDate,
  formatTime,
} from "./i18n.js";
import {
  approachingUnplanned,
  dayCapacity,
  daysUntil,
  formatSpan,
  plannedForDay,
  type CalendarMeeting,
  type PlannedTask,
} from "./today-plan.js";
import { useListNavigation } from "./hooks/useListNavigation.js";
import styles from "./today.module.css";

// Today odpowiada na jedno pytanie: „od czego zacząć". Stoi na `startAt`
// i na zarezerwowanych blokach, NIE na `dueAt` — ekran zbudowany na terminach
// jest ekranem cudzych obietnic.
//
// Czego tu NIE MA, świadomie:
//   • sygnałów z Inboxa — mieszkają tam i tylko tam, a powtarzanie ich tutaj
//     było źródłem wrażenia „po co mi to";
//   • bloków zbiorczych „waiting" i „blocked" — wiersz niesie sygnał, pulpit
//     go nie powtarza.

/** Ile dni naprzód termin bez planu ma prawo się odezwać. */
const WARNING_HORIZON_DAYS = 7;

type MeetingsState =
  | { readonly kind: "loading" }
  | { readonly kind: "refused"; readonly reason: string }
  | { readonly kind: "ready"; readonly meetings: readonly CalendarMeeting[] };

const principalName = (
  snapshot: DesktopSnapshot,
  principalId: string,
): string | undefined => {
  const access = snapshot.access;
  if (access.kind === "ready") {
    if (access.data.currentPrincipalId === principalId) return "You";
    const member = access.data.members.find(
      (candidate) => candidate.principalId === principalId,
    );
    if (member) return member.displayName;
  }
  const agents = snapshot.agentAccess;
  if (agents.kind === "ready") {
    const grant = agents.data.grants.find(
      (candidate) => candidate.agentPrincipalId === principalId,
    );
    if (grant) return grant.displayName;
  }
  return undefined;
};

// Kto położył pozycję na dniu. Przy uczącym się agencie to jest pytanie
// zadawane codziennie, więc odpowiedź stoi przy wierszu, a nie w audycie dwa
// kliknięcia dalej. Gdy imienia nie da się rozwiązać, mówimy rodzaj — „Agent"
// jest odpowiedzią, „" nie jest.
const plannerLabel = (
  snapshot: DesktopSnapshot,
  plannedBy: NonNullable<PlannedTask["plannedBy"]>,
): string => {
  const name = principalName(snapshot, plannedBy.principalId);
  if (name !== undefined) return name;
  switch (plannedBy.principalKind) {
    case "agent":
      return "An agent";
    case "integration":
      return "An integration";
    case "system":
      return "The app";
    default:
      return "Someone else";
  }
};

export const TodaySurface = ({
  client,
  snapshot,
  selectedTaskId,
  planBusyTaskId,
  onSelectTask,
  onOpenTask,
  onPlanForToday,
  onOpenCalendar,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly selectedTaskId: TaskId | undefined;
  readonly planBusyTaskId: TaskId | undefined;
  readonly onSelectTask: (id: TaskId) => void;
  readonly onOpenTask: (id: TaskId) => void;
  readonly onPlanForToday: (id: TaskId) => void;
  /** Dokąd prowadzi prawy koniec nagłówka sekcji terminów (wpis #6). */
  readonly onOpenCalendar: () => void;
}) => {
  const timezone = snapshot.bootstrap.workspace.timezone;
  const workingDay = snapshot.bootstrap.workspace.workingDay;
  const dayKey = dateKeyInZone(new Date(), timezone);

  // Spotkania nie mogą przyjść z kernela: stan kalendarza jest świadomie
  // lokalny dla urządzenia. Odmowa jest ODPOWIEDZIĄ, nie awarią — dzień bez
  // widocznych spotkań musi się różnić od dnia bez spotkań.
  const [meetingsState, setMeetingsState] = useState<MeetingsState>({
    kind: "loading",
  });
  const [helpTopic, setHelpTopic] = useState<ConceptHelpTopicId>();
  useEffect(() => {
    if (!client?.getMeetingLoop) {
      setMeetingsState({
        kind: "refused",
        reason: calendarReadRefusal(undefined) ?? "",
      });
      return;
    }
    let active = true;
    void client
      .getMeetingLoop({
        from: `${dayKey}T00:00:00.000Z`,
        // Doba w strefie workspace'u nigdy nie wykracza poza dwie doby UTC,
        // a okno węższe niż strefa gubiłoby poranne spotkanie na wschodzie.
        to: `${dayKey}T23:59:59.999Z`,
      })
      .then((surface) => {
        if (!active) return;
        const refusal = calendarReadRefusal(surface.capability);
        setMeetingsState(
          refusal === undefined
            ? {
                kind: "ready",
                meetings: surface.upcoming
                  .map((entry) => entry.event)
                  .filter(
                    (event) =>
                      dateKeyInZone(event.startsAt, timezone) === dayKey,
                  )
                  .toSorted((left, right) =>
                    left.startsAt.localeCompare(right.startsAt),
                  ),
              }
            : { kind: "refused", reason: refusal },
        );
      })
      .catch(() => {
        if (!active) return;
        setMeetingsState({
          kind: "refused",
          reason: calendarReadRefusal(undefined) ?? "",
        });
      });
    return () => {
      active = false;
    };
  }, [client, dayKey, timezone]);

  const meetings = meetingsState.kind === "ready" ? meetingsState.meetings : [];
  const planned = plannedForDay(snapshot.tasks, dayKey, timezone);
  const approaching = approachingUnplanned(snapshot.tasks, {
    dayKey,
    withinDays: WARNING_HORIZON_DAYS,
    timeZone: timezone,
  });
  const capacity = dayCapacity({
    meetings,
    tasks: planned,
    workingDay,
    dayKey,
    timeZone: timezone,
  });
  // Kto ułożył dzisiejszy plan, jeżeli nie człowiek (wpis #6, prawy koniec
  // nagłówka sekcji planu). Nazwa idzie tym samym `plannerLabel`, którym idzie
  // atrybucja przy WIERSZU — dwa liczenia tej samej rzeczy rozjeżdżają się przy
  // pierwszej zmianie któregokolwiek, a ta klasa defektu ma w tym repozytorium
  // nazwę. `find`, nie `some`, bo plakietka mówi KTO, a nie „ktoś".
  const agentPlan = planned.find(
    (task) => task.plannedBy?.principalKind === "agent",
  );
  const plannedByAgent =
    agentPlan?.plannedBy === undefined
      ? undefined
      : plannerLabel(snapshot, agentPlan.plannedBy);

  const plannedNav = useListNavigation({
    itemCount: planned.length,
    onSelect: (index) => {
      const entry = planned[index];
      if (entry) onSelectTask(entry.id);
    },
    onOpen: (index) => {
      const entry = planned[index];
      if (entry) onOpenTask(entry.id);
    },
  });
  const approachingNav = useListNavigation({
    itemCount: approaching.length,
    onSelect: (index) => {
      const entry = approaching[index];
      if (entry) onSelectTask(entry.id);
    },
    onOpen: (index) => {
      const entry = approaching[index];
      if (entry) onOpenTask(entry.id);
    },
  });

  return (
    <div className={`surface-scroll ${styles.today}`}>
      {/* WPIS #3 REJESTRU — TE SAME TRZY RZECZY, ROZŁOŻONE JAK W PROTOTYPIE.
          Rejestr nie zgłasza tu braku ani nadmiaru, tylko inne rozłożenie:
          data, tytuł i pojemność są w obu produktach, a stoją gdzie indziej.

          DATA: było `p.eyebrow` NAD tytułem — wersalikowa, rozstrzelona
          plakietka „AUG 9, 2026". Prototyp stawia ją po PRAWEJ stronie pasma,
          zdaniowo i wyciszoną (`v3/screens/today.js:129-130` — `crumbbar(…,
          '<span class="when">Monday, 27 July 2026</span>')`, a `.when`
          (`v3/app.css:441`) to `--text-xs` w kolorze trzeciorzędnym z cyframi
          tabularnymi). Plakietki wersalikowej prototyp na tym ekranie NIE MA
          w ogóle.

          POJEMNOŚĆ: stała na prawym końcu pasma, złożona pismem większym
          i jaśniejszym niż cokolwiek w rzędzie. Prototyp kładzie ją POD
          tytułem, przy lewej krawędzi kolumny, drobnym pismem trzeciorzędnym
          (`v3/screens/today.css:12-17`, `.td-capacity`) — a nasz własny
          kontrakt zabrania liczby u prawego końca pasma. To jest więc jedna
          zamiana, nie dwie poprawki: gdyby pojemność została w paśmie, ekran
          dalej łamałby regułę, którą lot D1 cytował, zamykając swoje pasma.

          `.eyebrow` ZOSTAJE W ARKUSZU I NIE JEST RUSZANA: to reguła wspólna
          (`styles.css` — `.eyebrow, .nav-label, .section-label`), a Dzisiaj
          przestaje jej UŻYWAĆ. Skasowanie reguły z powodu jednego ekranu
          ruszyłoby powierzchnie, których ten lot nie mierzy. */}
      <header className="surface-header">
        <h1 id="surface-title" tabIndex={-1}>
          Today
        </h1>
        {/* `<span>`, NIE `<p>`, I ZDECYDOWAŁ O TYM POMIAR, NIE GUST. Pierwsza
            wersja tego lotu dała tu akapit z klasą modułu — para D2-02a wróciła
            CZERWONA z 13 px zamiast 12: reguła powłokowa `.surface-header
            p:not(.eyebrow)` (`styles.css`) ma swoistość (0,2,1) i bije klasę
            modułu (0,1,0), więc stopień szedł z niej, nie z arkusza tego
            ekranu. Podniesienie swoistości u siebie albo poprawka w regule
            powłokowej ruszyłyby pasma dziesięciu innych ekranów, których ten
            lot nie mierzy. Prototyp niesie tam `<span class="when">`
            (`v3/screens/today.js:130`) — element, którego tamten selektor NIE
            dopasowuje — więc zgodność z prototypem i wyjście z kolizji są tym
            samym ruchem. */}
        <span className={styles.bandDate} data-band-date>
          {formatDate(new Date(), timezone)}
        </span>
      </header>

      {/* Pojemność policzona bez kalendarza to nie pojemność: gdy spotkania
          nie są przeczytane, `dayCapacity` dostaje pustą listę i „8h wolnego"
          stoi tuż nad paskiem z odmową. Dzień mówi więc, czego nie wie,
          zamiast podawać liczbę, wokół której ktoś ułoży sobie dzień. */}
      <p
        className={styles.capacity}
        data-capacity
        data-capacity-known={meetingsState.kind === "ready" ? "true" : "false"}
      >
        {!capacity.isWorkingDay ? (
          <strong>Outside the working week</strong>
        ) : meetingsState.kind !== "ready" ? (
          <strong>Free time unknown without the calendar</strong>
        ) : (
          <>
            <strong>{formatSpan(capacity.freeMinutes)} free</strong>
            <span className={styles.separator}>·</span>
            <span>
              {countLabel(capacity.meetingCount, "meeting")},{" "}
              {formatSpan(capacity.meetingMinutes)}
            </span>
            {capacity.reservedMinutes > 0 ? (
              <>
                <span className={styles.separator}>·</span>
                <span>{formatSpan(capacity.reservedMinutes)} reserved</span>
              </>
            ) : null}
          </>
        )}
      </p>

      <section className={styles.section} aria-labelledby="today-meetings">
        <div className={styles.sectionHead}>
          <h2 id="today-meetings">In the calendar</h2>
          {/* Powód, dla którego spotkania są nieruchome, jest pomocą NA ŻĄDANIE
              (#35): prawdziwy przycisk otwierający okno, nigdy `title=`
              i nigdy akapit pod nagłówkiem (#21).

              WPIS #4 REJESTRU — KSZTAŁT TEJ AFORDANCJI, NIE JEJ ISTNIENIE.
              Prototyp rysuje pomoc jako okrągły znacznik „?" MNIEJSZY od
              etykiety, przy której stoi (`v3/app.css:896-904`, `.helpb`
              — 1,125 rem, `--radius-full`, `--text-2xs`), a treść zostaje
              w oknie. Etykieta wchodzi do `aria-label`, bo znak „?" sam nie
              mówi czytnikowi ekranu, o co pyta. */}
          <button
            type="button"
            className="help-mark"
            aria-haspopup="dialog"
            aria-label="Why the calendar is read-only"
            onClick={() => setHelpTopic("calendar-meetings")}
          >
            ?
          </button>
        </div>
        {meetingsState.kind === "loading" ? (
          <p className={styles.quiet} aria-busy="true">
            Reading the calendar…
          </p>
        ) : meetingsState.kind === "refused" ? (
          <p className={styles.quiet} data-calendar-refusal>
            {meetingsState.reason}
          </p>
        ) : meetings.length === 0 ? (
          <p className={styles.quiet}>Nothing in the calendar today.</p>
        ) : (
          <ul className={styles.meetings}>
            {meetings.map((event) => (
              <li
                key={event.eventExternalId}
                className={styles.meeting}
                data-meeting
              >
                <span className={styles.when}>
                  {event.isAllDay
                    ? "All day"
                    : `${formatTime(event.startsAt, timezone)}–${formatTime(
                        event.endsAt,
                        timezone,
                      )}`}
                </span>
                <span className={styles.main}>
                  <span data-row-title>{event.title}</span>
                </span>
                {/* Spotkania są tym, czego nie przesuniesz wolą. Powód stoi
                    w wierszu, bo samo wyszarzenie kontrolki nie tłumaczy
                    niczego — a plakietka wystarcza za akapit. */}
                <span className={styles.locked} data-meeting-readonly>
                  Read-only
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="today-planned">
        <div className={styles.sectionHead}>
          <h2 id="today-planned">
            Planned for today{" "}
            <span className={styles.count}>{planned.length}</span>
          </h2>
          {/* WPIS #6, PIERWSZY Z DWÓCH KOŃCÓW. Prototyp dosuwa tu plakietkę
              autorstwa planu (`v3/screens/today.js:148-150` — `laid out by
              Hermes`, gdy którykolwiek wiersz położył agent). Warunek jest
              przepisany, nie zgadnięty: `plannedBy.principalKind === "agent"`
              to ta sama własność, którą wiersz niżej pokazuje jako `data-
              planned-by`. Glifu `spark` z prototypu ta plakietka NIE niesie —
              każdy nowy glif jest płacony przy otwarciu okna (`Icon.tsx`),
              a etykieta i tak nazywa, kto to zrobił, więc akcent nie zostaje
              tu sam z sobą. */}
          {plannedByAgent === undefined ? null : (
            <span className={styles.sectionAgent} data-planned-by-agent>
              laid out by {plannedByAgent}
            </span>
          )}
        </div>
        {planned.length === 0 ? (
          <div className={styles.emptyState} data-today-empty>
            <p>
              <strong>Nothing is planned for today.</strong>
            </p>
            <p>Pull the nearest deadline in below, or plan the day yourself.</p>
          </div>
        ) : (
          <ul
            className={styles.rows}
            role="listbox"
            aria-label="Planned for today"
          >
            {planned.map((task, index) => (
              <li key={task.id}>
                <div
                  className={styles.row}
                  role="option"
                  aria-selected={task.id === selectedTaskId}
                  data-planned-row
                  onClick={() => onSelectTask(task.id)}
                  onDoubleClick={() => onOpenTask(task.id)}
                  {...plannedNav(index)}
                >
                  <span
                    className={`${styles.when} ${task.calendarBlock === undefined ? styles.loose : ""}`}
                  >
                    {task.calendarBlock === undefined
                      ? "No time"
                      : `${formatTime(task.calendarBlock.startsAt, timezone)}–${formatTime(
                          task.calendarBlock.endsAt,
                          timezone,
                        )}`}
                  </span>
                  <span className={styles.main}>
                    <span data-row-title>{task.title}</span>
                    {task.plannedBy === undefined ? null : (
                      <span className={styles.by} data-planned-by>
                        {plannerLabel(snapshot, task.plannedBy)} ·{" "}
                        {formatDate(task.plannedBy.at, timezone)}
                      </span>
                    )}
                  </span>
                  <span className={styles.state}>{task.status.label}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="today-approaching">
        <div className={styles.sectionHead}>
          <h2 id="today-approaching">
            Deadline approaching, nobody planned it{" "}
            <span className={styles.count}>{approaching.length}</span>
          </h2>
          {/* WPIS #6, DRUGI KONIEC — I TEN JEST BEZWARUNKOWY. Prototyp:
              `v3/screens/today.js:152` — `<button class="more" data-go='
              {"kind":"calendar"}'>Open Calendar →</button>`, dosunięty regułą
              `.td-sec-head .more { margin-left: auto }`
              (`v3/screens/today.css:50`). Cel istnieje w rejestrze powierzchni
              tej aplikacji, więc nie jest to prototyp wyprzedzający domenę;
              brakowało wyłącznie drogi z tego ekranu. */}
          <button
            type="button"
            className={styles.sectionMore}
            data-open-calendar
            onClick={onOpenCalendar}
          >
            Open Calendar →
          </button>
        </div>
        {approaching.length === 0 ? (
          <p className={styles.quiet}>Nothing is approaching unplanned.</p>
        ) : (
          <ul
            className={styles.rows}
            role="listbox"
            aria-label="Approaching deadlines with no plan"
          >
            {approaching.map((task, index) => (
              <li key={task.id}>
                <div
                  className={`${styles.row} ${styles.warn}`}
                  role="option"
                  aria-selected={task.id === selectedTaskId}
                  data-approaching-row
                  onClick={() => onSelectTask(task.id)}
                  onDoubleClick={() => onOpenTask(task.id)}
                  {...approachingNav(index)}
                >
                  <span className={styles.when} data-lead>
                    {dayDistance(
                      daysUntil(task.dueAt ?? "", dayKey, timezone),
                      "lead",
                    )}
                  </span>
                  <span className={styles.main}>
                    <span data-row-title>{task.title}</span>
                    {task.status.operationalSemantics ===
                    "actionable" ? null : (
                      <span className={styles.by}>{task.status.label}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="secondary-button compact"
                    data-plan-today
                    disabled={planBusyTaskId === task.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onPlanForToday(task.id);
                    }}
                  >
                    Plan for today
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {helpTopic !== undefined && (
        <ConceptHelpDialog
          initialTopic={helpTopic}
          onClose={() => setHelpTopic(undefined)}
        />
      )}
    </div>
  );
};
