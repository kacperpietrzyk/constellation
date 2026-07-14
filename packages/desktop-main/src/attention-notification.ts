import type { QueryProjection } from "@constellation/contracts";

type AttentionProjection = Extract<
  QueryProjection,
  { kind: "attention.inbox" }
>;
export type AttentionItem = AttentionProjection["items"][number];
export type AttentionDestination = AttentionItem["destination"];

export interface SystemNotificationPort {
  show(input: {
    readonly title: string;
    readonly body: string;
    readonly onActivate: () => void;
  }): void;
}

export class AttentionNotificationCoordinator {
  private readonly delivered = new Set<string>();

  public constructor(private readonly port: SystemNotificationPort) {}

  public deliver(input: {
    readonly items: readonly AttentionItem[];
    readonly appIsFocused: boolean;
    readonly onActivate: (destination: AttentionDestination) => void;
  }): number {
    if (input.appIsFocused) return 0;
    let delivered = 0;
    for (const item of input.items) {
      const deliveryKey = `${item.id}:${item.version}`;
      if (
        item.state !== "unread" ||
        item.urgency !== "urgent" ||
        this.delivered.has(deliveryKey)
      )
        continue;
      this.port.show({
        title: item.title,
        body: item.detail,
        onActivate: () => input.onActivate(item.destination),
      });
      this.delivered.add(deliveryKey);
      delivered += 1;
    }
    return delivered;
  }
}
