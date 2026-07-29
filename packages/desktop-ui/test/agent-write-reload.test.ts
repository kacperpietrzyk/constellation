/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_WRITE_RELOAD_DELAY_MS,
  subscribeToAgentWrites,
  type WorkspaceChangedEvent,
} from "../src/client/agent-write-reload.js";

// Zegar sterowany ręcznie. Prawdziwy setTimeout zrobiłby z każdej asercji
// wyścig, a z pustego wyniku — „chyba jeszcze nie zdążyło".
const clock = () => {
  let now = 0;
  let nextId = 1;
  const scheduled = new Map<number, { at: number; run: () => void }>();
  return {
    schedule: (run: () => void, delayMs: number) => {
      const id = nextId++;
      scheduled.set(id, { at: now + delayMs, run });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    cancel: (timer: ReturnType<typeof setTimeout>) => {
      scheduled.delete(timer as unknown as number);
    },
    advance: (byMs: number) => {
      now += byMs;
      for (const [id, entry] of [...scheduled.entries()]) {
        if (entry.at <= now) {
          scheduled.delete(id);
          entry.run();
        }
      }
    },
    pendingCount: () => scheduled.size,
  };
};

const harness = (workspaceId: string | undefined) => {
  const time = clock();
  let listener: ((event: WorkspaceChangedEvent) => void) | undefined;
  let unsubscribed = 0;
  let reloads = 0;
  let current = workspaceId;

  const dispose = subscribeToAgentWrites({
    subscribe: (next) => {
      listener = next;
      return () => {
        unsubscribed += 1;
      };
    },
    currentWorkspaceId: () => current,
    reload: () => {
      reloads += 1;
    },
    schedule: time.schedule,
    cancel: time.cancel,
  });

  return {
    emit: (id: string) => listener?.({ workspaceId: id }),
    advance: time.advance,
    pendingCount: time.pendingCount,
    reloads: () => reloads,
    unsubscribed: () => unsubscribed,
    setWorkspace: (id: string | undefined) => {
      current = id;
    },
    dispose,
  };
};

const MINE = "11111111-1111-4111-8111-111111111111";
const THEIRS = "22222222-2222-4222-8222-222222222222";

test("a burst of agent writes re-reads the workspace exactly once", () => {
  const h = harness(MINE);

  h.emit(MINE);
  h.emit(MINE);
  h.emit(MINE);
  assert.equal(
    h.reloads(),
    0,
    "the re-read must wait for the burst to settle, not fire on the first event",
  );

  h.advance(AGENT_WRITE_RELOAD_DELAY_MS);
  assert.equal(h.reloads(), 1, "three writes in one window are one re-read");

  // Sprawdzenie przez zepsucie: gdyby opóźnienie było zerowe, asercja wyżej
  // („0 przed upływem") padłaby. Gdyby sklejania nie było, ta padnie na 3.
  h.emit(MINE);
  h.advance(AGENT_WRITE_RELOAD_DELAY_MS);
  assert.equal(h.reloads(), 2, "a write after the window is its own re-read");
});

test("the re-read does not fire before the coalescing window elapses", () => {
  const h = harness(MINE);
  h.emit(MINE);
  h.advance(AGENT_WRITE_RELOAD_DELAY_MS - 1);
  assert.equal(h.reloads(), 0);
  h.advance(1);
  assert.equal(h.reloads(), 1);
});

test("a write to somebody else's workspace is ignored", () => {
  const h = harness(MINE);

  h.emit(THEIRS);
  h.advance(AGENT_WRITE_RELOAD_DELAY_MS * 2);
  assert.equal(
    h.reloads(),
    0,
    "another workspace's write must not re-read this window's projection",
  );
  assert.equal(h.pendingCount(), 0, "and must not leave a timer behind");

  h.emit(MINE);
  h.advance(AGENT_WRITE_RELOAD_DELAY_MS);
  assert.equal(h.reloads(), 1, "our own write still lands");
});

test("a window that has not loaded a workspace yet accepts any write", () => {
  // Startowy wyścig: snapshot jeszcze nie wrócił, więc okno nie wie, czyj jest.
  // Odrzucanie w tym stanie gubiłoby pierwsze zapisy agenta bez śladu.
  const h = harness(undefined);
  h.emit(THEIRS);
  h.advance(AGENT_WRITE_RELOAD_DELAY_MS);
  assert.equal(h.reloads(), 1);
});

test("the workspace is re-read at every event, not captured once", () => {
  // Okno potrafi przełączyć workspace bez ponownego zapisu subskrypcji.
  const h = harness(MINE);
  h.setWorkspace(THEIRS);

  h.emit(MINE);
  h.advance(AGENT_WRITE_RELOAD_DELAY_MS);
  assert.equal(
    h.reloads(),
    0,
    "after switching workspace, writes to the old one are somebody else's",
  );

  h.emit(THEIRS);
  h.advance(AGENT_WRITE_RELOAD_DELAY_MS);
  assert.equal(h.reloads(), 1);
});

test("disposing cancels a re-read in flight and unsubscribes", () => {
  const h = harness(MINE);
  h.emit(MINE);
  h.dispose();
  h.advance(AGENT_WRITE_RELOAD_DELAY_MS * 2);

  assert.equal(h.reloads(), 0, "a reload must not land after teardown");
  assert.equal(h.pendingCount(), 0, "and its timer must not outlive the window");
  assert.equal(h.unsubscribed(), 1);
});
