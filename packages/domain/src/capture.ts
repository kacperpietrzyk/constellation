import type {
  CaptureId,
  CaptureOriginal,
  KnowledgeSourceId,
  PrincipalId,
  SpaceId,
  TaskId,
  TaskStatusId,
  WorkspaceId,
} from "@constellation/contracts";

import type {
  PendingCapture,
  RoutedKnowledgeSourceCapture,
  RoutedTaskCapture,
  KnowledgeSource,
  Task,
} from "./model.js";

export interface SubmitCaptureInput {
  readonly captureId: CaptureId;
  readonly workspaceId: WorkspaceId;
  readonly spaceId: SpaceId;
  readonly originalText: string;
  readonly original: CaptureOriginal;
  readonly originalFingerprint: string;
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
  original: input.original,
  originalFingerprint: input.originalFingerprint,
  deviceId: input.deviceId,
  source: input.source,
  capturedAt: input.capturedAt,
  processingState: "pending_processing",
  submittedBy: input.submittedBy,
  version: 1,
});

export const captureDisplayText = (original: CaptureOriginal): string => {
  switch (original.kind) {
    case "text":
      return original.text;
    case "url":
      return original.title ?? original.url;
    case "file":
      return original.displayName;
  }
};

export const routeCaptureAsKnowledgeSource = (input: {
  readonly capture: PendingCapture;
  readonly sourceId: KnowledgeSourceId;
  readonly routedBy: PrincipalId;
  readonly occurredAt: string;
}): RoutedKnowledgeSourceCapture => ({
  ...input.capture,
  processingState: "routed_as_knowledge_source",
  derivedKnowledgeSourceId: input.sourceId,
  routedAt: input.occurredAt,
  routedBy: input.routedBy,
  version: input.capture.version + 1,
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
    recordState: "active",
    completionState: "open",
    sourceCaptureId: input.capture.id,
    createdBy: input.routedBy,
    version: 1,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  },
});

export const undoCaptureTaskRoute = (input: {
  readonly capture: RoutedTaskCapture;
  readonly task: Task;
  readonly occurredAt: string;
}): { readonly capture: PendingCapture; readonly task: Task } => {
  if (input.capture.derivedTaskId !== input.task.id) {
    throw new Error("Capture provenance does not match the Task being undone.");
  }
  const pending: PendingCapture = {
    id: input.capture.id,
    workspaceId: input.capture.workspaceId,
    spaceId: input.capture.spaceId,
    originalText: input.capture.originalText,
    original: input.capture.original,
    originalFingerprint: input.capture.originalFingerprint,
    deviceId: input.capture.deviceId,
    source: input.capture.source,
    capturedAt: input.capture.capturedAt,
    submittedBy: input.capture.submittedBy,
    processingState: "pending_processing",
    version: input.capture.version + 1,
  };
  return {
    capture: pending,
    task: {
      ...input.task,
      recordState: "removed",
      version: input.task.version + 1,
      updatedAt: input.occurredAt,
    },
  };
};

export const undoCaptureKnowledgeRoute = (input: {
  readonly capture: RoutedKnowledgeSourceCapture;
  readonly source: KnowledgeSource;
  readonly occurredAt: string;
}): { readonly capture: PendingCapture; readonly source: KnowledgeSource } => {
  if (input.capture.derivedKnowledgeSourceId !== input.source.id) {
    throw new Error(
      "Capture provenance does not match the Knowledge Source being undone.",
    );
  }
  return {
    capture: {
      id: input.capture.id,
      workspaceId: input.capture.workspaceId,
      spaceId: input.capture.spaceId,
      originalText: input.capture.originalText,
      original: input.capture.original,
      originalFingerprint: input.capture.originalFingerprint,
      deviceId: input.capture.deviceId,
      source: input.capture.source,
      capturedAt: input.capture.capturedAt,
      submittedBy: input.capture.submittedBy,
      processingState: "pending_processing",
      version: input.capture.version + 1,
    },
    source: {
      ...input.source,
      availability: "unavailable",
      version: input.source.version + 1,
      updatedAt: input.occurredAt,
    },
  };
};
