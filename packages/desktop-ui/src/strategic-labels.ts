import type { RelationshipWorkspaceProjection } from "./client/workflow.js";

type StrategicRecord = RelationshipWorkspaceProjection["records"][number];

// Wspólny słownik etykiet stanów rekordów strategicznych; konsumuje go
// powierzchnia CRM oraz inspector w RealApp, żeby stan czytał się identycznie
// po obu stronach shellu. Moduł jest wydzielony z StrategicDepthSurface, aby
// stale obecny inspector nie wciągał całej powierzchni do wejściowego chunku
// renderera.
export const strategicStateLabels: { readonly [state: string]: string } = {
  active: "Active",
  pursued: "In progress",
  stale: "Stale",
  watching: "Watching",
  open: "Open",
  resolved: "Resolved",
  renewed: "Renewed",
  current: "Current",
  superseded: "Superseded",
  prospect: "Prospect",
  inactive: "Inactive",
  deferred: "Deferred",
  rejected: "Rejected",
  lost: "Lost",
  draft: "Draft",
  ready: "Ready",
  submitted: "Submitted",
  accepted: "Accepted",
  declined: "Declined",
  not_renewing: "Not renewing",
  irrelevant: "Irrelevant",
  conflicted: "Conflicted",
  paused: "Paused",
  ended: "Ended",
  pending: "Pending",
  saved: "Saved",
  dismissed: "Dismissed",
};

export const recurrenceCadenceLabels: {
  readonly [
    cadence in Extract<StrategicRecord, { kind: "recurrence" }>["cadence"]
  ]: string;
} = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};
