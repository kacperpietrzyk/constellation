import { strict as assert } from "node:assert";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";

import { useListNavigation } from "../src/hooks/useListNavigation.js";

// The shell's row keyboard model owns Enter and Space on every list in the
// product. A control INSIDE a row bubbles its own keydown to the row, so
// without a guard the row's `preventDefault()` swallows the control's
// activation: pressing Enter on an in-row button opens the row's record and
// the button never fires.
//
// This is asserted MOUNTED rather than by reading the source, because the
// thing that goes wrong is event propagation, and a regex over the hook cannot
// see it. Renewals is the first accepted screen with buttons in a row; fixed
// here once, or every later screen carries its own capture-phase workaround.

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

interface Trace {
  readonly opened: number[];
  readonly selected: number[];
  readonly pressed: number[];
}

const Rows = ({ trace }: { readonly trace: Trace }) => {
  const navProps = useListNavigation({
    itemCount: 2,
    onOpen: (index) => {
      trace.opened.push(index);
    },
    onSelect: (index) => {
      trace.selected.push(index);
    },
  });
  return createElement(
    "ul",
    null,
    [0, 1].map((index) =>
      createElement(
        "li",
        {
          key: index,
          role: "button",
          "data-row": String(index),
          ...navProps(index),
        },
        createElement(
          "button",
          {
            type: "button",
            "data-row-action": String(index),
            onClick: () => {
              trace.pressed.push(index);
            },
          },
          "Add to contract",
        ),
      ),
    ),
  );
};

const mount = (): Trace => {
  const trace: Trace = { opened: [], selected: [], pressed: [] };
  act(() => root.render(createElement(Rows, { trace })));
  return trace;
};

const rowAt = (index: number): HTMLElement => {
  const row = container.querySelector<HTMLElement>(`[data-row="${index}"]`);
  assert.ok(row, `Row ${index} did not render.`);
  return row;
};

const actionIn = (index: number): HTMLButtonElement => {
  const action = container.querySelector<HTMLButtonElement>(
    `[data-row-action="${index}"]`,
  );
  assert.ok(action, `Row ${index} rendered without its in-row control.`);
  return action;
};

const pressKey = (element: HTMLElement, key: string): boolean => {
  let defaultPrevented = false;
  act(() => {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    defaultPrevented = event.defaultPrevented;
  });
  return defaultPrevented;
};

test("a control inside a row keeps its own Enter and Space", () => {
  const trace = mount();
  const action = actionIn(0);

  // Enter on the in-row button must reach the button, not the row. A browser
  // turns an unprevented Enter on a <button> into a click; the assertion that
  // matters here is that the row did NOT consume it.
  const enterPrevented = pressKey(action, "Enter");
  assert.deepEqual(
    trace.opened,
    [],
    "Enter on an in-row control opened the row's record instead of pressing the control.",
  );
  assert.equal(
    enterPrevented,
    false,
    "The row cancelled the in-row control's Enter, so the browser can no longer turn it into a click.",
  );

  const spacePrevented = pressKey(action, " ");
  assert.deepEqual(
    trace.selected,
    [],
    "Space on an in-row control selected the row instead of pressing the control.",
  );
  assert.equal(
    spacePrevented,
    false,
    "The row cancelled the in-row control's Space, so the browser can no longer turn it into a click.",
  );

  // The control still works: this is a guard against the row stealing keys,
  // not against the row having controls.
  act(() => action.click());
  assert.deepEqual(trace.pressed, [0]);
});

test("the row itself still opens, selects and moves under the same keys", () => {
  // The other half of the assertion. Without it, a hook that ignored every key
  // would pass the test above — which is the shape of guard this repository
  // has shipped before and had to come back for.
  const trace = mount();
  const row = rowAt(0);

  assert.equal(pressKey(row, "Enter"), true);
  assert.deepEqual(trace.opened, [0]);

  assert.equal(pressKey(row, " "), true);
  assert.deepEqual(trace.selected, [0]);

  assert.equal(pressKey(row, "ArrowDown"), true);
  assert.equal(document.activeElement, rowAt(1));

  assert.equal(pressKey(rowAt(1), "Home"), true);
  assert.equal(document.activeElement, rowAt(0));
});
