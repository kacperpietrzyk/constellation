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

export type SurfaceShortcutHint = {
  readonly keys: string;
  readonly kind: "direct" | "palette";
};

export const surfaceShortcutHint = (surface: {
  readonly shortcut?: string;
}): SurfaceShortcutHint =>
  surface.shortcut === undefined
    ? { keys: `${modifierLabel}K`, kind: "palette" }
    : { keys: `${modifierLabel}${surface.shortcut}`, kind: "direct" };

export const shellShortcutGroups = (
  surfaces: readonly { readonly label: string; readonly shortcut?: string }[],
): readonly ShortcutGroup[] => [
  {
    title: "Global",
    entries: [
      { keys: [`${modifierLabel}K`], label: "Command palette and search" },
      { keys: [`${modifierLabel}⇧K`], label: "Quick Capture" },
      { keys: [`${modifierLabel}/`], label: "Shortcut list" },
      { keys: ["Esc"], label: "Close the overlay or clear the selection" },
    ],
  },
  {
    title: "Direct views",
    entries: surfaces
      .filter((item) => item.shortcut !== undefined)
      .map((item) => ({
        keys: [surfaceShortcutHint(item).keys],
        label: item.label,
      })),
  },
  {
    title: "Views through the palette",
    entries: surfaces
      .filter((item) => item.shortcut === undefined)
      .map((item) => ({
        keys: [surfaceShortcutHint(item).keys],
        label: item.label,
      })),
  },
  {
    // ⌘Tab należy na macOS do systemowego przełącznika aplikacji, dlatego
    // karty kontekstu przełącza Ctrl+Tab (obsługiwane też z menu aplikacji).
    title: "Tabs and history",
    entries: [
      { keys: ["Ctrl+Tab"], label: "Next tab" },
      { keys: ["Ctrl+⇧Tab"], label: "Previous tab" },
      { keys: [`${modifierLabel}W`], label: "Close tab" },
      { keys: ["Alt+←", "Alt+→"], label: "Back / forward in history" },
    ],
  },
  {
    title: "Record lists",
    entries: [
      { keys: ["↑", "↓"], label: "Previous / next row" },
      { keys: ["Home", "End"], label: "First / last row" },
      { keys: ["Space"], label: "Show in the context preview" },
      { keys: ["Enter"], label: "Open as the active context" },
      // Obsługa: listener cyfr w CockpitSurface (Wave2Surfaces.tsx).
      { keys: ["1–9"], label: "Open the nth focus action (Week)" },
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
            <p className="eyebrow">Keyboard</p>
            <h2 id="shortcuts-title">Keyboard shortcuts</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close the shortcut list"
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
            ⌘Tab belongs to the system app switcher — Ctrl+Tab switches context
            tabs.
          </p>
        )}
      </section>
    </dialog>
  );
};
