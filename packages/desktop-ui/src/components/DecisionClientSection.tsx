import { useState } from "react";

import type { StrategicRecordId } from "@constellation/contracts";
import type { ConstellationRendererClient } from "@constellation/desktop-preload/client";

import {
  updateDecision,
  type DesktopSnapshot,
  type MutationFailure,
} from "../client/workflow.js";

// Attributing a decision to a client, after the fact.
//
// #196 gave a decision the edge to an organisation and the create panel a
// `<select>` for it, which covers every decision written from that PR onward
// and none of the ones already in the graph. Those are openable by name in ⌘K
// and listed on no client record, so the control belongs where ⌘K lands: the
// inspector, which already renders every strategic kind and already resolves
// this record's organisation to print "Decision in the Acme relationship".
//
// The org record's Decisions section cannot host this — it filters
// `organizationId === organization.id`, so a decision with no client matches no
// organisation and appears on no such screen. The records this exists to fix
// are exactly the ones that screen cannot show.
//
// No new CSS: the classes are the inspector's own and `<select>` is styled
// globally, so this adds nothing to a stylesheet another lot is rewriting.
export const DecisionClientSection = ({
  client,
  snapshot,
  decision,
  organizations,
  onUpdated,
  onFailure,
}: {
  readonly client: ConstellationRendererClient;
  readonly snapshot: DesktopSnapshot;
  readonly decision: {
    readonly id: StrategicRecordId;
    readonly version: number;
    readonly organizationId?: StrategicRecordId | undefined;
  };
  readonly organizations: readonly {
    readonly id: StrategicRecordId;
    readonly name: string;
  }[];
  readonly onUpdated: (message: string) => Promise<void>;
  readonly onFailure: (result: MutationFailure) => void;
}) => {
  const current = decision.organizationId ?? "";
  const [choice, setChoice] = useState<string>(current);
  const [busy, setBusy] = useState(false);
  const changed = choice !== current;

  return (
    // `data-*` rather than a class or the button's words: the interaction test
    // holds the state this section is in, and both of those are free to change
    // without changing the guarantee.
    <section
      className="inspector-section"
      data-decision-client=""
      data-decision-attributed={
        decision.organizationId === undefined ? "" : "1"
      }
    >
      <p className="section-label">Client</p>
      <p className="muted-text">
        Which client this decision is about. Clearing it detaches the decision
        from the relationship; the decision itself stays.
      </p>
      {/* "No client" is first and stays first, for the same reason it is first
          in the create panel: it is the value an unattributed decision holds,
          and it is also the clear. */}
      <select
        aria-label="Client this decision is about"
        data-decision-client-select=""
        disabled={busy}
        value={choice}
        onChange={(event) => setChoice(event.target.value)}
      >
        <option value="">No client</option>
        {organizations.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="secondary-button"
        data-decision-client-save=""
        disabled={busy || !changed}
        onClick={() => {
          setBusy(true);
          void updateDecision(client, snapshot, decision, {
            // The empty option is the DETACHMENT, so it has to travel as an
            // explicit `null`. Sending `undefined` would mean "leave the client
            // alone" — the wrapper would drop the key and answer "nothing
            // changed" to the one caller correcting a wrong attribution.
            organizationId:
              choice === "" ? null : (choice as StrategicRecordId),
          }).then(async (result) => {
            setBusy(false);
            if (result.kind === "success")
              await onUpdated(
                choice === ""
                  ? "Decision detached from the client. Undo if that was a mistake."
                  : "Decision filed under the client. Undo if that was a mistake.",
              );
            else onFailure(result);
          });
        }}
      >
        {busy ? "Saving…" : "Save client"}
      </button>
    </section>
  );
};
