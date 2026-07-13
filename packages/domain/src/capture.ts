import type {
  CaptureId,
  PrincipalId,
  SpaceId,
  TaskId,
  TaskStatusId,
  WorkspaceId,
} from "@constellation/contracts";

import type { PendingCapture, RoutedTaskCapture, Task } from "./model.js";

export interface SubmitCaptureInput {
  readonly captureId: CaptureId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly originalText: string;
  readonly deviceId: string;
  readonly source: PendingCapture["source"];
  readonly submittedBy: PrincipalId;
  readonly capturedAt: string;
}

export const submitCapture = (input: SubmitCaptureInput): PendingCapture => ({
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

export interface RouteCaptureAsTaskInput {
  readonly capture: PendingCapture;
  readonly taskId: TaskId;
  readonly taskStatusId: TaskStatusId;
  readonly title: string;
  readonly routedBy: PrincipalId;
  readonly occurredAt: string;
}

export interface RoutedCaptureAsTask {
  readonly capture: RoutedTaskCapture;
  readonly task: Task;
}

export const routeCaptureAsTask = (
  input: RouteCaptureAsTaskInput,
): RoutedCaptureAsTask => ({
  capture: {
    ...input.capture,
    processingState: "routed_as_task",
    derivedTaskId: input.taskId,
    routedAt: input.occurredAt,
    routedBy: input.routedBy,
    version: input.capture.version + 1,
  },
  task: {
    id: input.taskId,
    workspaceId: input.capture.workspaceId,
    spaceId: input.capture.spaceId,
    title: input.title,
    statusId: input.taskStatusId,
    completionState: "open",
    sourceCaptureId: input.capture.id,
    createdBy: input.routedBy,
    version: 1,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  },
});
