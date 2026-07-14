import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AttentionNotificationCoordinator,
  type SystemNotificationPort,
} from "../src/attention-notification.js";

describe("permission-safe attention notification delivery", () => {
  it("delivers one scoped urgent alert, routes exactly, and suppresses foreground or routine signals", () => {
    const shown: Parameters<SystemNotificationPort["show"]>[0][] = [];
    const coordinator = new AttentionNotificationCoordinator({
      show: (input) => shown.push(input),
    });
    const taskId = "60000000-0000-4000-8000-000000000001" as never;
    const urgent = {
      id: "60000000-0000-4000-8000-000000000002" as never,
      reason: "sync_conflict" as const,
      destination: { kind: "task" as const, taskId },
      title: "Review offline conflict",
      detail: "Your preserved change needs reconciliation.",
      urgency: "urgent" as const,
      state: "unread" as const,
      version: 1,
      occurredAt: "2026-07-14T12:00:00.000Z",
    };
    const routine = {
      ...urgent,
      id: "60000000-0000-4000-8000-000000000003" as never,
      urgency: "in_app" as const,
    };
    const activated: unknown[] = [];
    assert.equal(
      coordinator.deliver({
        items: [urgent, routine],
        appIsFocused: true,
        onActivate: (destination) => activated.push(destination),
      }),
      0,
    );
    assert.equal(
      coordinator.deliver({
        items: [urgent, routine],
        appIsFocused: false,
        onActivate: (destination) => activated.push(destination),
      }),
      1,
    );
    assert.equal(shown.length, 1);
    assert.deepEqual(
      { title: shown[0]?.title, body: shown[0]?.body },
      { title: urgent.title, body: urgent.detail },
    );
    shown[0]?.onActivate();
    assert.deepEqual(activated, [urgent.destination]);
    assert.equal(
      coordinator.deliver({
        items: [urgent],
        appIsFocused: false,
        onActivate: () => undefined,
      }),
      0,
      "same scoped version is deduplicated",
    );
  });
});
