import type {
  CaptureId,
  PrincipalId,
  SpaceId,
  WorkspaceId,
} from "@constellation/contracts";

import type { Capture } from "./model.js";

export interface SubmitCaptureInput {
  readonly captureId: CaptureId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly originalText: string;
  readonly deviceId: string;
  readonly source: Capture["source"];
  readonly submittedBy: PrincipalId;
  readonly capturedAt: string;
}

export const submitCapture = (input: SubmitCaptureInput): Capture => ({
  id: input.captureId,
  workspaceId: input.workspaceId,
  spaceId: input.spaceId,
  originalText: input.originalText,
  deviceId: input.deviceId,
  source: input.source,
  capturedAt: input.capturedAt,
  processingState: "pending_processing",
  submittedBy: input.submittedBy,
  version: 1,
});
