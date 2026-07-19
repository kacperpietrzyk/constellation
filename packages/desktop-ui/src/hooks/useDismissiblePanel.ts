import { useCallback, useEffect, useRef } from "react";

// Wspólny kontrakt zamykalnego panelu inspektora: Escape zamyka panel (gdy nie
// ma otwartego modala), a po zamknięciu fokus wraca do elementu, który panel
// otworzył. Drawer może dodatkowo przenieść fokus na swój nagłówek; szeroki
// inspector pozostawia go w kolekcji do czasu jawnej interakcji z panelem.

export const useDismissiblePanel = ({
  open,
  onDismiss,
  focusOnOpen = true,
}: {
  readonly open: boolean;
  readonly onDismiss: () => void;
  readonly focusOnOpen?: boolean;
}): { readonly focusTargetRef: (element: HTMLElement | null) => void } => {
  const targetRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const activeElement = document.activeElement;
      returnFocusRef.current =
        activeElement instanceof HTMLElement && activeElement !== document.body
          ? activeElement
          : null;
      if (focusOnOpen) targetRef.current?.focus();
    } else if (!open && wasOpenRef.current) {
      const returnTarget = returnFocusRef.current;
      returnFocusRef.current = null;
      if (returnTarget?.isConnected) returnTarget.focus();
    }
    wasOpenRef.current = open;
  }, [focusOnOpen, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Modalne dialogi (Quick Capture, ⌘K, potwierdzenia) obsługują Escape
      // same; panel nie może zamknąć się pod nimi.
      if (document.querySelector("dialog[open]") !== null) return;
      dismissRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const focusTargetRef = useCallback((element: HTMLElement | null) => {
    targetRef.current = element;
  }, []);
  return { focusTargetRef };
};
