import { useEffect, useState } from "react";

import type { TaskId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  ConceptHelpDialog,
  type ConceptHelpTopicId,
} from "./components/ConceptHelpDialog.js";
import { calendarReadRefusal } from "./client/calendar-reservation.js";
import type { DesktopSnapshot } from "./client/workflow.js";
import { countLabel, dateKeyInZone, formatDate, formatTime } from "./i18n.js";
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
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly selectedTaskId: TaskId | undefined;
  readonly planBusyTaskId: TaskId | undefined;
  readonly onSelectTask: (id: TaskId) => void;
  readonly onOpenTask: (id: TaskId) => void;
  readonly onPlanForToday: (id: TaskId) => void;
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

  const leadLabel = (dueAt: string): string => {
    const days = daysUntil(dueAt, dayKey, timezone);
    if (days < 0) return `${countLabel(-days, "day")} late`;
    if (days === 0) return "due today";
    return `in ${countLabel(days, "day")}`;
  };

  return (
    <div className={`surface-scroll ${styles.today}`}>
      <header className="surface-header">
        <div>
          <p className="eyebrow">{formatDate(new Date(), timezone)}</p>
          <h1 id="surface-title" tabIndex={-1}>
            Today
          </h1>
        </div>
        <p className={styles.capacity} data-capacity>
          {capacity.isWorkingDay ? (
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
          ) : (
            <strong>Outside the working week</strong>
          )}
        </p>
      </header>

      <section className={styles.section} aria-labelledby="today-meetings">
        <div className={styles.sectionHead}>
          <h2 id="today-meetings">In the calendar</h2>
          {/* Powód, dla którego spotkania są nieruchome, jest pomocą NA ŻĄDANIE
              (#35): prawdziwy przycisk otwierający okno, nigdy `title=`
              i nigdy akapit pod nagłówkiem (#21). */}
          <button
            type="button"
            className="ghost-button compact"
            aria-haspopup="dialog"
            onClick={() => setHelpTopic("calendar-meetings")}
          >
            Why read-only?
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
                    {leadLabel(task.dueAt ?? "")}
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
