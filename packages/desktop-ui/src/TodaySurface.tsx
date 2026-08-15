import { Suspense, lazy, useEffect, useState } from "react";

import type { TaskId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import type { ConceptHelpTopicId } from "./components/ConceptHelpDialog.js";
import { calendarReadRefusal } from "./client/calendar-reservation.js";
import type { DesktopSnapshot } from "./client/workflow.js";
import { TopicHelp } from "./help/TopicHelp.js";
import {
  countLabel,
  dateKeyInZone,
  dayDistance,
  dayGreeting,
  dayPartOf,
  formatBandDay,
  formatDate,
  formatTime,
} from "./i18n.js";
import { viewerDisplayName } from "./viewer-identity.js";
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

/* OKNO POJĘCIOWE ŚCIĄGANE DOPIERO PO KLIKNIĘCIU, I TO JEST POPRAWKA BUDŻETU
   ZE ZMIERZONYM POWODEM, NIE PORZĄDKI.
 *
 * Ten moduł to jedyny NIELENIWY importer `ConceptHelpDialog` w produkcie:
 * Kalendarz, Spotkania i Ustawienia mają własne chunki, Dzisiaj siedzi
 * w chunku wejściowym. Statyczny import stąd wciągał więc całe okno na
 * ścieżkę gorącą — 1 792 B po gzipie preładowane przy każdym starcie okna,
 * dla dialogu, którego nikt nie widzi, dopóki nie kliknie znaku „?".
 *
 * `Suspense` z pustym zapasem, bo pierwszy rysunek NIE ZAWIERA tego okna
 * (`helpTopic` startuje nieustawiony) — czyli zapas nigdy nie jest widoczny
 * przy starcie, a po kliknięciu zastępuje okno na czas jednego pobrania
 * chunka, który i tak leży obok na dysku.
 *
 * `ConceptHelpTopicId` zostaje importem TYPU. Gdyby wjechał jako wartość —
 * albo gdyby ktokolwiek sięgnął stąd po `conceptHelpTopics` — moduł wróciłby
 * na ścieżkę gorącą w całości, a `React.lazy` niżej nie zapaliłoby się ani
 * razu. Ta pułapka jest w tym repozytorium zmierzona i ma własny wpis. */
const ConceptHelpDialog = lazy(async () => ({
  default: (await import("./components/ConceptHelpDialog.js"))
    .ConceptHelpDialog,
}));

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
  const band = formatBandDay(new Date(), timezone);
  // OTWARCIE EKRANU (wpis 1-1) — dwa fakty, oba z rzeczy, które ten ekran już
  // ma: pora dnia z TEJ SAMEJ strefy, z której liczy się klucz dnia, i imię
  // czytelnika z migawki dostępu, jedną regułą wspólną ze stopką powłoki.
  const greetingPart = dayPartOf(new Date(), timezone);
  const viewerName = viewerDisplayName(snapshot.access);
  const greeting = dayGreeting(greetingPart, viewerName);

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
        {/* WPIS 1-7 — PASMO MÓWI DZIEŃ TYGODNIA I PEŁNĄ NAZWĘ MIESIĄCA.
            Prototyp: `v3/screens/today.js:129-130` — „Monday, 27 July 2026".
            Tu stało „Aug 13, 2026", czyli ten sam format, którym ekran opisuje
            termin zadania — a na ekranie, którego CAŁA treść to „dzisiaj",
            dzień tygodnia jest informacją, nie ozdobą: to on mówi, czy dzień
            jeszcze się broni, czy jest piątkiem.

            NIE `formatDate`, I TO NIE JEST NIEDOPATRZENIE: `formatDate` mówi
            teraz o dniu bieżącym „Today", a „Today | Today" nie jest zdaniem.
            Pasmo ma własną regułę, bo ma własne czytanie.

            DZIEŃ TYGODNIA W SWOIM WŁASNYM ELEMENCIE — jedyny kształt, o który
            bramka może zapytać bez wpisywania daty, która zgnije nazajutrz. */}
        <span className={styles.bandDate} data-band-date>
          <span data-band-weekday>{band.weekday}</span>
          {`, ${band.remainder}`}
        </span>
      </header>

      {/* WPIS 1-1 — EKRAN OTWIERA TREŚĆ ZDANIEM DO CZŁOWIEKA, NIE PASKIEM
          STATYSTYKI.

          Prototyp: `v3/screens/today.js:130-133` — pasmo NAZYWA ekran
          (`<span class="cur">Today</span>`), a treść otwiera
          `<h2 class="td-greeting">Good morning, Kacper</h2>` w `--text-2xl`
          (`v3/screens/today.css:8-10`, waga 600, `letter-spacing: -0.02em`).
          Kontrakt: `.ui-craft/patterns.md`, „Pattern: Surface title band",
          ograniczenie „A band names the screen; it does not open it" — i tam
          też stoi, że robi tak DOKŁADNIE JEDEN ekran obok Kalendarza, więc to
          nie jest reguła do rozdania wszystkim.

          `h1` W PAŚMIE ZOSTAJE WIDOCZNY, i to jest różnica wobec prototypu
          przeczytana, a nie przeoczona. Prototyp trzyma `h1` jako `sr-only`,
          bo nazwanie ekranu niesie u niego `<span class="cur">` w paśmie —
          u nas tym nazwaniem JEST `h1#surface-title`. Ukrycie go zabiłoby
          podmiot pięciu osi przyrządu pasma (`#surface-title`) i dałoby awarię
          przyrządu w miejsce poprawki.

          NAGŁÓWEK JEST BEZWARUNKOWY, DEGRADUJE SIĘ TEKST. Odczyt dostępu bywa
          niedostępny; nagłówek znikający razem z imieniem kasowałby dokładnie
          tę rzecz, którą ten lot dowozi, i to w stanie, którego fikstura
          bramki nie rysuje. Bez imienia zostaje samo „Good morning"
          (`i18n.ts`, `dayGreeting`) — nigdy „Good morning, You".

          PORA DNIA IDZIE ZE STREFY WORKSPACE'U, nie z zegara maszyny, tą samą
          stałą, którą ten ekran liczy klucz dnia. Atrybut niesie pozycję ze
          ZBIORU ZAMKNIĘTEGO (`DAY_PARTS`), bo asercja na napisie „Good
          morning" jest asercją, która gnije w południe.

          `data-greeting-named` PORÓWNUJE SŁOWA, A NIE STAN ODCZYTU. Pierwsza
          wersja liczyła go jako `viewerName === undefined`, czyli odpowiadała
          „czy odczyt dostępu się udał", deklarując „czy powitanie niesie imię"
          — a `dayGreeting` odrzuca też `""`, same spacje i „You", więc dla
          członka o takim `displayName` atrybut mówił `"true"` nad napisem BEZ
          imienia. Teraz jest DOSŁOWNIE funkcją napisu: powitanie z imieniem
          porównane z powitaniem bez niego. Rozjechać się nie ma czemu, bo
          predykat jest jeden i jest nim sama treść. */}
      <h2
        className={styles.greeting}
        data-today-greeting
        data-greeting-part={greetingPart}
        data-greeting-named={
          greeting === dayGreeting(greetingPart) ? "false" : "true"
        }
      >
        {greeting}
      </h2>

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
            {/* WPIS 1-6, PIERWSZA POŁOWA. Prototyp stawia plakietkę pomocy
                PRZY WOLNYM CZASIE (`v3/screens/today.js:98` —
                `<b>${"${fmtSpan(free)}"} free</b>${"${helpBtn(\"capacity\")}"}`),
                a ta apka miała ją WYŁĄCZNIE przy sekcji „In the calendar",
                której prototyp nie ma. Czyli pomoc stała nie przy tej rzeczy.
                Liczba wolnego czasu jest jedyną na tym ekranie, która jest
                WYLICZONA, a nie przepisana — i jedyną, o którą czytelnik może
                zapytać „z czego". Odstęp bierze `gap` z `.capacity`. */}
            <TopicHelp topic="capacity" />
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
              etykiety, przy której stoi (`v3/app.css:896-903`, `.helpb`
              — 1,125 rem, `--radius-full`, `--text-2xs`), a treść zostaje
              w oknie. Etykieta wchodzi do `aria-label`, bo znak „?" sam nie
              mówi czytnikowi ekranu, o co pyta.

              OWIJKA `data-help-topic` DOPISANA PRZEZ LOT L7 FAZY II, I JEST TO
              NAPRAWA ZMIERZONEJ ŚLEPOTY, NIE OZDOBA. Kontrakt trasy
              (`test/topic-help.interaction.test.tsx`) zbiera afordancje pomocy
              WYŁĄCZNIE po tym atrybucie, więc znacznik, który się nim nie
              przedstawił, był dla najostrzejszej bramki pomocy w repozytorium
              niewidzialny — razem z jego nazwą, jego panelem i jego formą.
              Panel jest tu inny niż przy `TopicHelp` (okno pojęciowe z
              nawigatorem po sześciu tematach, nie dymek), i to jest świadome:
              lot zbiega WYZWALACZ, nie panel. Deklaracja jest jednak ta sama
              dla obu, bo inaczej bramka musiałaby mieć dwie gałęzie, a druga
              gałąź to miejsce, w którym trzecia forma wejdzie niezauważona. */}
          <span className="help-anchor" data-help-topic="calendar-meetings">
            <button
              type="button"
              className="help-mark"
              aria-haspopup="dialog"
              /* NAZWA ZOSTAJE TA, KTÓRA TU BYŁA. Prototypowa formuła
                 („What this means: <tytuł>") jest regułą dla wyzwalaczy,
                 które nazwy nie miały, bo ich etykietą było całe pytanie.
                 Ten znacznik miał ją od lotu D2 i mówi więcej niż formuła
                 („Why the calendar is read-only" wobec „Meetings"). Lot,
                 który zamienia lepszy napis na regularniejszy, oddaje
                 czytelnikowi mniej — a mierzy to samo. */
              aria-label="Why the calendar is read-only"
              onClick={() => setHelpTopic("calendar-meetings")}
            >
              ?
            </button>
          </span>
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
              autorstwa planu (`v3/screens/today.js:141-142` — `laid out by
              Hermes`, gdy którykolwiek wiersz położył agent; „148-150"
              wskazywało nagłówek SĄSIEDNIEJ sekcji). Warunek jest
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
          {/* WPIS 1-6, DRUGA POŁOWA. `v3/screens/today.js:149` stawia
              `helpBtn("unplanned")` ZARAZ ZA tym nagłówkiem i przed akcją
              dosuniętą do prawej — czyli plakietka należy do nagłówka, a nie
              do prawego końca wiersza. Odstęp bierze `gap` z `.sectionHead`,
              ten sam, z którego bierze go znacznik przy „In the calendar". */}
          <TopicHelp topic="unplanned" />
          {/* WPIS #6, DRUGI KONIEC — I TEN JEST BEZWARUNKOWY. Prototyp:
              `v3/screens/today.js:150` — `<button class="more" data-go='
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
        <Suspense fallback={null}>
          <ConceptHelpDialog
            initialTopic={helpTopic}
            onClose={() => setHelpTopic(undefined)}
          />
        </Suspense>
      )}
    </div>
  );
};
