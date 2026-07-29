export type RecordNarrativeKind = "area" | "initiative" | "project";

export interface RecordNarrativeGap {
  readonly marker: string;
  readonly detail: string;
  readonly action: string;
  readonly field: string;
}

// Obszar, Inicjatywa i Projekt mogą powstać bez zapisanej intencji — import
// pracy, która wyprzedza rekord, nie ma jej skąd wziąć, a wymuszony tekst
// produkuje wiarygodnie wyglądającą zmyśloną treść. Ta luka musi więc czytać
// się jako brak do uzupełnienia, a nie jako pusty wiersz.
export const recordNarrativeGaps: {
  readonly [kind in RecordNarrativeKind]: RecordNarrativeGap;
} = {
  area: {
    marker: "Responsibility to write",
    detail:
      "This area was created without a responsibility. Write what you stay responsible for.",
    action: "Write responsibility",
    field: "Ongoing responsibility",
  },
  initiative: {
    marker: "Outcome to write",
    detail:
      "This initiative was created without an outcome. Write what will let you close it.",
    action: "Write outcome",
    field: "Intended outcome",
  },
  project: {
    marker: "Outcome to write",
    detail:
      "This project was created without an outcome. Write how you will know the work is done.",
    action: "Write outcome",
    field: "Intended outcome",
  },
};

export type RecordNarrativeView =
  | { readonly written: true; readonly text: string }
  | ({ readonly written: false } & RecordNarrativeGap);

// Projekcje sprowadzają nienapisaną intencję do "" i zgłaszają lukę osobną
// flagą needsReview. Czytamy obie: pusty tekst przy needsReview === false
// oznaczałby starszą projekcję, a wtedy nadal nie ma czego pokazać.
export const readRecordNarrative = (
  kind: RecordNarrativeKind,
  narrative: { readonly text: string; readonly needsReview: boolean },
): RecordNarrativeView =>
  narrative.needsReview || narrative.text.trim() === ""
    ? { written: false, ...recordNarrativeGaps[kind] }
    : { written: true, text: narrative.text };
