import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { Icon } from "./Icon.js";
import { InlinePopover } from "./InlinePopover.js";

/* WYBÓR JEST RYSOWANYM MENU, NIE NATYWNĄ KONTROLKĄ (Faza II, lot L6, wpisy
   4-1 i 4-2 dokumentu przejścia).

   DWIE STRONY, BO REGUŁA MA MIEĆ DWA CYTATY.
   Kontrakt: `.ui-craft/patterns.md`, „Pattern: Control size" — po przepisaniu
   przez przyrząd P4 zdanie brzmi „anywhere else on a content surface it holds
   NONE", a jedynym wyjątkiem jest wiersz formularza w Ustawieniach.
   Prototyp: `v3/app.js:1921-1961` (`popover()`), zawieszony na zwykłym `.btn`
   — panel `.pop` (`v3/app.css:886-892`) z wierszami `role="menuitemradio"`,
   `aria-checked` i glifem `check` dosuniętym do prawej (`v3/app.css:911-921`).
   Cały prototyp ma DOKŁADNIE JEDEN `<select>` i stoi on w wierszu Ustawień
   (`v3/screens/settings.js:331`).

   `appearance` NIE JEST TU PRZYRZĄDEM i to jest ustalone pomiarem, nie gustem:
   Chromium zwraca dla każdej kontrolki wyłącznie `auto` albo `none`, więc
   asercja „`appearance: none`" byłaby prawdziwa o zdrowym przycisku i dałaby
   się zazielenić jedną linijką CSS, podczas gdy macOS dalej rysowałby listę
   opcji. Rzecz, której nie da się udawać, to NIEOBECNOŚĆ natywnej kontrolki na
   powierzchni treści — i tego pilnują pary `P4-01a/b` i `P4-02a/b`.

   PANEL JEST PORTALOWANY DO `document.body` (`InlinePopover.tsx:196-208`),
   więc pole i wiersze menu stoją POZA `#main-content`. To NIE jest sposób na
   obejście pomiaru: rzecz, którą lot oddaje, jest dokładnie tym, co robi
   prototyp — wybór przenosi się z widżetu rysowanego przez system na przycisk
   otwierający rysowane przez nas menu. Osobny spis źródeł
   (`scripts/native-control-census.mjs`) liczy natywne kontrolki w ŹRÓDLE, więc
   kontrolka przeniesiona o jedno kliknięcie dalej dalej się w nim liczy i dług
   nie znika z ewidencji przez samą przeprowadzkę.

   KLAWIATURA MA BYĆ NIE GORSZA NIŻ W `<select>`. To wymaganie i jego spełnienie
   są przepisane z `projects/ApplyTemplatePopover.tsx` — pierwszego miejsca
   w tym repozytorium, które zamieniło `<select>` na menu (Faza D, lot D11).
   `<select>` daje strzałki, Home/End i skok po pierwszej literze; sam
   `InlinePopover` daje Tab, Escape i oddanie ogniska. Resztę dokłada `walk`
   niżej — dokładnie tę samą listę, którą pisze menu prototypu
   (`v3/app.js:1947-1958`), plus skok po literze, którego prototyp nie ma,
   a `<select>` miał.

   RÓŻNICA WOBEC `ApplyTemplatePopover`, i dlatego to jest drugi plik, a nie
   jego rozszerzenie: tamten panel to lista AKCJI bez stanu („zastosuj ten
   szablon"), a ten jest WYBOREM JEDNEJ Z KILKU i musi powiedzieć, która jest
   wybrana teraz — w wyzwalaczu (tekstem) i w wierszu (`aria-checked` + glif).
   `role="menu"` deklarowane jest TUTAJ, na liście, a nie na wspólnym panelu:
   `InlinePopover` daje `role="dialog"` ośmiu konsumentom naraz i zmiana tam
   byłaby zmianą u wszystkich. */

export type Choice = {
  readonly value: string;
  readonly label: string;
};

/**
 * Chodzenie po wierszach menu klawiaturą, wspólne dla obu paneli tego pliku.
 *
 * Wydzielone, bo `ApplyTemplatePopover` udowodnił, że bez tego wymiana
 * `<select>` na menu ODBIERA klawiaturze to, co miała.
 */
const walkRows = (
  event: KeyboardEvent<HTMLDivElement>,
  list: HTMLDivElement | null,
): void => {
  const buttons = [
    ...(list?.querySelectorAll<HTMLButtonElement>("button") ?? []),
  ];
  if (buttons.length === 0) return;
  const at = buttons.findIndex((button) => button === document.activeElement);
  const focus = (index: number): void => {
    event.preventDefault();
    buttons[(index + buttons.length) % buttons.length]?.focus();
  };
  if (event.key === "ArrowDown") {
    focus(at + 1);
    return;
  }
  if (event.key === "ArrowUp") {
    focus(at < 0 ? -1 : at - 1);
    return;
  }
  if (event.key === "Home") {
    focus(0);
    return;
  }
  if (event.key === "End") {
    focus(buttons.length - 1);
    return;
  }
  if (event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey)
    return;
  const needle = event.key.toLowerCase();
  for (let step = 1; step <= buttons.length; step += 1) {
    const index = (at + step + buttons.length) % buttons.length;
    if (buttons[index]?.textContent?.trim().toLowerCase().startsWith(needle)) {
      focus(index);
      return;
    }
  }
};

/**
 * Jeden wybór z kilku, zrobiony przyciskiem otwierającym rysowane menu.
 *
 * Stan otwarcia jest WEWNĘTRZNY, w odróżnieniu od `InlinePopover`. Dwa takie
 * przyciski obok siebie nie mogą być otwarte naraz mimo to: naciśnięcie
 * drugiego jest dla pierwszego kliknięciem NA ZEWNĄTRZ, a `InlinePopover`
 * zamyka się na `pointerdown` poza swoim panelem i wyzwalaczem
 * (`InlinePopover.tsx:131-137`). Sprawdzone w kodzie, nie założone.
 */
export const ChoicePopover = ({
  choices,
  disabled = false,
  glyph,
  panelLabel,
  onChoose,
  trigger,
  triggerClassName,
  triggerId,
  value,
}: {
  readonly choices: readonly Choice[];
  readonly disabled?: boolean;
  /** Glif wyzwalacza; podawany tylko tam, gdzie prototyp naprawdę go stawia. */
  readonly glyph?: ReactNode | undefined;
  readonly panelLabel: string;
  readonly onChoose: (value: string) => void;
  /** Treść pigułki. Niesie STAN — „Group: Status", nie „Group". */
  readonly trigger: string;
  readonly triggerClassName?: string | undefined;
  /** Zostaje po `<select>`, którego ten panel zastąpił: to samo `id`, ten sam
   *  adres dla testów i dla każdego, kto tego szuka po nazwie. */
  readonly triggerId?: string | undefined;
  readonly value: string;
}) => {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  return (
    <InlinePopover
      disabled={disabled}
      label={
        <>
          {glyph}
          {trigger}
        </>
      }
      onOpenChange={setOpen}
      open={open}
      panelLabel={panelLabel}
      {...(triggerClassName === undefined ? {} : { triggerClassName })}
      triggerId={triggerId}
    >
      <div
        className="popover-choices"
        onKeyDown={(event) => walkRows(event, listRef.current)}
        ref={listRef}
        role="menu"
      >
        {choices.map((choice) => (
          <button
            aria-checked={choice.value === value}
            data-choice={choice.value}
            key={choice.value}
            onClick={() => {
              onChoose(choice.value);
              setOpen(false);
            }}
            role="menuitemradio"
            type="button"
          >
            <span>{choice.label}</span>
            {choice.value === value ? <Icon name="check" /> : null}
          </button>
        ))}
      </div>
    </InlinePopover>
  );
};

/**
 * Pole tekstowe schowane za pigułką — dla rzeczy, których nie da się wybrać
 * z listy, bo są wpisywane.
 *
 * DLACZEGO POLE ZOSTAJE POLEM, powiedziane wprost, bo to jest granica tego
 * lotu: prototyp nie stawia na ekranie Zadań ŻADNEGO pola, a szukanie oddaje
 * omniboksowi powłoki — który sam jest przyciskiem (`v3/app.js:653-654`,
 * `.omnibox`) otwierającym paletę z jedynym `<input>` całego prototypu
 * (`v3/app.js:1831`, `#palette-input`), czyli też polem, tylko w nakładce.
 * Skasowanie filtrowania po tekście zabrałoby działającą zdolność, której
 * powłoka tej aplikacji NIE zastępuje (nie zmierzono, żeby paleta filtrowała
 * wiersze Zadań), a lot, który kasuje zdolność, żeby zazielenić licznik, jest
 * dokładnie tym, przed czym ostrzega wpis `LP4-03`. Pole schodzi więc za
 * pigułkę `Filter`.
 *
 * CO Z TEGO JEST PROTOTYPOWE, A CO NIE — POPRAWKA PO PRZEGLĄDZIE. Prototypowa
 * jest SAMA PIGUŁKA: `<button class="chip dashed" data-act="filter">`
 * (`v3/screens/tasks.js:521`). Prototypowe NIE JEST to, co za nią stoi —
 * `data-act="filter"` prowadzi tam przez `pickFilterField` →
 * `pickFilterOperator` → `pickFilterValues` (`v3/app.js:1875-1913`), czyli
 * przez łańcuch samych menu `popover(...)`, i ANI JEDNEGO `<input>` w nim nie
 * ma. Pierwsza wersja tego zdania brzmiała „pole schodzi za pigułkę Filter —
 * tak jak w prototypie" i przypisywała prototypowi rzecz, której on nie robi.
 * Prototyp buduje filtr z wyborów, bo wszystkie jego osie są wyliczalne;
 * nasze filtrowanie po tytule, projekcie i osobie jest WPISYWANE, a wpisywania
 * nie da się zrobić menu. To jest więc świadome odstępstwo od prototypu na
 * ekranie Zadań, uzasadnione zdolnością, której nie ma czym zastąpić — a nie
 * przepisanie wzorca. Ostrzeżenia P4 to nie łamie i to jest osobne zdanie:
 * P4 mówi o produkcie, który dalej WYBIERA natywnym widżetem, a pole tekstowe
 * nie jest wyborem. Jedynym strażnikiem tego przeniesionego pola jest spis
 * źródeł (`scripts/native-control-census.mjs`), który liczy je dalej —
 * w wierszu `components/ChoicePopover.tsx: 1`.
 */
export const FieldPopover = ({
  fieldLabel,
  onChange,
  panelLabel,
  placeholder,
  trigger,
  triggerId,
  type = "search",
  value,
}: {
  readonly fieldLabel: string;
  readonly onChange: (value: string) => void;
  readonly panelLabel: string;
  readonly placeholder?: string | undefined;
  readonly trigger: string;
  readonly triggerId?: string | undefined;
  readonly type?: "search" | "text";
  readonly value: string;
}) => {
  const [open, setOpen] = useState(false);
  const fieldId = `${triggerId ?? "field"}-input`;

  return (
    <InlinePopover
      label={trigger}
      onOpenChange={setOpen}
      open={open}
      panelLabel={panelLabel}
      triggerId={triggerId}
    >
      <div className="popover-field">
        <label htmlFor={fieldId}>{fieldLabel}</label>
        <input
          id={fieldId}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type={type}
          value={value}
        />
      </div>
    </InlinePopover>
  );
};
