import { useEffect, useRef } from "react";

import { Icon } from "./Icon.js";

/* Jedno deklaratywne źródło skrótów klawiszowych shellu. Ta sama tablica
   zasila nakładkę pod ⌘/, skróty przy poleceniach nawigacji w palecie ⌘K
   oraz tooltipy sidebaru, więc dokumentacja nie rozjeżdża się z obsługą
   klawiszy w RealApp. */

const platform = typeof navigator === "undefined" ? "" : navigator.platform;

export const modifierLabel = /Mac|iPhone|iPad/.test(platform) ? "⌘" : "Ctrl";

export type ShortcutEntry = {
  readonly keys: readonly string[];
  readonly label: string;
};

export type ShortcutGroup = {
  readonly title: string;
  readonly entries: readonly ShortcutEntry[];
};

export const shellShortcutGroups = (
  surfaces: readonly { readonly label: string; readonly shortcut?: string }[],
): readonly ShortcutGroup[] => [
  {
    title: "Globalne",
    entries: [
      { keys: [`${modifierLabel}K`], label: "Paleta poleceń i wyszukiwanie" },
      { keys: [`${modifierLabel}⇧K`], label: "Quick Capture" },
      { keys: [`${modifierLabel}/`], label: "Lista skrótów" },
      { keys: ["Esc"], label: "Zamknij nakładkę lub wyczyść wybór" },
    ],
  },
  {
    title: "Widoki",
    entries: surfaces
      .filter((item) => item.shortcut !== undefined)
      .map((item) => ({
        keys: [`${modifierLabel}${item.shortcut}`],
        label: item.label,
      })),
  },
  {
    // ⌘Tab należy na macOS do systemowego przełącznika aplikacji, dlatego
    // karty kontekstu przełącza Ctrl+Tab (obsługiwane też z menu aplikacji).
    title: "Karty i historia",
    entries: [
      { keys: ["Ctrl+Tab"], label: "Następna karta" },
      { keys: ["Ctrl+⇧Tab"], label: "Poprzednia karta" },
      { keys: [`${modifierLabel}W`], label: "Zamknij kartę" },
      { keys: ["Alt+←", "Alt+→"], label: "Wstecz / Dalej w historii" },
    ],
  },
  {
    title: "Listy rekordów",
    entries: [
      { keys: ["↑", "↓"], label: "Poprzedni / następny wiersz" },
      { keys: ["Home", "End"], label: "Pierwszy / ostatni wiersz" },
      { keys: ["Space"], label: "Pokaż w podglądzie kontekstu" },
      { keys: ["Enter"], label: "Otwórz jako aktywny kontekst" },
      // Obsługa: listener cyfr w CockpitSurface (Wave2Surfaces.tsx).
      { keys: ["1–9"], label: "Otwórz n-te działanie fokusu (Tydzień)" },
    ],
  },
];

export const ShortcutsOverlay = ({
  surfaces,
  onClose,
}: {
  readonly surfaces: readonly {
    readonly label: string;
    readonly shortcut?: string;
  }[];
  readonly onClose: () => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const returnTarget =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    dialog?.showModal();
    return () => {
      dialog?.close();
      returnTarget?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="shortcuts-backdrop"
      aria-labelledby="shortcuts-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="shortcuts-dialog">
        <header>
          <div>
            <p className="eyebrow">Klawiatura</p>
            <h2 id="shortcuts-title">Skróty klawiszowe</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Zamknij listę skrótów"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="shortcuts-groups">
          {shellShortcutGroups(surfaces).map((group) => (
            <section key={group.title} aria-label={group.title}>
              <h3>{group.title}</h3>
              <dl>
                {group.entries.map((entry) => (
                  <div key={entry.label}>
                    <dt>{entry.label}</dt>
                    <dd>
                      {entry.keys.map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        {modifierLabel === "⌘" && (
          <p className="shortcuts-note">
            ⌘Tab należy do systemowego przełącznika aplikacji — karty kontekstu
            przełącza Ctrl+Tab.
          </p>
        )}
      </section>
    </dialog>
  );
};
