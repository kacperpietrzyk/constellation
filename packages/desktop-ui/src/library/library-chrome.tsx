import type { DesktopSnapshot } from "../client/workflow.js";

// Kawałki wspólne dla wszystkich odczytów Biblioteki. Leżą osobno, bo przy
// rozbiciu jednego pliku na odczyty każda z tych map trafiłaby do dwóch
// miejsc naraz, a przepisana kopia jest dokładnie tym, jak powstaje „ręczna
// lista obok zamkniętego słownika".

export type DocumentItem = Extract<
  DesktopSnapshot["documents"],
  { kind: "ready" }
>["data"]["items"][number];

export const roleCopy = {
  note: "Note",
  document: "Document",
  deliverable: "Deliverable",
} as const;

export const roleAccusativeCopy = {
  note: "note",
  document: "document",
  deliverable: "deliverable",
} as const;

export const sourceKindCopy = {
  url: "Link",
  file: "File",
  screenshot: "Screenshot",
  excerpt: "Excerpt",
} as const;

export const availabilityCopy = {
  reference_only: "Reference only",
  available: "Available",
  unavailable: "Unavailable",
} as const;

export const EvidenceMotif = () => (
  <svg
    className="knowledge-motif"
    viewBox="0 0 240 92"
    role="img"
    aria-label="A source leads to a note and a frozen version"
  >
    <path d="M44 46h48M148 46h48" />
    <circle cx="28" cy="46" r="14" />
    <rect x="94" y="30" width="52" height="32" rx="8" />
    <path d="M196 30h24v32h-24zM204 38h8M204 46h8M204 54h8" />
  </svg>
);
