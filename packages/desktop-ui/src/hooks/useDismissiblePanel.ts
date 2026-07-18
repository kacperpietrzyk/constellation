import { useCallback, useEffect, useRef } from "react";

// Wspólny kontrakt zamykalnego panelu (drawer inspektora <75rem dla spotkań,
// dokumentów oraz zadań/projektów): przy otwarciu fokus przechodzi na
// nagłówek panelu, Escape zamyka panel (gdy nie ma otwartego modala),
// a po zamknięciu fokus wraca do elementu, który panel otworzył.

export const useDismissiblePanel = ({
  open,
  onDismiss,
}: {
  readonly open: boolean;
  readonly onDismiss: () => void;
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
      targetRef.current?.focus();
    } else if (!open && wasOpenRef.current) {
      const returnTarget = returnFocusRef.current;
      returnFocusRef.current = null;
      if (returnTarget?.isConnected) returnTarget.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

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
