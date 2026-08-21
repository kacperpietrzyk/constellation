import type { InitiativeOverviewProjection } from "../client/workflow.js";
import {
  WorkContextRecordScreen,
  type WorkContextRecordScreenProps,
} from "./WorkContextRecordScreen.js";

export type InitiativeRecordScreenProps = Omit<
  WorkContextRecordScreenProps,
  "kind" | "overview"
> & { readonly overview: InitiativeOverviewProjection };

export const InitiativeRecordScreen = (props: InitiativeRecordScreenProps) => (
  <div data-record-kind="initiative">
    <WorkContextRecordScreen {...props} kind="initiative" />
  </div>
);

export default InitiativeRecordScreen;
