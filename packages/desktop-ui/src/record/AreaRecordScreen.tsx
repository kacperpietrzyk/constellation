import type { AreaOverviewProjection } from "../client/workflow.js";
import {
  WorkContextRecordScreen,
  type WorkContextRecordScreenProps,
} from "./WorkContextRecordScreen.js";

export type AreaRecordScreenProps = Omit<
  WorkContextRecordScreenProps,
  "kind" | "overview"
> & { readonly overview: AreaOverviewProjection };

export const AreaRecordScreen = (props: AreaRecordScreenProps) => (
  <div data-record-kind="area">
    <WorkContextRecordScreen {...props} kind="area" />
  </div>
);

export default AreaRecordScreen;
