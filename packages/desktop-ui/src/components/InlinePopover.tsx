import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

// Shared popover for compact create/link forms (Work columns, saved-view
// strip, strategic create panel). Replaces the previous <details> pattern:
// the panel is portaled to <body>, so overflow containers such as the
// saved-view strip cannot clip it; the parent controls `open`, keeping one
// popover visible at a time; Escape and clicking outside close the panel and
// return focus to the trigger; the first field receives focus on open.

/**
 * Surfaces the first required field that passes native validation but holds
 * only whitespace. Popover forms reject trimmed-empty values; without this
 * the rejection would be silent.
 */
export const reportFirstEmptyRequiredField = (form: HTMLFormElement): void => {
  for (const element of Array.from(form.elements)) {
    if (
      (element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement) &&
      element.required &&
      element.value.trim() === ""
    ) {
      element.setCustomValidity("To pole nie może zawierać samych spacji.");
      element.reportValidity();
      element.addEventListener("input", () => element.setCustomValidity(""), {
        once: true,
      });
      return;
    }
  }
};

export const InlinePopover = ({
  label,
  panelLabel,
  open,
  onOpenChange,
  triggerClassName,
  disabled = false,
  children,
}: {
  /** Trigger content, rendered inside the chip-like button. */
  readonly label: ReactNode;
  /** Accessible name of the popover dialog. */
  readonly panelLabel: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly triggerClassName?: string;
  readonly disabled?: boolean;
  readonly children: ReactNode;
}) => {
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const [style, setStyle] = useState<CSSProperties>();

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (trigger === null || panel === null) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 12;
    const gap = 6;
    const left = Math.max(
      margin,
      Math.min(rect.left, window.innerWidth - panel.offsetWidth - margin),
    );
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    // Near the bottom edge the panel flips above the trigger instead of
    // being squeezed into the remaining strip of the window.
    if (panel.offsetHeight > spaceBelow && spaceAbove > spaceBelow) {
      setStyle({
        bottom: window.innerHeight - rect.top + gap,
        left,
        maxHeight: spaceAbove,
      });
      return;
    }
    setStyle({ top: rect.bottom + gap, left, maxHeight: spaceBelow });
  }, []);

  useLayoutEffect(() => {
    if (open) updatePosition();
    else setStyle(undefined);
  }, [open, updatePosition]);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      panelRef.current
        ?.querySelector<HTMLElement>("input, select, textarea, button")
        ?.focus();
      const isInside = (target: EventTarget | null): boolean =>
        target instanceof Node &&
        (panelRef.current?.contains(target) === true ||
          triggerRef.current?.contains(target) === true);
      const onPointerDown = (event: PointerEvent) => {
        if (isInside(event.target)) return;
        onOpenChange(false);
      };
      // Document-level capture: Escape closes the popover even when focus sits
      // on <body> (click on non-focusable panel content) and never reaches the
      // window-level guards underneath (inspector drawer, shell selection).
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onOpenChange(false);
        triggerRef.current?.focus();
      };
      // A non-modal popover closes when keyboard focus leaves it: tabbing past
      // the last field does not leave an orphaned panel floating over content
      // far from where focus went (the panel is portaled to <body>).
      const onFocusIn = (event: FocusEvent) => {
        if (isInside(event.target)) return;
        onOpenChange(false);
      };
      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("keydown", onKeyDown, true);
      document.addEventListener("focusin", onFocusIn, true);
      document.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      return () => {
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("keydown", onKeyDown, true);
        document.removeEventListener("focusin", onFocusIn, true);
        document.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      const active = document.activeElement;
      // Restore focus only when closing left it stranded (the portal content
      // unmounted); a click that already moved focus elsewhere keeps it.
      if (active === null || active === document.body)
        triggerRef.current?.focus();
    }
    return undefined;
  }, [open, onOpenChange, updatePosition]);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={`inline-popover-trigger${
          triggerClassName ? ` ${triggerClassName}` : ""
        }`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
      >
        {label}
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label={panelLabel}
            className="inline-popover"
            style={style}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
};
