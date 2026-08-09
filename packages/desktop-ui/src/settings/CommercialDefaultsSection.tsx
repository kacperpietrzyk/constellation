import { useState, type FormEvent } from "react";

import { CurrencySchema, type Currency } from "@constellation/contracts";

import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  setWorkspaceCommercialDefaults,
  type DesktopSnapshot,
  type MutationFailure,
} from "../client/workflow.js";

import styles from "./commercial-defaults-section.module.css";

/**
 * THE FUNNEL AND WHAT A NUMBER ON A DEAL MEANS — the settings B6 named.
 *
 * The whole capability was already here except the last inch. The command,
 * its refusals and the projection shipped with Wave C; `workflow.ts` carries
 * `setWorkspaceCommercialDefaults` written down to the optimistic-concurrency
 * envelope — AND NOTHING IN THE RENDERER CALLED IT. That is this repository's
 * `capability nothing mounts` shape one layer up: built through the client and
 * stopped at the screen, so the stages, the markup, the uplift and both
 * currency settings were readable on four screens and settable on none.
 *
 * TWO CONTRACT FACTS THIS CONTROL HONOURS, and they are the reason it is
 * shaped the way it is.
 *
 * 1. `stages` and `currencies` REPLACE THE WHOLE LIST when present. Every
 *    write below therefore sends the list it wants to end up with, including
 *    the entries it is keeping. Sending only the changed entry is how a stage
 *    goes missing, and the wrapper's own comment says so.
 * 2. REMOVING A STAGE THAT STILL HOLDS DEALS IS ALLOWED. The kernel refuses
 *    moving a deal INTO an unconfigured stage; it deliberately does not refuse
 *    the orphan, because a stored stage no definition matches has to stay
 *    readable. A UI that blocked removal would contradict the kernel, so this
 *    one asks for a confirmation and then does what it was asked.
 *
 * The one refusal it does make is the schema's: a funnel cannot be emptied
 * (`PipelineStagesSchema` is `min(1)`), and neither can the currency list.
 * Refusing that here is not a second opinion — it is not sending a command
 * whose only possible answer is no.
 */
export const CommercialDefaultsSection = ({
  client,
  snapshot,
  onReload,
  onFailure,
}: {
  readonly client: ConstellationRendererClient | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly onReload: () => Promise<void>;
  readonly onFailure: (failure: MutationFailure) => void;
}) => {
  const defaults = snapshot.bootstrap.workspace.commercialDefaults;
  const stages = [...defaults.stages].sort(
    (left, right) =>
      left.order - right.order || left.id.localeCompare(right.id),
  );
  // NOT A UNION WRITTEN HERE. The currencies a workspace may choose from are
  // the contract's own enum; a fourth arrives by widening that enum and this
  // control offers it the same day. A list of currency strings beside a closed
  // vocabulary is the drift family this repository has paid for three times,
  // and money is the shape where it produces a plausible number, not an error.
  const everyCurrency: readonly Currency[] = CurrencySchema.options;

  const [busy, setBusy] = useState<string>();
  // KTÓRY ETAP JEST WYBRANY — nowy stan, bo pasek akcji działa NA WYBRANYM,
  // a nie na wierszu, w którym akurat stoi kursor. Trzymany jako `id`, nie
  // jako indeks: kolejność zmienia się właśnie tymi przyciskami, więc indeks
  // wskazywałby po każdym ruchu na inny etap.
  const [selectedId, setSelectedId] = useState<string>();
  const [renameId, setRenameId] = useState<string>();
  const [renameLabel, setRenameLabel] = useState("");
  const [removeId, setRemoveId] = useState<string>();
  const [newStageLabel, setNewStageLabel] = useState("");
  const [markup, setMarkup] = useState(String(defaults.markupPct));
  const [uplift, setUplift] = useState(String(defaults.upliftPct));

  /**
   * ONE WRITE AT A TIME, and it is the version that makes it necessary rather
   * than taste: every change here is a write to the Workspace record carrying
   * the version it read. Two writes started from one render would send the
   * same expected version, and the second would be refused as a conflict for a
   * reason the person did nothing to cause.
   */
  const run = async (
    key: string,
    change: Parameters<typeof setWorkspaceCommercialDefaults>[2],
  ): Promise<boolean> => {
    if (busy !== undefined || !client) return false;
    setBusy(key);
    try {
      const result = await setWorkspaceCommercialDefaults(
        client,
        snapshot,
        change,
      );
      if (result.kind === "success") {
        await onReload();
        return true;
      }
      onFailure(result as MutationFailure);
      return false;
    } finally {
      setBusy(undefined);
    }
  };

  const submitStage = (event: FormEvent) => {
    event.preventDefault();
    const label = newStageLabel.trim();
    if (label.length === 0) return;
    void run("stage-create", {
      stages: [
        ...stages,
        {
          // A STABLE ID, NOT A SLUG OF THE LABEL. `opportunity.stage` stores
          // this value, so it must survive every rename the label goes
          // through — and two stages that once read the same would otherwise
          // collide on an id the schema refuses.
          id: crypto.randomUUID(),
          label,
          order: Math.min(
            9_999,
            stages.reduce(
              (highest, stage) => Math.max(highest, stage.order),
              0,
            ) + 1,
          ),
        },
      ],
    }).then((ok) => {
      if (ok) setNewStageLabel("");
    });
  };

  const submitNumbers = (event: FormEvent) => {
    event.preventDefault();
    const markupPct = Number(markup);
    const upliftPct = Number(uplift);
    if (!Number.isInteger(markupPct) || !Number.isInteger(upliftPct)) return;
    // PARTIAL BY FIELD, USED AS SUCH. The command leaves an absent key alone,
    // so changing the markup does not restate the uplift — and neither of them
    // restates the funnel.
    void run("numbers", {
      ...(markupPct === defaults.markupPct ? {} : { markupPct }),
      ...(upliftPct === defaults.upliftPct ? {} : { upliftPct }),
    });
  };

  const numbersUnchanged =
    Number(markup) === defaults.markupPct &&
    Number(uplift) === defaults.upliftPct;
  const homeCurrencyOffered = defaults.currencies.includes(
    defaults.homeCurrency,
  );
  // Wyprowadzone z listy, nie zapamiętane obok niej: etap usunięty przez
  // kogokolwiek przestaje być wybrany sam z siebie, bez sprzątania po stanie.
  const selectedIndex = stages.findIndex((stage) => stage.id === selectedId);
  const selected = selectedIndex < 0 ? undefined : stages[selectedIndex];

  /**
   * CO ROBI NARZUT — POLICZONE, I REGUŁA ZAOKRĄGLENIA ZAPISANA.
   *
   * Marża to udział w CENIE, narzut — w KOSZCIE, więc `margin = m / (100 + m)`.
   * „25% narzutu = 20% marży" jest dokładne; 33% narzutu to 24,812…% i liczba
   * musi się do czegoś zaokrąglić, bo inaczej ekran wypisze osiemnaście cyfr
   * albo — gorzej — obetnie do 24% i zacznie kłamać w jedną stronę.
   *
   * REGUŁA: jedno miejsce po przecinku, zaokrąglenie do najbliższego (`.toFixed`
   * na wartości dodatniej), a końcowe „,0" ZNIKA. Stąd 25% → „20%", 33% →
   * „24,8%", 0% → „0%". Największy możliwy błąd wyniosłego zdania to 0,05
   * punktu procentowego i jest to błąd ZAOKRĄGLENIA, a nie modelu.
   *
   * Liczy się z WPISANEJ wartości pola, nie z zapisanej: skutek ma odpowiadać
   * na to, co człowiek właśnie wpisał, jeszcze zanim naciśnie zapis.
   */
  const markupPctTyped = Number(markup);
  const markupEffect =
    markup.trim() === "" ||
    !Number.isFinite(markupPctTyped) ||
    markupPctTyped < 0
      ? undefined
      : {
          price: 100 + markupPctTyped,
          margin: Number(
            ((markupPctTyped / (100 + markupPctTyped)) * 100).toFixed(1),
          ),
        };

  return (
    <div
      className={`settings-control ${styles.commercial}`}
      data-commercial-defaults="true"
    >
      {/* JEDEN PASEK AKCJI NA ZAZNACZENIU, NIE DWADZIEŚCIA CZTERY PRZYCISKI
          W WIERSZACH (`v3/screens/settings.css:162-175`, `.st-bar`; wiersz
          zaznaczony `:120`). Sześć etapów × cztery kontrolki dawało w tej
          kolumnie 24 przyciski jednocześnie — a prototyp trzyma kontrolki
          W PASKU NAD LISTĄ i pisze wprost dlaczego: opcja listy z przyciskiem
          w środku jest opcją, po której czytnik ekranu nie umie się poruszać.

          RÓŻNICA WOBEC PROTOTYPU, ZAPISANA: v3 daje wierszom
          `aria-selected` (czyli `role="option"` w `role="listbox"`), co
          wymaga własnej obsługi strzałek i roving tabindex. Tutaj wiersz jest
          zwykłym przyciskiem przełącznym (`aria-pressed`): Tab przechodzi po
          etapach bez ani jednej linijki kodu klawiatury, a znaczenie
          „ten wiersz jest wybrany" niesie atrybut, który to znaczy. */}
      <div className={styles.stageBar} role="group" aria-label="Funnel stages">
        <span className={styles.stageBarText}>
          {stages.length === 1 ? "1 stage" : `${stages.length} stages`}
          <b>{selected ? selected.label : "none selected"}</b>
        </span>
        {renameId !== undefined && selected ? (
          <form
            className={styles.stageRename}
            onSubmit={(event) => {
              event.preventDefault();
              const label = renameLabel.trim();
              if (label.length === 0) return;
              void run(selected.id, {
                stages: stages.map((other) =>
                  other.id === selected.id ? { ...other, label } : other,
                ),
              }).then((ok) => {
                if (ok) setRenameId(undefined);
              });
            }}
          >
            <input
              value={renameLabel}
              maxLength={80}
              autoFocus
              aria-label={`New label for ${selected.label}`}
              onChange={(event) => setRenameLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setRenameId(undefined);
                }
              }}
            />
            <button type="submit" disabled={busy !== undefined}>
              Save
            </button>
            <button
              type="button"
              disabled={busy !== undefined}
              onClick={() => setRenameId(undefined)}
            >
              Cancel
            </button>
          </form>
        ) : (
          <span className={styles.stageActions}>
            <button
              type="button"
              disabled={busy !== undefined || selectedIndex < 1}
              aria-label={
                selected ? `Move earlier: ${selected.label}` : "Move earlier"
              }
              onClick={() => {
                const above = stages[selectedIndex - 1];
                if (!selected || !above) return;
                void run(selected.id, {
                  stages: stages.map((other) =>
                    other.id === selected.id
                      ? { ...other, order: above.order }
                      : other.id === above.id
                        ? { ...other, order: selected.order }
                        : other,
                  ),
                });
              }}
            >
              ↑
            </button>
            <button
              type="button"
              disabled={
                busy !== undefined ||
                selectedIndex < 0 ||
                selectedIndex === stages.length - 1
              }
              aria-label={
                selected ? `Move later: ${selected.label}` : "Move later"
              }
              onClick={() => {
                const below = stages[selectedIndex + 1];
                if (!selected || !below) return;
                void run(selected.id, {
                  stages: stages.map((other) =>
                    other.id === selected.id
                      ? { ...other, order: below.order }
                      : other.id === below.id
                        ? { ...other, order: selected.order }
                        : other,
                  ),
                });
              }}
            >
              ↓
            </button>
            <button
              type="button"
              disabled={busy !== undefined || !selected}
              onClick={() => {
                if (!selected) return;
                setRemoveId(undefined);
                setRenameId(selected.id);
                setRenameLabel(selected.label);
              }}
            >
              Rename
            </button>
            {removeId !== undefined && selected ? (
              <>
                <button
                  type="button"
                  className={styles.stageDanger}
                  disabled={busy !== undefined || !client}
                  onClick={() => {
                    setRemoveId(undefined);
                    setSelectedId(undefined);
                    void run(selected.id, {
                      stages: stages.filter(
                        (other) => other.id !== selected.id,
                      ),
                    });
                  }}
                >
                  Confirm remove
                </button>
                <button type="button" onClick={() => setRemoveId(undefined)}>
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                // A FUNNEL CANNOT BE EMPTIED — the schema says so, and
                // sending the command anyway would spend a round trip
                // to be told what is already known here.
                disabled={
                  busy !== undefined || !selected || stages.length === 1
                }
                onClick={() => selected && setRemoveId(selected.id)}
              >
                Remove
              </button>
            )}
          </span>
        )}
      </div>

      <ul className={styles.stageList}>
        {stages.map((stage, index) => (
          <li key={stage.id} data-stage={stage.id}>
            <button
              type="button"
              // TWO CLASSES, AND THE GLOBAL ONE CARRIES NO PAINT — it is the
              // name of an exception. `.settings-control button:not(.primary-button)`
              // in `styles.css` dresses every button inside a settings section
              // as a secondary action, at a weight (0,2,1) this module's own
              // (0,2,0) rules cannot reach; measured, that rule was overriding
              // the row's background, border AND the accent rail of the SELECTED
              // state, so the selected stage was drawn exactly like the others.
              // A list row is not an action, and `settings-row` is where that
              // sentence is written down for the cascade to read.
              className={`settings-row ${styles.stageRow}`}
              aria-pressed={selectedId === stage.id}
              disabled={busy !== undefined}
              onClick={() => {
                setRenameId(undefined);
                setRemoveId(undefined);
                setSelectedId(selectedId === stage.id ? undefined : stage.id);
              }}
            >
              {/* Numer pozycji z przodu, bo kolejność JEST tu treścią
                  (`v3/screens/settings.css:121-128`). */}
              <span className={styles.stageOrd}>{index + 1}</span>
              <span className={styles.stageLabel}>
                <strong>{stage.label}</strong>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <form className={styles.stageCreate} onSubmit={submitStage}>
        <label>
          <span className="sr-only">New stage label</span>
          <input
            value={newStageLabel}
            maxLength={80}
            placeholder="New stage"
            disabled={busy === "stage-create"}
            onChange={(event) => setNewStageLabel(event.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={
            busy === "stage-create" || newStageLabel.trim() === "" || !client
          }
        >
          Add stage
        </button>
      </form>

      <form className={styles.numbers} onSubmit={submitNumbers}>
        <label className={styles.number}>
          <span>Markup on cost, %</span>
          <input
            type="number"
            min={0}
            max={1000}
            step={1}
            value={markup}
            disabled={busy === "numbers"}
            onChange={(event) => setMarkup(event.target.value)}
          />
        </label>
        <label className={styles.number}>
          <span>Uplift on renewal, %</span>
          <input
            type="number"
            min={0}
            max={1000}
            step={1}
            value={uplift}
            disabled={busy === "numbers"}
            onChange={(event) => setUplift(event.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy === "numbers" || numbersUnchanged || !client}
        >
          Save
        </button>
      </form>

      {/* CO TA LICZBA ROBI, POLICZONE (`v3/screens/settings.css:206-218`,
          `.st-effect` — „skutek liczby, policzony, nie zapowiedziany").
          Pole mówiło dotąd „Markup on cost, %" i nic więcej: żeby wiedzieć,
          co 25 znaczy dla oferty, trzeba było policzyć w głowie. */}
      {markupEffect === undefined ? null : (
        <div className={styles.effect} data-markup-effect="true">
          <span className={styles.effectKey}>What this does</span>
          <span className={styles.effectValue}>
            A cost of <b>100</b> is offered at <b>{markupEffect.price}</b> — a
            margin of <b>{markupEffect.margin}%</b>.
          </span>
          <span className={styles.effectNote}>
            Margin is the share of the price, not of the cost, so it is always
            smaller than the markup.
          </span>
        </div>
      )}

      <label className={styles.home}>
        <span>Totals are summed into</span>
        <select
          value={defaults.homeCurrency}
          disabled={busy === "home-currency" || !client}
          data-home-currency={defaults.homeCurrency}
          onChange={(event) => {
            const homeCurrency = event.target.value as Currency;
            if (homeCurrency === defaults.homeCurrency) return;
            void run("home-currency", { homeCurrency });
          }}
        >
          {everyCurrency.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
      </label>

      <fieldset className={styles.currencies}>
        <legend>Currencies a deal may be recorded in</legend>
        {everyCurrency.map((currency) => {
          const offered = defaults.currencies.includes(currency);
          return (
            <label key={currency} className={styles.currency}>
              <input
                type="checkbox"
                checked={offered}
                // The list is `min(1)` for the same reason the funnel is: "no
                // currencies at all" is not a state this product has, it is a
                // picker nobody can use.
                disabled={
                  busy === "currencies" ||
                  !client ||
                  (offered && defaults.currencies.length === 1)
                }
                onChange={() =>
                  void run("currencies", {
                    currencies: offered
                      ? defaults.currencies.filter(
                          (other) => other !== currency,
                        )
                      : [...defaults.currencies, currency],
                  })
                }
              />
              <span>{currency}</span>
            </label>
          );
        })}
      </fieldset>

      {/* THE NAMED GAP, SAID AT THE PLACE THAT CAN CAUSE IT. Nothing makes the
          home currency a member of this list — not the schema, not the kernel —
          and the deal record already withholds its amount controls when the two
          disagree. This control is the only place that can produce that state,
          so it says what happens rather than refusing a write the kernel
          allows. */}
      {homeCurrencyOffered ? null : (
        <p className={styles.misconfigured} data-home-currency-not-offered>
          Deals cannot be given an amount while {defaults.homeCurrency} is not
          offered.
        </p>
      )}
    </div>
  );
};
