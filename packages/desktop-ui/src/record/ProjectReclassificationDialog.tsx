import { useEffect, useRef, useState } from "react";

import type { ProjectId, StrategicRecordId } from "@constellation/contracts";

export type ReclassificationKind = "area" | "initiative" | "opportunity";
export type ReclassificationDestination = {
  readonly mode: "create" | "merge";
  readonly kind: ReclassificationKind;
  readonly targetId: StrategicRecordId;
  readonly targetTitle?: string | undefined;
};
export type ReclassificationPreview = {
  readonly projectId: ProjectId;
  readonly destination: ReclassificationDestination;
  readonly canApply: boolean;
  readonly blockedReason?: string | undefined;
  readonly expectedVersions: Readonly<Record<string, number>>;
  readonly history: {
    readonly bodyOwner: {
      readonly kind: "project";
      readonly projectId: ProjectId;
    };
    readonly checkInIds: readonly string[];
    readonly commentIds: readonly string[];
    readonly evidenceSourceIds: readonly string[];
    readonly taskIds: readonly string[];
    readonly relationIds: readonly string[];
    readonly workLinkIds: readonly string[];
    readonly eventIds: readonly string[];
    readonly auditReceiptIds: readonly string[];
  };
};
export type ReclassificationLoad =
  | { readonly kind: "ready"; readonly data: ReclassificationPreview }
  | { readonly kind: "unavailable"; readonly message: string };

interface ReclassificationDraftFacts {
  readonly title: string;
  readonly responsibility: string;
  readonly opportunity: {
    readonly organizationId: string;
    readonly need: string;
    readonly qualification: string;
    readonly stage: string;
    readonly nextAction: string;
  };
}

export const reclassificationDraftKey = (
  destination: ReclassificationDestination,
  facts: ReclassificationDraftFacts,
): string => JSON.stringify({ destination, facts });

const newTargetId = (): StrategicRecordId =>
  crypto.randomUUID() as StrategicRecordId;
const label = (kind: ReclassificationKind): string =>
  kind.charAt(0).toUpperCase() + kind.slice(1);

export const ProjectReclassificationDialog = ({
  projectTitle,
  targets,
  onClose,
  onPreview,
  onApply,
}: {
  readonly projectId: ProjectId;
  readonly projectTitle: string;
  readonly targets: readonly {
    readonly id: StrategicRecordId;
    readonly kind: ReclassificationKind;
    readonly title: string;
  }[];
  readonly onClose: () => void;
  readonly onPreview: (
    destination: ReclassificationDestination,
  ) => Promise<ReclassificationLoad>;
  readonly onApply: (
    preview: ReclassificationPreview,
    destination: unknown,
  ) => Promise<
    | { readonly kind: "success"; readonly commandId: string }
    | { readonly kind: "failure"; readonly message: string }
  >;
}) => {
  const [mode, setMode] = useState<"create" | "merge">("create");
  const [kind, setKind] = useState<ReclassificationKind>("area");
  const [targetId, setTargetId] = useState<StrategicRecordId>(() =>
    newTargetId(),
  );
  const [preview, setPreview] = useState<ReclassificationPreview>();
  const [previewDraftKey, setPreviewDraftKey] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [creationTitle, setCreationTitle] = useState(projectTitle);
  const [responsibility, setResponsibility] = useState("");
  const [opportunityFacts, setOpportunityFacts] = useState({
    organizationId: "",
    need: "",
    qualification: "",
    stage: "",
    nextAction: "",
  });
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnTargetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const active = document.activeElement;
    returnTargetRef.current = active instanceof HTMLElement ? active : null;
    cancelRef.current?.focus();
    return () => {
      const target = returnTargetRef.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, []);
  const available = targets.filter((target) => target.kind === kind);
  const changeMode = (next: "create" | "merge") => {
    setMode(next);
    setPreview(undefined);
    setMessage(undefined);
    setTargetId(
      next === "merge" ? (available[0]?.id ?? newTargetId()) : newTargetId(),
    );
  };
  const changeKind = (next: ReclassificationKind) => {
    setKind(next);
    setPreview(undefined);
    setMessage(undefined);
    setTargetId(
      mode === "merge"
        ? (targets.find((target) => target.kind === next)?.id ?? newTargetId())
        : newTargetId(),
    );
  };
  const selectedTarget = targets.find((target) => target.id === targetId);
  const destination: ReclassificationDestination =
    mode === "merge" && selectedTarget !== undefined
      ? { mode, kind, targetId, targetTitle: selectedTarget.title }
      : { mode, kind, targetId };
  const draftKey = reclassificationDraftKey(destination, {
    title: creationTitle,
    responsibility,
    opportunity: opportunityFacts,
  });
  const freshPreview =
    preview !== undefined && previewDraftKey === draftKey ? preview : undefined;
  const previewChange = async () => {
    if (
      mode === "merge" &&
      !available.some((target) => target.id === targetId)
    ) {
      setMessage(`No authorized ${label(kind)} is available to merge into.`);
      return;
    }
    setBusy(true);
    setMessage(undefined);
    const result = await onPreview(destination);
    setBusy(false);
    if (result.kind === "ready") {
      setPreview(result.data);
      setPreviewDraftKey(draftKey);
    } else {
      setPreview(undefined);
      setPreviewDraftKey(undefined);
      setMessage(result.message);
    }
  };
  const apply = async () => {
    if (freshPreview === undefined || !freshPreview.canApply) return;
    const payloadDestination =
      mode === "merge"
        ? destination
        : kind === "opportunity"
          ? {
              ...destination,
              title: creationTitle.trim(),
              organizationId: opportunityFacts.organizationId,
              personIds: [],
              need: opportunityFacts.need.trim(),
              qualification: opportunityFacts.qualification.trim(),
              stage: opportunityFacts.stage.trim(),
              nextAction: opportunityFacts.nextAction.trim(),
              evidenceSourceIds: [],
            }
          : kind === "area"
            ? {
                ...destination,
                title: creationTitle.trim(),
                ...(responsibility.trim()
                  ? { responsibility: responsibility.trim() }
                  : {}),
              }
            : {
                ...destination,
                title: creationTitle.trim(),
                ...(responsibility.trim()
                  ? { intendedOutcome: responsibility.trim() }
                  : {}),
              };
    if (
      mode === "create" &&
      (creationTitle.trim() === "" ||
        (kind === "opportunity" &&
          Object.values(opportunityFacts).some((value) => value.trim() === "")))
    ) {
      setMessage("Complete every required target fact before confirming.");
      return;
    }
    setBusy(true);
    const result = await onApply(freshPreview, payloadDestination);
    setBusy(false);
    if (result.kind === "success") onClose();
    else setMessage(result.message);
  };
  const count = (value: readonly string[], name: string) =>
    `${value.length} ${name}${value.length === 1 ? "" : "s"}`;
  return (
    <div
      className="undo-backdrop"
      role="presentation"
      onMouseDown={(event) =>
        event.target === event.currentTarget && !busy && onClose()
      }
    >
      <section
        aria-labelledby="project-reclassification-title"
        aria-modal="true"
        className="undo-dialog"
        role="dialog"
        onKeyDown={(event) => event.key === "Escape" && !busy && onClose()}
      >
        <header>
          <div>
            <p className="eyebrow">Project record</p>
            <h2 id="project-reclassification-title">
              Reclassify “{projectTitle}”
            </h2>
          </div>
        </header>
        <p>
          The Project is not closed. Preview the exact durable history before
          confirming.
        </p>
        <label>
          Mode{" "}
          <select
            aria-label="Reclassification mode"
            disabled={busy}
            value={mode}
            onChange={(event) =>
              changeMode(event.target.value as "create" | "merge")
            }
          >
            <option value="create">Create a new target</option>
            <option value="merge">Merge into an existing target</option>
          </select>
        </label>
        <label>
          Target kind{" "}
          <select
            aria-label="Target kind"
            disabled={busy}
            value={kind}
            onChange={(event) =>
              changeKind(event.target.value as ReclassificationKind)
            }
          >
            {(["area", "initiative", "opportunity"] as const).map((item) => (
              <option key={item} value={item}>
                {label(item)}
              </option>
            ))}
          </select>
        </label>
        {mode === "merge" && (
          <label>
            Merge target{" "}
            <select
              aria-label="Merge target"
              disabled={busy || available.length === 0}
              value={targetId}
              onChange={(event) => {
                setTargetId(event.target.value as StrategicRecordId);
                setPreview(undefined);
              }}
            >
              {available.length === 0 ? (
                <option value="">No authorized targets</option>
              ) : (
                available.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.title}
                  </option>
                ))
              )}
            </select>
          </label>
        )}
        {mode === "create" && (
          <>
            <label>
              Target title{" "}
              <input
                aria-label="Target title"
                disabled={busy}
                value={creationTitle}
                onChange={(event) => {
                  setCreationTitle(event.target.value);
                  setPreview(undefined);
                }}
              />
            </label>
            {kind !== "opportunity" && (
              <label>
                {kind === "area" ? "Responsibility" : "Intended outcome"}
                <textarea
                  aria-label={
                    kind === "area" ? "Responsibility" : "Intended outcome"
                  }
                  disabled={busy}
                  value={responsibility}
                  onChange={(event) => setResponsibility(event.target.value)}
                />
              </label>
            )}
            {kind === "opportunity" && (
              <fieldset>
                <legend>Opportunity facts</legend>
                {(
                  [
                    "organizationId",
                    "need",
                    "qualification",
                    "stage",
                    "nextAction",
                  ] as const
                ).map((field) => (
                  <label key={field}>
                    {field === "organizationId"
                      ? "Organization ID"
                      : label(
                          field === "nextAction" ? "initiative" : "area",
                        ).replace("Area", field)}
                    <input
                      aria-label={field}
                      disabled={busy}
                      value={opportunityFacts[field]}
                      onChange={(event) =>
                        setOpportunityFacts((current) => ({
                          ...current,
                          [field]: event.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
              </fieldset>
            )}
          </>
        )}
        {message && <p role="alert">{message}</p>}
        {freshPreview && (
          <section aria-live="polite">
            <h3>Preview</h3>
            <p>
              {freshPreview.canApply
                ? "Ready to confirm this fresh preview."
                : `Cannot apply: ${freshPreview.blockedReason ?? "the authoritative state changed"}.`}
            </p>
            <p>
              Project remains the body owner.{" "}
              {count(freshPreview.history.checkInIds, "check-in")},{" "}
              {count(freshPreview.history.commentIds, "comment")},{" "}
              {count(freshPreview.history.evidenceSourceIds, "evidence")},{" "}
              {count(freshPreview.history.taskIds, "task")},{" "}
              {count(freshPreview.history.relationIds, "relation")},{" "}
              {count(freshPreview.history.workLinkIds, "work link")},{" "}
              {count(freshPreview.history.eventIds, "audit event")} and{" "}
              {count(freshPreview.history.auditReceiptIds, "audit receipt")} are
              preserved.
            </p>
            <p>
              Expected versions:{" "}
              {Object.entries(freshPreview.expectedVersions)
                .map(([id, version]) => `${id}: ${version}`)
                .join(" · ")}
            </p>
          </section>
        )}
        <footer>
          <button
            ref={cancelRef}
            className="ghost-button"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="secondary-button"
            data-reclassification-preview
            disabled={busy}
            onClick={() => void previewChange()}
            type="button"
          >
            {busy ? "Checking…" : "Preview change"}
          </button>
          {freshPreview?.canApply && (
            <button
              className="primary-button"
              data-reclassification-confirm
              disabled={busy}
              onClick={() => void apply()}
              type="button"
            >
              {busy ? "Applying…" : "Confirm reclassification"}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
};
