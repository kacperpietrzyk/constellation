import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

// Shared keyboard model for vertical record lists (cockpit focus, work,
// tasks, Jamie results): one roving tab stop per list, ArrowUp/ArrowDown to
// move, Home/End to jump, Enter opens the record as the active context and
// Space only shows it in the inspector. The split mirrors the shell's
// select-vs-open contract, so every list behaves like the ⌘K palette instead
// of inventing its own arrow handling.

export interface ListNavigationItemProps {
  readonly ref: (element: HTMLElement | null) => void;
  readonly tabIndex: number;
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  readonly onFocus: () => void;
}

export const useListNavigation = ({
  itemCount,
  onOpen,
  onSelect,
  selectOnFocus = false,
}: {
  readonly itemCount: number;
  /** Enter: promote the record to the active context (navigation). */
  readonly onOpen?: (index: number) => void;
  /** Space (and arrow movement, when `selectOnFocus`): show the record in the inspector. */
  readonly onSelect?: (index: number) => void;
  readonly selectOnFocus?: boolean;
}): ((index: number) => ListNavigationItemProps) => {
  const [focusIndex, setFocusIndex] = useState(0);
  const itemsRef = useRef<(HTMLElement | null)[]>([]);
  itemsRef.current.length = itemCount;
  const tabStop = itemCount === 0 ? 0 : Math.min(focusIndex, itemCount - 1);

  const moveFocus = (index: number) => {
    const target = itemsRef.current[index];
    if (target === null || target === undefined) return;
    setFocusIndex(index);
    target.focus();
    // Selection follows deliberate keyboard movement inside the list. It must
    // NOT follow the bare focus event: dismissing the inspector drawer returns
    // focus to the row, and select-on-focus would instantly re-open the drawer
    // the user just closed.
    if (selectOnFocus) onSelect?.(index);
  };

  return (index: number): ListNavigationItemProps => ({
    ref: (element) => {
      itemsRef.current[index] = element;
    },
    tabIndex: index === tabStop ? 0 : -1,
    onFocus: () => {
      setFocusIndex(index);
    },
    onKeyDown: (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveFocus(Math.min(index + 1, itemCount - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveFocus(Math.max(index - 1, 0));
      } else if (event.key === "Home") {
        event.preventDefault();
        moveFocus(0);
      } else if (event.key === "End") {
        event.preventDefault();
        moveFocus(itemCount - 1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        onOpen?.(index);
      } else if (event.key === " ") {
        event.preventDefault();
        onSelect?.(index);
      }
    },
  });
};
