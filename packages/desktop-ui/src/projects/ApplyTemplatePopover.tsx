import { useRef, useState, type KeyboardEvent } from "react";

import { InlinePopover } from "../components/InlinePopover.js";

/* APPLYING A TEMPLATE IS A DISCLOSURE, NOT A FORM (Faza D, lot D11, wpisy #51
   i #55 rejestru). Do 2026-08-12 pas akcji otwartego projektu niósł `<select>`
   „Apply template…" i osobny przycisk „Apply". Prototyp nie stawia W ŻADNYM
   ze swoich czternastu ekranów ani jednego `<select>`, `<input>` czy
   `<textarea>` w paśmie tytułu; wybór jednej rzeczy z listy robi u niego
   PRZYCISK OTWIERAJĄCY MENU — `popover()` (`v3/app.js:1921-1961`) zawieszony
   na `.btn` (np. `<button class="btn bordered" data-act="status-menu">`,
   `v3/app.js:1571`), a panel to `.pop` (`v3/app.css:886-892`): pozycja
   `fixed`, `min-width: 13rem`, `max-height: 22rem`, `overflow-y: auto`.

   KROK POTWIERDZENIA ODCHODZI, I TO JEST DECYZJA NA POMIARZE, nie skrót.
   Wybór szablonu wysyła JEDNĄ komendę `project.applyTemplate`
   (`client/workflow.ts:3885-3908`), a `refreshAfter` (`RealApp.tsx:1534+`)
   wyprowadza `undoCommandId` z głowy strumienia aktywności, więc toast niesie
   działające Cofnij przez 8 s (`RealApp.tsx:1320`) i cofa CAŁOŚĆ jednym
   kliknięciem — bo to jest jedna komenda. Pomyłka kosztuje jedno kliknięcie
   wstecz, a nie odbudowę projektu.

   LENIWY, I TO JEST BUDŻET, NIE GUST. `Wave2Surfaces.tsx` jest na ścieżce
   gorącej, a `InlinePopover` — mimo ośmiu konsumentów — nie jest na niej
   dzisiaj wcale (`grep -c InlinePopover dist/index.html` = 0). Statyczny
   import wciągnąłby go tam razem z portalem i całą obsługą ognisk. Dlatego
   ten plik bierze WYŁĄCZNIE propsy: leniwy import WARTOŚCI z modułu gorącego
   wciągnąłby moduł z powrotem, i to jest w tym repozytorium nazwana pułapka.

   KLAWIATURA MA BYĆ NIE GORSZA NIŻ W `<select>`, i to jest wymaganie zadania,
   a nie dodatek. `<select>` daje strzałki, Home/End i wyszukiwanie pierwszą
   literą; sam `InlinePopover` daje Tab, Escape i oddanie ogniska. Brakującą
   połowę dokłada ta lista — dokładnie tę samą, którą pisze menu prototypu
   (`v3/app.js:1947-1958`: Escape, ArrowDown, ArrowUp, Home, End). Chodzenie
   po literze to nasz dodatek: `<select>` ma je natywnie, prototypowe menu nie.

   CZEGO TU NIE MA I DLACZEGO: panel zostaje `role="dialog"` z przyciskami,
   a nie `role="menu"` z `menuitemradio` jak w prototypie, bo rolę deklaruje
   wspólny `InlinePopover` dla ośmiu konsumentów naraz i zmiana jej tutaj
   byłaby zmianą u wszystkich. Ta różnica jest wypisana w raporcie lotu. */

export const ApplyTemplatePopover = ({
  templates,
  busy,
  onApplyTemplate,
}: {
  readonly templates: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly busy: boolean;
  readonly onApplyTemplate: (templateId: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const walk = (event: KeyboardEvent<HTMLDivElement>): void => {
    const buttons = [
      ...(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []),
    ];
    if (buttons.length === 0) return;
    const active = document.activeElement;
    const at = buttons.findIndex((button) => button === active);
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
    // Pierwszą literą, jak w `<select>`: szuka OD NASTĘPNEGO, więc powtórzenie
    // tej samej litery obchodzi po kolei wszystkie szablony na nią zaczynające
    // się, zamiast zatrzymywać się na pierwszym.
    if (
      event.key.length !== 1 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    const needle = event.key.toLowerCase();
    for (let step = 1; step <= buttons.length; step += 1) {
      const index = (at + step + buttons.length) % buttons.length;
      if (
        buttons[index]?.textContent?.trim().toLowerCase().startsWith(needle)
      ) {
        focus(index);
        return;
      }
    }
  };

  return (
    <InlinePopover
      disabled={busy}
      label="Apply template"
      onOpenChange={setOpen}
      open={open}
      panelLabel="Apply a template to this project"
      triggerClassName="secondary-button compact"
    >
      <div className="popover-choices" onKeyDown={walk} ref={listRef}>
        {templates.map((template) => (
          <button
            key={template.id}
            onClick={() => {
              onApplyTemplate(template.id);
              setOpen(false);
            }}
            type="button"
          >
            {template.name}
          </button>
        ))}
      </div>
    </InlinePopover>
  );
};
