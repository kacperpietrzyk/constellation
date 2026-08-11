import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { TaskId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  buildWeek,
  daysBetweenKeys,
  planIntent,
  shiftDayKey,
  type CalendarDay,
} from "./calendar-week.js";
import { calendarReadRefusal } from "./client/calendar-reservation.js";
import type { DesktopSnapshot } from "./client/workflow.js";
import {
  ConceptHelpDialog,
  type ConceptHelpTopicId,
} from "./components/ConceptHelpDialog.js";
import {
  countLabel,
  dateKeyInZone,
  dayDistance,
  formatDate,
  formatTime,
  instantForZonedDate,
} from "./i18n.js";
import { useListNavigation } from "./hooks/useListNavigation.js";
import {
  approachingUnplanned,
  daysUntil,
  formatSpan,
  type CalendarMeeting,
  type PlannedTask,
} from "./today-plan.js";
import styles from "./calendar.module.css";

// Calendar to nie układ nad kolekcją zadań, tylko widok CZASU, składany
// z trzech rodzajów rzeczy: spotkań (twarde ograniczenie), zarezerwowanych
// bloków (własna praca z godziną) i pracy zaplanowanej bez godziny. Dlatego
// nie mógł zostać układem w Tasks: układ jest soczewką nad JEDNĄ kolekcją,
// a planowanie tygodnia bez spotkań każe planować w próżni.
//
// Dwie rzeczy, na które trzeba uważać przy czytaniu tego pliku:
//
// · SPOTKANIA SĄ TYLKO DO ODCZYTU. Nie dostają `draggable`, nie dostają
//   przycisku planowania i nie są pozycjami listboksa. Powód stoi PRZY
//   spotkaniu (plakietka) i jest dostępny na żądanie (przycisk otwierający
//   `ConceptHelpDialog`), nigdy jako akapit pod nagłówkiem i nigdy w `title=`.
// · UPUSZCZENIE PRACY NA DZIEŃ USTAWIA `startAt`, NIGDY `dueAt`. Gest znaczy
//   „zajmę się tym w środę", nie „obiecuję to na środę" — to dokładnie to
//   pomieszanie planu z obietnicą, które ten ekran ma likwidować. Mysz
//   i klawiatura wchodzą w ten sam `planIntent`.

const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

type MeetingsState =
  | { readonly kind: "loading" }
  | { readonly kind: "refused"; readonly reason: string }
  | { readonly kind: "ready"; readonly meetings: readonly CalendarMeeting[] };

const dayNumber = (dayKey: string): string => dayKey.slice(8, 10);

const shortDayLabel = (day: CalendarDay): string =>
  `${DAY_SHORT[day.isoWeekday - 1] ?? ""} ${dayNumber(day.key)}`;

const longDayLabel = (day: CalendarDay, timeZone: string): string => {
  const instant = instantForZonedDate(day.key, timeZone, "start");
  const date = instant === undefined ? day.key : formatDate(instant, timeZone);
  return `${DAY_NAMES[day.isoWeekday - 1] ?? ""}, ${date}`;
};

/** Kiedy praca ma miejsce w dniu: godziny bloku albo szczera ich nieobecność. */
const whenLabel = (task: PlannedTask, timeZone: string): string =>
  task.calendarBlock === undefined
    ? "No time"
    : `${formatTime(task.calendarBlock.startsAt, timeZone)}–${formatTime(
        task.calendarBlock.endsAt,
        timeZone,
      )}`;

/**
 * Klawiaturowy odpowiednik przeciągnięcia. Gest dostępny wyłącznie myszą jest
 * gestem nieosiągalnym, więc każdy wiersz, który da się przeciągnąć, da się
 * też położyć na dniu z klawiatury — tą samą drogą do tego samego zapisu.
 */
const DayPicker = ({
  days,
  currentKey,
  onPick,
  onDismiss,
}: {
  readonly days: readonly CalendarDay[];
  readonly currentKey: string | undefined;
  readonly onPick: (dayKey: string) => void;
  readonly onDismiss: () => void;
}) => {
  const firstRef = useRef<HTMLButtonElement>(null);
  // Czy menu zamknęło się WYBOREM dnia, czy rezygnacją. To rozróżnienie jest
  // tu dlatego, że po udanym zaplanowaniu wiersz znika (zadanie dostaje
  // `startAt`, więc wypada z zasobnika albo przenosi się na inny dzień), a więc
  // kontrolka, która menu otworzyła, jest już ODPIĘTA od dokumentu — `focus()`
  // na odpiętym węźle nie robi nic i ognisko spada na `<body>`, czyli dokładnie
  // ta awaria, przed którą to sprzątanie miało bronić. Po wyborze ognisko
  // przejmuje kolumna dnia, która pracę dostała; tutaj wracamy tylko po
  // rezygnacji.
  const pickedRef = useRef(false);
  useEffect(() => {
    // Ognisko wraca do kontrolki, która menu otworzyła. Zamknięcie, po którym
    // ognisko spada na `<body>`, wyrzuca klawiaturę na początek strony — ta
    // sama pomyłka, którą repo naprawiało już w wyszukiwarce.
    const returnTarget =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    firstRef.current?.focus();
    return () => {
      if (pickedRef.current) return;
      if (returnTarget === undefined || !returnTarget.isConnected) return;
      returnTarget.focus();
    };
  }, []);
  return (
    <div
      className={styles.dayPicker}
      role="group"
      aria-label="Plan on a day"
      data-day-picker
      onKeyDown={(event) => {
        // Klawisze zatrzymują się tutaj: bez tego strzałki przenosiłyby
        // ognisko na sąsiedni wiersz, a Enter zostałby zjedzony przez
        // `preventDefault` systemu roving, zanim uruchomi przycisk dnia.
        event.stopPropagation();
        if (event.key !== "Escape") return;
        event.preventDefault();
        onDismiss();
      }}
    >
      {days.map((day, index) => (
        <button
          key={day.key}
          type="button"
          ref={index === 0 ? firstRef : undefined}
          className="ghost-button compact"
          data-move-to={day.key}
          aria-current={day.key === currentKey ? "true" : undefined}
          onClick={(event) => {
            event.stopPropagation();
            pickedRef.current = true;
            onPick(day.key);
          }}
        >
          {shortDayLabel(day)}
        </button>
      ))}
    </div>
  );
};

/** Wiersz własnej pracy: da się go wybrać, otworzyć i przenieść na inny dzień. */
const PlannableRow = ({
  task,
  kind,
  when,
  meta,
  navProps,
  days,
  currentKey,
  selected,
  busy,
  dragging,
  menuOpen,
  onSelect,
  onOpen,
  onDragStart,
  onDragEnd,
  onToggleMenu,
  onPick,
}: {
  readonly task: PlannedTask;
  readonly kind: "planned" | "approaching";
  readonly when: ReactNode;
  readonly meta?: ReactNode;
  readonly navProps: ReturnType<ReturnType<typeof useListNavigation>>;
  readonly days: readonly CalendarDay[];
  readonly currentKey: string | undefined;
  readonly selected: boolean;
  readonly busy: boolean;
  readonly dragging: boolean;
  readonly menuOpen: boolean;
  readonly onSelect: () => void;
  readonly onOpen: () => void;
  readonly onDragStart: () => void;
  readonly onDragEnd: () => void;
  readonly onToggleMenu: () => void;
  readonly onPick: (dayKey: string) => void;
}) => (
  <li>
    <div
      className={`${styles.row} ${kind === "approaching" ? styles.trayRow : ""} ${
        dragging ? styles.rowDragging : ""
      }`}
      role="option"
      aria-selected={selected}
      draggable={!busy}
      data-task-row={task.id}
      {...(kind === "planned"
        ? { "data-planned-row": "" }
        : { "data-approaching-row": "" })}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onDragStart={(event) => {
        event.dataTransfer?.setData?.("text/plain", task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      {...navProps}
    >
      {when}
      <span className={styles.title} data-row-title>
        {task.title}
      </span>
      {meta}
      <span className={styles.rowActions}>
        <button
          type="button"
          className="secondary-button compact"
          data-move-task={task.id}
          aria-expanded={menuOpen}
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            onToggleMenu();
          }}
          // Bez tego Enter na przycisku dopłynąłby do wiersza, a system roving
          // zdążyłby zrobić `preventDefault` i OTWORZYĆ rekord, zanim przycisk
          // zdąży się uruchomić: droga klawiaturowa robiłaby co innego niż
          // mysz. Klik dociera do `onClick` niezależnie od tego.
          onKeyDown={(event) => event.stopPropagation()}
        >
          Plan on a day
        </button>
      </span>
      {menuOpen ? (
        <DayPicker
          days={days}
          currentKey={currentKey}
          onPick={onPick}
          onDismiss={onToggleMenu}
        />
      ) : null}
    </div>
  </li>
);

const CalendarDayColumn = ({
  day,
  days,
  timeZone,
  weekHasPlan,
  meetingsKnown,
  selectedTaskId,
  planBusyTaskId,
  draggedTaskId,
  droppingDayKey,
  moveMenuTaskId,
  onSelectTask,
  onOpenTask,
  onDragTask,
  onDragEnd,
  onHoverDay,
  onDropOnDay,
  onToggleMoveMenu,
  onPlanTaskOnDay,
}: {
  readonly day: CalendarDay;
  readonly days: readonly CalendarDay[];
  readonly timeZone: string;
  readonly weekHasPlan: boolean;
  /** Czy spotkania są PRZECZYTANE. Pojemność bez kalendarza nie jest pojemnością. */
  readonly meetingsKnown: boolean;
  readonly selectedTaskId: TaskId | undefined;
  readonly planBusyTaskId: TaskId | undefined;
  readonly draggedTaskId: TaskId | undefined;
  readonly droppingDayKey: string | undefined;
  readonly moveMenuTaskId: TaskId | undefined;
  readonly onSelectTask: (id: TaskId) => void;
  readonly onOpenTask: (id: TaskId) => void;
  readonly onDragTask: (id: TaskId) => void;
  readonly onDragEnd: () => void;
  readonly onHoverDay: (dayKey: string | undefined) => void;
  readonly onDropOnDay: (dayKey: string) => void;
  readonly onToggleMoveMenu: (id: TaskId) => void;
  readonly onPlanTaskOnDay: (id: TaskId, dayKey: string) => void;
}) => {
  const rows = [...day.timed, ...day.loose];
  const nav = useListNavigation({
    itemCount: rows.length,
    onSelect: (index) => {
      const entry = rows[index];
      if (entry) onSelectTask(entry.id);
    },
    onOpen: (index) => {
      const entry = rows[index];
      if (entry) onOpenTask(entry.id);
    },
  });
  const label = longDayLabel(day, timeZone);
  const capacity = day.capacity;
  const share = (minutes: number): string =>
    capacity.workingMinutes === 0
      ? "0%"
      : `${Math.min(100, (minutes / capacity.workingMinutes) * 100)}%`;

  return (
    <section
      className={`${styles.day} ${capacity.isWorkingDay ? "" : styles.dayOff} ${
        day.isToday ? styles.dayToday : ""
      } ${droppingDayKey === day.key ? styles.dayDropping : ""}`}
      data-day={day.key}
      aria-label={label}
      // Kolumna jest celem OGNISKA po zaplanowaniu z klawiatury: wiersz, który
      // wybór wykonał, po zapisie znika, więc ognisko musi mieć dokąd wrócić —
      // a dzień, który pracę dostał, jest jedynym miejscem, o którym da się
      // z góry powiedzieć, że po zapisie nadal istnieje.
      tabIndex={-1}
      onDragOver={(event) => {
        if (draggedTaskId === undefined) return;
        event.preventDefault();
        onHoverDay(day.key);
      }}
      onDragLeave={() => onHoverDay(undefined)}
      onDrop={(event) => {
        event.preventDefault();
        onDropOnDay(day.key);
      }}
    >
      <header className={styles.dayHead}>
        <span className={styles.dayName}>
          {DAY_SHORT[day.isoWeekday - 1] ?? ""}
        </span>
        <span className={styles.dayNum}>{dayNumber(day.key)}</span>
        {/* Dzisiaj niesie NAPIS, nie tylko obwódkę: kolor sam nigdy nie jest
            nośnikiem znaczenia. */}
        {day.isToday ? (
          <span className={styles.todayTag} data-today-column>
            Today
          </span>
        ) : null}
        {/* Wolne minuty policzone BEZ spotkań to nie wolne minuty. Dopóki
            kalendarz nie jest przeczytany, kolumna mówi „nie wiem" zamiast
            podawać pełny dzień — powód stoi raz, w nagłówku tygodnia. */}
        <span
          className={`${styles.free} ${capacity.freeMinutes === 0 && capacity.isWorkingDay && meetingsKnown ? styles.freeNone : ""}`}
          data-day-free
        >
          {!capacity.isWorkingDay
            ? "Non-working"
            : !meetingsKnown
              ? "Unknown"
              : capacity.freeMinutes === 0
                ? "Full"
                : `${formatSpan(capacity.freeMinutes)} free`}
        </span>
      </header>

      {capacity.isWorkingDay && meetingsKnown ? (
        <div
          className={styles.meter}
          role="img"
          data-day-meter
          aria-label={`${formatSpan(capacity.meetingMinutes)} in meetings, ${formatSpan(
            capacity.reservedMinutes,
          )} reserved`}
        >
          <i
            className={styles.meterMeetings}
            style={{ width: share(capacity.meetingMinutes) }}
          />
          <i
            className={styles.meterReserved}
            style={{ width: share(capacity.reservedMinutes) }}
          />
        </div>
      ) : null}

      <div className={styles.dayBody}>
        {/* Spotkania stoją POZA listboksem: nie są opcjami do wybrania. */}
        {day.meetings.map((event) => (
          <div
            key={event.eventExternalId}
            className={styles.meeting}
            data-meeting={event.eventExternalId}
          >
            <span className={styles.when}>
              {event.isAllDay
                ? "All day"
                : `${formatTime(event.startsAt, timeZone)}–${formatTime(
                    event.endsAt,
                    timeZone,
                  )}`}
            </span>
            <span className={styles.meetingTitle} data-row-title>
              {event.title}
            </span>
            {/* Powód stoi PRZY spotkaniu. Samo wyszarzenie nie tłumaczy
                niczego, a plakietka wystarcza za akapit. */}
            <span className={styles.locked} data-meeting-readonly>
              Read-only
            </span>
          </div>
        ))}

        {rows.length === 0 ? null : (
          <ul className={styles.list} role="listbox" aria-label={label}>
            {rows.map((task, index) => (
              <PlannableRow
                key={task.id}
                task={task}
                kind="planned"
                when={
                  <span
                    className={`${styles.when} ${task.calendarBlock === undefined ? styles.loose : ""}`}
                  >
                    {whenLabel(task, timeZone)}
                  </span>
                }
                meta={
                  task.status.operationalSemantics ===
                  "actionable" ? undefined : (
                    <span className={styles.meta}>{task.status.label}</span>
                  )
                }
                navProps={nav(index)}
                days={days}
                currentKey={day.key}
                selected={task.id === selectedTaskId}
                busy={planBusyTaskId === task.id}
                dragging={draggedTaskId === task.id}
                menuOpen={moveMenuTaskId === task.id}
                onSelect={() => onSelectTask(task.id)}
                onOpen={() => onOpenTask(task.id)}
                onDragStart={() => onDragTask(task.id)}
                onDragEnd={onDragEnd}
                onToggleMenu={() => onToggleMoveMenu(task.id)}
                onPick={(dayKey) => onPlanTaskOnDay(task.id, dayKey)}
              />
            ))}
          </ul>
        )}

        {/* Pusty dzień roboczy mówi to wprost, ale tylko wtedy, gdy w tygodniu
            cokolwiek stoi — inaczej pięć kolumn powtarza jedno zdanie, które
            i tak stoi pod siatką. */}
        {weekHasPlan &&
        capacity.isWorkingDay &&
        day.meetings.length === 0 &&
        rows.length === 0 ? (
          <p className={styles.dayNone}>Nothing planned</p>
        ) : null}
      </div>
    </section>
  );
};

export const CalendarSurface = ({
  client,
  snapshot,
  selectedTaskId,
  planBusyTaskId,
  onSelectTask,
  onOpenTask,
  onPlanTaskOnDay,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly selectedTaskId: TaskId | undefined;
  readonly planBusyTaskId: TaskId | undefined;
  readonly onSelectTask: (id: TaskId) => void;
  readonly onOpenTask: (id: TaskId) => void;
  /** Plan, nie termin: powłoka zapisuje `startAt` i nie dotyka `dueAt`. */
  readonly onPlanTaskOnDay: (id: TaskId, dayKey: string) => void;
}) => {
  const timezone = snapshot.bootstrap.workspace.timezone;
  const workingDay = snapshot.bootstrap.workspace.workingDay;
  const todayKey = dateKeyInZone(new Date(), timezone);

  const [weekOffset, setWeekOffset] = useState(0);
  const [meetingsState, setMeetingsState] = useState<MeetingsState>({
    kind: "loading",
  });
  const [helpTopic, setHelpTopic] = useState<ConceptHelpTopicId>();
  const [draggedTaskId, setDraggedTaskId] = useState<TaskId>();
  const [droppingDayKey, setDroppingDayKey] = useState<string>();
  const [moveMenuTaskId, setMoveMenuTaskId] = useState<TaskId>();
  const [focusDayKey, setFocusDayKey] = useState<string>();
  const surfaceRef = useRef<HTMLDivElement>(null);

  // Po zaplanowaniu z klawiatury ognisko ląduje na kolumnie, która pracę
  // dostała. Wiersz, z którego wyszedł wybór, już nie istnieje — zadanie ma
  // `startAt`, więc wypadło z zasobnika albo stoi na innym dniu — a ognisko na
  // odpiętym węźle to ognisko na `<body>`: klawiatura wraca na początek strony
  // i nie widzi skutku własnego zapisu.
  useEffect(() => {
    if (focusDayKey === undefined) return;
    surfaceRef.current
      ?.querySelector<HTMLElement>(`[data-day="${focusDayKey}"]`)
      ?.focus();
    setFocusDayKey(undefined);
  }, [focusDayKey]);

  // Złożenie tygodnia idzie po wszystkich zadaniach siedem razy i mierzalnie
  // kosztuje (169 ms przy tysiącu zadań). W ciele renderu płaciło się je na
  // każde najechanie przeciąganym wierszem i na każde otwarcie menu, choć
  // materiał się wtedy nie zmienia. `meetingsState` w zależnościach, a nie
  // wyliczona z niego lista: `[]` jest przy każdym renderze nową tablicą, więc
  // memo nigdy by nie trafiło.
  const week = useMemo(
    () =>
      buildWeek({
        todayKey,
        weekOffset,
        meetings: meetingsState.kind === "ready" ? meetingsState.meetings : [],
        tasks: snapshot.tasks,
        workingDay,
        timeZone: timezone,
      }),
    [todayKey, weekOffset, meetingsState, snapshot.tasks, workingDay, timezone],
  );
  const { startKey, endKey } = week;
  const meetingsKnown = meetingsState.kind === "ready";

  // Spotkania nie przychodzą z kernela: stan kalendarza jest świadomie lokalny
  // dla urządzenia. Odmowa jest ODPOWIEDZIĄ, nie awarią — tydzień bez
  // pokazanych spotkań musi się różnić od tygodnia bez spotkań.
  useEffect(() => {
    if (!client?.getMeetingLoop) {
      setMeetingsState({
        kind: "refused",
        reason: calendarReadRefusal(undefined) ?? "",
      });
      return;
    }
    // Krok na inny tydzień zaczyna od nowa: bez tego siatka nowego tygodnia
    // pokazywałaby przez chwilę spotkania POPRZEDNIEGO, odfiltrowane do zera,
    // czyli tydzień bez spotkań — a to jest właśnie to kłamstwo, przed którym
    // broni odmowa.
    setMeetingsState({ kind: "loading" });
    let active = true;
    void client
      .getMeetingLoop({
        // Doba w strefie workspace'u nigdy nie wykracza poza dwie doby UTC,
        // więc okno bierze dzień zapasu z każdej strony. Dziewięć dni mieści
        // się w limicie 93 dni na jedno wywołanie.
        from: `${shiftDayKey(startKey, -1)}T00:00:00.000Z`,
        to: `${shiftDayKey(endKey, 1)}T23:59:59.999Z`,
      })
      .then((surface) => {
        if (!active) return;
        const refusal = calendarReadRefusal(surface.capability);
        setMeetingsState(
          refusal === undefined
            ? { kind: "ready", meetings: surface.upcoming.map((e) => e.event) }
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
  }, [client, startKey, endKey]);

  // Zasobnik sięga końca POKAZYWANEGO tygodnia — i, gdy patrzymy na tydzień
  // inny niż bieżący, zaczyna się od jego początku. Bez tego dna nagłówek
  // kłamał w obie strony: krok naprzód wciągał wszystko po drodze (terminów
  // z oglądanego tygodnia było w tej liście najmniej), a krok wstecz dawał
  // ujemny horyzont i pokazywał wyłącznie stare zaległości.
  //
  // Bieżący tydzień świadomie ZOSTAJE bez dna: termin po czasie, którego nikt
  // nie zaplanował, jest dokładnie tym, co najbardziej potrzebuje dnia — więc
  // nagłówek mówi wtedy wprost, że lista obejmuje też spóźnione.
  const showingThisWeek = weekOffset === 0;
  const tray = approachingUnplanned(snapshot.tasks, {
    dayKey: todayKey,
    withinDays: daysBetweenKeys(todayKey, endKey),
    timeZone: timezone,
    notBeforeDayKey: showingThisWeek ? undefined : startKey,
  });
  const trayNav = useListNavigation({
    itemCount: tray.length,
    onSelect: (index) => {
      const entry = tray[index];
      if (entry) onSelectTask(entry.id);
    },
    onOpen: (index) => {
      const entry = tray[index];
      if (entry) onOpenTask(entry.id);
    },
  });

  const plan = (
    taskId: TaskId | undefined,
    dayKey: string | undefined,
    options?: { readonly focusDay: boolean },
  ): void => {
    const intent = planIntent(taskId, dayKey);
    setDraggedTaskId(undefined);
    setDroppingDayKey(undefined);
    setMoveMenuTaskId(undefined);
    if (intent === undefined) return;
    if (options?.focusDay === true) setFocusDayKey(intent.dayKey);
    onPlanTaskOnDay(intent.taskId, intent.dayKey);
  };

  const startInstant = instantForZonedDate(startKey, timezone, "start");
  const endInstant = instantForZonedDate(endKey, timezone, "start");
  const rangeLabel = `${
    startInstant === undefined ? startKey : formatDate(startInstant, timezone)
  } – ${endInstant === undefined ? endKey : formatDate(endInstant, timezone)}`;

  const totals = week.totals;

  return (
    <div className={`surface-scroll ${styles.calendar}`} ref={surfaceRef}>
      <header className="surface-header">
        <div className={styles.headline}>
          <div>
            <p className="eyebrow" data-week-range>
              {rangeLabel}
            </p>
            <h1 id="surface-title" tabIndex={-1}>
              Calendar
            </h1>
          </div>
          <div className={styles.weekNav}>
            <button
              type="button"
              className="ghost-button compact"
              data-week-step="previous"
              onClick={() => setWeekOffset(weekOffset - 1)}
            >
              Previous week
            </button>
            <button
              type="button"
              className="ghost-button compact"
              data-week-step="current"
              disabled={weekOffset === 0}
              onClick={() => setWeekOffset(0)}
            >
              This week
            </button>
            <button
              type="button"
              className="ghost-button compact"
              data-week-step="next"
              onClick={() => setWeekOffset(weekOffset + 1)}
            >
              Next week
            </button>
          </div>
        </div>
        {/* Pojemność policzona bez kalendarza to nie pojemność. Dopóki
            spotkania nie są przeczytane, `buildWeek` dostaje pustą listę —
            i wtedy „40h wolnego" stałoby dokładnie NAD paskiem z odmową.
            Nagłówek mówi więc, czego nie wie, zamiast podawać liczbę,
            wokół której ktoś zaplanuje tydzień. */}
        <p
          className={styles.capacity}
          data-week-capacity
          data-capacity-known={meetingsKnown ? "true" : "false"}
        >
          {meetingsKnown ? (
            <>
              <strong>{formatSpan(totals.freeMinutes)} free</strong>
              <span className={styles.separator}>·</span>
              <span>
                {countLabel(totals.meetingCount, "meeting")},{" "}
                {formatSpan(totals.meetingMinutes)}
              </span>
              <span className={styles.separator}>·</span>
              <span>{formatSpan(totals.reservedMinutes)} reserved</span>
            </>
          ) : (
            <strong>Free time unknown without the calendar</strong>
          )}
        </p>
      </header>

      <div className={styles.calendarState}>
        {/* Powód, dla którego spotkania są nieruchome, jest pomocą NA ŻĄDANIE:
            prawdziwy przycisk otwierający okno, nigdy `title=` i nigdy akapit
            pod nagłówkiem. Stoi RAZ, w nagłówku — powtórzony przy każdym
            spotkaniu byłby tą samą odpowiedzią wypisaną pięć razy.
            Warunek jest tu po to, żeby ekran nie tłumaczył zachowania rzeczy,
            której nie ma na ekranie: tydzień bez spotkań pytania nie stawia.
            Liczone po dniach, NIE po `totals.meetingCount` — tamta suma
            pomija weekend, więc sobotnie spotkanie zostałoby bez wyjaśnienia. */}
        {/* WPIS #4 REJESTRU, BLIŹNIAK Z DZISIAJ. Ten przycisk otwiera DOKŁADNIE
            ten sam temat pomocy co znacznik na Dzisiaj (`calendar-meetings`),
            stał w tej samej klasie (`ghost-button compact`) i niósł to samo
            zdanie — a lot D2 poprawił tylko jeden z dwóch, przez co jeden ekran
            mówił „?", a sąsiedni dalej zdanie. Naprawa po przeglądzie zdejmuje
            ten rozjazd: jedna afordancja, jeden kształt (`v3/app.css:896-904`,
            `.helpb`). Etykieta idzie do `aria-label`, bo znak „?" sam nie mówi
            czytnikowi ekranu, o co pyta. */}
        {week.days.some((day) => day.meetings.length > 0) ? (
          <button
            type="button"
            className="help-mark"
            aria-haspopup="dialog"
            aria-label="Why the calendar is read-only"
            data-meeting-help
            onClick={() => setHelpTopic("calendar-meetings")}
          >
            ?
          </button>
        ) : null}
        {meetingsState.kind === "loading" ? (
          <p className={styles.quiet} aria-busy="true">
            Reading the calendar…
          </p>
        ) : null}
        {meetingsState.kind === "refused" ? (
          <p className={styles.refusal} data-calendar-refusal>
            {meetingsState.reason}
          </p>
        ) : null}
      </div>

      <div className={styles.week}>
        {week.days.map((day) => (
          <CalendarDayColumn
            key={day.key}
            day={day}
            days={week.days}
            timeZone={timezone}
            weekHasPlan={totals.plannedCount > 0}
            meetingsKnown={meetingsKnown}
            selectedTaskId={selectedTaskId}
            planBusyTaskId={planBusyTaskId}
            draggedTaskId={draggedTaskId}
            droppingDayKey={droppingDayKey}
            moveMenuTaskId={moveMenuTaskId}
            onSelectTask={onSelectTask}
            onOpenTask={onOpenTask}
            onDragTask={setDraggedTaskId}
            onDragEnd={() => {
              setDraggedTaskId(undefined);
              setDroppingDayKey(undefined);
            }}
            onHoverDay={setDroppingDayKey}
            onDropOnDay={(dayKey) => plan(draggedTaskId, dayKey)}
            onToggleMoveMenu={(id) =>
              setMoveMenuTaskId(moveMenuTaskId === id ? undefined : id)
            }
            onPlanTaskOnDay={(id, dayKey) =>
              plan(id, dayKey, { focusDay: true })
            }
          />
        ))}
      </div>

      {totals.plannedCount === 0 ? (
        <div className={styles.emptyState} data-week-empty>
          <p>
            <strong>Nothing is laid out this week.</strong>
          </p>
          <p>
            Drag work onto a day, or use Plan on a day, to say when you will
            start it.
          </p>
        </div>
      ) : null}

      <section className={styles.section} aria-labelledby="calendar-tray">
        <div className={styles.sectionHead}>
          <h2 id="calendar-tray" data-tray-heading>
            {/* Nagłówek mówi dokładnie to, co filtr robi. Wersja bieżącego
                tygodnia przyznaje się do spóźnionych, bo tylko tam wchodzą. */}
            {showingThisWeek
              ? "Deadline this week or already late, nobody planned it"
              : "Deadline inside this week, nobody planned it"}{" "}
            <span className={styles.count}>{tray.length}</span>
          </h2>
        </div>
        {tray.length === 0 ? (
          <p className={styles.quiet}>Nothing with a deadline is unplanned.</p>
        ) : (
          <ul
            className={styles.tray}
            role="listbox"
            aria-label="Unplanned work with a deadline"
          >
            {tray.map((task, index) => (
              <PlannableRow
                key={task.id}
                task={task}
                kind="approaching"
                when={
                  <span
                    className={`${styles.lead} ${
                      daysUntil(task.dueAt ?? "", todayKey, timezone) < 0
                        ? styles.leadLate
                        : ""
                    }`}
                    data-lead
                  >
                    {dayDistance(
                      daysUntil(task.dueAt ?? "", todayKey, timezone),
                      "lead",
                    )}
                  </span>
                }
                meta={
                  task.status.operationalSemantics ===
                  "actionable" ? undefined : (
                    <span className={styles.meta}>{task.status.label}</span>
                  )
                }
                navProps={trayNav(index)}
                days={week.days}
                currentKey={undefined}
                selected={task.id === selectedTaskId}
                busy={planBusyTaskId === task.id}
                dragging={draggedTaskId === task.id}
                menuOpen={moveMenuTaskId === task.id}
                onSelect={() => onSelectTask(task.id)}
                onOpen={() => onOpenTask(task.id)}
                onDragStart={() => setDraggedTaskId(task.id)}
                onDragEnd={() => {
                  setDraggedTaskId(undefined);
                  setDroppingDayKey(undefined);
                }}
                onToggleMenu={() =>
                  setMoveMenuTaskId(
                    moveMenuTaskId === task.id ? undefined : task.id,
                  )
                }
                onPick={(dayKey) => plan(task.id, dayKey, { focusDay: true })}
              />
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
