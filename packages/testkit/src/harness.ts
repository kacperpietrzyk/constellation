import {
  ApplicationKernel,
  FailureInjector,
  type ReferenceStateSnapshot,
} from "@constellation/application";

import {
  Base64JsonCursorCodec,
  DeterministicIdGenerator,
  Sha256SemanticHasher,
  TickingClock,
} from "./deterministic.js";
import { InMemoryReferenceStore } from "./reference-store.js";
import { InMemoryAuthorizationPolicy } from "./authorization.js";

export const createReferenceHarness = (
  options: {
    readonly capturePayloadsAvailable?: boolean;
    readonly initialState?: ReferenceStateSnapshot;
  } = {},
) => {
  const clock = new TickingClock();
  const ids = new DeterministicIdGenerator();
  const store = new InMemoryReferenceStore(
    new FailureInjector(),
    options.initialState,
  );
  const authorization = new InMemoryAuthorizationPolicy();
  const kernel = new ApplicationKernel({
    authorization,
    clock,
    cursorCodec: new Base64JsonCursorCodec(),
    hasher: new Sha256SemanticHasher(),
    ids,
    store,
    capturePayloadVerifier: {
      isAvailable: () => options.capturePayloadsAvailable !== false,
    },
  });
  return { authorization, clock, ids, kernel, store };
};

export type ReferenceHarness = ReturnType<typeof createReferenceHarness>;
